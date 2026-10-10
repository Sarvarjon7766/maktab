# -*- coding: utf-8 -*-
"""
isup-service / device_registry.py

Kameralar (devices) ro'yxatini qayerdan olishni hal qiladi. Ilgari bu
ro'yxat FAQAT config.json'dagi "devices" massividan kelardi — endi admin
panelda ("Kameralar" bo'limi) qo'shilgan kameralar ham backend orqali
ishlatilishi mumkin.

QOIDA (backward-compatible):
    - config.json'dagi "devices" bo'sh bo'lmasa — O'SHA ishlatiladi
      (qo'lda sozlash/test uchun, hech narsa buzilmaydi).
    - Bo'sh bo'lsa — backend'dan (`GET {backend.base_url}/api/camera/devices`,
      `backend.token` bilan) olinadi.

Diqqat: bu FAQAT ishga tushishda (yoki qayta ishga tushirilganda) bir
marta chaqiriladi — runtime'da avtomatik qayta yuklash yo'q (buni ataylab
qilmadik: DeviceSyncService._sessions lock'siz, bir xil device_id qayta
register qilinsa eski adapter sessiyasi to'g'ri yopilmasdan almashtirilib
qolishi mumkin — shuning uchun kamera ro'yxatini o'zgartirgandan keyin
serverni qayta ishga tushirish talab qilinadi, xuddi config.json'ni
tahrirlagandagidek).
"""

from __future__ import annotations

import logging
from typing import Any

import requests

logger = logging.getLogger("isup_service.device_registry")


def _validate_devices(devices: list[Any], source: str) -> list[dict[str, Any]]:
    """Har bir qurilma yozuvida majburiy 'ip' maydoni borligini tekshiradi.
    Bitta noto'g'ri/chala yozuv (masalan qo'lda tahrirlashda xato qilingan
    config.json yoki admin panelidan yaroqsiz ma'lumot bilan qo'shilgan
    kamera) butun jarayonni (barcha qurilmalar bilan) KeyError bilan
    yiqitib qo'ymasligi uchun — bunday yozuvlar o'tkazib yuboriladi,
    faqat log'ga yoziladi."""
    valid = []
    for i, d in enumerate(devices):
        if not isinstance(d, dict) or not d.get("ip"):
            logger.error(
                "%s: %d-qurilma yozuvida 'ip' maydoni yo'q yoki noto'g'ri — o'tkazib yuborildi: %r",
                source, i, d,
            )
            continue
        valid.append(d)
    return valid


def load_devices(config: dict[str, Any], timeout: float = 15.0) -> list[dict[str, Any]]:
    local_devices = config.get("devices") or []
    if local_devices:
        valid = _validate_devices(local_devices, "config.json")
        logger.info("Kameralar ro'yxati config.json'dan olindi (%d ta)", len(valid))
        return valid

    backend_cfg = config.get("backend", {})
    base_url = (backend_cfg.get("base_url") or "").rstrip("/")
    token = backend_cfg.get("token", "")
    if not base_url:
        logger.error(
            "config.json'da 'devices' bo'sh va 'backend.base_url' ham to'ldirilmagan — "
            "kameralar ro'yxatini olib bo'lmadi."
        )
        return []

    url = f"{base_url}/api/camera/devices"
    try:
        resp = requests.get(url, headers={"Authorization": token}, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        devices = data.get("devices", []) if isinstance(data, dict) else []
        valid = _validate_devices(devices, url)
        logger.info("Kameralar ro'yxati backend'dan olindi (%s): %d ta", url, len(valid))
        return valid
    except Exception as exc:  # noqa: BLE001
        logger.error("Kameralar ro'yxatini backend'dan olishda xatolik (%s): %s", url, exc)
        return []

