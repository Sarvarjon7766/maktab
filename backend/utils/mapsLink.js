// Google Maps havolasidan (yoki oddiy matndan) koordinatalarni aniqlaydi.
// Qo'llab-quvvatlanadi: .../place/...!3d39.65!4d66.91, ?q=39.7,67.2, ?ll=..., @39.65,66.91,17z, 39°39'16.0"N 66°54'50.0"E, "39.7259, 67.2918"
// Qisqa havolalar (maps.app.goo.gl) serverda yo'naltirishlar bo'yicha ochiladi (faqat Google manzillari).
const axios = require('axios')

const inUz = (lat, lng) => lat >= 37 && lat <= 46 && lng >= 55 && lng <= 74
const num = (s) => Number(String(s).replace(',', '.'))
const dms = (d, m, s, hemi) => { const v = Number(d) + Number(m) / 60 + Number(s || 0) / 3600; return /[SW]/i.test(hemi) ? -v : v }

function parseText(input) {
	let t = String(input || '').trim()
	if (!t) return null
	for (let i = 0; i < 2; i++) { try { t = decodeURIComponent(t.replace(/\+/g, ' ')) } catch { break } }
	const tryPair = (a, b) => { const lat = num(a), lng = num(b); return Number.isFinite(lat) && Number.isFinite(lng) && inUz(lat, lng) ? { lat, lng } : null }
	let m
	// 1) aniq belgi (pin): !3d<lat>!4d<lng>
	if ((m = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(t))) { const r = tryPair(m[1], m[2]); if (r) return r }
	// 2) ?q= / ll= / query= / destination= / center=
	if ((m = /[?&](?:q|ll|query|destination|center|daddr)=\s*(?:loc:)?(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/.exec(t))) { const r = tryPair(m[1], m[2]); if (r) return r }
	// 3) daraja-daqiqa-soniya: 39°39'16.0"N 66°54'50.0"E
	if ((m = /(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*([\d.]+)?\s*["″”]?\s*([NSns])\W{0,3}(\d{1,3})\s*[°º]\s*(\d{1,2})\s*['′’]\s*([\d.]+)?\s*["″”]?\s*([EWew])/.exec(t))) {
		const lat = dms(m[1], m[2], m[3], m[4]), lng = dms(m[5], m[6], m[7], m[8])
		if (inUz(lat, lng)) return { lat, lng }
	}
	// 4) @lat,lng
	if ((m = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(t))) { const r = tryPair(m[1], m[2]); if (r) return r }
	// 5) /place/lat,lng yoki oddiy "lat, lng" matni
	if ((m = /(?:^|[/\s])(-?\d{1,2}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)(?:$|[/\s&?,])/.exec(t))) { const r = tryPair(m[1], m[2]); if (r) return r }
	return null
}

const SHORT_HOSTS = ['maps.app.goo.gl', 'goo.gl', 'g.co']
const isGoogleHost = (h) => /(^|\.)google\.[a-z.]+$/i.test(h) || SHORT_HOSTS.includes(h)

// Qisqa havolani ochadi (SSRF'dan himoya: faqat Google manzillariga boriladi)
async function resolveShort(url) {
	let current = url
	for (let i = 0; i < 6; i++) {
		const u = new URL(current)
		if (!isGoogleHost(u.hostname)) throw new Error("Faqat Google Maps havolalari qo'llab-quvvatlanadi")
		const direct = parseText(current)
		if (direct) return { url: current, point: direct }
		const res = await axios.get(current, { maxRedirects: 0, timeout: 6000, validateStatus: () => true, headers: { 'User-Agent': 'Mozilla/5.0' }, responseType: 'text' })
		const loc = res.headers.location
		if (!loc) return { url: current, point: parseText(String(res.data || '').slice(0, 200000)) }
		let next = new URL(loc, current).toString()
		const cont = new URL(next).searchParams.get('continue')   // consent.google.com?continue=<asl manzil>
		if (cont) next = cont
		current = next
	}
	return { url: current, point: parseText(current) }
}

async function locate(input) {
	const text = String(input || '').trim()
	if (!text) return { success: false, message: 'Havola yoki koordinatani kiriting' }
	const direct = parseText(text)
	if (direct) return { success: true, ...direct }
	if (/^https?:\/\//i.test(text)) {
		try {
			const host = new URL(text).hostname
			if (!isGoogleHost(host)) return { success: false, message: "Faqat Google Maps havolasi qabul qilinadi" }
			const r = await resolveShort(text)
			if (r.point) return { success: true, ...r.point }
		} catch (e) {
			return { success: false, message: e.message?.includes('Google') ? e.message : "Havolani ochib bo'lmadi: koordinatani qo'lda kiriting" }
		}
	}
	return { success: false, message: "Havoladan koordinata topilmadi. Google Maps'da joyni oching va to'liq havolani (yoki «39.7259, 67.2918» ko'rinishidagi koordinatani) yuboring" }
}

module.exports = { parseText, locate }
