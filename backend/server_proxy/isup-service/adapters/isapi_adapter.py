# -*- coding: utf-8 -*-
"""
isup-service / adapters / isapi_adapter.py

Fallback / secondary transport: Hikvision ISAPI over plain HTTP + Digest
auth. Used for device models/firmwares that don't register over ISUP, or
during initial provisioning before ISUP is configured on the device.

This is a refactor of the standalone forensic-debug tkinter tool you
provided: the verified-working UserInfo/Record + FDSetUp payload shapes
are preserved (they were validated against a real statusCode=1 response),
but everything GUI/forensic/debug-console related has been removed and
the class now implements the shared `DeviceAdapter` interface so
event-service, user-service etc. can use it interchangeably with the
ISUP adapter.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

import requests
from requests.adapters import HTTPAdapter
from requests.auth import HTTPDigestAuth
from urllib3.util.retry import Retry

from .base import (
    AdapterProtocol,
    CardRecord,
    DeviceAdapter,
    DeviceCredentials,
    DeviceInfo,
    DeviceOnlineStatus,
    DeviceStatusSnapshot,
    EventCategory,
    FaceRecord,
    InternalEvent,
    SyncResult,
    SyncStatus,
    UserRecord,
    VerifyMode,
)
from .exceptions import (
    DeviceAuthError,
    DeviceConnectionError,
    DeviceTimeoutError,
    SyncRejectedError,
)

logger = logging.getLogger("isup_service.adapters.isapi")

_GENDER_MAP = {"male": "male", "female": "female", "unknown": "unknown"}
_USER_TYPE_MAP = {"normal": "normal", "visitor": "visitor", "blackList": "blackList"}

# Values confirmed against the device's own
# /ISAPI/AccessControl/UserInfo/capabilities response.
_VALID_VERIFY_MODES = {
    "cardAndPw", "card", "fp", "fpAndPw", "fpOrCard", "fpAndCard",
    "fpAndCardAndPw", "faceOrFpOrCardOrPw", "faceAndFp", "faceAndPw",
    "faceAndCard", "face", "faceAndFpAndCard", "faceAndPwAndFp",
    "fpOrface", "cardOrFace", "cardOrFaceOrFp",
}

# Asosiy (past kechikishli) usul — /ISAPI/Event/notification/alertStream:
# qurilmaga doimiy ochiq HTTP-ulanish o'rnatiladi va kamera hodisani
# ANIQLAGAN ZAHOTI shu ulanish orqali "push" qiladi (eski hik1.py/dastur.py
# skripti aynan shu usulda ishlagan va tasdiqlangan — kechikish deyarli
# faqat tarmoq RTT bilan cheklangan). Ba'zi access-control terminal
# modellari/firmware'lari bu endpointni qo'llab-quvvatlamasligi mumkin
# (404 qaytaradi) — shu holatda avtomatik ravishda AcsEvent qidiruvini
# davriy so'rashga (polling, sekinroq lekin universal) o'tiladi, ya'ni har
# ikkala usul ham qo'llab-quvvatlanadi va tanlov runtime'da avtomatik
# bo'ladi (_alert_stream_worker qarang). Vaqtlar qurilma bilan bir xil
# mahalliy zonada (Toshkent, UTC+5) yuboriladi — aks holda ba'zi qurilmalar
# vaqt oralig'ini noto'g'ri talqin qilib, bo'sh natija qaytaradi.
_TASHKENT_TZ = timezone(timedelta(hours=5))


class ISAPIAdapter(DeviceAdapter):
    protocol = AdapterProtocol.ISAPI_HTTP

    USER_INFO_RECORD = "/ISAPI/AccessControl/UserInfo/Record?format=json"
    USER_INFO_MODIFY = "/ISAPI/AccessControl/UserInfo/Modify?format=json"
    USER_INFO_DELETE = "/ISAPI/AccessControl/UserInfo/Delete?format=json"
    USER_INFO_SEARCH = "/ISAPI/AccessControl/UserInfo/Search?format=json"
    FD_SETUP = "/ISAPI/Intelligent/FDLib/FDSetUp?format=json"
    FACE_SEARCH = "/ISAPI/Intelligent/FDLib/FDSearch?format=json"
    FACE_LIBRARY = "/ISAPI/Intelligent/FDLib?format=json"
    CARD_INFO_RECORD = "/ISAPI/AccessControl/CardInfo/Record?format=json"
    DEVICE_INFO = "/ISAPI/System/deviceInfo"
    ACS_EVENT_SEARCH = "/ISAPI/AccessControl/AcsEvent?format=json"
    ALERT_STREAM = "/ISAPI/Event/notification/alertStream"
    _MIME_BOUNDARY = b"--MIME_boundary"
    # Qurilma buzuq/nostandart oqim yuborsa (chegara belgisi hech qachon
    # kelmasa), `buffer` cheksiz o'sib ketmasligi uchun yuqori chegara —
    # haqiqiy MIME qismlar orasida bu qadar katta ma'lumot bo'lishi shart
    # emas (odatiy JSON hodisa bir necha KB)
    _MAX_STREAM_BUFFER_BYTES = 2 * 1024 * 1024

    def __init__(self, timeout: float = 15.0):
        self.timeout = timeout
        self.base_url: str = ""
        self.session = requests.Session()
        retry_strategy = Retry(
            total=3, backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST", "PUT", "DELETE"],
        )
        adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=10)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

        self._lock = threading.Lock()
        self._device_id: Optional[str] = None
        self.face_lib_id = "1"
        self.face_lib_type = "blackFD"

        self._event_callback: Optional[Callable[[InternalEvent], None]] = None
        self._status_callback: Optional[Callable[[DeviceStatusSnapshot], None]] = None
        self._last_online_state: Optional[bool] = None
        self._stream_stop = threading.Event()
        self._stream_thread: Optional[threading.Thread] = None
        # Hozir alertStream'dan o'qilayotgan javob obyekti — stop_event_stream()
        # bu orqali oqim to'xtashini MAJBURAN tezlashtiradi (pastga qarang)
        self._stream_response: Optional[requests.Response] = None

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------
    def connect(self, creds: DeviceCredentials) -> DeviceInfo:
        self.base_url = f"http://{creds.ip}:{creds.port}"
        self.session.auth = HTTPDigestAuth(creds.username, creds.password)

        resp = self._request("GET", self.DEVICE_INFO)
        # 401'ni ALOHIDA va BIRINCHI tekshiramiz — aks holda quyidagi umumiy
        # "status_code != 200" sharti uni ham qamrab olib, noto'g'ri parol
        # holati ham umumiy DeviceConnectionError sifatida chiqib ketardi
        # (401 uchun maxsus yozilgan DeviceAuthError'ga hech qachon yetib
        # bo'lmasdi)
        if resp is not None and resp.status_code == 401:
            raise DeviceAuthError("Digest auth rejected by device.", device_id=creds.ip)
        if resp is None or resp.status_code != 200:
            raise DeviceConnectionError(
                f"deviceInfo request failed (status={getattr(resp, 'status_code', None)})",
                device_id=creds.ip,
            )

        info = self._parse_device_info(resp.text)
        # device_id sifatida config.json/qurilmalar ro'yxatida ishlatiladigan
        # IP manzilini saqlaymiz (seriya raqamini emas) — shunda
        # event_sinks.py'dagi device_meta (qayer/where/joy/post) qidiruvi
        # to'g'ri ishlaydi va Telegram/Web API xabarlarida ham xuddi
        # config.json'dagi IP ko'rinadi.
        self._device_id = creds.ip
        self._discover_face_library()

        return DeviceInfo(
            device_id=self._device_id,
            serial_number=info.get("serialNumber"),
            model=info.get("model"),
            firmware_version=info.get("firmwareVersion"),
            device_type=info.get("deviceType"),
            protocol=AdapterProtocol.ISAPI_HTTP,
            raw=info,
        )

    def disconnect(self) -> None:
        self.stop_event_stream()
        self.session.close()

    def heartbeat(self) -> DeviceStatusSnapshot:
        try:
            # _request() so'rov davomida self._lock'ni ushlab turadi — bu
            # LOCK xuddi shu adapter'ning sync operatsiyalari (create_or_update_user/
            # upload_face/delete_user, service.py orqali 5 martagacha qayta
            # uriniladigan) bilan umumiy. Avval faqat HTTP timeout (4s)
            # qisqartirilgan edi, lekin qulfning O'ZINI band qilib turgan
            # sekin/javob bermayotgan qurilma bo'lsa, heartbeat HTTP so'rovi
            # HALI BOSHLANMASDAN, faqat qulf bo'shashini kutib, cheksiz
            # bloklanib qolar edi — bu esa service.py'ning heartbeat_all()
            # BARCHA qurilmalarni ketma-ket tekshiruvchi tsiklini shu bitta
            # qurilmada to'xtatib qo'yardi. Shu sabab qulfning o'ziga ham
            # qisqa (2s) chegara qo'yildi — band bo'lsa, HTTP so'rov umuman
            # boshlanmasdan darhol OFFLINE deb hisoblanadi.
            resp = self._request("GET", self.DEVICE_INFO, timeout=4, lock_timeout=2)
            online = DeviceOnlineStatus.ONLINE if resp is not None and resp.status_code == 200 else DeviceOnlineStatus.OFFLINE
        except (DeviceConnectionError, DeviceTimeoutError):
            online = DeviceOnlineStatus.OFFLINE
        return DeviceStatusSnapshot(
            device_id=self._device_id or "unknown",
            online=online,
            last_heartbeat_at=datetime.now(timezone.utc),
        )

    # ------------------------------------------------------------------
    # user management  (verified payload shape — see module docstring)
    # ------------------------------------------------------------------
    def create_or_update_user(self, user: UserRecord) -> SyncResult:
        verify_mode = user.verify_mode.value if isinstance(user.verify_mode, VerifyMode) else str(user.verify_mode)
        if verify_mode not in _VALID_VERIFY_MODES:
            verify_mode = "face"

        now = datetime.now(timezone.utc)
        begin = user.valid_from or now
        end = user.valid_to or (now + timedelta(days=365))

        body = {
            "UserInfo": {
                "employeeNo": user.employee_no,
                "name": user.name,
                "userType": _USER_TYPE_MAP.get(user.user_type, "normal"),
                "doorRight": user.door_right,
                "RightPlan": [{"doorNo": 1, "planTemplateNo": "1"}],
                "gender": _GENDER_MAP.get(user.gender, "male") if user.gender else "male",
                "localUIRight": False,
                "maxOpenDoorTime": user.max_open_door_time,
                "userVerifyMode": verify_mode,
                "Valid": {
                    "enable": True,
                    "beginTime": begin.strftime("%Y-%m-%dT%H:%M:%S"),
                    "endTime": end.strftime("%Y-%m-%dT%H:%M:%S"),
                    "timeType": "local",
                },
            }
        }

        resp = self._request("POST", self.USER_INFO_RECORD, json=body,
                              headers={"Content-Type": "application/json"})
        result = self._to_sync_result(resp, user.employee_no)
        if result.status == SyncStatus.SUCCESS:
            return result

        # POST (yaratish) muvaffaqiyatsiz bo'lsa — odatda sabab shu employeeNo
        # qurilmada ALLAQACHON mavjudligi (Hikvision qurilmalari mavjud
        # xodimni POST bilan qayta yaratishga ruxsat bermaydi, statusCode
        # 6 / "checkUser" qaytaradi). Bu holatda PUT (Modify) bilan
        # yangilashga urinamiz.
        resp2 = self._request("PUT", self.USER_INFO_MODIFY, json=body,
                               headers={"Content-Type": "application/json"})
        result2 = self._to_sync_result(resp2, user.employee_no)
        if result2.status == SyncStatus.SUCCESS:
            return result2

        return result

    def delete_user(self, employee_no: str) -> SyncResult:
        # Diqqat: bu qurilmalar xom HTTP DELETE metodini qo'llamaydi
        # (methodNotAllowed qaytaradi) — ISAPI standarti bo'yicha o'chirish
        # alohida "Delete" endpointiga PUT so'rovi bilan amalga oshiriladi.
        body = {"UserInfoDelCond": {"EmployeeNoList": [{"employeeNo": employee_no}]}}
        resp = self._request("PUT", self.USER_INFO_DELETE, json=body,
                              headers={"Content-Type": "application/json"})
        return self._to_sync_result(resp, employee_no)

    def upload_face(self, face: FaceRecord) -> SyncResult:
        face_data_record = {
            "faceLibType": face.face_lib_type,
            "FDID": face.face_lib_id,
            "FPID": face.employee_no,
        }
        files = {
            "FaceDataRecord": (None, json.dumps(face_data_record, separators=(",", ":")), "application/json"),
            "img": ("face.jpg", face.image_bytes, "image/jpeg"),
        }
        resp = self._request("PUT", self.FD_SETUP, files=files)
        return self._to_sync_result(resp, face.employee_no)

    def upload_card(self, card: CardRecord) -> SyncResult:
        body = {"CardInfo": {"employeeNo": card.employee_no, "cardNo": card.card_no, "cardType": card.card_type}}
        resp = self._request("POST", self.CARD_INFO_RECORD, json=body,
                              headers={"Content-Type": "application/json"})
        return self._to_sync_result(resp, card.employee_no)

    def search_users(self, max_results: int = 1000, offset: int = 0) -> list[UserRecord]:
        body = {"UserInfoSearchCond": {"searchID": "1", "searchResultPosition": offset, "maxResults": max_results}}
        resp = self._request("POST", self.USER_INFO_SEARCH, json=body,
                              headers={"Content-Type": "application/json"})
        if resp is None or resp.status_code != 200:
            return []
        try:
            data = resp.json()
        except ValueError:
            return []
        result = data.get("UserInfoSearch", {}).get("UserInfo", [])
        if isinstance(result, dict):
            result = [result]
        users: list[UserRecord] = []
        for item in result:
            users.append(UserRecord(
                employee_no=item.get("employeeNo", ""),
                name=item.get("name", ""),
                gender=item.get("gender"),
                user_type=item.get("userType", "normal"),
            ))
        return users

    def send_command(self, command: str, payload: dict[str, Any]) -> SyncResult:
        endpoint = payload.get("endpoint")
        if not endpoint:
            raise SyncRejectedError("send_command requires payload['endpoint'] for the ISAPI adapter.")
        method = payload.get("method", "PUT")
        resp = self._request(method, endpoint, json=payload.get("body"))
        return self._to_sync_result(resp, payload.get("employee_no", ""))

    def pull_events(self, since: Optional[datetime] = None) -> list[InternalEvent]:
        # This adapter delivers events via the push-style alertStream
        # (see register_event_callback) rather than polling.
        return []

    def register_event_callback(self, callback: Callable[[InternalEvent], None]) -> None:
        """
        Avval `alertStream` (push, deyarli nol kechikish) bilan urinadi;
        qurilma buni qo'llab-quvvatlamasa (404) shu THREAD ichida
        avtomatik `_acs_event_poll_worker`ga (polling) o'tadi. Har bir
        yangi hodisa uchun `callback(InternalEvent)` chaqiriladi —
        `stop_event_stream()` chaqirilguncha yoki adapter uzilguncha.
        """
        self._event_callback = callback
        self._stream_stop.clear()
        self._stream_thread = threading.Thread(target=self._alert_stream_worker, daemon=True)
        self._stream_thread.start()

    def register_status_callback(self, callback: Callable[[DeviceStatusSnapshot], None]) -> None:
        """
        Called whenever the AcsEvent polling loop transitions between
        reachable/unreachable — the same signal the original event-monitor
        script used to detect ONLINE/OFFLINE (via HTTP request success vs.
        repeated failures).
        """
        self._status_callback = callback

    def _update_online_status(self, online: bool) -> None:
        """Fires the status callback only on state CHANGE, not on every poll."""
        if self._last_online_state == online:
            return
        self._last_online_state = online
        if self._status_callback:
            snapshot = DeviceStatusSnapshot(
                device_id=self._device_id or "unknown",
                online=DeviceOnlineStatus.ONLINE if online else DeviceOnlineStatus.OFFLINE,
                last_heartbeat_at=datetime.now(timezone.utc),
            )
            self._status_callback(snapshot)

    def stop_event_stream(self) -> None:
        self._stream_stop.set()
        if self._stream_thread and self._stream_thread.is_alive():
            self._stream_thread.join(timeout=5)
            if self._stream_thread.is_alive():
                # Oqim (worker) thread hali tirik — demak `resp.iter_content()`
                # ichida, qurilmadan hozircha ma'lumot kelmayotgani uchun
                # ijtimoiy (blocking) socket o'qishida qotib turibdi (bu holat
                # 60s'gacha davom etishi mumkin, _stream_stop bayrog'i esa
                # faqat navbatdagi chunk kelganda tekshiriladi). Javob
                # obyektini boshqa oqimdan MAJBURAN yopish shu bloklangan
                # o'qishni darhol xato bilan tugatadi — bu, masalan,
                # register_device() SHU device_id'ni qayta ro'yxatdan
                # o'tkazayotganda, eski va yangi alertStream ulanishlari
                # bir necha o'nlab soniya PARALLEL ochiq qolib ketishining
                # oldini oladi (ba'zi qurilmalar buni yaxshi ko'tarolmaydi).
                try:
                    if self._stream_response is not None:
                        self._stream_response.close()
                except Exception:  # noqa: BLE001 - best-effort: yopib bo'lmasa ham quyidagi join baribir sinab ko'radi
                    pass
                self._stream_thread.join(timeout=2)

    def _alert_stream_worker(self) -> None:
        """
        dastur.py namunasidagi `get_events_from_device` asosida: qurilmaga
        doimiy ochiq GET ulanish o'rnatib, multipart/MIME oqimini o'qiydi
        va har bir JSON qismini kamera ANIQLAGAN ZAHOTI callback'ga
        uzatadi (poll oralig'ini kutish yo'q). `self.session`ning umumiy
        `_lock`idan ATAYLAB foydalanmaydi — aks holda bu uzoq umr
        ko'radigan ulanish `heartbeat()`/boshqa so'rovlarni butunlay
        bloklab qo'yardi.

        Qurilma bu endpointni qo'llamasa (404) — bir marta aniqlab,
        butunlay `_acs_event_poll_worker`ga (polling) o'tamiz. Boshqa
        xatolarda (tarmoq uzilishi, timeout) dastur.py'dagi kabi cheksiz
        va o'sib boruvchi kutish (backoff, max 30s) bilan qayta ulanishga
        urinamiz — bu holatlarda polling ham xuddi shu qurilmaga yetib
        bormaydi, shuning uchun fallback ma'nosiz.
        """
        url = f"{self.base_url}{self.ALERT_STREAM}"
        connection_errors = 0

        while not self._stream_stop.is_set():
            try:
                with self.session.get(url, stream=True, timeout=60) as resp:
                    # stop_event_stream() shu obyektni kerak bo'lsa (thread
                    # bloklangan socket o'qishida qotib qolsa) boshqa
                    # oqimdan majburan yopish uchun ishlatadi. Tozalash
                    # shart emas — keyingi iteratsiya buni qayta yozadi,
                    # allaqachon yopilgan javobni yana yopish xavfsiz no-op.
                    self._stream_response = resp
                    if resp.status_code == 404:
                        logger.warning(
                            "alertStream qo'llab-quvvatlanmaydi [%s] (404) — AcsEvent pollingga o'tildi",
                            self._device_id,
                        )
                        self._acs_event_poll_worker()
                        return

                    if resp.status_code != 200:
                        logger.warning("alertStream ulanishi muvaffaqiyatsiz [%s]: status=%s",
                                        self._device_id, resp.status_code)
                        connection_errors += 1
                        if connection_errors > 3:
                            self._update_online_status(False)
                        self._stream_stop.wait(min(30, connection_errors * 5))
                        continue

                    connection_errors = 0
                    self._update_online_status(True)

                    buffer = b""
                    for chunk in resp.iter_content(chunk_size=2048):
                        if self._stream_stop.is_set():
                            return
                        if not chunk:
                            continue
                        buffer += chunk
                        if len(buffer) > self._MAX_STREAM_BUFFER_BYTES:
                            logger.warning(
                                "alertStream buferi %d bayt oshib ketdi [%s] (chegara belgisi topilmadi) — "
                                "buzuq/nostandart oqim deb hisoblanib, bufer tashlab yuborildi",
                                len(buffer), self._device_id,
                            )
                            buffer = b""
                            continue
                        while self._MIME_BOUNDARY in buffer:
                            boundary_pos = buffer.find(self._MIME_BOUNDARY)
                            part = buffer[:boundary_pos]
                            buffer = buffer[boundary_pos + len(self._MIME_BOUNDARY):]
                            if b"Content-Type: application/json" in part:
                                json_start = part.find(b"{")
                                if json_start != -1:
                                    json_text = part[json_start:].decode("utf-8", errors="ignore").strip()
                                    self._process_alert_stream_json(json_text)
                    # Server oqimni tabiiy yopdi — tashqi while qayta ulanadi.
            except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as exc:
                connection_errors += 1
                logger.warning("alertStream ulanish xatosi [%s]: %s", self._device_id, exc)
                if connection_errors > 3:
                    self._update_online_status(False)
                self._stream_stop.wait(min(30, connection_errors * 5))
            except Exception as exc:  # noqa: BLE001
                connection_errors += 1
                logger.error("alertStream kutilmagan xato [%s]: %s", self._device_id, exc, exc_info=True)
                self._stream_stop.wait(min(30, connection_errors * 5))

    def _process_alert_stream_json(self, json_str: str) -> None:
        """alertStream'dan kelgan bitta MIME qismini `InternalEvent`ga o'giradi
        va callback'ga uzatadi (agar xodimga bog'liq hodisa bo'lsa)."""
        try:
            data = json.loads(json_str)
        except (ValueError, TypeError) as exc:
            logger.debug("alertStream JSON xatosi [%s]: %s", self._device_id, exc)
            return

        event_block = data.get("AccessControllerEvent") or {}
        employee_no = event_block.get("employeeNoString") or event_block.get("employeeID")
        if not employee_no:
            # Xodimga bog'liq bo'lmagan hodisa (eshik/tizim/karta xatosi va h.k.)
            return

        occurred_at = self._parse_iso(data.get("dateTime", "")) or datetime.now(timezone.utc)
        major, minor = data.get("major"), data.get("minor")
        event_type = f"acs_{major}_{minor}" if major is not None else data.get("eventType", "AlertStreamEvent")

        verify_mode_raw = event_block.get("currentVerifyMode")
        verify_mode = None
        if verify_mode_raw:
            try:
                verify_mode = VerifyMode(verify_mode_raw)
            except ValueError:
                verify_mode = None

        event = InternalEvent(
            device_id=self._device_id or "unknown",
            category=EventCategory.ACCESS,
            event_type=event_type,
            occurred_at=occurred_at,
            employee_no=str(employee_no),
            card_no=event_block.get("cardNo") or None,
            door_no=event_block.get("doorNo"),
            verify_mode=verify_mode,
            raw={
                "AccessControllerEvent": {"name": event_block.get("name", "")},
                "dateTime": data.get("dateTime", ""),
                "source": "alert_stream",
            },
        )
        if self._event_callback:
            self._event_callback(event)

    def _acs_event_poll_worker(self) -> None:
        """Har `poll_interval` soniyada AcsEvent qidiruvini so'rab, yangi
        yozuvlarni callback'ga uzatib turadi. Oyna chegarasida hodisa
        yo'qolib qolmasligi uchun har safar bir oz orqaga (`_OVERLAP`)
        qaytib so'raymiz — takrorlanishlarni `DedupEventSink` filtrlaydi."""
        # Avval 3.0 edi — kamera "Rahmat" deb tanigandan hodisa tizimga
        # yetib borishigacha o'rtacha ~1.5s (eng yomon holatda ~3s)
        # kutish bo'lardi. AsyncEventSink bilan birga (yetkazish endi
        # bu poll siklini bloklamaydi) 1.2s ga tushirish qurilmaga ortiqcha
        # yuk solmaydi (bitta AcsEventSearch so'rovi, odatda o'sha
        # oraliqda bo'sh natija bilan tez qaytadi).
        poll_interval = 1.2
        overlap = timedelta(seconds=10)
        last_end = datetime.now(_TASHKENT_TZ) - timedelta(seconds=30)
        consecutive_errors = 0

        while not self._stream_stop.is_set():
            now = datetime.now(_TASHKENT_TZ)
            items = None
            try:
                items = self._fetch_acs_events(last_end - overlap, now)
            except (DeviceConnectionError, DeviceTimeoutError) as exc:
                logger.warning("AcsEvent so'rovida xatolik [%s]: %s", self._device_id, exc)
            except Exception as exc:  # noqa: BLE001
                # Kutilmagan xato turi (masalan ChunkedEncodingError, SSLError,
                # yoki firmware'dan kelgan noto'g'ri formatdagi javob) bu
                # thread'ni butunlay o'ldirib qo'ymasligi kerak — aks holda
                # kamera "jim" o'lib qoladi va hech kim buni sezmaydi (process
                # ishlab turgandek ko'rinaveradi).
                logger.error("AcsEvent poll'da kutilmagan xato [%s]: %s", self._device_id, exc, exc_info=True)

            if items is None:
                consecutive_errors += 1
                if consecutive_errors > 3:
                    self._update_online_status(False)
            else:
                consecutive_errors = 0
                self._update_online_status(True)
                try:
                    for item in items:
                        event = self._to_internal_event_from_acs(item)
                        if event and self._event_callback:
                            self._event_callback(event)
                    last_end = now
                except Exception as exc:  # noqa: BLE001
                    logger.error("AcsEvent natijalarini qayta ishlashda xato [%s]: %s", self._device_id, exc, exc_info=True)

            self._stream_stop.wait(poll_interval)

    def _fetch_acs_events(self, start_time: datetime, end_time: datetime) -> Optional[list[dict]]:
        """AcsEvent'ni sahifalab (pagination) to'liq so'raydi. Tarmoq/vaqt
        xatosida `None` (chaqiruvchi buni xatolik deb hisoblasin), oddiy
        bo'sh natijada `[]` qaytaradi."""
        results: list[dict] = []
        position = 0
        max_results = 30

        while True:
            body = {
                "AcsEventCond": {
                    "searchID": str(int(time.time() * 1000)),
                    "searchResultPosition": position,
                    "maxResults": max_results,
                    "major": 0,
                    "minor": 0,
                    "startTime": start_time.astimezone(_TASHKENT_TZ).strftime("%Y-%m-%dT%H:%M:%S") + "+05:00",
                    "endTime": end_time.astimezone(_TASHKENT_TZ).strftime("%Y-%m-%dT%H:%M:%S") + "+05:00",
                }
            }
            resp = self._request("POST", self.ACS_EVENT_SEARCH, json=body,
                                  headers={"Content-Type": "application/json"})
            if resp is None or resp.status_code != 200:
                logger.warning("AcsEvent so'rovi muvaffaqiyatsiz [%s]: status=%s, javob=%s",
                                self._device_id, getattr(resp, "status_code", None),
                                getattr(resp, "text", "")[:500])
                return None if not results else results

            logger.debug("AcsEvent javobi [%s]: %s", self._device_id, resp.text[:1500])
            try:
                data = resp.json()
            except ValueError:
                return None if not results else results

            acs = data.get("AcsEvent", {})
            info_list = acs.get("InfoList", [])
            if isinstance(info_list, dict):
                info_list = [info_list]
            results.extend(info_list)

            # Ba'zi firmware'lar bu maydonlarni satr sifatida qaytaradi —
            # int() bilan himoyalanmasa `position += num_matches` TypeError
            # beradi va butun poll tsikli (shu kameraning barcha hodisalari)
            # to'xtab qolishi mumkin edi.
            try:
                num_matches = int(acs.get("numOfMatches") or 0)
            except (TypeError, ValueError):
                num_matches = 0
            try:
                total_matches = int(acs.get("totalMatches") or len(results))
            except (TypeError, ValueError):
                total_matches = len(results)
            position += num_matches if num_matches else max_results
            if not info_list or num_matches < max_results or position >= total_matches:
                break

        return results

    def _to_internal_event_from_acs(self, item: dict) -> Optional[InternalEvent]:
        employee_no = item.get("employeeNoString") or item.get("employeeNo")
        if not employee_no:
            # Xodimga bog'liq bo'lmagan hodisa (eshik/tizim/karta xatosi va h.k.) — o'tkazib yuboriladi
            return None

        occurred_at = self._parse_iso(item.get("time", "")) or datetime.now(timezone.utc)
        major, minor = item.get("major"), item.get("minor")
        event_type = f"acs_{major}_{minor}" if major is not None else "AcsEvent"

        verify_mode_raw = item.get("currentVerifyMode")
        verify_mode = None
        if verify_mode_raw:
            try:
                verify_mode = VerifyMode(verify_mode_raw)
            except ValueError:
                verify_mode = None

        return InternalEvent(
            device_id=self._device_id or "unknown",
            category=EventCategory.ACCESS,
            event_type=event_type,
            occurred_at=occurred_at,
            employee_no=str(employee_no),
            card_no=item.get("cardNo") or None,
            door_no=item.get("doorNo"),
            verify_mode=verify_mode,
            # WebApiEventSink/TelegramEventSink AccessControllerEvent.name va
            # dateTime'ni shu shaklda kutadi — alertStream payload shakliga moslab beryapmiz.
            raw={
                "AccessControllerEvent": {"name": item.get("name", "")},
                "dateTime": item.get("time", ""),
                "source": "acs_event",
            },
        )

    @staticmethod
    def _parse_iso(value: str) -> Optional[datetime]:
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------
    def _discover_face_library(self) -> None:
        try:
            resp = self._request("GET", self.FACE_LIBRARY)
            if resp is not None and resp.status_code == 200:
                data = resp.json()
                libs = data.get("FaceLibInfo", [])
                if isinstance(libs, list) and libs:
                    self.face_lib_id = str(libs[0].get("faceLibID", "1"))
                    self.face_lib_type = libs[0].get("faceLibType", "blackFD")
        except Exception as exc:  # noqa: BLE001 - best-effort discovery
            logger.warning("Face library discovery failed: %s", exc)

    @staticmethod
    def _parse_device_info(xml_text: str) -> dict[str, str]:
        try:
            root = ET.fromstring(xml_text)
            for elem in root.iter():
                if "}" in elem.tag:
                    elem.tag = elem.tag.split("}", 1)[1]
            return {
                "model": root.findtext("model", ""),
                "serialNumber": root.findtext("serialNumber", ""),
                "firmwareVersion": root.findtext("firmwareVersion", ""),
                "deviceType": root.findtext("deviceType", ""),
            }
        except ET.ParseError:
            return {}

    def _request(
        self, method: str, endpoint: str, lock_timeout: Optional[float] = None, **kwargs
    ) -> Optional[requests.Response]:
        # lock_timeout berilmasa (standart, sync operatsiyalar uchun) —
        # avvalgidek qulf bo'shashini CHEKSIZ kutamiz. lock_timeout berilsa
        # (heartbeat uchun, pastga qarang) — qulf shu vaqt ichida
        # bo'shamasa, DeviceTimeoutError bilan darhol chiqib ketamiz, HTTP
        # so'rovining o'zi hech qachon boshlanmaydi.
        if lock_timeout is not None:
            if not self._lock.acquire(timeout=lock_timeout):
                raise DeviceTimeoutError(
                    f"Qurilma band (boshqa so'rov {lock_timeout}s dan ko'p band qilib turibdi)",
                    device_id=self._device_id,
                )
        else:
            self._lock.acquire()
        try:
            url = f"{self.base_url}{endpoint}"
            kwargs.setdefault("timeout", self.timeout)
            try:
                return self.session.request(method, url, **kwargs)
            except requests.exceptions.Timeout as exc:
                raise DeviceTimeoutError(str(exc), device_id=self._device_id) from exc
            except requests.exceptions.ConnectionError as exc:
                raise DeviceConnectionError(str(exc), device_id=self._device_id) from exc
        finally:
            self._lock.release()

    def _to_sync_result(self, resp: Optional[requests.Response], employee_no: str) -> SyncResult:
        if resp is None:
            return SyncResult(device_id=self._device_id or "", employee_no=employee_no,
                               status=SyncStatus.FAILED, error_message="No response from device")

        status_code = status_string = error_code = error_msg = None
        try:
            content_type = resp.headers.get("Content-Type", "").lower()
            if "xml" in content_type:
                root = ET.fromstring(resp.text)
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]
                status_code = root.findtext("statusCode")
                status_string = root.findtext("statusString")
                error_code = root.findtext("errorCode")
                error_msg = root.findtext("errorMsg")
            else:
                data = resp.json()
                status_code = data.get("statusCode")
                status_string = data.get("statusString")
                error_code = data.get("errorCode")
                error_msg = data.get("errorMsg")
        except (ValueError, ET.ParseError):
            pass

        ok = resp.status_code in (200, 201, 202, 204, 207) and (str(status_code) == "1" or status_string == "OK")
        return SyncResult(
            device_id=self._device_id or "",
            employee_no=employee_no,
            status=SyncStatus.SUCCESS if ok else SyncStatus.FAILED,
            status_code=str(status_code) if status_code is not None else None,
            status_string=status_string,
            error_code=str(error_code) if error_code is not None else None,
            error_message=error_msg,
            raw_response=resp.text[:2000],
        )

