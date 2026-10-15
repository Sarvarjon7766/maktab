// Jonli oqimlar byudjeti va navbati (brauzer video'ni dasturiy dekodlaydi, bir vaqtda ko'p oqim kompyuterni bo'g'adi).
// - active: hozir jonli oqim ochgan pleyerlar; limit (getMax) dan oshmaydi
// - waiting: limit to'lgani uchun kutayotganlar (navbat). Joy bo'shaganda birinchisi AVTOMATIK ishga tushadi
// - almashinish (time-slice): navbat bor bo'lsa, jonli oqim sliceMs dan keyin joyini boshqasiga beradi va oxirgi kadrini ko'rsatib navbat oxiriga turadi
// Sozlamalar localStorage'da (ixtiyoriy): hikQuality ('sd'|'hd'), hikMaxStreams (son), hikSliceSec (soniya)
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { if (v === null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, String(v)) } catch { /* ixtiyoriy */ } }
const cores = () => (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8

// Panel (lazy) ko'rinishida standart yengil SD; yirik ko'rish va yuz tanish — HD. Foydalanuvchi sahifada o'zgartira oladi
export const getQuality = (lazy) => { const q = read('hikQuality'); return q === 'sd' || q === 'hd' ? q : lazy ? 'sd' : 'hd' }
export const setQuality = (q) => { write('hikQuality', q === 'auto' ? '' : q); notify() }

// Bir vaqtda ruxsat etilgan jonli oqimlar soni. SD (past sifat) ancha yengil: yadrolar soniga qarab; HD — kam
export const defaultMax = (quality) => (quality === 'sd' ? Math.min(24, Math.max(6, cores() * 2)) : Math.min(8, Math.max(3, Math.floor(cores() / 2))))
export const getMax = (quality) => { const v = Number(read('hikMaxStreams')); return v >= 1 && v <= 64 ? v : defaultMax(quality || getQuality(true)) }
export const setMax = (n) => { write('hikMaxStreams', n === 'auto' ? '' : n); wakeNext(); notify() }

export const getSliceMs = () => { const v = Number(read('hikSliceSec')); return (v >= 10 && v <= 600 ? v : 25) * 1000 }
export const setSliceSec = (n) => { write('hikSliceSec', n === 'auto' ? '' : n); notify() }

const active = new Set()
const waiting = [] // [{ id, wake }]
const listeners = new Set()
const notify = () => listeners.forEach((fn) => { try { fn() } catch { /* tinglovchi xatosi boshqalarga ta'sir qilmasin */ } })

export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const stats = () => ({ active: active.size, waiting: waiting.length, max: getMax() })
export const waitingCount = () => waiting.length
export const activeCount = () => active.size

// Joy bo'lsa band qiladi (true), aks holda false
export const tryAcquire = (id, quality) => {
	if (active.has(id)) return true
	if (active.size >= getMax(quality)) return false
	active.add(id); notify(); return true
}
// Foydalanuvchi qo'lda «Ishga tushirish» bosdi: limitdan qat'i nazar
export const forceAcquire = (id) => { active.add(id); dequeue(id); notify() }
export const enqueue = (id, wake) => { if (!waiting.some((w) => w.id === id)) waiting.push({ id, wake }); notify() }
export const dequeue = (id) => { const i = waiting.findIndex((w) => w.id === id); if (i >= 0) waiting.splice(i, 1) }
export const release = (id) => { active.delete(id); dequeue(id); wakeNext(); notify() }

// Bo'sh joylar qadar navbatdagilarni uyg'otadi (birinchi kelgan — birinchi)
export function wakeNext() {
	let free = getMax() - active.size
	while (free > 0 && waiting.length) { const w = waiting.shift(); free--; try { w.wake() } catch { /* komponent allaqachon yo'q */ } }
}
