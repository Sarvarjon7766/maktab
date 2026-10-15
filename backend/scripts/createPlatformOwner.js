// Platforma egasi (role='superadmin') hisobini yaratadi yoki (mavjud bo'lsa)
// parolini yangilaydi. Maktablarni qo'shish/boshqarish shu hisob bilan bajariladi.
// Yangi parol faqat BIR MARTA konsolga chiqariladi — darhol yozib qo'ying.
//
// Ishlatish: node backend/scripts/createPlatformOwner.js [username]            (parol tasodifiy yaratiladi va bir marta chiqadi)
//   o'z parolingiz bilan:  OWNER_LOGIN=login OWNER_PASSWORD='kamida 10 belgi' node scripts/createPlatformOwner.js   (parol chiqarilmaydi)

require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const User = require('../models/user.model')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'
const username = process.env.OWNER_LOGIN || process.argv[2] || 'platform-owner'
const given = process.env.OWNER_PASSWORD
if (given && given.length < 10) { console.error("Parol kamida 10 belgidan iborat bo'lishi kerak"); process.exit(1) }

async function run() {
	await mongoose.connect(MONGO_URI)
	const password = given || crypto.randomBytes(12).toString('base64url')
	const hashed = await bcrypt.hash(password, 10)

	let user = await User.findOne({ username })
	let status = 'YANGILANDI'
	if (user) {
		user.password = hashed
		user.role = 'superadmin'
		user.schoolId = null
		user.isActive = true
	} else {
		status = 'YARATILDI'
		user = new User({
			fullName: 'Platforma egasi',
			position: 'Platforma administratori',
			role: 'superadmin',
			schoolId: null,
			username,
			password: hashed,
			isActive: true
		})
		user.hodimID = user._id.toString()
	}
	await user.save()

	console.log(given ? `[${status}] role=superadmin login=${username}` : `[${status}] role=superadmin login=${username} parol=${password}`)
	await mongoose.connection.close()
}

run().catch((err) => {
	console.error('Xatolik:', err)
	process.exit(1)
})
