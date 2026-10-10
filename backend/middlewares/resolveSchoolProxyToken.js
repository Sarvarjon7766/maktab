// middlewares/resolveSchoolProxyToken.js
//
// Eski checkToken.js'ning o'rnini bosadi. Farqi: bitta global statik token
// emas, har bir maktabning O'ZINING tokeni bor (School.apiTokenHash).
// server_proxy config.json'dagi backend.token qiymatini Authorization
// header'ida XOM holda (Bearer prefiksisiz) yuboradi — bu shartnoma
// eskisi bilan bir xil saqlanadi, shuning uchun server_proxy'ning o'zida
// KOD O'ZGARISHI shart emas, faqat har bir maktab uchun boshqa token.
//
// Muvaffaqiyatli bo'lsa req.school (to'liq School hujjati) o'rnatiladi —
// keyingi controller/service shu orqali barcha so'rovlarni
// req.school._id bilan cheklashi SHART.
const schoolService = require('../services/school.service')

module.exports = async function resolveSchoolProxyToken(req, res, next) {
	try {
		const token = req.headers['authorization'] // faqat token olingan header, checkToken.js bilan bir xil

		if (!token) {
			return res.status(401).json({ success: false, message: "Token mavjud emas" })
		}

		const school = await schoolService.findByRawToken(token)
		if (!school) {
			return res.status(401).json({ success: false, message: "Token noto'g'ri" })
		}

		req.school = school
		next()
	} catch (err) {
		console.error(err)
		return res.status(500).json({ success: false, message: "Server xatosi" })
	}
}
