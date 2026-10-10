// O'zbek lotin → kirill transliteratori (1995-yil alifbosi qoidalari). Kalit so'zlar (brend nomlari) o'zgarishsiz qoladi.
// Natija ~90% aniq; istisnolar `src/locales/uz-cyrl.json` da qo'lda beriladi
const KEEP = new Set(['Excel', 'Telegram', 'Google', 'Maps', 'FaceControl', 'Hik-Connect', 'Hik', 'Connect', 'AI', 'QR', 'IT', 'OpenStreetMap', 'Wi-Fi', 'PDF', 'ID', 'URL', 'API', 'JSHR', 'Online', 'Offline', 'FaceID', 'YOLOX', 'RTSP', 'IP', 'SMS', 'School', 'Supervision', 'online', 'offline', 'proxy', 'user', 'type', 'xlsx', 'JPG', 'PNG', 'WEBP', 'KB', 'MB', 'Ctrl', 'Esc', 'LIVE', 'timeout', 'polling', 'username', 'Heartbeat', 'GeoJSON', 'Polygon', 'Preview', 'viewer', 'Leader', 'token', 'Token', 'server_proxy', 'Telegram', 'WebM', 'JSON', 'CSV', 'HTML', 'Chrome', 'Windows'])

const VOWELS = 'aeiouAEIOUоОўЎ'
const MAP = { a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', x: 'х', y: 'й', z: 'з', c: 'к', w: 'в' }

const cap = (lower, upperCase, titleCase) => (upperCase ? lower.toUpperCase() : titleCase ? lower[0].toUpperCase() + lower.slice(1) : lower)

function word(w) {
	const s = w.replace(/[ʻʼ‘’`´]/g, "'")
	// Lotin so'z + apostrof + qo'shimcha (Excel'dan): so'z o'zgarmaydi, qo'shimcha kirillga o'tadi
	const m = /^([A-Za-z_]+)'([a-z]+)$/.exec(s)
	if (m && KEEP.has(m[1])) return `${m[1]}'${word(m[2])}`
	let out = ''
	for (let i = 0; i < s.length; i++) {
		const c = s[i], rest = s.slice(i)
		const lower = c.toLowerCase()
		const isUp = c !== lower
		const nextUp = s[i + 1] ? s[i + 1] !== s[i + 1].toLowerCase() : false
		const prev = out.slice(-1)
		const two = (rest.slice(0, 2)).toLowerCase()
		// raqam yoki boshqa belgi
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
			// tutuq belgisi: unlidan keyin undosh yoki unli oldidan → ъ; aks holda tushib qoladi
			const before = s[i - 1] || '', after = s[i + 1] || ''
			if (before && after && /[a-z]/i.test(before) && /[a-z]/i.test(after)) out += 'ъ'
			continue
		}
		const m = MAP[lower]
		out += m ? (isUp ? m.toUpperCase() : m) : c
	}
	return out
}

// Matn: so'zlarga bo'lib o'giradi; {{o'zgaruvchi}} va KEEP so'zlari tegmaydi
export function toCyrillic(text) {
	if (!text) return text
	return String(text).split(/(\{\{[^}]+\}\}|[^A-Za-zʻʼ‘’`´'0-9{}-]+)/).map(part => {
		if (!part || part.startsWith('{{') || !/[A-Za-z]/.test(part)) return part
		if (KEEP.has(part)) return part
		return part.split('-').map(p => (KEEP.has(p) ? p : word(p))).join('-')
	}).join('')
}
