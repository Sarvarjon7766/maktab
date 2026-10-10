require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const User = require('./models/user.model')
const bcrypt = require('bcrypt')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'

// Standart, taxmin qilinadigan parollar bilan admin hisob yaratish xavfli —
// shuning uchun har chaqirilganda tasodifiy kuchli parol generatsiya qilinadi
// va faqat bir marta konsolga chiqariladi (birortayerda saqlanmaydi).
function randomPassword() {
	return crypto.randomBytes(12).toString('base64url')
}

async function ensureUser({ username, fullName, position, role, hodimID, lavel }) {
	const existing = await User.findOne({ username })
	if (existing) {
		console.log(`ℹ️ ${username} allaqachon mavjud — o'tkazib yuborildi`)
		return
	}
	const plainPassword = randomPassword()
	const hashed = await bcrypt.hash(plainPassword, 10)
	const user = new User({ fullName, position, username, password: hashed, role, hodimID, lavel })
	await user.save()
	console.log(`✅ ${username} yaratildi. Bir martalik parol (hozir saqlab qo'ying): ${plainPassword}`)
}

async function addAdmin() {
	try {
		await mongoose.connect(MONGO_URI)
		console.log('MongoDB ulandi:', MONGO_URI)

		await ensureUser({
			username: 'superadmin1',
			fullName: 'Super Admin',
			position: 'Tizim administratori',
			role: 'user',
			hodimID: '000000',
			lavel: 0,
		})

		await ensureUser({
			username: 'admin',
			fullName: 'Toyloq Tuman Hokimligi',
			position: 'Administrator',
			role: 'admin',
			hodimID: '000001',
			lavel: 1,
		})

		await mongoose.connection.close()
		console.log('✅ MongoDB ulanishi yopildi')
	} catch (error) {
		console.error('❌ Xatolik yuz berdi:', error)
		await mongoose.connection.close()
	}
}

addAdmin()

