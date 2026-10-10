// Namuna ma'lumotlar: 60 maktab x 20 sinf x 15 o'quvchi (+ xodimlar, oxirgi 3 haftalik davomat, kameralar).
//   node scripts/seed-demo.js seed    — eski namunani o'chirib, qaytadan yaratadi
//   node scripts/seed-demo.js clean   — namunani to'liq o'chiradi (haqiqiy maktablarga tegmaydi)
// Namuna maktablar `code` maydoni "seed-" bilan boshlanadi; shu belgi bo'yicha topiladi va o'chiriladi.
const path = require('path')
const fs = require('fs')
const backend = path.join(__dirname, '..')
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') })
const mongoose = require(path.join(backend, 'node_modules/mongoose'))
const M = {
	S: require('../models/school.model'), ST: require('../models/student.model'), SI: require('../models/sinf.model'), U: require('../models/user.model'),
	SA: require('../models/student.attandance.model'), SL: require('../models/student.attandance.log.model'), AA: require('../models/attandance.model'), AL: require('../models/attandance.log.model'),
	HC: require('../models/hik.camera.model'), HA: require('../models/hik.account.model'), CE: require('../models/hik.cameraevent.model'), SE: require('../models/settings.model')
}

// Hamma o'quvchi va xodim uchun bitta rasm (uploads papkasidagi fayl)
const PHOTO = 'image-1790762202480-298798893.jpg'
const SCHOOLS = 60, GRADES = 10, LETTERS = ['A', 'B'], PER_CLASS = 15, STAFF_EXTRA = 5, DAYS = 21
const TZ = 'Asia/Tashkent'
const dstr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const at = (back, h, mi) => { const d = new Date(); d.setDate(d.getDate() - back); d.setUTCHours(h - 5, mi, 0, 0); return d }
let seed = 20260930
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

const REGIONS = {
	'Toshkent shahri': ['Chilonzor', 'Yunusobod', 'Mirzo Ulug‘bek', 'Sergeli'], 'Samarqand viloyati': ['Samarqand shahri', 'Kattaqo‘rg‘on', 'Urgut', 'Bulung‘ur'],
	'Buxoro viloyati': ['Buxoro shahri', 'G‘ijduvon', 'Kogon'], 'Farg‘ona viloyati': ['Farg‘ona shahri', 'Marg‘ilon', 'Qo‘qon'],
	'Andijon viloyati': ['Andijon shahri', 'Asaka', 'Shahrixon'], 'Namangan viloyati': ['Namangan shahri', 'Chust', 'Pop'],
	'Qashqadaryo viloyati': ['Qarshi', 'Shahrisabz', 'Kitob'], 'Xorazm viloyati': ['Urganch', 'Xiva', 'Xazorasp']
}
const MALE = ['Ali', 'Vali', 'Bekzod', 'Sardor', 'Jasur', 'Otabek', 'Aziz', 'Dilshod', 'Jamshid', 'Sherzod', 'Akmal', 'Bobur', 'Timur', 'Ulug‘bek', 'Islom', 'Shohruh', 'Doniyor', 'Sanjar']
const FEMALE = ['Zuhra', 'Madina', 'Nodira', 'Malika', 'Dilnoza', 'Sevara', 'Nilufar', 'Shahnoza', 'Gulnora', 'Mohira', 'Sitora', 'Kamola', 'Feruza', 'Laylo', 'Munisa', 'Aziza']
const SURNAMES = ['Karimov', 'Aliyev', 'Tursunov', 'Yusupov', 'Ergashev', 'Rahimov', 'Abdullayev', 'Nazarov', 'Umarov', 'Saidov', 'Xasanov', 'Qodirov', 'Mirzayev', 'Ismoilov', 'Sobirov', 'Normatov']
const SUBJECTS = ['Matematika', 'Ona tili', 'Fizika', 'Tarix', 'Kimyo', 'Inglizcha', 'Biologiya', 'Geografiya', 'Informatika', 'Adabiyot', 'Jismoniy tarbiya', 'Tasviriy san’at', 'Rus tili', 'Texnologiya', 'Musiqa', 'Boshlang‘ich ta’lim', 'Boshlang‘ich ta’lim', 'Boshlang‘ich ta’lim', 'Boshlang‘ich ta’lim', 'Boshlang‘ich ta’lim']
const person = (female) => {
	const sur = pick(SURNAMES)
	return { name: `${female ? sur + 'a' : sur} ${pick(female ? FEMALE : MALE)}`, female }
}

async function insertBatched(model, docs) {
	for (let i = 0; i < docs.length; i += 5000) await model.insertMany(docs.slice(i, i + 5000), { ordered: false })
}

