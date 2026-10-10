// MASHTAB SINOVI: 80 maktab x 2500 o'quvchi x 80 xodim, har maktabda 40 oddiy + 6 FaceControl kamera, 2 yillik davomat.
//   node scripts/seed-scale.js seed [--years=2] [--schools=80] [--students=2500]   — yaratadi (eski "seed-", "load-" va "scale-" maktablarni o'chiradi)
//   node scripts/seed-scale.js indexes                                              — davomat indekslarini (qayta) quradi
//   node scripts/seed-scale.js clean                                                — faqat "scale-" maktablarni o'chiradi
// Davomat eng yangi oydan boshlab orqaga qarab yoziladi; diskda joy 12 GB dan kamaysa to'xtaydi (tizim diski to'lib qolmasligi uchun).
// Katta jadvallarga yozish tezligi uchun ikkilamchi indekslar vaqtincha olib tashlanadi va oxirida bitta o'tishda qayta quriladi.
const path = require('path')
const fs = require('fs')
const backend = path.join(__dirname, '..')
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env') })
const mongoose = require(path.join(backend, 'node_modules/mongoose'))
const M = {
	S: require('../models/school.model'), ST: require('../models/student.model'), SI: require('../models/sinf.model'), U: require('../models/user.model'),
	SA: require('../models/student.attandance.model'), SL: require('../models/student.attandance.log.model'), AA: require('../models/attandance.model'), AL: require('../models/attandance.log.model'),
	HC: require('../models/hik.camera.model'), HA: require('../models/hik.account.model'), CE: require('../models/hik.cameraevent.model'), HE: require('../models/hik.event.model'),
	SE: require('../models/settings.model'), EC: require('../models/employee.comment.model')
}
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d }
const CFG = { schools: arg('schools', 80), students: arg('students', 2500), staff: arg('staff', 80), regular: arg('regular', 40), face: arg('face', 6), years: arg('years', 2) }
const MIN_FREE_GB = 12
const PHOTO = 'image-1790762202480-298798893.jpg'
const TZ_MS = 5 * 3600 * 1000
let seed = 20261002
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const MALE = ['Ali', 'Vali', 'Bekzod', 'Sardor', 'Jasur', 'Otabek', 'Aziz', 'Dilshod', 'Jamshid', 'Sherzod', 'Akmal', 'Bobur', 'Timur', 'Shohruh', 'Doniyor', 'Sanjar', 'Islom', 'Ulug‘bek']
const FEMALE = ['Zuhra', 'Madina', 'Nodira', 'Malika', 'Dilnoza', 'Sevara', 'Nilufar', 'Shahnoza', 'Gulnora', 'Mohira', 'Sitora', 'Kamola', 'Feruza', 'Laylo', 'Munisa', 'Aziza']
const SURN = ['Karimov', 'Aliyev', 'Tursunov', 'Yusupov', 'Ergashev', 'Rahimov', 'Abdullayev', 'Nazarov', 'Umarov', 'Saidov', 'Xasanov', 'Qodirov', 'Mirzayev', 'Ismoilov', 'Sobirov', 'Normatov']
const REGIONS = {
	'Toshkent shahri': ['Chilonzor', 'Yunusobod', 'Mirzo Ulug‘bek', 'Sergeli', 'Yakkasaroy'], 'Samarqand viloyati': ['Samarqand shahri', 'Kattaqo‘rg‘on', 'Urgut', 'Bulung‘ur'],
	'Buxoro viloyati': ['Buxoro shahri', 'G‘ijduvon', 'Kogon'], 'Farg‘ona viloyati': ['Farg‘ona shahri', 'Marg‘ilon', 'Qo‘qon'], 'Andijon viloyati': ['Andijon shahri', 'Asaka', 'Shahrixon'],
	'Namangan viloyati': ['Namangan shahri', 'Chust', 'Pop'], 'Qashqadaryo viloyati': ['Qarshi', 'Shahrisabz', 'Kitob'], 'Xorazm viloyati': ['Urganch', 'Xiva', 'Xazorasp'],
	'Surxondaryo viloyati': ['Termiz', 'Denov'], 'Navoiy viloyati': ['Navoiy shahri', 'Zarafshon'], 'Jizzax viloyati': ['Jizzax shahri', 'Zomin'], 'Sirdaryo viloyati': ['Guliston', 'Sirdaryo']
}
const person = (f) => { const s = pick(SURN); return `${f ? s + 'a' : s} ${pick(f ? FEMALE : MALE)}` }
const freeGB = () => { try { const s = fs.statfsSync('C:\\'); return (s.bavail * s.bsize) / 1e9 } catch { return 999 } }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ---- sana yordamchilari (Toshkent kunlari) ----
const pad = (n) => String(n).padStart(2, '0')
const dstrOf = (ms) => { const d = new Date(ms + TZ_MS); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` }
const midnightOf = (ds) => Date.UTC(+ds.slice(0, 4), +ds.slice(5, 7) - 1, +ds.slice(8, 10)) - TZ_MS // shu kunning 00:00 (Toshkent) UTC ms
const shiftDay = (ds, n) => dstrOf(midnightOf(ds) + n * 86400000 + 12 * 3600000)
const weekday = (ds) => new Date(`${ds}T00:00:00Z`).getUTCDay()
// O'quv kuni: dushanba–shanba, sentyabr–may; bayram va ta'tillar chiqarib tashlanadi
function isSchoolDay(ds) {
	const wd = weekday(ds), m = +ds.slice(5, 7), d = +ds.slice(8, 10)
	if (wd === 0) return false
	if (m >= 6 && m <= 8) return false
	if (m === 9 && d === 1) return false // Mustaqillik kuni
	if ((m === 12 && d >= 29) || (m === 1 && d <= 12)) return false // qishki ta'til
	if ((m === 10 && d >= 28) || (m === 11 && d <= 3)) return false // kuzgi ta'til
	if (m === 3 && d >= 21 && d <= 29) return false // bahorgi ta'til (Navro'z)
	if ((m === 3 && d === 8) || (m === 5 && (d === 1 || d === 9)) || (m === 12 && d === 8) || (m === 10 && d === 1)) return false
	return true
}

async function indexSpecs(model) {
	return model.schema.indexes().map(([key, opts]) => ({ key, ...opts }))
}
async function dropSecondary(model) {
	const idx = await model.collection.indexes().catch(() => [])
	for (const i of idx) if (i.name !== '_id_') await model.collection.dropIndex(i.name).catch(() => { })
}
async function buildIndexes(model) {
	const specs = await indexSpecs(model)
	const t = Date.now()
	await model.collection.createIndexes(specs)
	log(`  indekslar qurildi: ${model.collection.name} (${specs.length} ta) ${((Date.now() - t) / 60000).toFixed(1)} daqiqa`)
}

async function clean() {
	const ids = (await M.S.find({ code: /^(scale|load|seed)-/ }).select('_id code').lean()).map(s => s._id)
	log(`tozalanmoqda: ${ids.length} maktab`)
	for (const [name, model, field] of [['davomat', M.SA, 'schoolId'], ['kirish-chiqish', M.SL, 'schoolId'], ['xodim davomati', M.AA, 'schoolId'], ['xodim kirish-chiqish', M.AL, 'schoolId'], ['hodisalar', M.CE, 'schoolId'], ['yuz hodisalari', M.HE, 'schoolId'], ['izohlar', M.EC, 'schoolId'], ['kameralar', M.HC, 'schoolId'], ['o\'quvchilar', M.ST, 'schoolId'], ['xodimlar', M.U, 'schoolId'], ['sinflar', M.SI, 'schoolId'], ['sozlamalar', M.SE, 'schoolId']]) {
		for (let i = 0; i < ids.length; i += 8) { await model.deleteMany({ [field]: { $in: ids.slice(i, i + 8) } }) }
		log('  o\'chirildi:', name)
	}
	await M.HA.deleteMany({ name: { $in: ['SCALE akkaunt', 'LOAD akkaunt', 'SEED akkaunt'] } })
	await M.S.deleteMany({ _id: { $in: ids } })
	for (const mdl of [M.HC]) { try { await mdl.syncIndexes() } catch { /* nusxa kameralar o'chirildi */ } }
	log('tozalandi')
}

// So'rovlar navbati: bir vaqtda kam sonli yozuv
function queue(n) {
	const active = new Set()
	return {
		async add(fn) { while (active.size >= n) await Promise.race(active); const p = fn().finally(() => active.delete(p)); active.add(p) },
		async drain() { await Promise.all(active) }
	}
}

async function seedAll() {
	log('config', JSON.stringify(CFG), `bo'sh disk: ${freeGB().toFixed(1)} GB`)
	await clean()
	await require('../services/grade.service').ensureDefaults()
	for (const m of [M.SA, M.SL, M.AA, M.AL, M.CE, M.HE]) { await dropSecondary(m) }
	try { await mongoose.connection.collection('hikcameras').dropIndex('accountId_1_cameraId_1') } catch { /* eski indeks yo'q */ }
	await M.HC.syncIndexes()
	const acc = await M.HA.create({ name: 'SCALE akkaunt', appKey: 'scale', appKeyHash: 'scale' + Date.now(), secretKey: 'scale' })

	// ===== 1) tuzilma: maktablar, sinflar, o'quvchilar, xodimlar, kameralar =====
	const regionKeys = Object.keys(REGIONS), schools = []
	const letters = 'ABCDEFGH'.split('')
	for (let si = 0; si < CFG.schools; si++) {
		const t0 = Date.now()
		const region = regionKeys[si % regionKeys.length], district = pick(REGIONS[region])
		const school = await M.S.create({ name: `${si + 1}-maktab`, code: `scale-${String(si + 1).padStart(3, '0')}`, region, district, phone: `+998 7${si % 10} ${200 + si} 00 00` })
		const sid = school._id
		const workStart = pick(['08:00', '08:30', '09:00', '09:00'])
		await M.SE.create({ schoolId: sid, workStartTime: workStart })
		const staff = await M.U.insertMany(Array.from({ length: CFG.staff }, (_, i) => ({ schoolId: sid, fullName: person(rnd() < 0.7), position: i < 88 ? 'Sinf rahbari o‘qituvchi' : 'O‘qituvchi', role: 'viewer', hodimID: `S${si}X${i}`, username: `scale-${si}-${i}`, password: 'xxxxxx', isActive: true, photo: PHOTO, photo_camera: false })), { ordered: false })
		const sinfDocs = []
		for (let g = 1; g <= 11; g++) for (const l of letters) sinfDocs.push({ schoolId: sid, grade: g, letter: l, name: `${g}-${l}`, description: '', head: staff[sinfDocs.length % staff.length]._id })
		const sinfs = await M.SI.insertMany(sinfDocs)
		const perClass = Math.floor(CFG.students / sinfs.length), extra = CFG.students - perClass * sinfs.length
		const quality = clamp(0.62 + rnd() * 0.35, 0, 0.97), staffQ = clamp(0.82 + rnd() * 0.16, 0, 0.99), punctual = clamp(0.55 + rnd() * 0.4, 0, 0.97), drift = pick([0, 0, 0.00003, -0.00003, 0.00006, -0.00006])
		const studentDocs = [], meta = []
		sinfs.forEach((sinf, ci) => {
			const classQ = clamp(quality + (rnd() - 0.5) * 0.16, 0.4, 0.99)
			for (let k = 0; k < perClass + (ci < extra ? 1 : 0); k++) {
				studentDocs.push({ schoolId: sid, sinf: sinf._id, fullName: person(rnd() < 0.5), studentIdNumber: `S${si}-${ci}-${k}`, gender: rnd() < 0.5 ? 'ayol' : 'erkak', parentName: `${pick(SURN)} ${pick(MALE)}`, parentPhone: `+998 9${k % 10} ${100 + ci} ${10 + (k % 80)} ${10 + (si % 80)}`, photo: PHOTO, photo_camera: false })
				meta.push({ q: clamp(classQ + (rnd() - 0.5) * 0.3, 0.05, 1), late: rnd() < 0.15 ? 0.7 : rnd() * 0.2, cls: ci })
			}
		})
		const students = []
		for (let i = 0; i < studentDocs.length; i += 5000) students.push(...await M.ST.insertMany(studentDocs.slice(i, i + 5000), { ordered: false }))

		// kameralar: 40 oddiy (birinchi 40 sinfga biriktirilgan) + 6 FaceControl (3 kirish, 3 chiqish)
		const camDocs = []
		for (let i = 0; i < CFG.regular; i++) camDocs.push({ accountId: acc._id, schoolId: sid, cameraId: `SCALE-${si}-${i}`, serial: `SCALESER${si}-${i}`, name: `Camera ${i + 1}`, areaName: `${1 + (i % 3)}-qavat`, online: rnd() > 0.08, lastSeenAt: new Date(), syncedAt: new Date(), role: 'monitor', sinfId: sinfs[i % sinfs.length]._id })
		for (let i = 0; i < CFG.face; i++) camDocs.push({ accountId: acc._id, schoolId: sid, cameraId: `SCALE-${si}-fc${i}`, serial: `SCALEFC${si}-${i}`, name: `FaceControl ${i + 1}`, areaName: 'Kirish', online: rnd() > 0.03, lastSeenAt: new Date(), syncedAt: new Date(), role: i % 2 === 0 ? 'in' : 'out', sinfId: null })
		const cams = await M.HC.insertMany(camDocs, { ordered: false })

		// xodimlar ta'tillari (izohlar): 2 yil davomida taxminan 70 ta
		const [wh, wm] = workStart.split(':').map(Number)
		schools.push({ si, sid, school, staff, students, studentDocs, meta, sinfs, cams, quality, staffQ, punctual, drift, wh, wm, leaves: [] })
		log(`#${si + 1}/${CFG.schools} ${school.name}: ${students.length} o'quvchi, ${staff.length} xodim, ${sinfs.length} sinf, ${cams.length} kamera · ${((Date.now() - t0) / 1000).toFixed(1)}s`)
	}

	// ===== 2) kunlik davomat: eng yangi oydan boshlab orqaga =====
	const today = dstrOf(Date.now())
	const first = shiftDay(today, -Math.round(365 * CFG.years))
	const days = []
	for (let d = today; d >= first; d = shiftDay(d, -1)) if (isSchoolDay(d)) days.push(d)
	log(`o'quv kunlari: ${days.length} (${first} → ${today})`)

	// ta'tillar: har maktab uchun tasodifiy davrlar (xodim shu kunlarda kelmaydi)
	const types = ['tatil', 'safar', 'kasallik', 'boshqa']
	const TXT = { tatil: "Yillik mehnat ta'tili", safar: 'Xizmat safari', kasallik: 'Kasallik (shifokor ma‘lumotnomasi)', boshqa: 'Oilaviy sabab' }
	const leaveDocs = []
	for (const S of schools) {
		for (let k = 0; k < Math.round(35 * CFG.years); k++) {
			const emp = S.staff[Math.floor(rnd() * S.staff.length)], start = days[Math.floor(rnd() * days.length)], len = 1 + Math.floor(rnd() * (rnd() < 0.2 ? 24 : 6)), end = shiftDay(start, -len)
			const [a, b] = start < end ? [start, end] : [end, start]
			const type = pick(types)
			S.leaves.push({ emp: String(emp._id), a, b })
			leaveDocs.push({ schoolId: S.sid, employee: emp._id, type, comment: TXT[type], startDate: a, endDate: b, closed: b < today, createdAt: new Date(), updatedAt: new Date() })
		}
	}
	for (let i = 0; i < leaveDocs.length; i += 5000) await M.EC.collection.insertMany(leaveDocs.slice(i, i + 5000), { ordered: false })
	log(`ta'til izohlari: ${leaveDocs.length}`)

	const q = queue(4)
	const totals = { sa: 0, sl: 0, aa: 0, al: 0, he: 0, ce: 0 }
	let guid = 0, stopped = false
	let monthKey = '', monthDocs = 0, monthT = Date.now()
	for (const ds of days) {
		const mk = ds.slice(0, 7)
		if (mk !== monthKey) {
			if (monthKey) { await q.drain(); log(`${monthKey}: ${monthDocs.toLocaleString()} hujjat, ${((Date.now() - monthT) / 1000).toFixed(0)}s · jami o'quvchi davomati ${totals.sa.toLocaleString()} · bo'sh disk ${freeGB().toFixed(1)} GB`) }
			monthKey = mk; monthDocs = 0; monthT = Date.now()
			if (freeGB() < MIN_FREE_GB) { log(`DISK CHEGARASI: bo'sh joy ${freeGB().toFixed(1)} GB < ${MIN_FREE_GB} GB — to'xtatildi (${monthKey} dan eski kunlar yozilmadi)`); stopped = true; break }
		}
		const mid = midnightOf(ds), wd = weekday(ds), month = +ds.slice(5, 7)
		const ageDays = Math.round((midnightOf(today) - mid) / 86400000)
		const dayF = (wd === 1 ? -0.03 : wd === 6 ? -0.07 : 0) + (month === 12 || month === 1 || month === 2 ? -0.05 : month === 5 ? -0.03 : 0)
		const recent = ageDays <= 7, recentCam = ageDays <= 14
		const at = (h, mi) => new Date(mid + (h * 60 + mi) * 60000)
		for (const S of schools) {
			const sa = [], sl = [], aa = [], al = []
			const outAt = at(14, 0)
			const fe = []
			// sovuq mavsum / epidemiya: har maktabda bir necha hafta pasayish
			const epidemic = ((S.si * 7 + Math.floor(ageDays / 7)) % 23 === 0) ? -0.18 : 0
			const driftF = S.drift * ageDays * -1
			const lateBase = 1.2 - S.punctual
			for (let i = 0; i < S.students.length; i++) {
				const m = S.meta[i]
				if (rnd() > clamp(m.q + dayF + epidemic + driftF, 0.05, 0.995)) continue
				const late = rnd() < m.late * lateBase
				const inT = late ? at(S.wh, S.wm + 5 + Math.floor(rnd() * 40)) : at(S.wh, S.wm - 2 - Math.floor(rnd() * 38))
				const sid = S.students[i]._id
				sa.push({ schoolId: S.sid, student: sid, date: inT, dateString: ds, status: 'tashqarida', totalTime: '5:10', totalEntries: 2, createdAt: inT, updatedAt: outAt })
				sl.push({ schoolId: S.sid, student: sid, date: inT, dateString: ds, checkin: true, checkout: true, checkInTime: inT, checkOutTime: outAt, comment: null, createdAt: inT, updatedAt: outAt })
				if (recent) {
					const dc = S.cams[CFG.regular + (i % 2 === 0 ? 0 : 1) * 2 + (i % 3 === 0 ? 0 : 0)]
					fe.push({ schoolId: S.sid, accountId: acc._id, camera: S.cams[CFG.regular + (i % 3) * 2]._id, guid: `f${guid++}`, direction: 'in', humanId: S.studentDocs[i].studentIdNumber, humanName: S.studentDocs[i].fullName, similarity: 80 + Math.floor(rnd() * 20), threshold: 80, personType: 'student', student: sid, personName: S.studentDocs[i].fullName, sinf: S.studentDocs[i].sinf, recorded: true, time: inT, dateString: ds, createdAt: inT, updatedAt: inT })
					fe.push({ schoolId: S.sid, accountId: acc._id, camera: (dc || S.cams[CFG.regular + 1])._id, guid: `f${guid++}`, direction: 'out', humanId: S.studentDocs[i].studentIdNumber, humanName: S.studentDocs[i].fullName, similarity: 80 + Math.floor(rnd() * 20), threshold: 80, personType: 'student', student: sid, personName: S.studentDocs[i].fullName, sinf: S.studentDocs[i].sinf, recorded: true, time: outAt, dateString: ds, createdAt: outAt, updatedAt: outAt })
				}
			}
			// xodimlar
			for (const u of S.staff) {
				const id = String(u._id)
				if (S.leaves.some(l => l.emp === id && l.a <= ds && l.b >= ds)) continue
				if (rnd() > S.staffQ - (month === 12 || month === 1 ? 0.04 : 0)) continue
				const inT = at(S.wh, S.wm - 10 - Math.floor(rnd() * 40)), out = at(15, 0)
				aa.push({ schoolId: S.sid, user: u._id, date: inT, dateString: ds, status: 'tashqarida', totalTime: '6:00', totalEntries: 2, createdAt: inT, updatedAt: out })
				al.push({ schoolId: S.sid, user: u._id, date: inT, dateString: ds, checkin: true, checkout: true, checkInTime: inT, checkOutTime: out, comment: null, createdAt: inT, updatedAt: out })
			}
			// sinf kameralari hodisalari (so'nggi 14 kun)
			const ce = []
			if (recentCam) for (let ci = 0; ci < CFG.regular; ci++) for (let h = 8; h < 14; h++) for (let k = 0; k < 2 + Math.floor(rnd() * 3); k++) {
				const t = at(h, k * 11)
				ce.push({ schoolId: S.sid, accountId: acc._id, camera: S.cams[ci]._id, sinfId: S.sinfs[ci % S.sinfs.length]._id, guid: `c${guid++}`, eventType: 10002, kind: 'motion', time: t, hour: h, dateString: ds, createdAt: t, updatedAt: t })
			}
			totals.sa += sa.length; totals.sl += sl.length; totals.aa += aa.length; totals.al += al.length; totals.he += fe.length; totals.ce += ce.length
			monthDocs += sa.length + sl.length + aa.length + al.length + fe.length + ce.length
			await q.add(() => M.SA.collection.insertMany(sa, { ordered: false }))
			await q.add(() => M.SL.collection.insertMany(sl, { ordered: false }))
			if (aa.length) { await q.add(() => M.AA.collection.insertMany(aa, { ordered: false })); await q.add(() => M.AL.collection.insertMany(al, { ordered: false })) }
			if (fe.length) await q.add(() => M.HE.collection.insertMany(fe, { ordered: false }))
			if (ce.length) await q.add(() => M.CE.collection.insertMany(ce, { ordered: false }))
		}
	}
	await q.drain()
	log(`davomat yozildi${stopped ? ' (diskka ko\'ra qisman)' : ''}:`, JSON.stringify(totals))

	// ===== 3) indekslar (har jadval uchun bitta o'tishda) =====
	log('indekslar qurilmoqda...')
	for (const m of [M.SA, M.SL, M.AA, M.AL, M.HE, M.CE]) await buildIndexes(m)
	log('TAYYOR', JSON.stringify({ schools: schools.length, students: schools.length * CFG.students, ...totals, freeGB: freeGB().toFixed(1) }))
}

mongoose.connect(process.env.MONGO_URI, { maxPoolSize: 12 }).then(async () => {
	const mode = process.argv[2]
	if (mode === 'seed') await seedAll()
	else if (mode === 'indexes') { for (const m of [M.SA, M.SL, M.AA, M.AL, M.HE, M.CE]) await buildIndexes(m) }
	else if (mode === 'clean') await clean()
	else console.log('Ishlatish: node scripts/seed-scale.js seed | indexes | clean')
	await mongoose.disconnect()
}).catch(e => { console.error(e); process.exit(1) })
