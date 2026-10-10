# -*- coding: utf-8 -*-
"""
app.py

Xodim qo'shish + hodisalarni kuzatish — ikkalasi ham BITTA joydan,
`config.json` faylidan sozlanadi. Ushbu faylda (app.py) hech qanday IP,
parol yoki token yo'q va bo'lmaydi — hammasi config.json'da.

JOYLASHUV:
    isup-service (1)\\
        isup-service\\        <-- paket
        config.json            <-- BARCHA sozlamalar shu yerda
        app.py                 <-- BU FAYL (tegilmaydi)

CONFIG.JSON TUZILISHI:
    {
      "backend": {"base_url": "https://sizning-domeningiz.uz", "token": "..."},
      "web_api": {"url": "", "token": ""},   // bo'sh qoldirilsa backend.base_url'dan hosil bo'ladi
      "telegram": {"bot_token": "...", "chat_id": "..."},
      "devices": [
        {"ip": "...", "port": 80, "username": "admin", "password": "...",
         "qayer": "1", "where": "2", "joy": "kirish", "post": "1"},
        ...
      ]
    }

    Yangi tuman/server uchun ODATDA FAQAT "backend" bo'limini (va devices
    ro'yxatidagi kamera IP/login/parollarni) o'zgartirasiz — web_api,
    pull_api va boshqa URL'lar shu domendan avtomatik hosil bo'ladi.

ISHLATISH:

  1) TAVSIYA ETILADI — hammasi birga, bitta jarayonda: hodisalarni
     kuzatish + yangi xodimlarni fon oqimida kameraga qo'shish +
     o'chirilgan xodimlarni kameradan tozalash:
     python app.py run

  2) Faqat hodisalarni kuzatish (xodim sinxronizatsiyasisiz):
     python app.py monitor

  3) Bitta xodimni qo'lda kameraga qo'shish (config.json'dagi
     qurilmalardan birini IP orqali tanlab):
     python app.py add-employee --device 192.168.2.133 \
         --employee-id 1001 --name "Ali Valiyev" --photo ./ali.jpg

Sozlamalarni o'zgartirish uchun faqat config.json'ni tahrirlang —
app.py'ga hech narsa yozish shart emas, dastur qayta ishga tushirilganda
yangi qiymatlarni o'qiydi.
"""

from __future__ import annotations

import argparse
import json
import logging
import logging.handlers
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

import requests

sys.path.insert(0, str(Path(__file__).parent / "isup-service"))