async function clean() {
	const schools = await M.S.find({ code: /^seed-/ }).select('_id').lean()
	const ids = schools.map(s => s._id)
	const filter = { schoolId: { $in: ids } }
	const r = await Promise.all([M.SA.deleteMany(filter), M.SL.deleteMany(filter), M.AA.deleteMany(filter), M.AL.deleteMany(filter), M.CE.deleteMany(filter), M.HC.deleteMany(filter), M.ST.deleteMany(filter), M.U.deleteMany(filter), M.SI.deleteMany(filter), M.SE.deleteMany(filter)])
	await M.HA.deleteMany({ name: 'SEED akkaunt' })
	try { await M.HC.syncIndexes() } catch { /* nusxa kameralar o'chirilgach indeks tiklanadi */ }
	await M.S.deleteMany({ _id: { $in: ids } })
	console.log(`tozalandi: ${ids.length} maktab, ${r[6].deletedCount} o'quvchi, ${r[0].deletedCount} davomat yozuvi`)
}

async function seedAll() {
	// Eski global unikal indeks (name_1) sinf nomini BUTUN tizimda yagona qilib qo'yardi; model esa maktab ichida yagona bo'lishini talab qiladi
	try { await M.SI.collection.dropIndex('name_1') } catch { /* indeks yo'q */ }
	await M.SI.syncIndexes()

	// Kameralar: haqiqiy 1-maktabdagi oddiy (monitor) kameralar nusxasi har bir namuna maktabga ulanadi (jonli video haqiqiy bo'ladi)
	try { await M.HC.collection.dropIndex('accountId_1_cameraId_1') } catch { /* allaqachon almashtirilgan */ }
	await M.HC.syncIndexes()
	const realSchool = await M.S.findOne({ name: '1-maktab', code: { $not: /^seed-/ } }).lean()
	const template = realSchool ? await M.HC.find({ schoolId: realSchool._id, role: { $in: ['monitor', null] } }).sort({ name: 1 }).limit(3).lean() : []
	if (!template.length) console.log("Diqqat: 1-maktabda oddiy kamera topilmadi, kameralar yaratilmaydi")
	const regionKeys = Object.keys(REGIONS)
	const usedNumbers = new Set()
	let students = 0, attendance = 0

	for (let si = 0; si < SCHOOLS; si++) {
		let num; do { num = 1 + Math.floor(rnd() * 90) } while (usedNumbers.has(num)); usedNumbers.add(num)
		const region = regionKeys[si % regionKeys.length], district = pick(REGIONS[region])
		const school = await M.S.create({ name: `${num}-maktab`, code: `seed-${String(si + 1).padStart(3, '0')}`, region, district, phone: `+998 9${si % 10} ${100 + si} ${10 + (si % 80)} ${10 + ((si * 7) % 80)}` })
		const sid = school._id
		await M.SE.create({ schoolId: sid, workStartTime: pick(['08:30', '09:00', '09:00', '09:00']) })

		// Maktab sifati va yo'nalishi: ba'zilari yaxshilanmoqda, ba'zilari yomonlashmoqda
		const quality = clamp(0.62 + rnd() * 0.35, 0, 0.97)
		const drift = pick([0, 0, 0.004, -0.004, 0.007, -0.007])
		const punctuality = clamp(0.55 + rnd() * 0.4, 0, 0.97)
		const staffQuality = clamp(0.8 + rnd() * 0.18, 0, 0.99)

		// Xodimlar: har sinfga bittadan rahbar + qo'shimcha xodimlar
		const staffDocs = Array.from({ length: GRADES * LETTERS.length + STAFF_EXTRA }, (_, i) => {
			const p = person(rnd() < 0.7)
			return { schoolId: sid, fullName: p.name, photo: PHOTO, photo_camera: false, position: i < 20 ? `${SUBJECTS[i]} o‘qituvchisi` : ['Direktor', 'O‘rinbosar', 'Psixolog', 'Kutubxonachi', 'Xavfsizlik'][i - 20], role: 'viewer', hodimID: `S${si}X${i}`, username: `seed-${si}-${i}`, password: 'xxxxxx', isActive: true }
		})
		const staff = await M.U.insertMany(staffDocs)

		// Sinflar: 1-A ... 10-B
		const sinfDocs = []
		for (let g = 1; g <= GRADES; g++) for (const l of LETTERS) sinfDocs.push({ schoolId: sid, name: `${g}-${l}`, description: `${g}-sinf ${l} guruhi`, head: staff[sinfDocs.length]._id })
		const sinfs = await M.SI.insertMany(sinfDocs)

		// O'quvchilar: har sinfda 15 ta; har biriga shaxsiy "davomat moyilligi" va "kechikish moyilligi"
		const studentDocs = []
		sinfs.forEach((sinf, ci) => {
			const classQ = clamp(quality + (rnd() - 0.5) * 0.16, 0.4, 0.99)
			for (let k = 0; k < PER_CLASS; k++) {
				const p = person(rnd() < 0.5)
				studentDocs.push({ schoolId: sid, sinf: sinf._id, fullName: p.name, studentIdNumber: `S${si}-${ci}-${k}`, gender: p.female ? 'ayol' : 'erkak', photo: PHOTO, photo_camera: false, parentName: `${pick(SURNAMES)} ${pick(MALE)}`, parentPhone: `+998 9${k % 10} ${100 + ci} ${10 + k} ${10 + si % 80}`, _q: clamp(classQ + (rnd() - 0.5) * 0.3, 0.05, 1), _late: rnd() < 0.15 ? 0.7 : rnd() * 0.2 })
			}
		})
		const stuMeta = studentDocs.map(({ _q, _late }) => ({ q: _q, late: _late }))
		const stu = await M.ST.insertMany(studentDocs.map(({ _q, _late, ...d }) => d)) // eslint-disable-line no-unused-vars
		students += stu.length
		const workStart = (await M.SE.findOne({ schoolId: sid }).lean()).workStartTime
		const [wh, wm] = workStart.split(':').map(Number)

		// Davomat: oxirgi DAYS kun (yakshanbasiz). Eng eski kun -> drift bo'yicha o'zgaradi
		const sa = [], sl = [], aa = [], al = []
		for (let back = 0; back < DAYS; back++) {
			const day = at(back, 9, 0)
			const wd = day.getUTCDay()
			if (wd === 0) continue
			const ds = dstr(day)
			const dayFactor = (wd === 1 ? -0.03 : wd === 6 ? -0.07 : 0.0) + drift * (DAYS - back) - drift * DAYS / 2 // yaqin kunlarga qarab
			for (const [i, s] of stu.entries()) {
				const m = stuMeta[i]
				if (rnd() > clamp(m.q + dayFactor, 0.05, 0.995)) continue
				const late = rnd() < m.late * (1.2 - punctuality)
				const inT = late ? at(back, wh, wm + 5 + Math.floor(rnd() * 40)) : at(back, wh - 1, 40 + Math.floor(rnd() * (60 - 40 + wm)))
				sa.push({ schoolId: sid, student: s._id, date: inT, dateString: ds, status: back === 0 && rnd() < 0.6 ? 'ishda' : 'tashqarida', totalTime: '5:10', totalEntries: 2 })
				sl.push({ schoolId: sid, student: s._id, date: inT, dateString: ds, checkin: true, checkInTime: inT, checkOutTime: at(back, 14, 0) })
			}
			for (const u of staff) {
				if (rnd() > staffQuality) continue
				const inT = at(back, wh - 1, 30 + Math.floor(rnd() * 50))
				aa.push({ schoolId: sid, user: u._id, date: inT, dateString: ds, status: back === 0 ? 'ishda' : 'tashqarida', totalTime: '6:00', totalEntries: 2 })
				al.push({ schoolId: sid, user: u._id, date: inT, dateString: ds, checkin: true, checkInTime: inT, checkOutTime: at(back, 15, 0) })
			}
		}
		attendance += sa.length
		await Promise.all([insertBatched(M.SA, sa), insertBatched(M.SL, sl), insertBatched(M.AA, aa), insertBatched(M.AL, al)])

		// Kameralar: 1-maktabdagi 3 ta haqiqiy kamera nusxasi; har biri shu maktabning bitta sinfiga biriktiriladi
		const camClass = [0, 8, 19]
		if (template.length) {
			await M.HC.insertMany(template.map((c, i) => ({
				accountId: c.accountId, schoolId: sid, cameraId: c.cameraId, serial: c.serial, name: c.name, areaName: c.areaName, online: c.online, lastSeenAt: c.lastSeenAt, syncedAt: c.syncedAt,
				inCloud: c.inCloud, role: 'monitor', sinfId: sinfs[camClass[i % camClass.length]]._id, autoAttendance: false
			})))
		}
		console.log(`yaratildi: ${school.name} (${region}, ${district}) · sifat ${Math.round(quality * 100)}%`)
	}
	console.log(`Jami: ${SCHOOLS} maktab, ${SCHOOLS * GRADES * LETTERS.length} sinf, ${students} o'quvchi, ${attendance} o'quvchi davomat yozuvi`)
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
	const mode = process.argv[2]
	if (mode === 'seed') { await clean(); await seedAll() } else if (mode === 'clean') await clean()
	else console.log('Ishlatish: node scripts/seed-demo.js seed | clean')
	await mongoose.disconnect()
}).catch(e => { console.error(e); process.exit(1) })
