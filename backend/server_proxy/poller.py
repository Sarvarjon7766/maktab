# -*- coding: utf-8 -*-
"""
poller.py

PULL usuli: bu skript hech qanday portni ochmaydi, hech qanday tashqi
so'rovni kutmaydi. Buning o'rniga, o'zi vaqti-vaqti bilan (masalan har
10 soniyada) veb dasturingizning API'siga murojaat qilib, "yangi
qo'shilishi kerak bo'lgan xodim bormi?" deb so'raydi va bo'lsa —
kameraga yuboradi. Faqat CHIQUVCHI so'rov, hech qanday tunnel/port
forwarding/statik IP kerak emas.

ESLATMA: Agar bir vaqtning o'zida ham hodisalarni kuzatish (app.py monitor),
ham xodim sinxronizatsiyasini (shu skript) xohlasangiz — ikkita alohida
terminal ochib yurishning o'rniga `python app.py run` buyrug'ini ishlating,
u ikkalasini BITTA jarayonda birga bajaradi. Bu skript alohida ishlatish
kerak bo'lgan hollar (masalan sinxronizatsiyani boshqa mashinada, monitoring'dan
alohida ishga tushirish) uchun saqlab qolingan.

JOYLASHUV:
    isup-service-project\\
        isup-service\\
        config.json
        poller.py             <-- BU FAYL

ISHGA TUSHIRISH:
    pip install -r requirements.txt
    python poller.py

CONFIG.JSON'GA QO'SHILADIGAN BO'LIM:
    "backend": {
      "base_url": "https://sizning-domeningiz.uz",
      "token": "SIZNING_API_TOKENINGIZ"
    },
    "pull_api": {
      "url": "",              // bo'sh qoldirilsa backend.base_url'dan hosil bo'ladi
      "token": "",            // bo'sh qoldirilsa backend.token ishlatiladi
      "ack_url": "",
      "poll_interval_seconds": 10
    }

    Eslatma: agar "pull_api.url"/"ack_url"/"token" aniq to'ldirilgan bo'lsa,
    ular "backend" bo'limidan ustun turadi (override).

VEB DASTUR TOMONIDAN KUTILADIGAN JAVOB FORMATI
================================================
GET {pull_api.url}  (header: Authorization: {token})

Javob — kutilayotgan xodimlar RO'YXATI (JSON array), har biri:
    {
      "employee_id": "1001",
      "name": "Ali Valiyev",              // yoki ism/familya/otchestva
      "device": "192.168.2.133",           // ixtiyoriy
      "photo_base64": "<base64>",          // YOKI:
      "photo_url": "https://.../photo.jpg" // ikkalasidan biri kerak
    }

Ro'yxat bo'sh bo'lsa ([]), poller shunchaki keyingi tsiklgacha kutadi.

Har bir xodim muvaffaqiyatli kameraga yuborilgach, agar `ack_url`
sozlangan bo'lsa, poller quyidagini yuboradi (xodim qayta-qayta
qayta ishlanmasligi uchun — bu SIZNING API'ingiz tomonida "bu xodim
allaqachon yuborilgan" deb belgilashi kerak):
    POST {pull_api.ack_url}
    {"employee_id": "1001", "success": true}
"""

from __future__ import annotations

import json
import logging
import logging.handlers
import signal
import sys
import threading
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent / "isup-service"))

from adapters import AdapterProtocol, DeviceCredentials  # noqa: E402
from device_registry import load_devices  # noqa: E402
from employee_ingest import resolve_delete_api_config, resolve_pull_api_config, run_employee_sync_loop  # noqa: E402
from service import DeviceSyncService  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler("poller.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("poller")

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        logger.error("config.json topilmadi")
        sys.exit(1)
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.error("config.json noto'g'ri formatda (JSON xatosi): %s", exc)
        sys.exit(1)


def connect_devices(sync_service: DeviceSyncService, devices: list[dict]) -> list[str]:
    """Barcha config.json'dagi kameralarga ulanadi, muvaffaqiyatli ulangan
    barcha IP'lar ro'yxatini qaytaradi (xodim sinxronizatsiyasi shu
    ro'yxatdagi HAR BIR kameraga yuboriladi, faqat birinchisiga emas)."""
    connected_ips: list[str] = []
    for device in devices:
        try:
            creds = DeviceCredentials(
                ip=device["ip"], port=device.get("port", 80),
                username=device.get("username", "admin"), password=device["password"],
            )
            # poller.py faqat PULL (xodim sinxronizatsiyasi) uchun — hodisa
            # oqimi (event monitoring) kerak emas, shuning uchun o'chiramiz
            sync_service.register_device(
                device_id=device["ip"], creds=creds, preferred_protocol=AdapterProtocol.ISUP_SDK,
                enable_event_monitoring=False,
            )
            connected_ips.append(device["ip"])
            logger.info("✅ %s ulandi", device["ip"])
        except Exception as exc:  # noqa: BLE001
            logger.error("❌ %s ga ulanib bo'lmadi: %s", device["ip"], exc)
    return connected_ips


def main() -> None:
    config = load_config()
    devices = load_devices(config)
    if not devices:
        logger.error("Kameralar ro'yxati bo'sh (config.json'dagi 'devices' ham, backend ham natija bermadi)")
        sys.exit(1)

    pull_cfg = resolve_pull_api_config(config)
    if not pull_cfg.get("url"):
        logger.error("config.json'da 'pull_api.url' yoki 'backend.base_url' to'ldirilmagan. Iltimos, veb dasturingizdan olingan API manzilini kiriting.")
        sys.exit(1)
    delete_cfg = resolve_delete_api_config(config)

    sync_service = DeviceSyncService()
    connected_ips = connect_devices(sync_service, devices)
    if not connected_ips:
        logger.error("Hech bir qurilmaga ulanib bo'lmadi. Chiqilmoqda.")
        sys.exit(1)

    stop_event = threading.Event()

    def _signal_handler(signum, frame):
        logger.info("🛑 To'xtatilmoqda...")
        stop_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    run_employee_sync_loop(sync_service, connected_ips, pull_cfg, stop_event, delete_cfg=delete_cfg)


if __name__ == "__main__":
    main()

