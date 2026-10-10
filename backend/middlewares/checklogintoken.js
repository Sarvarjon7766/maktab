const jwt = require('jsonwebtoken')

const checkLoginToken = (req, res) => {
	const authHeader = req.headers.authorization

	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return res.status(401).json({
			success: false,
			message: 'Token yuborilmagan yoki noto‘g‘ri formatda'
		})
	}

	const token = authHeader.split(' ')[1]

	try {
		const decoded = jwt.verify(token, process.env.JWT_SECRET)

		return res.json({
			success: true,
			message: 'Token yaroqli',
			user: decoded
		})
	} catch (err) {
		return res.status(401).json({
			success: false,
			message: 'Token yaroqsiz yoki muddati tugagan'
		})
	}
}

module.exports = checkLoginToken

