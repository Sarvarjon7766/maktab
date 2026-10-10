// Mavjud superadmin1 / admin hisoblarining eski, taxmin qilinadigan
// parollarini yangi tasodifiy kuchli parollarga almashtiradi.
//
// Ishlatish: node backend/scripts/rotateAdminPasswords.js
//
// Diqqat: bu skript faqat username='superadmin1' va username='admin'
// hisoblarining parolini yangilaydi (mavjud bo'lmasa o'tkazib yuboradi).
// Yangi parollar faqat bir marta konsolga chiqariladi — darhol xavfsiz
// joyga yozib qo'ying, chunki qayta ko'rsatilmaydi.

require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const User = require('../models/user.model')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'
const USERNAMES_TO_ROTATE = ['superadmin1', 'admin']

function randomPassword() {
	return crypto.randomBytes(12).toString('base64url')
}

async function rotate() {
	await mongoose.connect(MONGO_URI)
	console.log('MongoDB ulandi:', MONGO_URI)

	for (const username of USERNAMES_TO_ROTATE) {
		const user = await User.findOne({ username })
		if (!user) {
			console.log(`ℹ️ ${username} topilmadi — o'tkazib yuborildi`)
			continue
		}
		const newPassword = randomPassword()
		user.password = await bcrypt.hash(newPassword, 10)
		await user.save()
		console.log(`✅ ${username} paroli yangilandi. Yangi parol: ${newPassword}`)
	}

	await mongoose.connection.close()
	console.log('✅ MongoDB ulanishi yopildi')
}

rotate().catch((err) => {
	console.error('❌ Xatolik:', err)
	process.exit(1)
})

