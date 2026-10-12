// /uploads (xodim va o'quvchi rasmlari) himoyasi. Ruxsat uch yo'l bilan:
//  1) kirish tokeni: `Authorization: Bearer <jwt>` sarlavhasi yoki `?t=<jwt>` (brauzerdagi <img> sarlavha yubora olmaydi);
//  2) maktab server_proxy tokeni (xom, Bearer'siz) — Authorization sarlavhasida;
//  3) fayl nomiga imzolangan havola `?sig=...`: kameraga/qurilmaga beriladigan photo_url uchun (token yubora olmaydigan mijozlar).
const crypto = require('crypto')
const path = require('path')
const jwt = require('jsonwebtoken')

const secret = () => `${process.env.HIK_SECRETS_KEY || process.env.JWT_SECRET}:uploads`
const sign = (file) => crypto.createHmac('sha256', secret()).update(String(file)).digest('hex').slice(0, 32)
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }

// base — oxiri "/" bilan tugaydigan manzil (masalan CAMERA_PHOTO_URL). Qaytaradi: <base><fayl>?sig=...
const signedUrl = (base, file) => { const f = path.basename(String(file)); return `${base}${encodeURIComponent(f)}?sig=${sign(f)}` }

async function uploadsGuard(req, res, next) {
	try {
		const file = path.basename(decodeURIComponent(req.path || ''))
		if (!file) return res.status(404).end()
		if (req.query.sig && safeEq(req.query.sig, sign(file))) return next()
		const header = req.headers.authorization || ''
		const bearer = header.startsWith('Bearer ') ? header.slice(7) : req.query.t
		if (bearer) {
			try { jwt.verify(String(bearer), process.env.JWT_SECRET); return next() } catch { /* quyida proxy tokenini sinaymiz */ }
		}
		if (header && !header.startsWith('Bearer ')) {
			const school = await require('../services/school.service').findByRawToken(header)
			if (school) return next()
		}
		return res.status(401).json({ success: false, message: 'Ruxsat yo\'q' })
	} catch (e) {
		return res.status(400).end()
	}
}

module.exports = { sign, signedUrl, uploadsGuard }
