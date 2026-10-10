// Qat'iy YYYY-MM-DD tekshiruvi: regex + haqiqiy kalendar sanasi ('2026-13-45', '0000-00-00' rad etiladi)
const isDate = (s) => {
	if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
	const y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10)
	if (y < 1) return false
	const dt = new Date(Date.UTC(y, m - 1, d))
	dt.setUTCFullYear(y) // 0-99 yillar uchun
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
// Qidiruv (q) parametri: boshqaruv belgilari (NUL va h.k.) olib tashlanadi, 64 belgigacha kesiladi
const cleanQ = (v) => String(Array.isArray(v) ? v[0] : (v ?? '')).replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 64)
module.exports = { isDate, cleanQ }
