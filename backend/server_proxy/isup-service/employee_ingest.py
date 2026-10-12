# -*- coding: utf-8 -*-
"""
isup-service / employee_ingest.py

webhook_server.py (push/webhook usuli), poller.py va app.py'ning `run`
rejimi — barchasi ishlatadigan umumiy logika: rasmni tekshirish/tayyorlash,
xodimni kameraga yuborish, hamda backend'ning "pending xodimlar" API'sidan
(PULL usuli) navbatni o'qib kameraga yuklash tsikli. Ikki-uch joyda
alohida-alohida yozilmasligi uchun shu yerga chiqarilgan.
"""

from __future__ import annotations

import base64
import io
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Optional

import requests
from PIL import Image, UnidentifiedImageError

from adapters import FaceRecord, UserRecord, VerifyMode
from service import DeviceSyncService

logger = logging.getLogger("isup_service.employee_ingest")

# Hikvision terminallar odatda JPEG, ~200KB dan kichik, va uzun tomoni
# taxminan 1920px dan oshmagan rasmni qabul qiladi. Aniq limit modelga
# qarab farq qiladi, shuning uchun bu yerda "xavfsiz" umumiy qiymatlar
# ishlatiladi — kerak bo'lsa moslashtiring.
MAX_DIMENSION = 1920
JPEG_QUALITY = 90
MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024  # 2 MB


class IngestError(Exception):
    """Foydalanuvchiga tushunarli xato — HTTP status yoki log darajasini
    chaqiruvchi (webhook_server.py / poller.py / app.py) o'zi belgilaydi."""


def validate_and_prepare_photo(photo_bytes: bytes) -> bytes:
    """Kameraga yuborishdan oldin rasmni tekshiradi va tayyorlaydi:
    haqiqiy rasm ekanligini tasdiqlaydi, JPEG'ga o'tkazadi, kerak bo'lsa
    kichraytiradi. Xom baytlarni hech qachon o'zgarishsiz yubormaydi."""
    if not photo_bytes:
        raise IngestError("Rasm bo'sh")
    if len(photo_bytes) > MAX_FILE_SIZE_BYTES:
        raise IngestError(f"Rasm juda katta ({len(photo_bytes)} bayt, limit {MAX_FILE_SIZE_BYTES} bayt)")

    # Image.verify() faqat FAYL TUZILISHINI tekshiradi, piksel ma'lumotini
    # dekodlamaydi — kesilgan/buzilgan JPEG shu tekshiruvdan muvaffaqiyatli
    # o'tishi, keyin convert()/thumbnail()/save()da (haqiqiy dekodlash
    # sodir bo'lganda) xato berishi mumkin. Shu sabab BUTUN tayyorlash
    # jarayoni (convert/thumbnail/save ham) bitta try/except ichida —
    # aks holda bu yerdagi xom OSError push_employee_to_camera'ning
    # faqat IngestError'ni tutuvchi bloklaridan sirtqariga chiqib ketardi.
    try:
        img = Image.open(io.BytesIO(photo_bytes))
        img.verify()
        img = Image.open(io.BytesIO(photo_bytes))  # verify() streamni "yeb qo'yadi" — qayta ochamiz

        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        if max(img.size) > MAX_DIMENSION:
            img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)

        output = io.BytesIO()
        img.save(output, format="JPEG", quality=JPEG_QUALITY)
        return output.getvalue()
    except UnidentifiedImageError:
        raise IngestError("Fayl haqiqiy rasm emas yoki buzilgan")
    except IngestError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise IngestError(f"Rasmni o'qib/tayyorlab bo'lmadi: {exc}")


def build_full_name(name: Optional[str], ism: Optional[str], familya: Optional[str], otchestva: Optional[str]) -> str:
    if name:
        return name.strip()
    parts = [p for p in (familya, ism, otchestva) if p]
    full = " ".join(parts).strip()
    if not full:
        raise IngestError("Ism/familya yoki name kiritilishi shart")
    return full


@dataclass
class PushResult:
    success: bool
    employee_id: str
    name: str
    device: str
    error: Optional[str] = None


