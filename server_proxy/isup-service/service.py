# -*- coding: utf-8 -*-
"""
isup-service / service.py

Thin orchestration layer sitting on top of `adapters.DeviceAdapter`.
This is the module other services (device-service, user-service,
event-service) import — none of them ever touch an adapter directly.

Persistence (sync_jobs, device_status, events tables) is intentionally
left as injected repository callables so this module has no direct
DB/ORM dependency and can be unit-tested with in-memory fakes.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional, Protocol

from adapters import (
    AdapterError,
    AdapterProtocol,
    DeviceAdapter,
    DeviceCredentials,
    DeviceInfo,
    DeviceStatusSnapshot,
    FaceRecord,
    InternalEvent,
    SyncResult,
    SyncStatus,
    UserRecord,
    build_adapter,
)

logger = logging.getLogger("isup_service")


# ======================================================================
# repository protocols (implemented by device-service / user-service
# using SQLAlchemy — kept abstract here on purpose)
# ======================================================================

class SyncJobRepository(Protocol):
    def create_job(self, device_id: str, employee_no: str) -> str: ...
    def mark_result(self, job_id: str, result: SyncResult) -> None: ...
    def next_retryable(self, max_attempts: int = 5) -> list[dict]: ...


class DeviceStatusRepository(Protocol):
    def upsert_status(self, snapshot: DeviceStatusSnapshot) -> None: ...


class EventSink(Protocol):
    def publish(self, event: InternalEvent) -> None:
        """Pushes onto the Redis queue described in the EVENT FLOW diagram."""


# ======================================================================
# retry policy
# ======================================================================

@dataclass
class RetryPolicy:
    max_attempts: int = 5
    base_delay_seconds: float = 2.0
    max_delay_seconds: float = 60.0

    def delay_for(self, attempt: int) -> float:
        return min(self.base_delay_seconds * (2 ** (attempt - 1)), self.max_delay_seconds)


# ======================================================================
# DeviceSession — wraps one connected adapter instance for one device
# ======================================================================

class DeviceSession:
    def __init__(self, device_id: str, adapter: DeviceAdapter, info: DeviceInfo):
        self.device_id = device_id
        self.adapter = adapter
        self.info = info
        self.connected_at = datetime.now(timezone.utc)


class DeviceSyncService:
    """
    One instance per running isup-service process (or per worker, under
    Celery). Holds live adapter sessions for currently-managed devices.
    """

    def __init__(
        self,
        sync_job_repo: Optional[SyncJobRepository] = None,
        device_status_repo: Optional[DeviceStatusRepository] = None,
        event_sink: Optional[EventSink] = None,
        retry_policy: Optional[RetryPolicy] = None,
    ):
        self._sessions: dict[str, DeviceSession] = {}
        self._sync_job_repo = sync_job_repo
        self._device_status_repo = device_status_repo
        self._event_sink = event_sink
        self._retry_policy = retry_policy or RetryPolicy()

    # ------------------------------------------------------------------
    # device registration
    # ------------------------------------------------------------------
    def register_device(
        self,
        device_id: str,
        creds: DeviceCredentials,
        preferred_protocol: AdapterProtocol = AdapterProtocol.ISUP_SDK,
        status_callback: Optional[Callable[[DeviceStatusSnapshot], None]] = None,
        enable_event_monitoring: bool = True,
    ) -> DeviceInfo:
        adapter = build_adapter(preferred_protocol)
        try:
            info = adapter.connect(creds)
        except AdapterError:
            logger.exception("Device registration failed for %s", device_id)
            raise

        # ISAPIAdapter uchun register_event_callback DARHOL cheksiz
        # background poll-thread (har 3 soniyada AcsEvent so'rovi) boshlaydi.
        # poller.py (faqat PULL) va webhook_server.py (faqat PUSH) hech qachon
        # hodisa oqimidan foydalanmaydi — shu ikkalasi enable_event_monitoring
        # ni False qilib chaqiradi, aks holda kerak bo'lmagan doimiy so'rovlar
        # qurilmani ortiqcha yuklaydi (ayniqsa app.py monitor bilan bir vaqtda
        # ishlaganda — ikkala jarayon ham bir xil qurilmani poll qiladi).
        if enable_event_monitoring:
            adapter.register_event_callback(self._on_device_event)
        if status_callback:
            adapter.register_status_callback(status_callback)

        # Shu device_id allaqachon ro'yxatdan o'tgan bo'lsa (masalan qayta
        # ulanish tugmasi bosilganda), eski adapter sessiyasini avval
        # to'g'ri yopamiz — aks holda eski poll-thread va requests.Session
        # hech qachon yopilmasdan ishlab qolaveradi (resurs sizib chiqishi
        # va hodisalarning IKKI MARTA kelishi).
        old_session = self._sessions.get(device_id)
        if old_session:
            try:
                old_session.adapter.disconnect()
            except Exception:  # noqa: BLE001
                logger.exception("Eski sessiyani yopishda xatolik: %s", device_id)

        self._sessions[device_id] = DeviceSession(device_id, adapter, info)
        logger.info("Device %s registered via %s", device_id, adapter.protocol.value)
        return info

    def unregister_device(self, device_id: str) -> None:
        session = self._sessions.pop(device_id, None)
        if session:
            session.adapter.disconnect()

    def is_registered(self, device_id: str) -> bool:
        return device_id in self._sessions

    def registered_devices(self) -> list[str]:
        return list(self._sessions.keys())

    # ------------------------------------------------------------------
    # heartbeat / online-offline monitoring
    # ------------------------------------------------------------------
    def heartbeat_all(self) -> list[DeviceStatusSnapshot]:
        snapshots = []
        for device_id, session in list(self._sessions.items()):
            try:
                snapshot = session.adapter.heartbeat()
            except AdapterError as exc:
                logger.warning("Heartbeat failed for %s: %s", device_id, exc.message)
                continue
            except Exception as exc:  # noqa: BLE001
                # Kutilmagan xato turi bitta qurilmada bo'lsa ham, qolgan
                # qurilmalarning heartbeat'i davom etishi kerak. Bu odatda
                # tarmoq xatosi emas (ular yuqorida AdapterError'ga o'raladi),
                # balki dasturchi xatosi — shuning uchun to'liq stack trace
                # (exc_info) log qilinadi, aks holda sababini topib bo'lmaydi.
                logger.warning("Heartbeat kutilmagan xato bilan tugadi (%s): %s", device_id, exc, exc_info=True)
                continue
            snapshots.append(snapshot)
            if self._device_status_repo:
                self._device_status_repo.upsert_status(snapshot)
        return snapshots

    # ------------------------------------------------------------------
    # user sync (with retry, per the USER SYNCHRONIZATION section)
    # ------------------------------------------------------------------
    def sync_user_to_device(self, device_id: str, user: UserRecord) -> SyncResult:
        session = self._require_session(device_id)
        job_id = self._sync_job_repo.create_job(device_id, user.employee_no) if self._sync_job_repo else None

        result = self._run_with_retry(lambda: session.adapter.create_or_update_user(user))

        if self._sync_job_repo and job_id:
            self._sync_job_repo.mark_result(job_id, result)
        return result

    def sync_face_to_device(self, device_id: str, face: FaceRecord) -> SyncResult:
        session = self._require_session(device_id)
        return self._run_with_retry(lambda: session.adapter.upload_face(face))

    def delete_user_from_device(self, device_id: str, employee_no: str) -> SyncResult:
        session = self._require_session(device_id)
        return self._run_with_retry(lambda: session.adapter.delete_user(employee_no))

    def _run_with_retry(self, action: Callable[[], SyncResult]) -> SyncResult:
        last_result: Optional[SyncResult] = None
        for attempt in range(1, self._retry_policy.max_attempts + 1):
            try:
                last_result = action()
            except AdapterError as exc:
                last_result = SyncResult(
                    device_id=exc.device_id or "", employee_no="",
                    status=SyncStatus.FAILED, error_message=exc.message,
                )
            except Exception as exc:  # noqa: BLE001
                # AdapterError'dan boshqa har qanday kutilmagan xato ham
                # (masalan qurilma javobini tahlil qilishdagi dasturchi
                # xatosi) shu yerda ushlanishi SHART — aks holda bu istisno
                # to'g'ridan-to'g'ri chaqiruvchiga (sync_user_to_device) otilib
                # ketardi va uning mark_result() chaqiruvi HECH QACHON
                # bajarilmay, saqlangan sync job abadiy "kutilmoqda" holatida
                # qolib ketardi. To'liq stack trace log qilinadi, chunki bu
                # odatda dasturchi xatosi, oddiy tarmoq xatosi emas.
                logger.exception("Sync operatsiyasida kutilmagan xato")
                last_result = SyncResult(
                    device_id="", employee_no="",
                    status=SyncStatus.FAILED, error_message=str(exc),
                )
            if last_result.status == SyncStatus.SUCCESS:
                return last_result
            if attempt < self._retry_policy.max_attempts:
                time.sleep(self._retry_policy.delay_for(attempt))
        return last_result  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # event flow:  device -> adapter -> here -> event_sink (Redis queue)
    # ------------------------------------------------------------------
    def _on_device_event(self, event: InternalEvent) -> None:
        if self._event_sink:
            self._event_sink.publish(event)
        else:
            logger.info("Event received (no sink configured): %s %s", event.device_id, event.event_type)

    def ingest_http_listener_event(self, event: InternalEvent) -> None:
        """
        Entry point for the http-listener module (Hikvision HTTP Listening
        mode POST) once it has parsed XML/JSON into an InternalEvent.
        """
        self._on_device_event(event)

    def _require_session(self, device_id: str) -> DeviceSession:
        session = self._sessions.get(device_id)
        if not session:
            raise KeyError(f"Device {device_id} has no active adapter session — call register_device first.")
        return session

