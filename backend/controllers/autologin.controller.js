const net = require('net')
const { cameraAutoLogin } = require('../services/cameraAutoLogin.js')

// SSRF himoyasi: faqat to'g'ri IP; loopback, link-local (bulut metadata 169.254.169.254),
// 0.0.0.0, multicast/zahiralangan diapazonlar bloklanadi. (Kameralar odatda LAN
// (RFC1918) manzilida bo'lgani uchun ular ruxsat etiladi.)
function isForbiddenIp(ip) {
	if (net.isIPv4(ip)) {
		const [a, b] = ip.split('.').map(Number)
		return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224
	}
	const v = ip.toLowerCase()
	if (v === '::' || v === '::1') return true
	if (/^fe[89ab]/.test(v) || /^ff/.test(v)) return true
	const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
	if (mapped) return isForbiddenIp(mapped[1])
	return false
}

const autoLoginCamera = async (req, res) => {
	const { cameraIp: rawIp, user, password } = req.body || {}

	if (!rawIp) {
		return res.status(400).json({ success: false, message: "cameraIp majburiy" })
	}
	const cameraIp = typeof rawIp === 'string' ? rawIp.trim() : ''
	if (!net.isIP(cameraIp) || isForbiddenIp(cameraIp)) {
		return res.status(400).json({ success: false, message: "cameraIp noto'g'ri" })
	}

	try {
		// Kamera auto login ishga tushirish — natija kutiladi, aks holda
		// login muvaffaqiyatsiz bo'lsa ham javob doim "success:true" bo'lib
		// qolardi
		const result = await cameraAutoLogin({
			ip: cameraIp,
			username: (typeof user === 'string' && user) || "admin",
			password: (typeof password === 'string' && password) || "Admin1234"
		})

		if (!result.success) {
			return res.status(502).json({
				success: false,
				message: result.error || "Kamera GUIga avtomatik login qilib bo'lmadi"
			})
		}

		res.json({
			success: true,
			message: "Kamera GUI avtomatik login bilan ochildi"
		})
	} catch (error) {
		console.error("autoLoginCamera error:", error)
		res.status(500).json({ success: false, message: "Server xatosi" })
	}
}

module.exports = { autoLoginCamera }
