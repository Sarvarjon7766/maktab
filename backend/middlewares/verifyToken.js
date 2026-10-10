const jwt = require('jsonwebtoken')

// Token imzosidan tashqari foydalanuvchi hali mavjud va faolmi — qisqa keshli tekshiruv: o'chirilgan/bloklangan hisob tokeni
// muddati tugamaguncha (12 soat) ishlashda davom etmasin. Kesh 30 soniya: har so'rovda bazaga bormaydi.
const cache = new Map() // userId -> { at, ok }
const TTL = 30 * 1000

async function stillActive(userId) {
	if (!userId) return true // userId bo'lmagan maxsus tokenlar (masalan eski) imzo bilan cheklanadi
	const key = String(userId)
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < TTL) return hit.ok
	let ok = true
	try {
		const u = await require('../models/user.model').findById(key).select('isActive').lean()
		ok = !!u && u.isActive !== false
	} catch {
		return true // baza vaqtincha ishlamasa so'rovni to'xtatmaymiz (imzo baribir tekshirilgan)
	}
	cache.set(key, { at: Date.now(), ok })
	if (cache.size > 5000) cache.delete(cache.keys().next().value)
	return ok
}

const verifyToken = async (req, res, next) => {
	const authHeader = req.headers.authorization

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return res.status(401).json({ success: false, message: 'Token yuborilmagan yoki noto‘g‘ri formatda' })
	}
	const token = authHeader.split(' ')[1]
	let decoded
	try {
		decoded = jwt.verify(token, process.env.JWT_SECRET)
	} catch (err) {
		return res.status(401).json({ success: false, message: 'Token yaroqsiz yoki muddati tugagan' })
	}
	if (!(await stillActive(decoded.userId || decoded.id))) {
		return res.status(401).json({ success: false, message: 'Hisob faol emas' })
	}
	req.user = decoded
	next()
}
module.exports = verifyToken
