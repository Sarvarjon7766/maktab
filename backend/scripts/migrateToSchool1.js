// Bitta tashkilot uchun ishlagan eski tizimni ko'p-maktabli platformaga
// o'tkazish uchun BIR MARTALIK migratsiya skripti:
//   1) .env'dagi tashkilot ma'lumotlaridan "1-maktab" School hujjatini yaratadi
//      (idempotent — qayta ishga tushirilsa hujjatni qayta yaratmaydi)
//   2) 1-maktabning proxy tokenini HOZIRGI INTERNAL_API_TOKEN qiymatidan
//      yaratadi — shunda uning mavjud server_proxy joylashuvi config.json'ni
//      o'zgartirmasdan ishlashda davom etadi
//   3) Har bir jadvaldagi schoolId yo'q hujjatlarni 1-maktab _id'si bilan to'ldiradi
//   4) Platforma darajasidagi YANGI 'superadmin' akkaunt yaratadi (mavjud
//      'superadmin1' — role:'user' — endi 1-maktabning O'ZINING admini,
//      platforma superadmini EMAS, shuning uchun alohida akkaunt kerak)
//
// Ishlatish: node backend/scripts/migrateToSchool1.js
// DIQQAT: ishga tushirishdan oldin to'liq mongodump zaxira nusxasi oling.

require('dotenv').config()
const mongoose = require('mongoose')
const crypto = require('crypto')
const bcrypt = require('bcrypt')

const School = require('../models/school.model')
const User = require('../models/user.model')
const Sinf = require('../models/sinf.model')
const Camera = require('../models/camera.model')
const Attendance = require('../models/attandance.model')
const AttendanceLog = require('../models/attandance.log.model')
const Settings = require('../models/settings.model')
const EmployeeComment = require('../models/employee.comment.model')
const AddUser = require('../models/add.user.model')
const UpdateUser = require('../models/update.user.model')
const DeleteUser = require('../models/delete.user.model')

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'

// "1-maktab"ni boshqa migratsiya ishga tushirilishlaridan ajratib olish
// uchun barqaror kod — code unique indeksga ega, shu orqali idempotentlik
const SCHOOL_1_CODE = 'school-1'

function hashApiToken(rawToken) {
	return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function randomPassword() {
	return crypto.randomBytes(12).toString('base64url')
}

async function ensureSchool1() {
	let school = await School.findOne({ code: SCHOOL_1_CODE })
	if (school) {
		console.log(`[BOR] 1-maktab allaqachon mavjud: ${school.name} (${school._id})`)
		return school
	}

	const rawToken = process.env.INTERNAL_API_TOKEN
	if (!rawToken) {
		throw new Error("INTERNAL_API_TOKEN .env'da topilmadi — 1-maktab tokeni shundan yaratiladi")
	}

	school = await School.create({
		name: process.env.ORG_NAME || '1-maktab',
		code: SCHOOL_1_CODE,
		district: process.env.DISTRICT_NAME || '',
		region: process.env.REGION || '',
		phone: process.env.PHONE || '',
		itCenter: process.env.IT_CENTER || '',
		apiTokenHash: hashApiToken(rawToken),
		apiTokenPrefix: rawToken.slice(0, 8),
		apiTokenRotatedAt: new Date()
	})
	console.log(`[YARATILDI] 1-maktab: ${school.name} (${school._id})`)
	console.log(`  -> proxy tokeni hozirgi INTERNAL_API_TOKEN'dan olindi — server_proxy/config.json o'zgarishsiz ishlayveradi`)
	return school
}

async function ensurePlatformSuperadmin(schoolOneId) {
	const username = 'platform-owner'
	const existing = await User.findOne({ username })
	if (existing) {
		if (existing.role !== 'superadmin' || existing.schoolId) {
			existing.role = 'superadmin'
			existing.schoolId = null
			await existing.save()
			console.log(`[TUZATILDI] ${username} -> role=superadmin, schoolId=null`)
		} else {
			console.log(`[BOR] Platforma superadmini allaqachon mavjud: ${username}`)
		}
		return
	}

	const password = randomPassword()
	const hashed = await bcrypt.hash(password, 10)
	const user = new User({
		fullName: 'Platforma egasi',
		position: 'Platforma administratori',
		role: 'superadmin',
		schoolId: null,
		username,
		password: hashed,
		isActive: true
	})
	user.hodimID = user._id.toString()
	await user.save()
	console.log(`[YARATILDI] Platforma superadmini: login=${username} parol=${password}`)
	console.log(`  -> BU PAROLNI DARHOL XAVFSIZ JOYGA YOZIB QO'YING, qayta ko'rsatilmaydi`)
}

// Har bir model uchun: schoolId yo'q hujjatlarni to'ldiradi, nechta
// yangilanganini qaytaradi
async function backfillSchoolId(Model, label, schoolId) {
	const result = await Model.updateMany(
		{ schoolId: { $exists: false } },
		{ $set: { schoolId } }
	)
	console.log(`  ${label}: ${result.modifiedCount} ta hujjat yangilandi`)
	return result.modifiedCount
}

async function run() {
	await mongoose.connect(MONGO_URI)
	console.log(`Bazaga ulandi: ${MONGO_URI}\n`)

	const school = await ensureSchool1()
	const schoolId = school._id

	console.log('\nSchoolId to\'ldirilmoqda...')
	await backfillSchoolId(User, 'User', schoolId)
	await backfillSchoolId(Sinf, 'Sinf', schoolId)
	await backfillSchoolId(Camera, 'camera', schoolId)
	await backfillSchoolId(Attendance, 'Attendance', schoolId)
	await backfillSchoolId(AttendanceLog, 'AttendanceLog', schoolId)
	await backfillSchoolId(Settings, 'Settings', schoolId)
	await backfillSchoolId(EmployeeComment, 'EmployeeComment', schoolId)
	await backfillSchoolId(AddUser, 'adduser', schoolId)
	await backfillSchoolId(UpdateUser, 'updateuser', schoolId)
	await backfillSchoolId(DeleteUser, 'deleteuser', schoolId)

	console.log('\nPlatforma superadmini tekshirilmoqda...')
	await ensurePlatformSuperadmin(schoolId)

	console.log('\n=== Migratsiya yakunlandi ===')
	console.log('Keyingi qadam: har bir modelda schoolId to\'liq to\'ldirilganini')
	console.log('tekshiring (barcha kolleksiyalarda 0 ta {schoolId:{$exists:false}}),')
	console.log('so\'ng model fayllaridagi schoolId maydonini required:true qiling')
	console.log('va compound unique indekslarni yoqing (sinf/camera/settings).')

	await mongoose.connection.close()
}

run().catch((err) => {
	console.error('Migratsiya xatoligi:', err)
	process.exit(1)
})
