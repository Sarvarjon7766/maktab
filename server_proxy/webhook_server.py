# -*- coding: utf-8 -*-
"""
webhook_server.py

Veb dasturingizdan (rasm + ism/familya/otchestva + ID) qabul qilib,
avtomatik ravishda tegishli Hikvision terminalga yuboradigan HTTP server.
(PUSH usuli — veb dastur bizga so'rov yuboradi. Agar internetdan
kirish/statik IP muammosi bo'lsa, poller.py — PULL usuli — ni ishlating.)

JOYLASHUV:
    isup-service-project\\
        isup-service\\
        config.json
        webhook_server.py    <-- BU FAYL

ISHGA TUSHIRISH:
    pip install -r requirements.txt
    python webhook_server.py
    (standart: http://0.0.0.0:8088)

VEB DASTURINGIZ QANDAY SO'ROV YUBORISHI KERAK
==============================================

1) Fayl sifatida (multipart/form-data) — TAVSIYA ETILADI:

   POST /webhook/employee
   Content-Type: multipart/form-data

   Fieldlar:
     employee_id  (majburiy)
     name         (majburiy agar ism/familya/otchestva berilmasa)
     ism / familya / otchestva  (ixtiyoriy, name o'rniga)
     device       (ixtiyoriy) — config.json'dagi kamera IP'si
     photo        (majburiy) — rasm fayli

2) JSON + base64:

   POST /webhook/employee/json
   {
     "employee_id": "1001", "name": "Ali Valiyev",
     "device": "192.168.2.133", "photo_base64": "<base64>"
   }

XAVFSIZLIK:
   config.json -> "webhook": {"token": "MAXFIY_TOKEN"} to'ldirilsa,
   har so'rovda "X-Webhook-Token: MAXFIY_TOKEN" header talab qilinadi.
"""

from __future__ import annotations

import base64
import hmac
import json
import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).parent / "isup-service"))

from fastapi import FastAPI, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
import uvicorn