def push_employee_to_camera(
    sync_service: DeviceSyncService,
    device_ip: str,
    employee_id: str,
    full_name: str,
    photo_bytes: bytes,
) -> PushResult:
    if not sync_service.is_registered(device_ip):
        return PushResult(False, employee_id, full_name, device_ip, error=f"'{device_ip}' kamerasi ulanmagan")

    try:
        prepared_photo = validate_and_prepare_photo(photo_bytes)
    except IngestError as exc:
        return PushResult(False, employee_id, full_name, device_ip, error=str(exc))

    user = UserRecord(
        employee_no=employee_id, name=full_name,
        gender="male", user_type="normal", verify_mode=VerifyMode.FACE,
    )
    result = sync_service.sync_user_to_device(device_ip, user)
    if result.status.value != "success":
        return PushResult(False, employee_id, full_name, device_ip,
                           error=f"Xodim yaratish muvaffaqiyatsiz: {result.status_code} / {result.error_message}")

    face = FaceRecord(employee_no=employee_id, image_bytes=prepared_photo)
    face_result = sync_service.sync_face_to_device(device_ip, face)
    if face_result.status.value != "success":
        return PushResult(False, employee_id, full_name, device_ip,
                           error=f"Yuz yuklash muvaffaqiyatsiz: {face_result.status_code} / {face_result.error_message}")

    return PushResult(True, employee_id, full_name, device_ip)


# ======================================================================
# PULL usuli: backend'ning "pending xodimlar" navbatini so'rab, kameraga
# yuklash. poller.py (mustaqil skript) va app.py'ning `run` rejimi
# (fon oqimida) — ikkalasi ham shu funksiyalarni ishlatadi.
# ======================================================================

def resolve_pull_api_config(config: dict[str, Any]) -> dict[str, Any]:
    """pull_api.url/ack_url/token bo'sh bo'lsa, backend.base_url/token'dan
    hosil qiladi. Aniq to'ldirilgan pull_api qiymatlari har doim ustun turadi."""
    backend_cfg = config.get("backend", {})
    base_url = backend_cfg.get("base_url", "").rstrip("/")
    backend_token = backend_cfg.get("token", "")

    pull_cfg = dict(config.get("pull_api", {}))
    if not pull_cfg.get("url") and base_url:
        pull_cfg["url"] = f"{base_url}/api/employees/pending"
    if not pull_cfg.get("ack_url") and base_url:
        pull_cfg["ack_url"] = f"{base_url}/api/employees/ack"
    if not pull_cfg.get("token"):
        pull_cfg["token"] = backend_token
    pull_cfg.setdefault("poll_interval_seconds", 10)
    return pull_cfg


def resolve_delete_api_config(config: dict[str, Any]) -> dict[str, Any]:
    """delete_api.url/ack_url/token bo'sh bo'lsa, backend.base_url/token'dan
    hosil qiladi (xuddi resolve_pull_api_config kabi, faqat o'chirish navbati uchun)."""
    backend_cfg = config.get("backend", {})
    base_url = backend_cfg.get("base_url", "").rstrip("/")
    backend_token = backend_cfg.get("token", "")

    delete_cfg = dict(config.get("delete_api", {}))
    if not delete_cfg.get("url") and base_url:
        delete_cfg["url"] = f"{base_url}/api/employees/pending-deletes"
    if not delete_cfg.get("ack_url") and base_url:
        delete_cfg["ack_url"] = f"{base_url}/api/employees/delete-ack"
    if not delete_cfg.get("token"):
        delete_cfg["token"] = backend_token
    return delete_cfg


def fetch_pending_employees(pull_cfg: dict[str, Any]) -> list[dict]:
    url = pull_cfg.get("url", "")
    if not url:
        return []
    headers = {}
    token = pull_cfg.get("token", "")
    if token:
        headers["Authorization"] = token
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            data = data.get("employees", data.get("data", []))
        return data if isinstance(data, list) else []
    except Exception as exc:  # noqa: BLE001
        logger.error("Pending xodimlarni olishda xatolik: %s", exc)
        return []


def fetch_photo_bytes(item: dict) -> Optional[bytes]:
    if item.get("photo_base64"):
        try:
            return base64.b64decode(item["photo_base64"])
        except Exception as exc:  # noqa: BLE001
            logger.error("photo_base64 dekodlashda xatolik: %s", exc)
            return None
    if item.get("photo_url"):
        try:
            resp = requests.get(item["photo_url"], timeout=20)
            resp.raise_for_status()
            return resp.content
        except Exception as exc:  # noqa: BLE001
            logger.error("photo_url yuklashda xatolik: %s", exc)
            return None
    return None


