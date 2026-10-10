// YUKLAMA SINOVI uchun katta ma'lumotlar: bitta maktabda 2000 tagacha o'quvchi, 50–60 o'qituvchi, 60+ sinf, ko'p kamera.
//   node scripts/seed-load.js seed [maktablar=12]   — yaratadi (avval eski yuklama ma'lumotlarini o'chiradi)
//   node scripts/seed-load.js clean                 — faqat shu skript yaratganini o'chiradi
// Maktablar kodi "load-" bilan boshlanadi; haqiqiy va "seed-" (namuna) maktablarga tegmaydi.
// Kameralar soxta (LOAD akkaunt): haqiqiy Hik-Connect'ga so'rov yuborilmaydi.
const path = require('path')
const backend = path.join(__dirname, '..')
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') })
const mongoose = require(path.join(backend, 'node_modules/mongoose'))
const M = {
	S: require('../models/school.model'), ST: require('../models/student.model'), SI: require('../models/sinf.model'), U: require('../models/user.model'),
	SA: require('../models/student.attandance.model'), SL: require('../models/student.attandance.log.model'), AA: require('../models/attandance.model'), AL: require('../models/attandance.log.model'),
	HC: require('../models/hik.camera.model'), HA: require('../models/hik.account.model'), CE: require('../models/hik.cameraevent.model'), HE: require('../models/hik.event.model'),
	SE: require('../models/settings.model'), EC: require('../models/employee.comment.model')
}
const PHOTO = 'image-1790762202480-298798893.jpg'
const SIZES = [2000, 2000, 2000, 2000, 1800, 1600, 1500, 1200, 1000, 900, 800, 600] // maktablar bo'yicha o'quvchilar soni
const DAYS = 21
const TZ = 'Asia/Tashkent'
const dstr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const at = (back, h, mi) => { const d = new Date(); d.setDate(d.getDate() - back); d.setUTCHours(h - 5, mi, 0, 0); return d }
let seed = 777001
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const MALE = ['Ali', 'Vali', 'Bekzod', 'Sardor', 'Jasur', 'Otabek', 'Aziz', 'Dilshod', 'Jamshid', 'Sherzod', 'Akmal', 'Bobur', 'Timur', 'Shohruh', 'Doniyor', 'Sanjar']
const FEMALE = ['Zuhra', 'Madina', 'Nodira', 'Malika', 'Dilnoza', 'Sevara', 'Nilufar', 'Shahnoza', 'Gulnora', 'Mohira', 'Sitora', 'Kamola', 'Feruza', 'Laylo']
const SURN = ['Karimov', 'Aliyev', 'Tursunov', 'Yusupov', 'Ergashev', 'Rahimov', 'Abdullayev', 'Nazarov', 'Umarov', 'Saidov', 'Xasanov', 'Qodirov', 'Mirzayev', 'Ismoilov', 'Sobirov', 'Normatov']
const REG = ['Toshkent shahri', 'Samarqand viloyati', 'Buxoro viloyati', "Farg'ona viloyati", 'Andijon viloyati', 'Namangan viloyati']
const person = (f) => { const s = pick(SURN); return `${f ? s + 'a' : s} ${pick(f ? FEMALE : MALE)}` }
const batch = async (model, docs) => { for (let i = 0; i < docs.length; i += 5000) await model.insertMany(docs.slice(i, i + 5000), { ordered: false }) }

async function clean() {
	const ids = (await M.S.find({ code: /^load-/ }).select('_id').lean()).map(s => s._id)
	const f = { schoolId: { $in: ids } }
	const r = await Promise.all([M.SA.deleteMany(f), M.SL.deleteMany(f), M.AA.deleteMany(f), M.AL.deleteMany(f), M.CE.deleteMany(f), M.HE.deleteMany(f), M.HC.deleteMany(f), M.ST.deleteMany(f), M.U.deleteMany(f), M.SI.deleteMany(f), M.SE.deleteMany(f), M.EC.deleteMany(f)])
	await M.HA.deleteMany({ name: 'LOAD akkaunt' })
	await M.S.deleteMany({ _id: { $in: ids } })
	try { await M.HC.syncIndexes() } catch { /* nusxa kameralar o'chirilgach */ }
	console.log(`tozalandi: ${ids.length} maktab, ${r[7].deletedCount} o'quvchi, ${r[0].deletedCount} davomat yozuvi`)
}

