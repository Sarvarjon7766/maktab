# -*- coding: utf-8 -*-
"""
isup-service / event_sinks.py

`EventSink` implementations — where normalized `InternalEvent`s go after
device-service/isup-service produces them. This replaces the Web-API +
Telegram delivery logic from the standalone event-monitor script, now
built on the shared `InternalEvent` shape so it works for ANY adapter
(ISAPI alertStream today, ISUP SDK push once wired).

SECURITY NOTE
-------------
The original script had a live Telegram bot token and API token written
directly in the source. Never do that — anyone with the file can use
them. This module reads credentials from environment variables instead:

    WEB_API_URL, WEB_API_TOKEN
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

If the tokens from the old script were ever committed/shared, rotate them.
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import requests

from adapters import DeviceOnlineStatus, DeviceStatusSnapshot, InternalEvent

logger = logging.getLogger("isup_service.event_sinks")


def send_telegram_message(bot_token: str, chat_id: str, text: str, timeout: float = 10.0) -> bool:
    """Low-level, reusable Telegram send — used both for event notifications
    and for status messages (startup, online/offline, watchdog warnings)."""
    if not bot_token or not chat_id:
        logger.debug("Telegram credentials not set — skipping message")
        return False
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        resp = requests.post(url, data={"chat_id": chat_id, "text": text}, timeout=timeout)
        resp.raise_for_status()
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error("Telegram delivery failed: %s", exc)
        return False


class NonRetryableError(Exception):
    """4xx kabi doimiy (business-logic) xatolar uchun — qayta urinish
    natijani hech qachon o'zgartirmaydi, shuning uchun _retry buni darhol
    qayta ko'tarishi kerak (FIFO navbatni bloklamaslik uchun)."""


def _retry(func, max_retries: int = 3, delay: float = 2.0):
    for attempt in range(1, max_retries + 1):
        try:
            return func()
        except NonRetryableError:
            raise
        except Exception as exc:  # noqa: BLE001
            if attempt == max_retries:
                raise
            logger.warning("Retrying after error (%s/%s): %s", attempt, max_retries, exc)
            time.sleep(delay)


# ======================================================================
# Web API sink
# ======================================================================

