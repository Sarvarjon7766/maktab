// VILOYAT → TUMAN: tuman serverining federatsiya API'siga xavfsiz so'rovlar.
// Himoya: HTTPS majburiy (faqat sinov/localhost uchun istisno), vaqt cheklovi, javob hajmi cheklovi, avtomat uzish (circuit breaker:
// ketma-ket xatolardan keyin tuman qisqa muddat so'ralmaydi — qolgan tumanlar sekinlashmaydi), kalit faqat Authorization sarlavhasida.
const { Readable } = require('stream')

const MAX_JSON = 30 * 1024 * 1024
const breakers = new Map() // districtId -> { fails, openUntil }

class FederationError extends Error {
	constructor(message, status = 0) { super(message); this.name = 'FederationError'; this.status = status }
}

const isLocal = (host) => /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host)

// baseUrl tekshiruvi: faqat https (productionda); localhost/127.0.0.1 faqat NODE_ENV!=='production' yoki FEDERATION_ALLOW_HTTP=1 bo'lsa http
function safeBase(baseUrl) {
	let u
	try { u = new URL(baseUrl) } catch { throw new FederationError("Tuman manzili noto'g'ri") }
	if (!['http:', 'https:'].includes(u.protocol)) throw new FederationError("Tuman manzili noto'g'ri")
	const allowHttp = process.env.FEDERATION_ALLOW_HTTP === '1' || (process.env.NODE_ENV !== 'production' && isLocal(u.hostname))
	if (u.protocol === 'http:' && !allowHttp) throw new FederationError('Tuman manzili HTTPS bo\'lishi shart')
	if (u.username || u.password) throw new FederationError("Manzilda login/parol bo'lmasligi kerak")
	return u.origin
}

function guard(id) {
	const b = breakers.get(id)
	if (b && b.openUntil > Date.now()) throw new FederationError("Tuman serveri vaqtincha javob bermayapti", 503)
}
const failed = (id) => { const b = breakers.get(id) || { fails: 0, openUntil: 0 }; b.fails++; if (b.fails >= 3) b.openUntil = Date.now() + Math.min(60000, 5000 * 2 ** (b.fails - 3)); breakers.set(id, b) }
const succeeded = (id) => breakers.delete(id)

function url(district, path, query) {
	const qs = new URLSearchParams()
	for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') qs.set(k, Array.isArray(v) ? v.join(',') : String(v))
	const s = qs.toString()
	return `${safeBase(district.baseUrl)}/api/federation/v1${path}${s ? `?${s}` : ''}`
}

const headers = (district, extra) => ({ Authorization: `Bearer ${district.apiKey}`, Accept: 'application/json', 'User-Agent': 'faceid-region/1', ...extra })

// JSON so'rov: { ok, status, data }. Xatoda FederationError tashlaydi (breaker hisobiga)
async function getJson(district, path, query, { timeoutMs = 20000 } = {}) {
	guard(district.id)
	try {
		const res = await fetch(url(district, path, query), { method: 'GET', headers: headers(district), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
		const len = Number(res.headers.get('content-length') || 0)
		if (len > MAX_JSON) throw new FederationError('Javob juda katta')
		const text = await res.text()
		if (text.length > MAX_JSON) throw new FederationError('Javob juda katta')
		let data = null
		try { data = JSON.parse(text) } catch { /* JSON emas */ }
		if (res.status >= 500) throw new FederationError(`Tuman serveri xatosi (${res.status})`, res.status)
		succeeded(district.id)
		return { ok: res.ok, status: res.status, data }
	} catch (e) {
		if (!(e instanceof FederationError) || (e.status || 0) >= 500 || e.status === 0) failed(district.id)
		if (e instanceof FederationError) throw e
		throw new FederationError(e.name === 'TimeoutError' ? 'Tuman serveri javob bermadi (vaqt tugadi)' : `Tuman serveriga ulanib bo'lmadi`, 0)
	}
}

// Fayl/oqim (rasm, lavha): javob oqimi mijozga uzatiladi. Qaytaradi { status, headers, stream } yoki xato
async function getStream(district, path, query, { timeoutMs = 30000 } = {}) {
	guard(district.id)
	try {
		const res = await fetch(url(district, path, query), { method: 'GET', headers: headers(district, { Accept: '*/*' }), signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
		if (res.status >= 500) throw new FederationError(`Tuman serveri xatosi (${res.status})`, res.status)
		succeeded(district.id)
		return { status: res.status, type: res.headers.get('content-type') || 'application/octet-stream', cache: res.headers.get('cache-control') || '', stream: res.body ? Readable.fromWeb(res.body) : null }
	} catch (e) {
		if (!(e instanceof FederationError) || (e.status || 0) >= 500 || e.status === 0) failed(district.id)
		if (e instanceof FederationError) throw e
		throw new FederationError(e.name === 'TimeoutError' ? 'Tuman serveri javob bermadi (vaqt tugadi)' : `Tuman serveriga ulanib bo'lmadi`, 0)
	}
}

module.exports = { getJson, getStream, safeBase, FederationError }
