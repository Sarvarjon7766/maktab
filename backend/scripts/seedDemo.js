/* eslint-disable no-console */
// Demo ma'lumotlar: har bir tumanda maktablar, sinflar, o'quvchilar, xodimlar, 30 kunlik davomat, kameralar, hodisalar, AI o'lchovlari.
// Hammasi kodi "seed-" bilan boshlanadigan maktablarga bog'lanadi: haqiqiy ma'lumotlarga tegmaydi.
//   node scripts/seedDemo.js          — qo'shadi (allaqachon bor bo'lsa to'xtaydi)
//   node scripts/seedDemo.js --clean  — faqat seed maktablari va ularga bog'liq yozuvlarni o'chiradi
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const School = require('../models/school.model')
const Sinf = require('../models/sinf.model')
const Student = require('../models/student.model')
const User = require('../models/user.model')
const Settings = require('../models/settings.model')
const District = require('../models/district.model')
const Attendance = require('../models/attandance.model')
const AttendanceLog = require('../models/attandance.log.model')
const StudentAttendance = require('../models/student.attandance.model')
const StudentAttendanceLog = require('../models/student.attandance.log.model')
const HikCamera = require('../models/hik.camera.model')
const HikCameraEvent = require('../models/hik.cameraevent.model')
const HikVisionMetric = require('../models/hik.visionmetric.model')
const HikAccount = require('../models/hik.account.model')
const EmployeeComment = require('../models/employee.comment.model')
const StudentExcuse = require('../models/student.excuse.model')

const DAYS = 30
// Demo kameralar alohida soxta akkauntda: haqiqiy akkauntning avtomatik sinxronizatsiyasi ularni 'bulutda yo'q' deb belgilab qo'ymasligi uchun
const DEMO_ACCOUNT = 'DEMO (seed) akkaunt'
const TZ_OFFSET = 5 * 3600 * 1000
const GRADES = [1, 2, 3, 5, 7, 9, 11]
const MALE = ['Aziz', 'Bobur', 'Davron', 'Eldor', 'Farrux', 'Jasur', 'Komil', 'Laziz', 'Muhammad', 'Nodir', 'Otabek', 'Sardor', 'Timur', 'Ulugbek', 'Zafar', 'Sanjar', 'Doston', 'Islom']
const FEMALE = ['Aziza', 'Dilnoza', 'Feruza', 'Gulnoza', 'Madina', 'Nilufar', 'Sevara', 'Zilola', 'Malika', 'Shahnoza', 'Nodira', 'Kamola', 'Laylo', 'Sabina', 'Munisa', 'Iroda']
const LAST = ['Karimov', 'Rahimov', 'Aliyev', 'Yusupov', 'Tursunov', 'Ismoilov', 'Normatov', 'Qodirov', 'Xolmatov', 'Saidov', 'Abdullayev', 'Ergashev', 'Hamidov', 'Mirzayev', 'Nazarov', 'Sobirov']
const POSITIONS = ["Matematika o'qituvchisi", "Ona tili o'qituvchisi", "Ingliz tili o'qituvchisi", "Fizika o'qituvchisi", "Tarix o'qituvchisi", "Biologiya o'qituvchisi", "Kimyo o'qituvchisi", "Boshlang'ich sinf o'qituvchisi", 'Direktor o\'rinbosari', 'Kutubxonachi']
const CAM_PLACES = ['Kirish', 'Koridor 1-qavat', 'Koridor 2-qavat', 'Hovli', 'Oshxona']

