# isup-service / device-adapter module

Bu modul katta loyihaning **isup-service** qismi uchun qurildi: qurilmalar
bilan gaplashish qismini (transport) qolgan barcha business logikadan
(user-service, event-service, sync-jobs) butunlay ajratadi.

## Fayllar

| Fayl | Vazifasi |
|---|---|
| `adapters/base.py` | Protokoldan mustaqil `DeviceAdapter` interfeysi + umumiy data model (`UserRecord`, `FaceRecord`, `InternalEvent`, `SyncResult`, ...) |
| `adapters/exceptions.py` | Adapter darajasidagi xatolik ierarxiyasi |
| `adapters/isup_sdk_adapter.py` | **ISUP SDK (7660-7663) adapter.** Hikvision'ning rasmiy, proprietar `HCISUPServer` kutubxonasini ctypes orqali yuklaydi. Struct/field layout'lar **o'ylab topilmagan** — ular `TODO(vendor-sdk)` deb belgilangan joylarda, sizning haqiqiy `HCISUPServer.h` fayllaringizdan to'ldirilishi kerak. |
| `adapters/isapi_adapter.py` | Siz bergan tkinter skriptdagi ISAPI logikaning production-toza versiyasi (GUI, forensic debug konsol, byte-level comparator olib tashlandi). To'liq ishlaydi va `DeviceAdapter` interfeysini bajaradi. |
| `adapters/factory.py` | ISUP SDK mavjud bo'lsa — shuni, bo'lmasa (yoki hali struct'lar to'ldirilmagan bo'lsa) avtomatik ISAPI'ga o'tadi. |
| `service.py` | `DeviceSyncService` — device registration, heartbeat monitoring, retry bilan user/face sinxronizatsiyasi, event flow (`device → adapter → Redis queue`) orkestratsiyasi. |

## Nega ISUP qismi to'liq emas

Loyiha topshirig'ida aniq aytilgan: *"Do not invent undocumented ISUP
packet formats or proprietary protocols."* Hikvision ISUP — yopiq
protokol; unga faqat rasmiy, litsenziyalangan SDK binary (`.so`/`.dll`)
va uning C header fayllari orqali kirish mumkin. Shuning uchun:

- Interfeys, xatolik xaritalash, callback ulanishi — **tayyor va to'g'ri**.
- Struct'lar (`ctypes.Structure._fields_`) va aniq funksiya nomlari
  (`NET_ISUP_...`) — sizning SDK versiyangizga bog'liq, shuning uchun
  **TODO** sifatida qoldirilgan. Buni firibgarlik/taxmin bilan to'ldirish
  xato struct offset → memory corruption xavfini tug'diradi.

## Keyingi qadam variantlari

1. Sizda rasmiy ISUP SDK header/dll bo'lsa — men `isup_sdk_adapter.py`
   ichidagi `TODO(vendor-sdk)` joylarni siz bilan birga to'ldiraman.
2. Yoki hozircha faqat ISAPI orqali davom etib, `device-service` uchun
   FastAPI router + PostgreSQL model qatlamini quramiz (keyingi bosqich).
3. Yoki `event-service`/`http-listener` modulini quramiz — bu ISAPI
   adapter allaqachon ishlab turgan qurilmalar uchun eng tezkor amaliy foyda beradi.

