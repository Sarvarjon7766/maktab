// Jamlash (merge) uchun umumiy yordamchilar. Hamma funksiya sof (tashqi holatsiz).
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const sum = (arr, pick) => arr.reduce((a, x) => a + num(typeof pick === 'function' ? pick(x) : x?.[pick]), 0)
// Foiz (bir kasr xonali), maxraj 0 bo'lsa null — tuman servislaridagi pct() bilan bir xil
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const r1 = (n) => Math.round(n * 10) / 10
// Barcha bo'laklardan massivlarni birlashtiradi: pick(data) -> array
const concat = (parts, pick) => parts.flatMap((p) => pick(p.data) || [])
// Tartiblash: uz tilidagi nomlar uchun numeric
const byName = (a, b) => String(a || '').localeCompare(String(b || ''), 'uz', { numeric: true })
// Kalit bo'yicha jamlash: items [{key, ...}] -> Map(key -> [items])
const groupBy = (items, keyFn) => { const m = new Map(); for (const it of items) { const k = keyFn(it); if (!m.has(k)) m.set(k, []); m.get(k).push(it) } return m }

module.exports = { num, sum, pct, r1, concat, byName, groupBy }
