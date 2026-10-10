// verifyToken'dan KEYIN ishlatiladi — req.user.role ruxsat etilgan
// rollar ro'yxatida bo'lmasa 403 qaytaradi. Faqat "admin darajasidagi"
// amallar (xodim/kamera/bo'lim CRUD, tartiblash, vaqtni tahrirlash)
// uchun — bularga oddiy 'viewer'/'leader' xodimlari kirmasligi kerak.
function requireRole(...allowedRoles) {
	return (req, res, next) => {
		if (!allowedRoles.includes(req.user?.role)) {
			return res.status(403).json({ success: false, message: "Ruxsat yo'q" })
		}
		next()
	}
}

module.exports = requireRole