from adapters import (  # noqa: E402
    AdapterProtocol,
    DeviceCredentials,
    DeviceOnlineStatus,
    FaceRecord,
    UserRecord,
    VerifyMode,
)
from device_registry import load_devices  # noqa: E402
from employee_ingest import resolve_delete_api_config, resolve_pull_api_config, run_employee_sync_loop  # noqa: E402
from event_sinks import (  # noqa: E402
    AsyncEventSink,
    CompositeEventSink,
    DedupEventSink,
    EventWatchdog,
    StatusNotifier,
    TelegramEventSink,
    WatchdogTouchSink,
    WebApiEventSink,
)
from service import DeviceSyncService  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    handlers=[
        logging.handlers.RotatingFileHandler("app.log", maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger("app")

CONFIG_TEMPLATE: dict[str, Any] = {
    "backend": {"base_url": "", "token": ""},
    "web_api": {"url": "", "token": ""},
    "pull_api": {"url": "", "token": "", "ack_url": "", "poll_interval_seconds": 10},
    "delete_api": {"url": "", "token": "", "ack_url": ""},
    "telegram": {"bot_token": "", "chat_id": ""},
    "devices": [
        {"ip": "192.168.2.133", "port": 80, "username": "admin", "password": "CHANGE_ME",
         "qayer": "1", "where": "2", "joy": "kirish", "post": "1"},
    ],
}


def resolve_backend_url(config: dict[str, Any], path: str) -> tuple[str, str]:
    """web_api.url/token bo'sh bo'lsa, backend.base_url + path'dan hosil qiladi.
    Aniq to'ldirilgan web_api qiymatlari har doim ustun turadi."""
    backend_cfg = config.get("backend", {})
    base_url = backend_cfg.get("base_url", "").rstrip("/")
    web_cfg = config.get("web_api", {})
    url = web_cfg.get("url") or (f"{base_url}{path}" if base_url else "")
    token = web_cfg.get("token") or backend_cfg.get("token", "")
    return url, token


# ======================================================================
# CONFIG YUKLASH
# ======================================================================

def load_config(path: Path) -> dict[str, Any]:
    if not path.exists():
        logger.warning("%s topilmadi — namuna fayl yaratildi. Uni tahrirlab, qayta ishga tushiring.", path)
        path.write_text(json.dumps(CONFIG_TEMPLATE, indent=2, ensure_ascii=False), encoding="utf-8")
        sys.exit(1)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        logger.error("config.json noto'g'ri formatda: %s", exc)
        sys.exit(1)


def find_device(config: dict[str, Any], ip: str) -> Optional[dict[str, Any]]:
    for device in load_devices(config):
        if device.get("ip") == ip:
            return device
    return None


# ======================================================================
# REJIM 1: xodim qo'shish
# ======================================================================

def cmd_add_employee(args: argparse.Namespace, config: dict[str, Any]) -> None:
    device = find_device(config, args.device)
    if not device:
        logger.error("config.json'da '%s' IP li qurilma topilmadi. devices ro'yxatini tekshiring.", args.device)
        sys.exit(1)

    photo_path = Path(args.photo)
    if not photo_path.exists():
        logger.error("Rasm topilmadi: %s", photo_path)
        sys.exit(1)

    sync_service = DeviceSyncService()
    creds = DeviceCredentials(
        ip=device["ip"], port=device.get("port", 80),
        username=device.get("username", "admin"), password=device["password"],
    )

    logger.info("Qurilmaga ulanmoqda: %s:%s", device["ip"], device.get("port", 80))
    device_info = sync_service.register_device(
        device_id=device["ip"], creds=creds, preferred_protocol=AdapterProtocol.ISUP_SDK,
        enable_event_monitoring=False,
    )
    logger.info("Ulandi: model=%s firmware=%s protokol=%s",
                device_info.model, device_info.firmware_version, device_info.protocol.value)

    user = UserRecord(
        employee_no=args.employee_id, name=args.name,
        gender="male", user_type="normal", verify_mode=VerifyMode.FACE,
    )
    logger.info("Xodim yuborilmoqda: %s (%s)", user.employee_no, user.name)
    result = sync_service.sync_user_to_device(device["ip"], user)
    if result.status.value != "success":
        logger.error("Xodim yaratish muvaffaqiyatsiz: %s / %s", result.status_code, result.error_message)
        sys.exit(1)
    logger.info("✅ Xodim yaratildi")

    face = FaceRecord(employee_no=args.employee_id, image_bytes=photo_path.read_bytes())
    logger.info("Yuz rasmi yuklanmoqda...")
    face_result = sync_service.sync_face_to_device(device["ip"], face)
    if face_result.status.value != "success":
        logger.error("Yuz yuklash muvaffaqiyatsiz: %s / %s", face_result.status_code, face_result.error_message)
        sys.exit(1)
    logger.info("✅ Yuz muvaffaqiyatli yuklandi. Tugadi.")


# ======================================================================
# REJIM 2: hodisalarni kuzatish
# ======================================================================

def build_sink(config: dict[str, Any], devices: list[dict[str, Any]]) -> CompositeEventSink:
    web_url, web_token = resolve_backend_url(config, "/api/events/hik")
    tg_cfg = config.get("telegram", {})
    device_meta = {d["ip"]: d for d in devices}

    web_sink = WebApiEventSink(api_url=web_url, api_token=web_token, device_meta=device_meta)
    telegram_sink = TelegramEventSink(bot_token=tg_cfg.get("bot_token", ""), chat_id=tg_cfg.get("chat_id", ""), device_meta=device_meta)
    composite = CompositeEventSink(sinks=[web_sink, telegram_sink])
    return CompositeEventSink(sinks=[DedupEventSink(composite, ttl_seconds=300)])


def _start_status_heartbeat(
    config: dict[str, Any],
    sync_service: DeviceSyncService,
    interval: float = 30.0,
) -> tuple[threading.Thread, threading.Event]:
    """Har `interval` soniyada barcha ulangan kameralarning onlayn/oflayn
    holatini (`heartbeat_all`) tekshirib, backend'ga (`POST /api/camera/status`)
    yuboradi — admin panelda kamera kartochkasidagi yashil/qizil nuqta shu
    orqali yangilanadi. `backend.base_url` sozlanmagan bo'lsa jimgina
    o'chirilgan holda qoladi."""
    backend_cfg = config.get("backend", {})
    base_url = (backend_cfg.get("base_url") or "").rstrip("/")
    token = backend_cfg.get("token", "")
    stop_event = threading.Event()

    def _loop() -> None:
        if not base_url:
            logger.info("ℹ️ 'backend.base_url' sozlanmagan — kamera holati backendga yuborilmaydi.")
            return
        status_url = f"{base_url}/api/camera/status"
        while not stop_event.is_set():
            try:
                snapshots = sync_service.heartbeat_all()
                if snapshots:
                    statuses = [
                        {
                            "cameraIp": s.device_id,
                            "online": s.online == DeviceOnlineStatus.ONLINE,
                            "error": None if s.online == DeviceOnlineStatus.ONLINE else "Qurilma javob bermadi",
                        }
                        for s in snapshots
                    ]
                    requests.post(status_url, json={"statuses": statuses}, headers={"Authorization": token}, timeout=15)
            except Exception as exc:  # noqa: BLE001
                # Bitta muvaffaqiyatsiz tsikl butun heartbeat oqimini abadiy
                # to'xtatib qo'ymasligi kerak — shuning uchun eng tashqi
                # try/except (faqat requests.post emas, heartbeat_all() ham).
                logger.warning("Kamera holatini yuborishda xatolik: %s", exc)
            stop_event.wait(interval)

    thread = threading.Thread(target=_loop, daemon=True)
    thread.start()
    return thread, stop_event


def _start_monitoring(config: dict[str, Any], devices: list[dict[str, Any]]) -> tuple[DeviceSyncService, EventWatchdog, list[str]]:
    """Qurilmalarni ISAPI orqali ro'yxatdan o'tkazadi, watchdog va event
    sink'ni ishga tushiradi. `monitor` va `run` rejimlarining ikkalasi
    ham shu umumiy o'rnatish bosqichidan foydalanadi."""
    tg_cfg = config.get("telegram", {})
    device_meta = {d["ip"]: d for d in devices}
    notifier = StatusNotifier(bot_token=tg_cfg.get("bot_token", ""), chat_id=tg_cfg.get("chat_id", ""), device_meta=device_meta)
    notifier.send_startup()

    watchdog = EventWatchdog(notifier, stale_after_seconds=60, check_interval=5)
    watchdog.start()

    # AsyncEventSink — Web API/Telegram'ga yuborish (tarmoq orqali, sekin
    # bo'lishi mumkin) kamera-poll siklidan ALOHIDA fon oqimida bajariladi,
    # shu bilan bitta hodisani yetkazishdagi kechikish keyingi hodisalarni
    # (kamera "Rahmat" deb tanigan lahzadan) aniqlashni kechiktirmaydi.
    # WatchdogTouchSink esa ENG TASHQARIDA qoladi — u faqat vaqt belgisini
    # yangilaydi (tezkor), shu sabab kechiktirilmasdan darhol ishlashi kerak.
    sink = WatchdogTouchSink(AsyncEventSink(build_sink(config, devices)), watchdog)
    sync_service = DeviceSyncService(event_sink=sink)

    logger.info("🚀 Event monitoring boshlanmoqda: %d ta qurilma", len(devices))

    connected_ips: list[str] = []
    for device in devices:
        try:
            creds = DeviceCredentials(
                ip=device["ip"], port=device.get("port", 80),
                username=device.get("username", "admin"), password=device["password"],
            )
            info = sync_service.register_device(
                device_id=device["ip"], creds=creds,
                preferred_protocol=AdapterProtocol.ISAPI_HTTP,
                status_callback=notifier.handle_status_snapshot,
            )
            connected_ips.append(device["ip"])
            logger.info("✅ %s ulandi (%s, firmware %s)", device["ip"], info.model, info.firmware_version)
        except Exception as exc:  # noqa: BLE001
            logger.error("❌ %s ga ulanib bo'lmadi: %s", device["ip"], exc)

    return sync_service, watchdog, connected_ips


def cmd_monitor(args: argparse.Namespace, config: dict[str, Any]) -> None:
    devices = load_devices(config)
    if not devices:
        logger.error("Kameralar ro'yxati bo'sh (config.json'dagi 'devices' ham, backend ham natija bermadi).")
        sys.exit(1)

    shutdown = {"flag": False}

    def _signal_handler(signum, frame):
        logger.info("🛑 To'xtatilmoqda (signal=%s)...", signum)
        shutdown["flag"] = True

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    sync_service, watchdog, connected_ips = _start_monitoring(config, devices)
    if not connected_ips:
        logger.error("Hech bir qurilmaga ulanib bo'lmadi. Chiqilmoqda.")
        sys.exit(1)

    logger.info("📡 %d/%d qurilma onlayn, hodisalar kuzatilmoqda...", len(connected_ips), len(devices))
    _, heartbeat_stop = _start_status_heartbeat(config, sync_service)

    try:
        while not shutdown["flag"]:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    heartbeat_stop.set()
    watchdog.stop()
    for ip in connected_ips:
        sync_service.unregister_device(ip)
    logger.info("✅ Dastur to'liq to'xtatildi")


# ======================================================================
# REJIM 3: hammasi birga — kuzatish + xodim sinxronizatsiyasi (BITTA jarayon)
# ======================================================================

def cmd_run(args: argparse.Namespace, config: dict[str, Any]) -> None:
    devices = load_devices(config)
    if not devices:
        logger.error("Kameralar ro'yxati bo'sh (config.json'dagi 'devices' ham, backend ham natija bermadi).")
        sys.exit(1)

    stop_event = threading.Event()

    def _signal_handler(signum, frame):
        logger.info("🛑 To'xtatilmoqda (signal=%s)...", signum)
        stop_event.set()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    sync_service, watchdog, connected_ips = _start_monitoring(config, devices)
    if not connected_ips:
        logger.error("Hech bir qurilmaga ulanib bo'lmadi. Chiqilmoqda.")
        sys.exit(1)

    logger.info("📡 %d/%d qurilma onlayn, hodisalar kuzatilmoqda...", len(connected_ips), len(devices))
    _, heartbeat_stop = _start_status_heartbeat(config, sync_service)

    # Xodim sinxronizatsiyasi (PULL) — SHU jarayonning fon oqimida, allaqachon
    # ulangan qurilma sessiyasini qayta ishlatib. backend.base_url sozlanmagan
    # bo'lsa, bu qism jimgina o'chirilgan holda qoladi (faqat kuzatish ishlaydi).
    pull_cfg = resolve_pull_api_config(config)
    delete_cfg = resolve_delete_api_config(config)
    sync_thread: Optional[threading.Thread] = None
    if pull_cfg.get("url"):
        sync_thread = threading.Thread(
            target=run_employee_sync_loop,
            args=(sync_service, connected_ips, pull_cfg, stop_event),
            kwargs={"delete_cfg": delete_cfg},
            daemon=True,
        )
        sync_thread.start()
    else:
        logger.info("ℹ️ 'backend.base_url'/'pull_api.url' sozlanmagan — xodim sinxronizatsiyasi o'chirilgan, faqat kuzatish ishlaydi.")

    try:
        while not stop_event.is_set():
            time.sleep(1)
    except KeyboardInterrupt:
        stop_event.set()

    if sync_thread:
        sync_thread.join(timeout=10)
    heartbeat_stop.set()
    watchdog.stop()
    for ip in connected_ips:
        sync_service.unregister_device(ip)
    logger.info("✅ Dastur to'liq to'xtatildi")


# ======================================================================
# CLI
# ======================================================================

def main() -> None:
    parser = argparse.ArgumentParser(description="Hikvision boshqaruv vositasi (xodim qo'shish + monitoring)")
    parser.add_argument("--config", default="config.json", help="Sozlamalar fayli (default: config.json)")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_add = subparsers.add_parser("add-employee", help="config.json'dagi qurilmalardan biriga xodim qo'shish")
    p_add.add_argument("--device", required=True, help="config.json'dagi qurilma IP manzili")
    p_add.add_argument("--employee-id", required=True)
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--photo", required=True)
    p_add.set_defaults(func=cmd_add_employee)

    p_monitor = subparsers.add_parser("monitor", help="config.json'dagi barcha qurilmani real-vaqtda kuzatish (xodim sinxronizatsiyasisiz)")
    p_monitor.set_defaults(func=cmd_monitor)

    p_run = subparsers.add_parser("run", help="TAVSIYA ETILADI: kuzatish + xodim sinxronizatsiyasi BITTA jarayonda birga")
    p_run.set_defaults(func=cmd_run)

    args = parser.parse_args()
    config = load_config(Path(args.config))
    args.func(args, config)


if __name__ == "__main__":
    main()