def send_ack(
    pull_cfg: dict[str, Any],
    employee_id: str,
    success: bool,
    error: Optional[str] = None,
    device_results: Optional[list[dict]] = None,
) -> None:
    ack_url = pull_cfg.get("ack_url", "")
    if not ack_url:
        return
    headers = {}
    token = pull_cfg.get("token", "")
    if token:
        headers["Authorization"] = token
    payload = {"employee_id": employee_id, "success": success}
    if not success and error:
        payload["error"] = error
    if device_results:
        # Bir nechta kamera bo'lsa — har birining natijasi alohida
        # yuboriladi, backend har bir kamerani alohida saqlaydi.
        payload["device_results"] = device_results
    try:
        requests.post(ack_url, json=payload, headers=headers, timeout=15)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Ack yuborishda xatolik (%s): %s", employee_id, exc)


def process_pending_item(sync_service: DeviceSyncService, device_ips: list[str], item: dict) -> tuple[bool, Optional[str], list[dict]]:
    """(muvaffaqiyatmi, umumiy xatolik matni, har-kamera natijalari) qaytaradi.
    Xodim bir nechta kameraga (kirish/chiqish nuqtalari) BIR VAQTNING O'ZIDA
    yuboriladi — har bir kameraning natijasi (muvaffaqiyat yoki xatolik sababi:
    "rasm topilmadi", "rasm qabul qilinmadi" va h.k.) alohida-alohida backendga
    yuboriladi, shunda admin panelida har bir kamera holati ko'rinadi."""
    employee_id = item.get("employee_id")
    if not employee_id:
        logger.warning("employee_id yo'q yozuv o'tkazib yuborildi: %s", item)
        return False, "employee_id yo'q", []

    try:
        full_name = build_full_name(item.get("name"), item.get("ism"), item.get("familya"), item.get("otchestva"))
    except Exception as exc:  # noqa: BLE001
        logger.error("Ism aniqlanmadi (%s): %s", employee_id, exc)
        return False, f"Ism aniqlanmadi: {exc}", []

    photo_bytes = fetch_photo_bytes(item)
    if not photo_bytes:
        logger.error("Rasm topilmadi (%s)", employee_id)
        return False, "Rasm topilmadi yoki yuklab bo'lmadi", []

    # Aniq bitta qurilma ko'rsatilmagan bo'lsa (item["device"]) — xodim
    # ULANGAN BARCHA kameralarga BIR VAQTNING O'ZIDA yuboriladi (bir necha
    # kirish/chiqish nuqtasi bo'lgan tashkilotlar uchun). Har bir kameraga
    # boshqasidan qat'i nazar (biri xato bersa ham qolganlari) yuborishga
    # urinib ko'riladi — natijalar alohida-alohida to'planadi.
    target_ips = [item["device"]] if item.get("device") else device_ips

    def _push_to_one(device_ip: str) -> tuple[str, bool, Optional[str]]:
        logger.info("📥 Pull: %s (%s) -> %s", employee_id, full_name, device_ip)
        result = push_employee_to_camera(sync_service, device_ip, employee_id, full_name, photo_bytes)
        if result.success:
            logger.info("✅ Qo'shildi: %s -> %s", employee_id, device_ip)
            return device_ip, True, None
        logger.error("❌ Xatolik (%s) [%s]: %s", employee_id, device_ip, result.error)
        return device_ip, False, result.error

    # Bir nechta kameraga BIR VAQTNING O'ZIDA (parallel) yuboriladi — har
    # bir kameraning o'z retry/timeout siklini kutish kerak emas, aks holda
    # bitta sekin/ishlamayotgan kamera navbatdagi BOSHQA barcha kameralarni
    # (va navbatdagi keyingi xodimlarni ham) o'ziga bog'lab qo'yardi.
    # pool.map natijalarni target_ips bilan bir xil tartibda qaytaradi.
    if len(target_ips) <= 1:
        push_results = [_push_to_one(ip) for ip in target_ips]
    else:
        with ThreadPoolExecutor(max_workers=len(target_ips)) as pool:
            push_results = list(pool.map(_push_to_one, target_ips))

    all_ok = True
    errors: list[str] = []
    device_results: list[dict] = []
    for device_ip, ok, error in push_results:
        if ok:
            device_results.append({"device": device_ip, "success": True})
        else:
            all_ok = False
            errors.append(f"{device_ip}: {error}")
            device_results.append({"device": device_ip, "success": False, "error": error})
    return all_ok, ("; ".join(errors) if errors else None), device_results


