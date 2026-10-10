// hashPassword.js - istalgan parolni bcrypt bilan xeshlash uchun yordamchi skript
// Ishlatish: node app.js "YangiParol123"

const bcrypt = require("bcrypt")

const password = process.argv[2]
if (!password) {
	console.error("Xatolik: parolni argument sifatida bering. Masalan: node app.js \"YangiParol123\"")
	process.exit(1)
}

// 🔁 Salt soni (10)
const saltRounds = 10

// Hash yaratish
bcrypt.hash(password, saltRounds, (err, hash) => {
	if (err) {
		console.error("Xatolik:", err)
		return
	}
	console.log("Asl parol:", password)
	console.log("Hashlangan parol:", hash)
})

