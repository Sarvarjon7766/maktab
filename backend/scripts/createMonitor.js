// Umumiy nazorat paneli uchun 'monitor' rolidagi hisobni yaratadi yoki
// (mavjud bo'lsa) parolini yangilaydi. Bu rol barcha maktablarning bugungi
// davomati va holatini FAQAT ko'ra oladi (o'zgartira olmaydi).
// Yangi parol faqat BIR MARTA konsolga chiqariladi — darhol yozib qo'ying.
//
// Ishlatish: node backend/scripts/createMonitor.js [username] [To'liq ism]

require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const User = require('../models/user.model')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'
const username = process.argv[2] || 'monitor'
const fullName = process.argv[3] || 'Umumiy nazorat'

async function run() {
	await mongoose.connect(MONGO_URI)
	const password = crypto.randomBytes(12).toString('base64url')
	const hashed = await bcrypt.hash(password, 10)

	let user = await User.findOne({ username })
	let status = 'YANGILANDI'
	if (user) {
		if (user.role !== 'monitor') {
			console.error(`Xatolik: "${username}" allaqachon '${user.role}' roli bilan mavjud — boshqa login tanlang`)
			await mongoose.connection.close()
			process.exit(1)
		}
		user.password = hashed
		user.isActive = true
	} else {
		status = 'YARATILDI'
		user = new User({
			fullName,
			position: 'Umumiy nazorat (monitoring)',
			role: 'monitor',
			schoolId: null,
			username,
			password: hashed,
			isActive: true
		})
		user.hodimID = user._id.toString()
	}
	await user.save()

	console.log(`[${status}] role=${user.role} login=${username} parol=${password}`)
	await mongoose.connection.close()
}

run().catch((err) => {
	console.error('Xatolik:', err)
	process.exit(1)
})