async function seedAll(count) {
	await require('../services/grade.service').ensureDefaults()
	const acc = await M.HA.create({ name: 'LOAD akkaunt', appKey: 'load', appKeyHash: 'load' + Date.now(), secretKey: 'load' })
	const totals = { schools: 0, students: 0, staff: 0, classes: 0, cameras: 0, att: 0, events: 0, faceEvents: 0 }
	for (let si = 0; si < count; si++) {
		const t0 = Date.now()
		const size = SIZES[si % SIZES.length]
		const parallels = Math.max(3, Math.round(size / 11 / 30)) // sinf darajasiga 3–6 parallel
		const letters = 'ABCDEFGH'.slice(0, parallels).split('')
		const school = await M.S.create({ name: `Yuklama ${si + 1}-maktab`, code: `load-${String(si + 1).padStart(3, '0')}`, region: REG[si % REG.length], district: 'Sinov tumani', phone: `+998 71 ${100 + si} 00 00` })
		const sid = school._id
		await M.SE.create({ schoolId: sid, workStartTime: pick(['08:30', '09:00', '09:00']) })
		const quality = clamp(0.6 + rnd() * 0.37, 0, 0.97), staffQ = clamp(0.8 + rnd() * 0.18, 0, 0.99), punctual = clamp(0.55 + rnd() * 0.4, 0, 0.97)

		// sinflar
		const classCount = 11 * parallels
		const staffCount = clamp(Math.round(size / 36), 40, 60)
		const staff = await M.U.insertMany(Array.from({ length: staffCount }, (_, i) => ({ schoolId: sid, fullName: person(rnd() < 0.7), position: i < classCount ? 'Sinf rahbari o‘qituvchi' : ['Direktor', 'O‘rinbosar', 'Psixolog', 'Kutubxonachi', 'Xavfsizlik', 'Fan o‘qituvchisi'][i % 6], role: 'viewer', hodimID: `L${si}X${i}`, username: `load-${si}-${i}`, password: 'xxxxxx', isActive: true, photo: PHOTO, photo_camera: false })))
		const sinfDocs = []
		for (let g = 1; g <= 11; g++) for (const l of letters) sinfDocs.push({ schoolId: sid, grade: g, letter: l, name: `${g}-${l}`, description: '', head: staff[sinfDocs.length % staff.length]._id })
		const sinfs = await M.SI.insertMany(sinfDocs)

		// o'quvchilar: sinflarga teng taqsimlanadi
		const perClass = Math.floor(size / sinfs.length)
		const studentDocs = [], meta = []
		sinfs.forEach((sinf, ci) => {
			const classQ = clamp(quality + (rnd() - 0.5) * 0.16, 0.4, 0.99)
			for (let k = 0; k < perClass + (ci < size - perClass * sinfs.length ? 1 : 0); k++) {
				studentDocs.push({ schoolId: sid, sinf: sinf._id, fullName: person(rnd() < 0.5), studentIdNumber: `L${si}-${ci}-${k}`, gender: rnd() < 0.5 ? 'ayol' : 'erkak', parentName: `${pick(SURN)} ${pick(MALE)}`, parentPhone: `+998 9${k % 10} ${100 + ci} ${10 + (k % 80)} ${10 + si}`, photo: PHOTO, photo_camera: false })
				meta.push({ q: clamp(classQ + (rnd() - 0.5) * 0.3, 0.05, 1), late: rnd() < 0.15 ? 0.7 : rnd() * 0.2 })
			}
		})
		const students = []
		for (let i = 0; i < studentDocs.length; i += 5000) students.push(...await M.ST.insertMany(studentDocs.slice(i, i + 5000), { ordered: false }))
		const [wh, wm] = (await M.SE.findOne({ schoolId: sid }).lean()).workStartTime.split(':').map(Number)

		// davomat: oxirgi DAYS kun (yakshanbasiz)
		const sa = [], sl = [], aa = [], al = []
		for (let back = 0; back < DAYS; back++) {
			const day = at(back, 9, 0); const wd = day.getUTCDay(); if (wd === 0) continue
			const ds = dstr(day); const dayF = wd === 1 ? -0.03 : wd === 6 ? -0.07 : 0
			for (let i = 0; i < students.length; i++) {
				const m = meta[i]; if (rnd() > clamp(m.q + dayF, 0.05, 0.995)) continue
				const late = rnd() < m.late * (1.2 - punctual)
				const inT = late ? at(back, wh, wm + 5 + Math.floor(rnd() * 40)) : at(back, wh, wm - 2 - Math.floor(rnd() * 38))
				sa.push({ schoolId: sid, student: students[i]._id, date: inT, dateString: ds, status: back === 0 && rnd() < 0.6 ? 'ishda' : 'tashqarida', totalTime: '5:10', totalEntries: 2 })
				sl.push({ schoolId: sid, student: students[i]._id, date: inT, dateString: ds, checkin: true, checkInTime: inT, checkOutTime: at(back, 14, 0) })
			}
			for (const u of staff) {
				if (rnd() > staffQ) continue
				const inT = at(back, wh, wm - 10 - Math.floor(rnd() * 40))
				aa.push({ schoolId: sid, user: u._id, date: inT, dateString: ds, status: back === 0 ? 'ishda' : 'tashqarida', totalTime: '6:00', totalEntries: 2 })
				al.push({ schoolId: sid, user: u._id, date: inT, dateString: ds, checkin: true, checkInTime: inT, checkOutTime: at(back, 15, 0) })
			}
		}
		await Promise.all([batch(M.SA, sa), batch(M.SL, sl), batch(M.AA, aa), batch(M.AL, al)])
		totals.att += sa.length

		// xodim izohlari (sababli kelmaganlar)
		const types = ['tatil', 'safar', 'kasallik', 'boshqa']
		await M.EC.insertMany(Array.from({ length: 6 }, (_, i) => ({ schoolId: sid, employee: staff[staff.length - 1 - i]._id, type: types[i % 4], comment: `Yuklama: ${types[i % 4]}`, startDate: dstr(at(5, 9, 0)), endDate: null })))

		// kameralar: 24–40 oddiy (sinflarga biriktirilgan) + 4 FaceControl
		const regular = clamp(24 + Math.floor(rnd() * 17), 24, 40)
		const camDocs = []
		for (let i = 0; i < regular; i++) camDocs.push({ accountId: acc._id, schoolId: sid, cameraId: `LOAD-${si}-${i}`, serial: `LOADSER${si}${i}`, name: `Camera ${i + 1}`, areaName: `${1 + (i % 3)}-qavat`, online: rnd() > 0.1, lastSeenAt: new Date(), syncedAt: new Date(), role: 'monitor', sinfId: i < sinfs.length ? sinfs[i]._id : null })
		for (const [i, role] of ['in', 'in', 'out', 'out'].entries()) camDocs.push({ accountId: acc._id, schoolId: sid, cameraId: `LOAD-${si}-fc${i}`, serial: `LOADFC${si}${i}`, name: `FaceControl ${i + 1}`, areaName: 'Kirish', online: true, lastSeenAt: new Date(), syncedAt: new Date(), role, sinfId: null })
		const cams = await M.HC.insertMany(camDocs)
		totals.cameras += cams.length

		// kamera hodisalari: oxirgi 3 kun, har sinf kamerasiga ~6 soat x 4 ta
		const events = []; let g = 0
		for (let ci = 0; ci < Math.min(regular, sinfs.length); ci++) for (let back = 0; back < 3; back++) for (let h = 8; h < 14; h++) for (let k = 0; k < 2 + Math.floor(rnd() * 5); k++)
			events.push({ schoolId: sid, accountId: acc._id, camera: cams[ci]._id, sinfId: sinfs[ci]._id, guid: `${si}-${ci}-${back}-${h}-${k}-${g++}`, eventType: 10002, kind: 'motion', time: at(back, h, k * 7), hour: h, dateString: dstr(at(back, h, 0)) })
		await batch(M.CE, events)
		totals.events += events.length

		// FaceControl aniqlashlari: bugun va kecha (kirish va chiqish)
		const fc = cams.filter(c => c.role !== 'monitor'), face = []
		for (let back = 0; back < 2; back++) for (let i = 0; i < students.length; i += 1) {
			if (rnd() > 0.8) continue
			const cin = fc.filter(c => c.role === 'in'), cout = fc.filter(c => c.role === 'out')
			face.push({ schoolId: sid, accountId: acc._id, camera: pick(cin)._id, guid: `f-${si}-${back}-${i}-in`, direction: 'in', humanId: studentDocs[i].studentIdNumber, humanName: studentDocs[i].fullName, similarity: 80 + Math.floor(rnd() * 20), threshold: 80, personType: 'student', student: students[i]._id, personName: studentDocs[i].fullName, sinf: studentDocs[i].sinf, recorded: true, time: at(back, 8, Math.floor(rnd() * 50)), dateString: dstr(at(back, 8, 0)) })
			face.push({ schoolId: sid, accountId: acc._id, camera: pick(cout)._id, guid: `f-${si}-${back}-${i}-out`, direction: 'out', humanId: studentDocs[i].studentIdNumber, humanName: studentDocs[i].fullName, similarity: 80 + Math.floor(rnd() * 20), threshold: 80, personType: 'student', student: students[i]._id, personName: studentDocs[i].fullName, sinf: studentDocs[i].sinf, recorded: true, time: at(back, 14, Math.floor(rnd() * 50)), dateString: dstr(at(back, 14, 0)) })
		}
		await batch(M.HE, face)
		totals.faceEvents += face.length

		totals.schools++; totals.students += students.length; totals.staff += staff.length; totals.classes += sinfs.length
		console.log(`#${si + 1} ${school.name}: ${students.length} o'quvchi, ${staff.length} xodim, ${sinfs.length} sinf, ${cams.length} kamera, ${sa.length} davomat · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
	}
	console.log('JAMI', JSON.stringify(totals))
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
	const mode = process.argv[2]
	if (mode === 'seed') {
		await mongoose.connection.collection('hikcameras').dropIndex('accountId_1_cameraId_1').catch(() => { })
		await M.HC.syncIndexes()
		await clean(); await seedAll(Number(process.argv[3]) || SIZES.length)
	} else if (mode === 'clean') await clean()
	else console.log('Ishlatish: node scripts/seed-load.js seed [maktablar] | clean')
	await mongoose.disconnect()
}).catch(e => { console.error(e); process.exit(1) })
