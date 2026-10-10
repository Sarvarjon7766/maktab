// Umumiy xavfsizlik qatlami (tuman ham, viloyat ham serveri uchun): sarlavhalar, CORS ruxsat ro'yxati, so'rov tezligi cheklovi.
// Sozlamalar (.env):
//   FRONTEND_URL   — frontend manzili (vergul bilan bir nechta bo'lishi mumkin). Productionda brauzer so'rovlari faqat shu manzillardan qabul qilinadi.
//   NODE_ENV=production — qat'iy rejim: CORS faqat FRONTEND_URL ro'yxatiga, HSTS yoqiladi. Developmentda hamma manzil ruxsat.
//   API_RATE_PER_MIN — bitta IP uchun daqiqada so'rovlar (standart 1500; federatsiya API'si o'z cheklovi bilan, kalit bo'yicha)
const PROD = process.env.NODE_ENV === 'production'

const origins = () => String(process.env.FRONTEND_URL || process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim().replace(/[/]+$/, '')).filter(Boolean)

// CORS: Origin sarlavhasiz so'rovlar (server-server, curl) ruxsat; brauzer so'rovlari productionda faqat ro'yxatdagi manzildan.
// Developmentda hamma manzil (LAN, boshqa portlar) — avvalgi xatti-harakat saqlanadi.
const corsOptions = {
	origin(origin, cb) {
		if (!origin || !PROD) return cb(null, true)
		return cb(null, origins().includes(String(origin).replace(/\/$/, '')))
	},
	credentials: false,
	maxAge: 600
}

// Xavfsizlik sarlavhalari (helmet'ning asosiy qismi, qo'shimcha paketsiz)
function securityHeaders(req, res, next) {
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('X-Frame-Options', 'SAMEORIGIN')
	res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
	res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=()')
	res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
	res.setHeader('X-DNS-Prefetch-Control', 'off')
	res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
	const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim()
	if (PROD && proto === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
	// API javoblari brauzer/proksi keshida qolmasin (shaxsiy ma'lumot); statik fayllar o'z sarlavhasini o'zi qo'yadi
	if (req.path.startsWith('/api/') && !res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store')
	next()
}

// IP bo'yicha so'rov tezligi (xotirada, daqiqa oynasi). Federatsiya yo'llari kalit bo'yicha o'zining cheklovidan foydalanadi
const hits = new Map()
const LIMIT = Math.max(100, Number(process.env.API_RATE_PER_MIN) || 1500)
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now > v.reset) hits.delete(k) }, 60000).unref()
function apiLimiter(req, res, next) {
	if (req.path.startsWith('/federation/')) return next()
	const ip = String(req.ip || req.socket?.remoteAddress || '')
	const now = Date.now()
	let h = hits.get(ip)
	if (!h || now > h.reset) { h = { n: 0, reset: now + 60000 }; hits.set(ip, h) }
	if (++h.n > LIMIT) {
		res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000))
		return res.status(429).json({ success: false, message: "So'rovlar juda ko'p. Birozdan keyin urinib ko'ring" })
	}
	next()
}

module.exports = { corsOptions, securityHeaders, apiLimiter }