@dataclass
class WebApiEventSink:
    api_url: str = field(default_factory=lambda: os.environ.get("WEB_API_URL", ""))
    api_token: str = field(default_factory=lambda: os.environ.get("WEB_API_TOKEN", ""))
    timeout: float = 15.0
    # optional per-device site labels: {"192.168.2.133": {"qayer": "1", "where": "2", "joy": "kirish", "post": "1"}}
    device_meta: dict[str, dict[str, str]] = field(default_factory=dict)
    verify_tls: bool = True

    def publish(self, event: InternalEvent) -> None:
        if not self.api_url:
            logger.debug("WEB_API_URL not set — skipping Web API delivery")
            return

        meta = self.device_meta.get(event.device_id, {})
        # Diqqat: `camera_time`ni qurilma yuborgan XOM (raw) dateTime satri
        # bilan to'ldiramiz (event.raw ichida) — original hik1.py xuddi shu
        # qiymatni yuborgan va API shunga moslashtirilgan bo'lishi mumkin.
        # Agar biror sababdan mavjud bo'lmasa, ISO formatga tushamiz.
        camera_time = event.raw.get("dateTime") or event.occurred_at.isoformat()

        payload = {
            "device_ip": event.device_id,
            "camera_time": camera_time,
            "server_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "name": event.raw.get("AccessControllerEvent", {}).get("name", ""),
            "employee_id": event.employee_no or "",
            "event_type": event.event_type,
            "verify_mode": event.verify_mode.value if event.verify_mode else "",
            "qayer": meta.get("qayer", ""),
            "where": meta.get("where", ""),
            "joy": meta.get("joy", ""),
            "post": meta.get("post", ""),
            "card_no": event.card_no or "",
            "source": "event",
        }

        def _send():
            resp = requests.post(
                self.api_url,
                json=payload,
                headers={"Authorization": self.api_token, "Content-Type": "application/json"},
                timeout=self.timeout,
                verify=self.verify_tls,
            )
            if resp.status_code == 404:
                # Xodim bazada topilmadi — bu kutilgan holat (hali
                # sinxronlanmagan yoki tanish xatosi), xato emas. Qayta
                # urinishning ma'nosi yo'q (natija hech qachon o'zgarmaydi),
                # shuning uchun bu yerda raise qilinmaydi.
                return resp
            if resp.status_code >= 400:
                # Server javobining tanasini ko'rsatamiz — bu haqiqiy xatoning
                # aniq sababi (qaysi maydon yetishmayapti/noto'g'ri) odatda
                # shu yerda yoziladi.
                logger.error("Web API javobi [%s]: %s", resp.status_code, resp.text[:1000])
                if resp.status_code < 500:
                    # 4xx — so'rovning o'zi rad etilgan (validatsiya/ruxsat
                    # xatosi). Xuddi shu payloadni qayta yuborish natijani
                    # o'zgartirmaydi, shuning uchun qayta urinmasdan darhol
                    # xato qaytaramiz.
                    raise NonRetryableError(f"Web API {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()
            return resp

        try:
            resp = _retry(_send)
            if resp.status_code == 404:
                logger.info("Web API: xodim topilmadi (employee_id=%s, name=%s) — o'tkazib yuborildi",
                             payload.get("employee_id"), payload.get("name"))
            else:
                logger.info("Web API: yuborildi (%s)", payload.get("name") or event.employee_no)
        except Exception as exc:  # noqa: BLE001
            logger.error("Web API delivery failed: %s", exc)
            logger.debug("Web API yuborilgan payload: %s", payload)


# ======================================================================
# Telegram sink
# ======================================================================

@dataclass
class TelegramEventSink:
    bot_token: str = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id: str = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID", ""))
    timeout: float = 10.0
    # optional per-device site labels, same shape as WebApiEventSink.device_meta
    device_meta: dict[str, dict[str, str]] = field(default_factory=dict)
    # Bir xodim ketma-ket bir necha marta tanish urinsa (masalan rad
    # etilgach qayta-qayta urinib ko'rgani uchun), shu vaqt oynasida faqat
    # BITTA Telegram xabari yuboriladi — hodisaning o'zi baribir odatdagidek
    # ishlanadi, faqat bildirishnoma spam bo'lishining oldi olinadi.
    notify_cooldown_seconds: float = 60.0
    _last_notified: dict[str, float] = field(default_factory=dict, repr=False, compare=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False, compare=False)

    def publish(self, event: InternalEvent) -> None:
        if not self.bot_token or not self.chat_id:
            logger.debug("Telegram credentials not set — skipping Telegram delivery")
            return

        name = event.raw.get("AccessControllerEvent", {}).get("name", "")
        if not name or name.strip().lower() in {"unknown", "noma'lum foydalanuvchi"}:
            return

        throttle_key = event.employee_no or event.device_id
        now = time.time()
        with self._lock:
            # opportunistic cleanup — DedupEventSink._seen'dagi bilan bir xil
            # naqsh: bu jarayon haftalar/oylab uzluksiz ishlaydi, cooldown
            # muddati o'tgan yozuvlar tozalanmasa _last_notified har bir
            # yangi employee_no/device_id uchun abadiy o'sib boraveradi
            expired = [k for k, ts in self._last_notified.items() if now - ts > self.notify_cooldown_seconds]
            for k in expired:
                del self._last_notified[k]

            last_notified = self._last_notified.get(throttle_key)
            if last_notified is not None and (now - last_notified) < self.notify_cooldown_seconds:
                logger.debug("Telegram: bildirishnoma cooldown sababli o'tkazib yuborildi (%s)", throttle_key)
                return
            self._last_notified[throttle_key] = now

        meta = self.device_meta.get(event.device_id, {})
        joy_direction = f"{meta.get('joy', '')} {meta.get('post', '')}".strip()
        camera_time = event.raw.get("dateTime") or event.occurred_at.isoformat()
        server_time = time.strftime("%Y-%m-%d %H:%M:%S")

        text = (
            f"👤 Hodim: {name}\n"
            f"🆔 ID: {event.employee_no or ''}\n"
        )
        if joy_direction:
            text += f"➡️ Harakat: {joy_direction}\n"
        text += (
            f"🕒 Server vaqti: {server_time}\n"
            f"📷 Kamera vaqti: {camera_time}\n"
            f"🔑 Tekshiruv: {event.verify_mode.value if event.verify_mode else ''}\n"
            f"🌍 Qurilma: {event.device_id}\n"
            f"📌 Manba: {event.raw.get('source', 'event').upper()}"
        )
        if event.card_no:
            text += f"\n💳 Karta: {event.card_no}"

        if send_telegram_message(self.bot_token, self.chat_id, text, self.timeout):
            logger.info("Telegram: yuborildi (%s)", name)


# ======================================================================
# Composite + dedup wrappers
# ======================================================================

@dataclass
class CompositeEventSink:
    """Fans one event out to several sinks; one sink's failure doesn't block the others."""
    sinks: list = field(default_factory=list)

    def publish(self, event: InternalEvent) -> None:
        for sink in self.sinks:
            try:
                sink.publish(event)
            except Exception as exc:  # noqa: BLE001
                logger.error("Sink %s failed: %s", type(sink).__name__, exc)


class DedupEventSink:
    """
    Wraps another sink and drops duplicate events (same device + employee +
    event_type within a short window) — mirrors the original script's
    signature-based dedup, since some devices resend the same event a few
    times over a flaky connection.
    """

    def __init__(self, inner, ttl_seconds: float = 300.0):
        self._inner = inner
        self._ttl = ttl_seconds
        self._seen: dict[str, float] = {}
        self._lock = threading.Lock()

    def _signature(self, event: InternalEvent) -> str:
        return f"{event.device_id}_{event.employee_no}_{event.occurred_at.isoformat()}_{event.event_type}"

    def publish(self, event: InternalEvent) -> None:
        now = time.time()
        sig = self._signature(event)
        with self._lock:
            # opportunistic cleanup
            expired = [s for s, ts in self._seen.items() if now - ts > self._ttl]
            for s in expired:
                del self._seen[s]

            if sig in self._seen:
                logger.debug("Takroriy event o'tkazib yuborildi: %s", sig)
                return
            self._seen[sig] = now

        self._inner.publish(event)


class AsyncEventSink:
    """
    Wraps another sink va publish()ni DARHOL qaytaradigan qiladi — haqiqiy
    yetkazish (Web API'ga POST, Telegram'ga POST — ikkalasi ham tarmoq
    orqali, sekinlashishi/qayta urinishi mumkin) ALOHIDA fon oqimida,
    ichki navbat (queue) orqali ishlaydi.

    NEGA KERAK: kamera hodisasi `_acs_event_poll_worker` (isapi_adapter.py)
    poll siklidan to'g'ridan-to'g'ri, SINXRON tarzda shu sink zanjiriga
    yuborilardi. Agar backend yoki Telegram bir zumga sekinlashsa (yoki
    _retry() qayta urinsa), butun poll sikli O'SHA vaqtgacha bloklanib
    qolardi — demak kamera "Rahmat" deb keyingi xodimni tanigan taqdirda
    ham, uning hodisasi navbatdagi poll so'rovigacha kutib turishga majbur
    bo'lardi. Bu klass shu bog'liqlikni uzadi: kamera-so'rash tsikli hech
    qachon tarmoq kechikishini kutib turmaydi, hodisalar esa qabul
    qilingan TARTIBDA (FIFO) fon oqimida yuboriladi.
    """

    def __init__(self, inner, maxsize: int = 200):
        self._inner = inner
        self._queue: "queue.Queue[InternalEvent]" = queue.Queue(maxsize=maxsize)
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def publish(self, event: InternalEvent) -> None:
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            # Navbat to'lib ketgan bo'lsa (yetkazish uzoq vaqt to'xtab
            # qolgan bo'lishi mumkin) — eng eski hodisani chiqarib,
            # yangisini qo'yamiz. Cheksiz o'sib ketishning oldini oladi;
            # eskirgan davomat hodisasini abadiy navbatda ushlab turishdan
            # ko'ra yo'qotish maqbulroq.
            try:
                self._queue.get_nowait()
            except queue.Empty:
                pass
            logger.warning("Event navbati to'lib ketdi — eng eski hodisa o'tkazib yuborildi")
            try:
                self._queue.put_nowait(event)
            except queue.Full:
                pass

    def _worker(self) -> None:
        while True:
            event = self._queue.get()
            try:
                self._inner.publish(event)
            except Exception as exc:  # noqa: BLE001
                logger.error("AsyncEventSink: ichki sink xatosi: %s", exc, exc_info=True)


# ======================================================================
# Status notifications: startup, device ONLINE/OFFLINE, event-system stall
# (mirrors the standalone alerts the original hik1.py sent besides events)
# ======================================================================

@dataclass
class StatusNotifier:
    bot_token: str = field(default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", ""))
    chat_id: str = field(default_factory=lambda: os.environ.get("TELEGRAM_CHAT_ID", ""))
    device_meta: dict[str, dict[str, str]] = field(default_factory=dict)

    def _send(self, text: str) -> None:
        send_telegram_message(self.bot_token, self.chat_id, text)

    def send_startup(self) -> None:
        self._send("🚀 Hikvision Event Monitor ishga tushdi")
        self._send("🚀 Event Monitoring tizimi ishga tushdi")

    def send_event_system_stalled(self) -> None:
        logger.warning("⏸️ Event tizimi ishlamay qoldi!")
        self._send("⚠️ Event tizimi ishlamay qoldi!")

    def handle_status_snapshot(self, snapshot: DeviceStatusSnapshot) -> None:
        meta = self.device_meta.get(snapshot.device_id, {})
        location = f"{meta.get('joy', '')} {meta.get('post', '')}".strip()

        if snapshot.online == DeviceOnlineStatus.ONLINE:
            logger.info("✅ %s qurilma ONLINE", snapshot.device_id)
            text = f"✅ Qurilma ONLINE\n🌍 IP: {snapshot.device_id}"
            if location:
                text += f"\n📍 Joy: {location}"
            self._send(text)
        elif snapshot.online == DeviceOnlineStatus.OFFLINE:
            logger.warning("⏸️ %s qurilma OFFLINE!", snapshot.device_id)
            self._send(f"🚨 Qurilma OFFLINE\n🌍 IP: {snapshot.device_id}")


class EventWatchdog:
    """
    Tracks the timestamp of the most recently received event (from ANY
    device) and fires `notifier.send_event_system_stalled()` exactly once
    if no event has arrived for `stale_after_seconds` — mirrors the
    original script's `monitor_device_activity` watchdog thread. Resets
    silently once a new event arrives (matches original behavior: no
    separate "recovered" message).
    """

    def __init__(self, notifier: StatusNotifier, stale_after_seconds: float = 60.0, check_interval: float = 5.0):
        self._notifier = notifier
        self._stale_after = stale_after_seconds
        self._check_interval = check_interval
        self._last_event_at = time.time()
        self._system_active = True
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def touch(self) -> None:
        with self._lock:
            self._last_event_at = time.time()
            self._system_active = True

    def start(self) -> None:
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2)

    def _loop(self) -> None:
        while not self._stop.is_set():
            time.sleep(self._check_interval)
            with self._lock:
                stale = time.time() - self._last_event_at > self._stale_after
                should_warn = stale and self._system_active
                if should_warn:
                    self._system_active = False
            if should_warn:
                self._notifier.send_event_system_stalled()


class WatchdogTouchSink:
    """Wraps another sink and pokes an `EventWatchdog` on every event,
    so the watchdog knows the pipeline is still alive."""

    def __init__(self, inner, watchdog: EventWatchdog):
        self._inner = inner
        self._watchdog = watchdog

    def publish(self, event: InternalEvent) -> None:
        self._watchdog.touch()
        self._inner.publish(event)