from adapters import AdapterProtocol, DeviceCredentials  # noqa: E402
from device_registry import load_devices  # noqa: E402
from employee_ingest import build_full_name, push_employee_to_camera  # noqa: E402
from service import DeviceSyncService  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler("webhook_server.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("webhook_server")

CONFIG_PATH = Path(__file__).parent / "config.json"

app = FastAPI(title="Hikvision Employee Webhook")

sync_service = DeviceSyncService()
_config: dict[str, Any] = {}
_default_device_ip: Optional[str] = None


@app.on_event("startup")
def on_startup() -> None:
    global _config, _default_device_ip

    if not CONFIG_PATH.exists():
        logger.error("config.json topilmadi: %s", CONFIG_PATH)
        raise RuntimeError("config.json topilmadi")

    try:
        _config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.error("config.json noto'g'ri formatda (JSON xatosi): %s", exc)
        raise RuntimeError(f"config.json JSON xatosi: {exc}") from exc
    devices = load_devices(_config)
    if not devices:
        raise RuntimeError("Kameralar ro'yxati bo'sh (config.json'dagi 'devices' ham, backend ham natija bermadi)")

    _default_device_ip = devices[0]["ip"]

    for device in devices:
        try:
            creds = DeviceCredentials(
                ip=device["ip"], port=device.get("port", 80),
                username=device.get("username", "admin"), password=device["password"],
            )
            # webhook_server faqat PUSH (xodim qabul qilish) uchun — hodisa
            # oqimi (event monitoring) kerak emas, shuning uchun o'chiramiz
            sync_service.register_device(
                device_id=device["ip"], creds=creds,
                preferred_protocol=AdapterProtocol.ISUP_SDK,
                enable_event_monitoring=False,
            )
            logger.info("✅ %s ulandi (webhook uchun tayyor)", device["ip"])
        except Exception as exc:  # noqa: BLE001
            logger.error("❌ %s ga ulanib bo'lmadi: %s", device["ip"], exc)

    if not _config.get("webhook", {}).get("token"):
        logger.warning(
            "⚠️ 'webhook.token' sozlanmagan — /add-employee va /update-employee "
            "endpointlari xavfsizlik uchun HAR BIR so'rovni rad etadi (fail-closed). "
            "Ishlatish uchun config.json'da webhook.token'ni to'ldiring."
        )

    logger.info("🚀 Webhook server tayyor. Standart kamera: %s", _default_device_ip)


# config.json endi git'ga committed emas — operatorlar uni
# config.example.json'dan nusxalab tuzatishadi. Bu andoza fayldagi
# placeholder qiymatlar (README/kod izohlarida ham aytilgan) OMMAVIY
# ma'lum, shu sabab ular haqiqiy token sifatida qabul qilinsa,
# quyidagi fail-closed tekshiruv chetlab o'tiladi (bo'sh emas, lekin
# hammaga ma'lum).
_KNOWN_PLACEHOLDER_TOKENS = {"CHANGE_ME_32_PLUS_RANDOM_CHARS", "CHANGE_ME"}


def _check_token(x_webhook_token: Optional[str]) -> None:
    expected = _config.get("webhook", {}).get("token", "")
    if not expected or expected in _KNOWN_PLACEHOLDER_TOKENS:
        # Token sozlanmagan (yoki config.example.json'dan o'zgartirilmagan
        # andoza qiymatida qolib ketgan) bo'lsa endpointni OCHIQ qoldirish
        # o'rniga butunlay yopamiz (fail-closed) — bo'sh/andoza token
        # "hammaga ruxsat" degani emas.
        raise HTTPException(status_code=503, detail="webhook.token konfiguratsiyada sozlanmagan")
    if not x_webhook_token or not hmac.compare_digest(x_webhook_token, expected):
        raise HTTPException(status_code=401, detail="Noto'g'ri yoki yo'q X-Webhook-Token")


def _respond(result) -> JSONResponse:
    if not result.success:
        raise HTTPException(status_code=502, detail=result.error)
    return JSONResponse({"success": True, "employee_id": result.employee_id, "name": result.name, "device": result.device})


@app.post("/webhook/employee")
async def webhook_employee(
    employee_id: str = Form(...),
    name: Optional[str] = Form(None),
    ism: Optional[str] = Form(None),
    familya: Optional[str] = Form(None),
    otchestva: Optional[str] = Form(None),
    device: Optional[str] = Form(None),
    photo: Optional[UploadFile] = None,
    x_webhook_token: Optional[str] = Header(None),
):
    _check_token(x_webhook_token)
    if photo is None:
        raise HTTPException(status_code=422, detail="'photo' fayli yuborilmadi (multipart/form-data kerak)")

    try:
        full_name = build_full_name(name, ism, familya, otchestva)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc))

    device_ip = device or _default_device_ip
    photo_bytes = await photo.read()

    logger.info("📥 Webhook: %s (%s) -> %s", employee_id, full_name, device_ip)
    # push_employee_to_camera bloklovchi (requests + time.sleep bilan qayta
    # urinishlar) — async route ichida to'g'ridan-to'g'ri chaqirilsa, FastAPI
    # buni threadpool'ga o'tkazmaydi (faqat oddiy `def` endpointlar uchun
    # avtomatik shunday bo'ladi) va butun event loop shu bitta kamera javob
    # bergunga (yoki qayta urinishlar tugaguncha, ~1-3 daqiqa) qadar
    # BLOKLANIB qoladi — shu vaqt ichida boshqa hech qanday kamera/xodim
    # uchun so'rov qayta ishlanmaydi. Shu sabab threadpool'ga qo'lda o'tkazamiz.
    result = await run_in_threadpool(push_employee_to_camera, sync_service, device_ip, employee_id, full_name, photo_bytes)
    if result.success:
        logger.info("✅ Webhook orqali qo'shildi: %s", employee_id)
    else:
        logger.error("❌ Webhook xatolik: %s", result.error)
    return _respond(result)


@app.post("/webhook/employee/json")
async def webhook_employee_json(payload: dict, x_webhook_token: Optional[str] = Header(None)):
    _check_token(x_webhook_token)

    employee_id = payload.get("employee_id")
    if not employee_id:
        raise HTTPException(status_code=422, detail="'employee_id' kerak")

    try:
        full_name = build_full_name(payload.get("name"), payload.get("ism"), payload.get("familya"), payload.get("otchestva"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=str(exc))

    device_ip = payload.get("device") or _default_device_ip

    photo_b64 = payload.get("photo_base64")
    if not photo_b64:
        raise HTTPException(status_code=422, detail="'photo_base64' kerak")
    try:
        photo_bytes = base64.b64decode(photo_b64)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"photo_base64 noto'g'ri: {exc}")

    logger.info("📥 Webhook (JSON): %s (%s) -> %s", employee_id, full_name, device_ip)
    result = await run_in_threadpool(push_employee_to_camera, sync_service, device_ip, employee_id, full_name, photo_bytes)
    if result.success:
        logger.info("✅ Webhook orqali qo'shildi: %s", employee_id)
    else:
        logger.error("❌ Webhook xatolik: %s", result.error)
    return _respond(result)


@app.get("/health")
def health():
    return {"status": "ok", "connected_devices": sync_service.registered_devices()}


if __name__ == "__main__":
    webhook_cfg: dict[str, Any] = {}
    if CONFIG_PATH.exists():
        try:
            webhook_cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8")).get("webhook", {})
        except json.JSONDecodeError as exc:
            logger.error("config.json noto'g'ri formatda (JSON xatosi): %s", exc)
            sys.exit(1)
    host = webhook_cfg.get("host", "0.0.0.0")
    port = webhook_cfg.get("port", 8088)
    uvicorn.run(app, host=host, port=port)

