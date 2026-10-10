import { toCyrillic } from './translit'

// Tizim tillari: o'zbek (lotin) — asosiy, o'zbek (kirill), rus, ingliz.
// Kalit sifatida o'zbek-lotin matnning o'zi ishlatiladi: t("Maktablar"). Tarjima topilmasa, kalitning o'zi ko'rinadi.
// Til almashganda sahifa qayta yuklanadi (modul darajasidagi o'zgarmaslar ham yangi tilda hisoblansin)
export const LANGS = [
	{ code: 'uz', label: "O'zbekcha", short: 'UZ', locale: 'uz-UZ' },
	{ code: 'uz-cyrl', label: 'Ўзбекча', short: 'ЎЗ', locale: 'uz-Cyrl-UZ' },
	{ code: 'ru', label: 'Русский', short: 'RU', locale: 'ru-RU' },
	{ code: 'en', label: 'English', short: 'EN', locale: 'en-GB' }
]
const STORE = 'lang'
const CODES = LANGS.map(l => l.code)

// Apostrof variantlarini bitta shaklga keltiradi (o'/oʻ/o‘/o’ ...)
export const normKey = (s) => String(s).replace(/[ʻʼ‘’`´]/g, "'")

const detect = () => {
	try {
		const saved = localStorage.getItem(STORE)
		if (CODES.includes(saved)) return saved
	} catch { /* ahamiyatsiz */ }
	return 'uz'
}

let lang = detect()
// Null-prototipli obyektlar: tx("constructor") / tx("__proto__") kabi kalitlar Object.prototype a'zolarini qaytarmasligi uchun
const plain = (o) => Object.assign(Object.create(null), o)
let dict = plain()
let overrides = plain()
let ready = null

export const getLang = () => lang
export const getLocale = () => LANGS.find(l => l.code === lang)?.locale || 'uz-UZ'
// Intl uchun: 'uz-UZ' ba'zi brauzerlarda oy nomlarini bermaydi, shuning uchun sana formatlari utils/formatDate.js da qo'lda
export const intlLocale = () => (lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-GB' : 'uz-UZ')

// Tarjima lug'atlarini yuklaydi (faqat tanlangan til); ilova render bo'lishidan oldin chaqiriladi
export function initI18n() {
	if (ready) return ready
	ready = (async () => {
		try {
			if (lang === 'ru') dict = plain((await import('../locales/ru.json')).default)
			else if (lang === 'en') dict = plain((await import('../locales/en.json')).default)
			else if (lang === 'uz-cyrl') overrides = plain((await import('../locales/uz-cyrl.json')).default)
		} catch { dict = plain(); overrides = plain() }
		document.documentElement.lang = lang === 'uz-cyrl' ? 'uz-Cyrl' : lang
	})()
	return ready
}

export function setLang(code) {
	if (!CODES.includes(code) || code === lang) return
	try { localStorage.setItem(STORE, code) } catch { /* ahamiyatsiz */ }
	window.location.reload()
}

const fill = (s, vars) => {
	if (typeof s !== 'string' || !vars || typeof vars !== 'object') return s
	try {
		return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (!Object.hasOwn(vars, k) || vars[k] === undefined || vars[k] === null ? m : String(vars[k])))
	} catch { return s }
}
// Keshlar cheksiz o'smasligi uchun
const CACHE_MAX = 5000
const remember = (map, k, v) => { if (map.size >= CACHE_MAX) map.clear(); map.set(k, v) }

// Serverdan kelgan dinamik matnlar ("12 / 30 o'quvchi · kamera 5/6 online") uchun: lug'atdagi {{o'zgaruvchili}} kalitlar andoza (regex) sifatida ishlatiladi
let patterns = null
const cache = new Map()
const esc = (x) => x.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')
const buildPatterns = () => {
	patterns = []
	for (const [k, v] of Object.entries(dict)) {
		if (!k.includes('{{')) continue
		const names = []
		const src = k.split(/(\{\{\s*\w+\s*\}\})/).map(part => {
			const m = /^\{\{\s*(\w+)\s*\}\}$/.exec(part)
			if (m) { names.push(m[1]); return '(.+?)' }
			return esc(part)
		}).join('')
		if (names.length === 0 || src.replace(/\(\.\+\?\)/g, '').length < 2) continue
		patterns.push({ re: new RegExp(`^${src}$`, 's'), names, v, len: k.length })
	}
	patterns.sort((a, b) => b.len - a.len)
}
// Andoza ichidagi o'zgaruvchi qiymati ham serverdan kelgan matn bo'lishi mumkin ("Sababli: Kasallik", "Oxirgi tahlil: 5 daqiqa oldin"): aniq mos kelsa tarjima qilinadi
const inner = (x, depth) => {
	const k = normKey(x)
	if (dict[k] !== undefined && !dict[k].includes('{{')) return dict[k]
	if (depth < 2 && /\D/.test(x)) { const p = viaPattern(k, depth + 1); if (p !== null) return p }
	// Sinf nomlari ro'yxati: "5-A (2 marta), 6-B"
	if (dict['{{n}} marta'] !== undefined && / marta\)/.test(x)) return x.replace(/\((\d+) marta\)/g, (m, n) => `(${fill(dict['{{n}} marta'], { n })})`)
	return x
}
const viaPattern = (k, depth = 0) => {
	if (depth === 0 && cache.has(k)) return cache.get(k)
	if (!patterns) buildPatterns()
	let out = null
	for (const p of patterns) {
		const m = p.re.exec(k)
		if (m) { const vars = Object.create(null); p.names.forEach((n, i) => { vars[n] = inner(m[i + 1], depth) }); out = fill(p.v, vars); break }
	}
	if (depth > 0) return out
	remember(cache, k, out)
	return out
}

// Server matni " · ", "; ", " − " bilan ulangan bo'laklardan iborat bo'lsa ("10/20 = 50% · sababsiz kelmagan 8 · sababli 2"), har bir bo'lak alohida tarjima qilinadi
const SEP = /( · |; | − )/
const segCache = new Map()
const neutral = (x) => !/[A-Za-z]{3}/.test(x.replace(/FaceControl|FaceID|Telegram|Hik-Connect|Hik|Excel|online|offline|Wi-?Fi/gi, ''))
const segOne = (s) => {
	const m = /^(\s*\()(.*)(\)\s*)$/.exec(s)
	if (m) { const r = segOne(m[2]); return { out: m[1] + r.out + m[3], ok: r.ok, changed: r.changed } }
	const k = normKey(s)
	if (dict[k] !== undefined && !k.includes('{{')) return { out: dict[k], ok: true, changed: true }
	const p = viaPattern(k)
	const pr = p !== null ? { out: p, ok: neutral(p), changed: true } : null
	if (pr && pr.ok) return pr
	// "ketgan 3 (FaceControl hali qayd etmagan)": oxiridagi qavs ichidagi izoh alohida tarjima qilinadi
	const tail = /^(.*\S)( \()(.*)(\))$/.exec(s)
	if (tail) {
		const a = segOne(tail[1]), b = segOne(tail[3])
		if (a.changed || b.changed) { const r = { out: a.out + tail[2] + b.out + tail[4], ok: a.ok && b.ok, changed: true }; if (r.ok || !pr) return r }
	}
	if (pr) return pr
	return { out: s, ok: neutral(s), changed: false }
}
const viaSegments = (k) => {
	if (segCache.has(k)) return segCache.get(k)
	const parts = k.split(SEP)
	let ok = true, changed = false
	const out = parts.map((s, i) => {
		if (i % 2) return s
		const r = segOne(s)
		if (!r.ok) ok = false
		if (r.changed) changed = true
		return r.out
	}).join('')
	const res = { out, ok, changed }
	remember(segCache, k, res)
	return res
}

// tx("Maktablar") yoki tx("{{n}} ta maktab", { n: 5 }). Nomi `tx`: koddagi `t` o'zgaruvchilari bilan to'qnashmasligi uchun
export function t(key, vars) {
	if (key === null || key === undefined || key === '') return key
	if (typeof key !== 'string') return key
	if (lang === 'uz') return fill(key, vars)
	const k = normKey(key)
	if (lang === 'uz-cyrl') return fill(overrides[k] ?? toCyrillic(k), vars)
	if (dict[k] !== undefined) return fill(dict[k], vars)
	if (!vars) {
		const sg = SEP.test(k) ? viaSegments(k) : null
		if (sg && sg.ok) return sg.out
		const p = viaPattern(k)
		if (p !== null) return p
		if (sg && sg.changed) return sg.out
	}
	return fill(key, vars)
}

export const tx = t

// Tarjima kaliti belgisi: matnni o'zgartirmaydi, lekin skript uni kalitlar ro'yxatiga qo'shadi.
// Dinamik ko'rsatiladigan matnlar uchun: const ITEMS = [{ label: tk("Maktablar") }] ... va ko'rsatishda tx(item.label)
export const tk = (s) => s

// Server xabarlari (o'zbek-lotin matn) uchun: lug'atda bo'lsa tarjima qiladi, bo'lmasa o'zini qaytaradi
export const tm = (msg) => (typeof msg === 'string' ? t(msg) : msg)
