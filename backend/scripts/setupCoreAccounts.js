// Superadmin, admin va kadrlar bo'limi uchun uchta asosiy hisobni
// yaratadi (mavjud bo'lmasa) yoki parolini yangilaydi (mavjud bo'lsa).
// Yangi parollar faqat BIR MARTA konsolga chiqariladi — darhol xavfsiz
// joyga yozib qo'ying.
//
// Ishlatish: node backend/scripts/setupCoreAccounts.js

require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const User = require('../models/user.model')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'

// Eslatma: tizimda alohida "kadrlar bo'limi" roli yo'q — mavjud rol
// modeli (admin/viewer/leader/user) shu uchtasidan iborat. Kadrlar
// bo'limi xodimi ham xodimlarni ro'yxatga olish/tahrirlash/o'chirish va
// Tahlil panelini ko'rish huquqiga ega bo'lishi kerak bo'lgani uchun eng
// mos keladigan mavjud rol — 'admin' (superadmin'dan farqli, u boshqa
// adminlarni boshqara olmaydi va tizim sozlamalariga kira olmaydi).
const ACCOUNTS = [
	{ username: 'superadmin1', fullName: 'Super Admin', position: 'Tizim administratori', role: 'user', hodimID: '000000', lavel: 0 },
	{ username: 'admin', fullName: 'Administrator', position: 'Administrator', role: 'admin', hodimID: '000001', lavel: 1 },
	{ username: 'kadrlar', fullName: "Kadrlar bo'limi", position: "Kadrlar bo'limi mas'uli", role: 'admin', hodimID: '000002', lavel: 2 },
]

function randomPassword() {
	// Base64url — o'qish/qo'lda kiritish qulay, 12 bayt = 16 belgi, yetarli kuchli
	return crypto.randomBytes(12).toString('base64url')
}

async function run() {
	await mongoose.connect(MONGO_URI)
	const results = []
	for (const acc of ACCOUNTS) {
		const password = randomPassword()
		const hashed = await bcrypt.hash(password, 10)
		const existing = await User.findOne({ username: acc.username })
		if (existing) {
			existing.password = hashed
			existing.role = acc.role
			existing.isActive = true
			await existing.save()
			results.push({ ...acc, password, status: 'YANGILANDI' })
		} else {
			const user = new User({ ...acc, password: hashed })
			await user.save()
			results.push({ ...acc, password, status: 'YARATILDI' })
		}
	}

	console.log('\n=== Hisoblar tayyor ===')
	for (const r of results) {
		console.log(`[${r.status}] rol=${r.role.padEnd(6)} login=${r.username.padEnd(12)} parol=${r.password}`)
	}
	console.log('========================\n')

	await mongoose.connection.close()
}

run().catch((err) => {
	console.error('Xatolik:', err)
	process.exit(1)
})