// Takrorlanadigan tasodifiy son (har ishga tushirishda bir xil natija)
let seed = 20261007
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const between = (a, b) => a + rnd() * (b - a)
const pad = (n) => String(n).padStart(2, '0')
const tz = (d) => new Date(d.getTime() + TZ_OFFSET)
const dateStr = (d) => { const t = tz(d); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}` }
const atTime = (ds, minutes) => new Date(new Date(`${ds}T00:00:00+05:00`).getTime() + Math.round(minutes) * 60000)
const hm = (m) => `${Math.floor(m / 60)}:${pad(Math.round(m % 60))}`
const chunk = async (Model, docs, size = 5000) => { for (let i = 0; i < docs.length; i += size) await Model.insertMany(docs.slice(i, i + size), { ordered: false }) }

async function clean() {
	const schools = await School.find({ code: /^seed-/ }).select('_id').lean()
	const ids = schools.map(s => s._id)
	if (!ids.length) return console.log('Seed maktablari topilmadi')
	const byS = { schoolId: { $in: ids } }
	for (const [name, M] of [['Attendance', Attendance], ['AttendanceLog', AttendanceLog], ['StudentAttendance', StudentAttendance], ['StudentAttendanceLog', StudentAttendanceLog], ['HikCameraEvent', HikCameraEvent], ['HikVisionMetric', HikVisionMetric], ['HikCamera', HikCamera], ['EmployeeComment', EmployeeComment], ['StudentExcuse', StudentExcuse], ['Student', Student], ['User', User], ['Sinf', Sinf], ['Settings', Settings]]) {
		const r = await M.deleteMany(byS)
		console.log(name, r.deletedCount)
	}
	console.log('School', (await School.deleteMany({ _id: { $in: ids } })).deletedCount)
	console.log('HikAccount (demo)', (await HikAccount.deleteMany({ name: DEMO_ACCOUNT })).deletedCount)
}

async function main() {
	await mongoose.connect(process.env.MONGO_URI)
	if (process.argv.includes('--clean')) { await clean(); return }
	if (await School.exists({ code: /^seed-/ })) { console.log('Seed maktablari allaqachon bor. Avval: node scripts/seedDemo.js --clean'); return }

	const account = (await HikAccount.findOne({ name: DEMO_ACCOUNT }).select('_id').lean()) || await HikAccount.create({ name: DEMO_ACCOUNT, appKeyHash: 'seed-demo-account', appKey: 'seed', secretKey: 'seed' })
	const districts = await District.find({ isRegion: false, isActive: true }).sort({ name: 1 }).lean()
	const hash = await bcrypt.hash('Seed12345!', 8)
	const now = new Date()
	const today = dateStr(now)
	const nowMin = Math.floor((tz(now).getUTCHours() * 60 + tz(now).getUTCMinutes()))
	const days = []
	for (let i = DAYS - 1; i >= 0; i--) { const d = new Date(now.getTime() - i * 86400000); if (tz(d).getUTCDay() !== 0) days.push(dateStr(d)) }
	console.log(`Tumanlar: ${districts.length}, kunlar: ${days.length}, bugun: ${today}, soat: ${hm(nowMin)}`)

	let schoolNo = 0, totals = { students: 0, staff: 0, att: 0 }
	for (const [di, dist] of districts.entries()) {
		// tuman "sifati": ba'zilari yuqori, ba'zilari past davomatli
		const distQ = 0.86 + rnd() * 0.12
		const count = dist.name === "Bulung'ur" ? 1 : (di % 3 === 0 ? 3 : 2)
		for (let k = 0; k < count; k++) {
			schoolNo++
			const quality = Math.min(0.985, Math.max(0.5, distQ + between(-0.1, 0.1)))
			const start = pick([480, 480, 495, 510])
			const school = await School.create({
				name: `${schoolNo + 1}-maktab`, code: `seed-${String(schoolNo).padStart(2, '0')}`, region: dist.region || 'Samarqand', district: dist.name,
				location: { lat: (dist.center?.lat || 39.7) + between(-0.04, 0.04), lng: (dist.center?.lng || 67) + between(-0.05, 0.05), address: `${dist.name} tumani`, updatedAt: now },
				phone: `+99890${Math.floor(1000000 + rnd() * 8999999)}`, isActive: schoolNo !== 7
			})
			await Settings.create({ schoolId: school._id, workStartTime: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`, parentNotify: { enabled: true, notifyIn: true, notifyOut: true, minGapMinutes: 3 } })

			// Sinflar va o'quvchilar
			const sinfs = await Sinf.insertMany(GRADES.map((g, i) => ({ schoolId: school._id, grade: g, letter: i % 2 ? 'B' : 'A', name: `${g}-${i % 2 ? 'B' : 'A'}` })))
			const students = []
			for (const s of sinfs) {
				const n = 16 + Math.floor(rnd() * 8)
				for (let i = 0; i < n; i++) {
					const male = rnd() > 0.5
					students.push({ schoolId: school._id, sinf: s._id, fullName: `${pick(LAST)}${male ? '' : 'a'} ${pick(male ? MALE : FEMALE)}`, studentIdNumber: `${school.code}-${String(students.length + 1).padStart(4, '0')}`, gender: male ? 'erkak' : 'ayol', isActive: true })
				}
			}
			const stDocs = await Student.insertMany(students)
			// Xodimlar (har bir sinfga bittadan rahbar + boshqalar)
			const staffRaw = []
			const staffCount = 9 + Math.floor(rnd() * 5)
			for (let i = 0; i < staffCount; i++) {
				const male = rnd() > 0.45
				const id = new mongoose.Types.ObjectId()
				staffRaw.push({ _id: id, schoolId: school._id, fullName: `${pick(LAST)}${male ? '' : 'a'} ${pick(male ? MALE : FEMALE)}`, position: pick(POSITIONS), role: 'viewer', username: `${school.code}-x${i + 1}`, password: hash, hodimID: String(id), isActive: true, isEdit: false, ...(i < sinfs.length ? { sinf: sinfs[i]._id } : {}) })
			}
			const staff = await User.insertMany(staffRaw)
			for (let i = 0; i < Math.min(sinfs.length, staff.length); i++) await Sinf.updateOne({ _id: sinfs[i]._id }, { head: staff[i]._id })

			// Davomat
			const sAtt = [], sLog = [], uAtt = [], uLog = []
			const absentStreak = new Map()
			for (const ds of days) {
				const isToday = ds === today
				const dayF = Math.min(0.99, Math.max(0.35, quality + between(-0.06, 0.04)))
				const open = !isToday || nowMin > start - 20
				if (!open) continue
				const mk = (person, kind, base, lateBias) => {
					const sid = String(person._id)
					const risk = kind === 'student' && absentStreak.get(sid) // xavf guruhi: ketma-ket kelmaganlar
					if (rnd() > base || risk > 0) { if (risk > 0) absentStreak.set(sid, risk - 1); return null }
					let arr = start - between(35, 5) + (rnd() < lateBias ? between(15, 55) : 0)
					if (isToday && arr > nowMin - 2) return null
					arr = Math.round(arr)
					const out = isToday ? null : Math.round(Math.max(arr + 200, between(780, 870)))
					return { arr, out }
				}
				const mkRow = (Att, Log, arrAcc, logAcc, person, field, r) => {
					const date = new Date(`${ds}T00:00:00+05:00`)
					arrAcc.push({ schoolId: school._id, [field]: person._id, date, dateString: ds, status: r.out === null ? 'ishda' : 'tashqarida', totalTime: hm(r.out === null ? Math.max(0, nowMin - r.arr) : r.out - r.arr), totalEntries: 1 })
					logAcc.push({ schoolId: school._id, [field]: person._id, date, dateString: ds, checkin: true, checkInTime: atTime(ds, r.arr) })
					if (r.out !== null) logAcc.push({ schoolId: school._id, [field]: person._id, date, dateString: ds, checkout: true, checkOutTime: atTime(ds, r.out) })
				}
				for (const st of stDocs) {
					if (!absentStreak.has(String(st._id)) && rnd() < 0.012 && ds === days[days.length - 5]) absentStreak.set(String(st._id), 4) // oxirgi kunlarda ketma-ket kelmagan
					const r = mk(st, 'student', dayF, 0.14)
					if (r) mkRow(StudentAttendance, StudentAttendanceLog, sAtt, sLog, st, 'student', r)
				}
				for (const u of staff) {
					const r = mk(u, 'staff', Math.min(0.99, dayF + 0.08), 0.1)
					if (r) mkRow(Attendance, AttendanceLog, uAtt, uLog, u, 'user', r)
				}
			}
			await chunk(StudentAttendance, sAtt); await chunk(StudentAttendanceLog, sLog); await chunk(Attendance, uAtt); await chunk(AttendanceLog, uLog)

			// Sabablar: ba'zi xodimlar ta'tilda, ba'zi o'quvchilar kasal
			const leaveTypes = ['tatil', 'safar', 'kasallik', 'boshqa']
			for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
				const u = staff[3 + i]; if (!u) break
				await EmployeeComment.create({ schoolId: school._id, employee: u._id, startDate: days[days.length - 3 - i] || today, endDate: i === 0 ? null : today, type: leaveTypes[i % 4], comment: ['Yillik ta\'til', 'Xizmat safari', 'Shamollash', 'Oilaviy sabab'][i % 4] })
			}
			for (let i = 0; i < 3; i++) {
				const st = stDocs[Math.floor(rnd() * stDocs.length)]
				await StudentExcuse.create({ schoolId: school._id, student: st._id, sinf: st.sinf, startDate: days[days.length - 4 - i] || today, endDate: today, type: pick(['kasallik', 'oilaviy', 'musobaqa']), comment: 'Sinf rahbari kiritgan' })
			}

			// Kameralar: FaceControl kirish/chiqish + sinf kameralari (AI)
			const cams = []
			const camBase = { accountId: account._id, schoolId: school._id, inCloud: true, syncedAt: now, assignedAt: now }
			cams.push({ ...camBase, cameraId: `${school.code}-in`, serial: `SEED${schoolNo}IN`, name: 'Kirish FaceControl', areaName: 'Kirish', role: 'in', online: rnd() > 0.1, lastSeenAt: now })
			cams.push({ ...camBase, cameraId: `${school.code}-out`, serial: `SEED${schoolNo}OUT`, name: 'Chiqish FaceControl', areaName: 'Kirish', role: 'out', online: rnd() > 0.1, lastSeenAt: now })
			sinfs.slice(0, 3).forEach((s, i) => cams.push({ ...camBase, cameraId: `${school.code}-c${i}`, serial: `SEED${schoolNo}C${i}`, name: `${s.name} sinf kamerasi`, areaName: s.name, role: 'monitor', sinfId: s._id, visionEnabled: true, autoAttendance: false, online: schoolNo % 5 === 0 ? i !== 0 : rnd() > 0.15, lastSeenAt: new Date(now.getTime() - Math.floor(rnd() * 3 * 3600000)) }))
			;[3, 4].forEach(i => cams.push({ ...camBase, cameraId: `${school.code}-g${i}`, serial: `SEED${schoolNo}G${i}`, name: CAM_PLACES[i], areaName: CAM_PLACES[i], role: 'monitor', online: rnd() > 0.2, lastSeenAt: now }))
			const camDocs = await HikCamera.insertMany(cams)

			// Kamera hodisalari va AI o'lchovlari
			const events = [], metrics = []
			const KINDS = [['motion', 1], ['density', 2], ['people', 3], ['enter', 4], ['exit', 5]]
			let ev = 0
			for (const ds of days.slice(-14)) {
				const n = 4 + Math.floor(rnd() * 8)
				for (let i = 0; i < n; i++) {
					const cam = pick(camDocs.filter(c => c.role === 'monitor'))
					const [kind, type] = pick(KINDS)
					const min = between(start + 30, 840)
					events.push({ schoolId: school._id, accountId: account._id, camera: cam._id, sinfId: cam.sinfId || null, guid: `${school.code}-e${++ev}`, eventType: type, kind, time: atTime(ds, min), hour: Math.floor(min / 60), dateString: ds, title: kind })
				}
				for (const cam of camDocs.filter(c => c.visionEnabled)) {
					for (let h = 8; h <= 14; h++) {
						if (ds === today && h * 60 > nowMin) break
						const empty = schoolNo % 6 === 0 && cam.name.startsWith(sinfs[0].name)
						const count = empty ? 0 : Math.round(between(8, 24) * (h === 8 || h === 14 ? 0.6 : 1))
						for (let m = 0; m < 3; m++) metrics.push({ schoolId: school._id, camera: cam._id, sinfId: cam.sinfId, count, activity: Math.round(between(10, 80)), time: atTime(ds, h * 60 + m * 20), hour: h, dateString: ds, ms: 120 })
					}
				}
			}
			// bugungi sinf bo'sh qolishi va odamlar keskin oshishi: ogohlantirishlar uchun
			if (schoolNo % 4 === 0) { const cam = camDocs.find(c => c.visionEnabled); events.push({ schoolId: school._id, accountId: account._id, camera: cam._id, sinfId: cam.sinfId, guid: `${school.code}-v1`, eventType: 9, kind: 'vision_empty', time: atTime(today, Math.min(nowMin, 600)), hour: Math.floor(Math.min(nowMin, 600) / 60), dateString: today, title: "Sinf bo'sh qolgan" }) }
			if (schoolNo % 5 === 0) { const cam = camDocs.find(c => c.visionEnabled); events.push({ schoolId: school._id, accountId: account._id, camera: cam._id, sinfId: cam.sinfId, guid: `${school.code}-v2`, eventType: 9, kind: 'vision_overcrowd', time: atTime(today, Math.min(nowMin, 560)), hour: Math.floor(Math.min(nowMin, 560) / 60), dateString: today, title: "Ro'yxatdan ortiq odam" }) }
			await chunk(HikCameraEvent, events); await chunk(HikVisionMetric, metrics)

			totals = { students: totals.students + stDocs.length, staff: totals.staff + staff.length, att: totals.att + sAtt.length + uAtt.length }
			console.log(`${school.name} (${school.code}) — ${dist.name}: ${stDocs.length} o'quvchi, ${staff.length} xodim, davomat ${sAtt.length + uAtt.length}`)
		}
	}
	console.log('Tayyor:', totals)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => mongoose.disconnect())