def process_pending_delete(sync_service: DeviceSyncService, device_ips: list[str], item: dict) -> bool:
    employee_id = item.get("employee_id")
    if not employee_id:
        logger.warning("employee_id yo'q o'chirish yozuvi o'tkazib yuborildi: %s", item)
        return False

    target_ips = [item["device"]] if item.get("device") else device_ips
    all_ok = True
    for device_ip in target_ips:
        if not sync_service.is_registered(device_ip):
            logger.error("O'chirib bo'lmadi (%s): '%s' kamerasi ulanmagan", employee_id, device_ip)
            all_ok = False
            continue

        logger.info("🗑️ O'chirilmoqda: %s -> %s", employee_id, device_ip)
        result = sync_service.delete_user_from_device(device_ip, employee_id)
        if result.status.value == "success":
            logger.info("✅ Kameradan o'chirildi: %s -> %s", employee_id, device_ip)
        else:
            logger.error("❌ Kameradan o'chirishda xatolik (%s) [%s]: %s / %s",
                          employee_id, device_ip, result.status_code, result.error_message)
            all_ok = False
    return all_ok


def run_employee_sync_loop(
    sync_service: DeviceSyncService,
    device_ips: list[str],
    pull_cfg: dict[str, Any],
    stop_event: threading.Event,
    delete_cfg: Optional[dict[str, Any]] = None,
) -> None:
    """Backend'dan pending xodimlarni so'rab kameraga yuklab, hamda (agar
    `delete_cfg` berilgan bo'lsa) o'chirilgan xodimlarni kameradan
    tozalab turadigan davriy tsikl. `stop_event.set()` chaqirilguncha
    ishlaydi — mustaqil skript sifatida ham (poller.py), boshqa jarayon
    ichidagi fon oqimi sifatida ham (app.py'ning `run` rejimi) ishlatish
    uchun mo'ljallangan."""
    poll_interval = pull_cfg.get("poll_interval_seconds", 10)
    logger.info("🔄 Xodim sinxronizatsiyasi ishga tushdi. Har %s soniyada tekshiriladi: %s",
                poll_interval, pull_cfg.get("url", ""))

    while not stop_event.is_set():
        pending = fetch_pending_employees(pull_cfg)
        if pending:
            logger.info("📋 %d ta yangi xodim topildi", len(pending))
        for item in pending:
            if stop_event.is_set():
                break
            # Bitta xodimni qayta ishlashda kutilmagan xato butun
            # sinxronizatsiya tsiklini (demak barcha keyingi xodimlarni ham,
            # chunki bu funksiya bitta doimiy fon oqimida ishlaydi) abadiy
            # to'xtatib qo'ymasligi kerak — shu sabab har bir item alohida
            # himoyalangan.
            try:
                ok, err, device_results = process_pending_item(sync_service, device_ips, item)
                send_ack(pull_cfg, item.get("employee_id", ""), success=ok, error=err, device_results=device_results)
            except Exception as exc:  # noqa: BLE001
                logger.error("Xodimni qayta ishlashda kutilmagan xato (%s): %s", item.get("employee_id"), exc, exc_info=True)
                # ack yuborilmasa, backend bu urinish haqida hech qachon
                # bilmaydi va xuddi shu (buzuq) yozuvni HAR poll siklida
                # (standart 10 soniyada bir) abadiy qayta yuborib turaveradi —
                # ack "muvaffaqiyatsiz" deb yuborilishi kerak, boshqa
                # elementlar/keyingi sikllar davom etishi uchun
                try:
                    send_ack(pull_cfg, item.get("employee_id", ""), success=False, error=f"Kutilmagan xato: {exc}")
                except Exception:  # noqa: BLE001
                    logger.error("Ack yuborishda ham xato (%s)", item.get("employee_id"), exc_info=True)

        if delete_cfg and delete_cfg.get("url") and not stop_event.is_set():
            pending_deletes = fetch_pending_employees(delete_cfg)
            if pending_deletes:
                logger.info("📋 %d ta o'chiriladigan xodim topildi", len(pending_deletes))
            for item in pending_deletes:
                if stop_event.is_set():
                    break
                try:
                    ok = process_pending_delete(sync_service, device_ips, item)
                    send_ack(delete_cfg, item.get("employee_id", ""), success=ok)
                except Exception as exc:  # noqa: BLE001
                    logger.error("Xodimni o'chirishda kutilmagan xato (%s): %s", item.get("employee_id"), exc, exc_info=True)
                    try:
                        send_ack(delete_cfg, item.get("employee_id", ""), success=False, error=f"Kutilmagan xato: {exc}")
                    except Exception:  # noqa: BLE001
                        logger.error("Ack yuborishda ham xato (%s)", item.get("employee_id"), exc_info=True)

        stop_event.wait(poll_interval)

    logger.info("✅ Xodim sinxronizatsiyasi to'xtatildi")

