// Ilova rejimi (bitta kod, ikki rejim). APP_MODE .env orqali:
//   district (standart) — TUMAN serveri: maktablar, kameralar, AI, davomat, bot, Excel. Tuman superadmini + tuman monitori.
//                          Viloyatga faqat o'qish uchun federatsiya API'sini (/api/federation/v1) beradi.
//   region              — VILOYAT serveri: kamera/AI/bot/o'quvchi bazasi YO'Q. Tumanlar serverlaridan federatsiya API orqali o'qib jamlaydi.
//                          Viloyat superadmini va viloyat monitorlari shu yerda.
// FEDERATION_DISTRICTS (ixtiyoriy, vergul bilan): tuman serveri faqat shu tumanlar maktablarini federatsiyaga beradi (bir serverda bir nechta
// tuman bo'lsa yoki sinov uchun). Bo'sh bo'lsa serverdagi hamma faol maktab.
const MODE = String(process.env.APP_MODE || 'district').trim().toLowerCase() === 'region' ? 'region' : 'district'

const servedDistricts = () => String(process.env.FEDERATION_DISTRICTS || '').split(',').map((s) => s.trim()).filter(Boolean)

module.exports = { MODE, isRegion: MODE === 'region', isDistrict: MODE === 'district', servedDistricts }
