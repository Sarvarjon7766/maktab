// TUMAN serverida federatsiya (viloyat → tuman) so'rovlarini tekshiradi.
// Himoya qatlamlari: (1) faqat `Authorization: Bearer fk_<prefix>.<secret>`, (2) kalit hashi vaqt-doimiy solishtiriladi, (3) faol va muddati
// o'tmagan, (4) ixtiyoriy IP ruxsat ro'yxati, (5) kalit bo'yicha so'rov tezligi cheklovi, (6) faqat GET/HEAD (faqat o'qish),
// (7) productionda HTTPS majburiy, (8) har so'rov auditga yoziladi. Xato javoblari bir xil (kalit mavjudligi sezdirilmaydi).
const crypto = require('crypto')
const FederationKey = require('../models/federation.key.model')
const FederationAudit = require('../models/federation.audit.model')

const TOKEN = /^fk_([a-f0-9]{8})\.([A-Za-z0-9_-]{40,64})$/
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const deny = (res, status = 401) => res.status(status).json({ success: false, message: status === 429 ? "So'rovlar juda ko'p" : 'Ruxsat yo\'q' })

// Yangi kalit: { token (bir marta ko'rsatiladi), prefix, keyHash }
function generateKey() {
	const prefix = crypto.randomBytes(4).toString('hex')
	const secret = crypto.randomBytes(32).toString('base64url') // 43 belgi
	const token = `fk_${prefix}.${secret}`
	return { token, prefix, keyHash: sha(secret) }
}

const buckets = new Map() // keyId -> { n, reset }
const touched = new Map() // keyId -> oxirgi lastUsed yozilgan vaqt

const clientIp = (req) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '')

async function federationAuth(req, res, next) {
	try {
		if (req.method !== 'GET' && req.method !== 'HEAD') return deny(res, 405)
		if (process.env.NODE_ENV === 'production' && process.env.FEDERATION_ALLOW_HTTP !== '1') {
			const proto = String(req.headers['x-forwarded-proto'] || req.protocol || '').split(',')[0].trim()
			if (proto !== 'https') return deny(res, 403)
		}
		const m = TOKEN.exec(String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim())
		if (!m) return deny(res)
		const doc = await FederationKey.findOne({ prefix: m[1] }).select('+keyHash').lean()
		const expected = Buffer.from(doc?.keyHash || '0'.repeat(64), 'hex')
		const given = Buffer.from(sha(m[2]), 'hex')
		const okHash = expected.length === given.length && crypto.timingSafeEqual(expected, given)
		if (!doc || !okHash || doc.active === false) return deny(res)
		if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return deny(res)
		const ip = clientIp(req)
		if (doc.allowedIps?.length && !doc.allowedIps.includes(ip)) return deny(res, 403)

		// so'rov tezligi (daqiqa oynasi)
		const id = String(doc._id), now = Date.now()
		let b = buckets.get(id)
		if (!b || now > b.reset) { b = { n: 0, reset: now + 60000 }; buckets.set(id, b) }
		if (++b.n > (doc.ratePerMin || 1200)) { res.setHeader('Retry-After', Math.ceil((b.reset - now) / 1000)); return deny(res, 429) }

		req.federation = { keyId: doc._id, keyName: doc.name }
		// oxirgi foydalanish (daqiqada bir marta yoziladi) va audit
		if (!touched.has(id) || now - touched.get(id) > 60000) {
			touched.set(id, now)
			FederationKey.updateOne({ _id: doc._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: ip } }).catch(() => {})
		}
		const started = now
		res.on('finish', () => {
			FederationAudit.create({ key: doc._id, keyName: doc.name, method: req.method, path: String(req.originalUrl || '').split('?')[0].slice(0, 200), status: res.statusCode, ms: Date.now() - started, ip }).catch(() => {})
		})
		next()
	} catch (error) {
		console.error('Federatsiya autentifikatsiyasi xatosi:', error.message)
		return deny(res, 500)
	}
}

module.exports = { federationAuth, generateKey, sha }
