// Server tomonidagi 4 tilli yordamchi: uz (lotin, manba), uz-cyrl, ru, en.
// Kalit = o'zbek-lotin matn (apostroflar ' ga keltirilgan). Qo'shish: locales/ru.json va en.json ga kalit qo'shing;
// uz-cyrl uchun avtomatik transliteratsiya (istisno: locales/uz-cyrl.json).
const fs = require('fs')
const path = require('path')

const LANGS = ['uz', 'uz-cyrl', 'ru', 'en']

function normLang(v) {
	if (Array.isArray(v)) v = v[0]
	let s = String(v || '').trim().toLowerCase().replace(/_/g, '-')
	if (!s) return 'uz'
	// Accept-Language: "ru-RU,ru;q=0.9" -> birinchi element
	s = s.split(',')[0].split(';')[0].trim()
	if (s === 'uz-cyrl' || s === 'uz-cyrillic' || s === 'uz-cyrl-uz' || s === 'uz-uz-cyrl' || s === 'cyrl' || s === 'uz-cyr') return 'uz-cyrl'
	if (s.startsWith('uz')) return s.includes('cyr') ? 'uz-cyrl' : 'uz'
	if (s.startsWith('ru')) return 'ru'
	if (s.startsWith('en')) return 'en'
	return 'uz'
}

// ---- uz lotin -> kirill (frontend/src/i18n/translit.js dan ko'chirilgan) ----
const KEEP = new Set(['Excel', 'Telegram', 'Google', 'Maps', 'FaceControl', 'Hik-Connect', 'Hik', 'Connect', 'AI', 'QR', 'IT', 'OpenStreetMap', 'Wi-Fi', 'PDF', 'ID', 'URL', 'API', 'JSHR', 'Online', 'Offline', 'FaceID', 'YOLOX', 'RTSP', 'IP', 'SMS', 'Excel\'da', 'School', 'Supervision'])
const MAP = { a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'к', w: 'в' }
const cap = (lower, upperCase, titleCase) => (upperCase ? lower.toUpperCase() : titleCase ? lower[0].toUpperCase() + lower.slice(1) : lower)

function word(w) {
	const s = w.replace(/[ʻʼ‘’`´]/g, "'")
	let out = ''
	for (let i = 0; i < s.length; i++) {
		const c = s[i], rest = s.slice(i)
		const lower = c.toLowerCase()
		const isUp = c !== lower
		const nextUp = s[i + 1] ? s[i + 1] !== s[i + 1].toLowerCase() : false
		const prev = out.slice(-1)
		const two = (rest.slice(0, 2)).toLowerCase()
		if (!/[a-z']/i.test(c)) { out += c; continue }
		if (two === "o'") { out += isUp ? 'Ў' : 'ў'; i++; continue }
		if (two === "g'") { out += isUp ? 'Ғ' : 'ғ'; i++; continue }
		if (two === 'sh') { out += cap('ш', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'ch') { out += cap('ч', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'ng' && i > 0) { out += cap('нг', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'yo' && s[i + 2] !== "'") { out += cap('ё', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'yu') { out += cap('ю', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'ya') { out += cap('я', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (two === 'ye') { out += cap('е', isUp && nextUp, isUp && !nextUp); i++; continue }
		if (lower === 'e') { out += i === 0 || !/[a-zа-яўғқҳё]/i.test(prev) ? (isUp ? 'Э' : 'э') : (isUp ? 'Е' : 'е'); continue }
		if (c === "'") {
			const before = s[i - 1] || '', after = s[i + 1] || ''
			if (before && after && /[a-z]/i.test(before) && /[a-z]/i.test(after)) out += 'ъ'
			continue
		}
		const m = MAP[lower]
		out += m ? (isUp ? m.toUpperCase() : m) : c
	}
	return out
}

function toCyrillic(text) {
	if (!text) return text
	return String(text).split(/(\{\{[^}]+\}\}|[^A-Za-zʻʼ‘’`´'0-9{-]+)/).map(part => {
		if (!part || part.startsWith('{{') || !/[A-Za-z]/.test(part)) return part
		if (KEEP.has(part)) return part
		return part.split('-').map(p => (KEEP.has(p) ? p : word(p))).join('-')
	}).join('')
}

// ---- lug'atlar ----
const normKey = (s) => String(s).replace(/[ʻʼ‘’`´]/g, "'")
function load(file) {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', file), 'utf8'))
		const out = Object.create(null)
		for (const k of Object.keys(raw)) out[normKey(k)] = raw[k]
		return out
	} catch (e) { return Object.create(null) }
}
// Asosiy fayl + server xabarlari fayli birlashtiriladi
const merge = (...parts) => Object.assign(Object.create(null), ...parts)
const DICTS = {
	ru: merge(load('server-ru.json'), load('ru.json')),
	en: merge(load('server-en.json'), load('en.json')),
	'uz-cyrl': load('uz-cyrl.json')
}

function interpolate(s, vars) {
	if (!vars) return s
	return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (!Object.hasOwn(vars, k) || vars[k] === undefined || vars[k] === null ? '' : String(vars[k])))
}

// tr(lang, "Kelgan", vars) — topilmasa kalitning o'zi (uz-cyrl uchun transliteratsiya)
function tr(lang, key, vars) {
	if (key === undefined || key === null) return key
	const k = normKey(key)
	const l = normLang(lang)
	const has = (d) => Object.hasOwn(d, k) && typeof d[k] === 'string'
	let out
	if (l === 'uz') out = k
	else if (l === 'uz-cyrl') out = has(DICTS['uz-cyrl']) ? DICTS['uz-cyrl'][k] : toCyrillic(k)
	else out = has(DICTS[l]) ? DICTS[l][k] : k
	return interpolate(out, vars)
}

function langMiddleware(req, res, next) {
	req.lang = normLang((req.query && req.query.lang) || req.headers['accept-language'])
	next()
}

module.exports = { LANGS, normLang, toCyrillic, tr, langMiddleware, normKey }
