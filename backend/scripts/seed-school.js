// Haqiqiy maktabni (standart: maktab-12) namunaviy ma'lumotlar bilan to'ldiradi — barcha sahifalarni real ko'rib ishlatish uchun:
// sinflar (1–11), sinf rahbarlari, o'qituvchilar/rahbarlar, o'quvchilar, 30 kunlik davomat (bugungi jonli holat bilan),
// sababli kelmaganlar, xodim izohlari (ta'til/safar/kasallik), sinfxona kameralari uchun odam soni o'lchovlari.
//   node scripts/seed-school.js seed [maktab-kodi]   — qo'shadi (avval shu skript yaratgan namunani o'chiradi)
//   node scripts/seed-school.js clean [maktab-kodi]  — faqat shu skript yaratganini o'chiradi (haqiqiy yozuvlarga tegmaydi)
// Belgilar: xodim login "mock-…", hodimID "MOCK-…"; o'quvchi ID "MOCK-…"; sinf tavsifi "MOCK …"; o'lchov ms = -1.
// Namuna xodimlar paroli: mock1234
const path = require('path')
const backend = path.join(__dirname, '..')
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true })
const mongoose = require(path.join(backend, 'node_modules/mongoose'))
const bcrypt = require(path.join(backend, 'node_modules/bcrypt'))
const M = {
	S: require('../models/school.model'), ST: require('../models/student.model'), SI: require('../models/sinf.model'), U: require('../models/user.model'),
	SA: require('../models/student.attandance.model'), SL: require('../models/student.attandance.log.model'), AA: require('../models/attandance.model'), AL: require('../models/attandance.log.model'),
	HC: require('../models/hik.camera.model'), VM: require('../models/hik.visionmetric.model'), SE: require('../models/settings.model'),
	EX: require('../models/student.excuse.model'), EC: require('../models/employee.comment.model')
}

const PHOTO = 'image-1791610311339-599136478.jpg'
const TZ = 'Asia/Tashkent'
const DAYS = 30, PER_CLASS = 18, PASSWORD = 'mock1234'
const dstr = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)
const at = (back, h, mi) => { const d = new Date(); d.setDate(d.getDate() - back); d.setUTCHours(h - 5, mi, 0, 0); return d }
let seed = 20261010
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
const pick = (a) => a[Math.floor(rnd() * a.length)]
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const pad = (n) => String(n).padStart(2, '0')
const hm = (mins) => `${Math.floor(mins / 60)}:${pad(mins % 60)}`

const MALE = ['Ali', 'Vali', 'Bekzod', 'Sardor', 'Jasur', 'Otabek', 'Aziz', 'Dilshod', 'Jamshid', 'Sherzod', 'Akmal', 'Bobur', 'Timur', 'Ulug‘bek', 'Islom', 'Shohruh', 'Doniyor', 'Sanjar', 'Behruz', 'Hasan']
const FEMALE = ['Zuhra', 'Madina', 'Nodira', 'Malika', 'Dilnoza', 'Sevara', 'Nilufar', 'Shahnoza', 'Gulnora', 'Mohira', 'Sitora', 'Kamola', 'Feruza', 'Laylo', 'Munisa', 'Aziza', 'Ruxsora', 'Hilola']
const SURNAMES = ['Karimov', 'Aliyev', 'Tursunov', 'Yusupov', 'Ergashev', 'Rahimov', 'Abdullayev', 'Nazarov', 'Umarov', 'Saidov', 'Xasanov', 'Qodirov', 'Mirzayev', 'Ismoilov', 'Sobirov', 'Normatov', 'Ruziyev', 'Jo‘rayev', 'Xolmatov', 'Berdiyev']
const SUBJECTS = ['Matematika', 'Ona tili', 'Fizika', 'Tarix', 'Kimyo', 'Inglizcha', 'Biologiya', 'Geografiya', 'Informatika', 'Adabiyot', 'Jismoniy tarbiya', 'Tasviriy san’at', 'Rus tili', 'Texnologiya', 'Musiqa']
const person = (female) => { const s = pick(SURNAMES); return { name: `${female ? s + 'a' : s} ${pick(female ? FEMALE : MALE)}`, female } }

async function clean(school) {
	const f = { schoolId: school._id }
	const staff = await M.U.find({ ...f, username: /^mock-/ }).select('_id').lean()
	const staffIds = staff.map(u => u._id)
	const students = await M.ST.find({ ...f, studentIdNumber: /^MOCK-/ }).select('_id').lean()
	const stuIds = students.map(s => s._id)
	const mockSinfs = await M.SI.find({ ...f, description: /^MOCK / }).select('_id').lean()
	const r = await Promise.all([
		M.SA.deleteMany({ student: { $in: stuIds } }), M.SL.deleteMany({ student: { $in: stuIds } }),
		M.AA.deleteMany({ user: { $in: staffIds } }), M.AL.deleteMany({ user: { $in: staffIds } }),
		M.EX.deleteMany({ student: { $in: stuIds } }), M.EC.deleteMany({ employee: { $in: staffIds } }),
		M.VM.deleteMany({ ...f, ms: -1 }),
	])
	await M.ST.deleteMany({ _id: { $in: stuIds } })
	await M.SI.updateMany({ ...f, head: { $in: staffIds } }, { $set: { head: null } })
	await M.SI.deleteMany({ _id: { $in: mockSinfs.map(s => s._id) } })
	await M.U.deleteMany({ _id: { $in: staffIds } })
	console.log(`tozalandi: ${staffIds.length} xodim, ${stuIds.length} o'quvchi, ${mockSinfs.length} sinf, ${r[0].deletedCount} o'quvchi davomati`)
}

async function seedAll(school) {
	const sid = school._id
	const settings = await M.SE.findOne({ schoolId: sid }).lean()
	const [wh, wm] = (settings?.workStartTime || '09:00').split(':').map(Number)
	const hash = await bcrypt.hash(PASSWORD, 10)

	// --- Sinflar: mavjudlari saqlanadi, yetishmaydigan 1–11 A/B qo'shiladi ---
	let sinfs = await M.SI.find({ schoolId: sid }).lean()
	const have = new Set(sinfs.map(s => s.name))
	const add = []
	for (let g = 1; g <= 11; g++) for (const l of ['A', 'B']) if (!have.has(`${g}-${l}`)) add.push({ schoolId: sid, grade: g, letter: l, name: `${g}-${l}`, description: `MOCK ${g}-sinf ${l} guruhi` })
	if (add.length) await M.SI.insertMany(add)
	sinfs = (await M.SI.find({ schoolId: sid }).lean()).sort((a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true }))
	await Promise.all(sinfs.filter(s => !s.grade).map(s => { const m = /^(\d+)-(.+)$/.exec(s.name); return m ? M.SI.updateOne({ _id: s._id }, { $set: { grade: Number(m[1]), letter: m[2] } }) : null }).filter(Boolean))

	// --- Xodimlar: har sinfga rahbar-o'qituvchi + rahbariyat va yordamchi xodimlar ---
	const staffDocs = []
	const mk = (i, position, role, sinf) => {
		const p = person(rnd() < 0.65)
		staffDocs.push({ schoolId: sid, fullName: p.name, position, role, sinf: sinf || undefined, photo: PHOTO, photo_camera: false, hodimID: `MOCK-T${pad(i)}`, username: `mock-t${pad(i)}`, password: hash, isActive: true, phone_personal: `+998 9${i % 10} ${100 + i * 7} ${10 + i} ${20 + (i * 3) % 70}`, birthday: new Date(1975 + (i % 25), i % 12, 1 + (i % 27)), lavel: i })
	}
	sinfs.forEach((s, i) => mk(i + 1, `${SUBJECTS[i % SUBJECTS.length]} o‘qituvchisi (${s.name} sinf rahbari)`, 'viewer', s._id))
	let n = sinfs.length
	for (const pos of ['Direktor', 'O‘quv ishlari bo‘yicha direktor o‘rinbosari', 'Tarbiyaviy ishlar bo‘yicha o‘rinbosar']) mk(++n, pos, 'leader')
	for (const pos of ['Psixolog', 'Kutubxonachi', 'Xavfsizlik xodimi', 'Hamshira', 'Ma‘muriy xodim']) mk(++n, pos, 'viewer')
	for (let i = 0; i < 6; i++) mk(++n, `${pick(SUBJECTS)} o‘qituvchisi`, 'viewer')
	const staff = await M.U.insertMany(staffDocs)
	await Promise.all(sinfs.map((s, i) => M.SI.updateOne({ _id: s._id }, { $set: { head: staff[i]._id } })))

	// --- O'quvchilar ---
	const sDocs = [], meta = []
	let k = 0
	sinfs.forEach((sinf, ci) => {
		const grade = sinf.grade || Number(/^(\d+)/.exec(sinf.name)?.[1]) || 5
		const classQ = clamp(0.8 + (rnd() - 0.4) * 0.2, 0.55, 0.97)
		const count = PER_CLASS - 3 + Math.floor(rnd() * 7)
		for (let j = 0; j < count; j++) {
			const p = person(rnd() < 0.5)
			const fam = p.name.split(' ')[0].replace(/a$/, '')
			sDocs.push({ schoolId: sid, sinf: sinf._id, fullName: p.name, studentIdNumber: `MOCK-${String(++k).padStart(4, '0')}`, gender: p.female ? 'ayol' : 'erkak', photo: PHOTO, photo_camera: false, birthday: new Date(2026 - 6 - grade, Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 27)), parentName: `${fam} ${pick(MALE)}`, parentPhone: `+998 9${j % 10} ${200 + ci * 7 + j} ${10 + (j * 3) % 80} ${10 + (ci * 5 + j) % 80}` })
			meta.push({ q: clamp(classQ + (rnd() - 0.5) * 0.3, 0.1, 0.995), late: rnd() < 0.15 ? 0.6 : rnd() * 0.15 })
		}
	})
	const stu = await M.ST.insertMany(sDocs)

	// --- Davomat: oxirgi DAYS kun (yakshanbasiz); bugun hozirgi vaqtgacha ---
	const nowMin = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date())) * 60 + Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, minute: '2-digit' }).format(new Date()))
	const sa = [], sl = [], aa = [], al = []
	const batch = async (model, docs) => { for (let i = 0; i < docs.length; i += 5000) await model.insertMany(docs.slice(i, i + 5000), { ordered: false }) }
	for (let back = 0; back < DAYS; back++) {
		const day = at(back, 9, 0)
		const wd = day.getUTCDay()
		if (wd === 0) continue
		const ds = dstr(day)
		const dayF = wd === 1 ? -0.03 : wd === 6 ? -0.06 : 0
		const rec = (inMin, outMin, isToday) => {
			// bugun: kirish hozirgi vaqtdan oldin bo'lishi kerak; chiqish — dars tugagach
			if (isToday && inMin > nowMin) return null
			const out = isToday && outMin > nowMin ? null : outMin
			return { inMin, out, status: out === null ? 'ishda' : 'tashqarida' }
		}
		const mkLogs = (docKey, id, inMin, out, lunch) => {
			const logs = [{ [docKey]: id, schoolId: sid, date: at(back, 0, inMin), dateString: ds, checkin: true, checkInTime: at(back, 0, inMin), checkOutTime: out === null ? undefined : at(back, 0, lunch ? lunch[0] : out) }]
			if (lunch && out !== null) logs.push({ [docKey]: id, schoolId: sid, date: at(back, 0, lunch[1]), dateString: ds, checkin: true, checkInTime: at(back, 0, lunch[1]), checkOutTime: at(back, 0, out) })
			return logs
		}
		for (const [i, s] of stu.entries()) {
			const m = meta[i]
			if (rnd() > clamp(m.q + dayF, 0.05, 0.995)) continue
			const late = rnd() < m.late
			const inMin = late ? wh * 60 + wm + 5 + Math.floor(rnd() * 40) : wh * 60 + wm - 50 + Math.floor(rnd() * 45)
			const r = rec(inMin, 14 * 60 + Math.floor(rnd() * 90), back === 0)
			if (!r) continue
			const lunch = rnd() < 0.2 && r.out !== null ? [12 * 60 + 30, 13 * 60 + 10] : null
			const worked = r.out === null ? Math.max(nowMin - inMin, 0) : (r.out - inMin) - (lunch ? lunch[1] - lunch[0] : 0)
			sa.push({ schoolId: sid, student: s._id, date: at(back, 0, inMin), dateString: ds, status: r.status, totalTime: hm(worked), totalEntries: lunch ? 2 : 1 })
			sl.push(...mkLogs('student', s._id, inMin, r.out, lunch))
		}
		for (const u of staff) {
			if (rnd() > (u.role === 'leader' ? 0.97 : 0.9) + dayF) continue
			const late = rnd() < 0.12
			const inMin = late ? wh * 60 + wm + 3 + Math.floor(rnd() * 35) : wh * 60 + wm - 40 + Math.floor(rnd() * 38)
			const r = rec(inMin, 15 * 60 + 30 + Math.floor(rnd() * 90), back === 0)
			if (!r) continue
			const lunch = rnd() < 0.5 && r.out !== null ? [12 * 60 + 40, 13 * 60 + 15] : null
			const worked = r.out === null ? Math.max(nowMin - inMin, 0) : (r.out - inMin) - (lunch ? lunch[1] - lunch[0] : 0)
			aa.push({ schoolId: sid, user: u._id, date: at(back, 0, inMin), dateString: ds, status: r.status, totalTime: hm(worked), totalEntries: lunch ? 2 : 1 })
			al.push(...mkLogs('user', u._id, inMin, r.out, lunch))
		}
	}
	await Promise.all([batch(M.SA, sa), batch(M.SL, sl), batch(M.AA, aa), batch(M.AL, al)])

	// --- Sababli kelmaganlar (o'quvchilar) va xodim izohlari ---
	const today = dstr(new Date()), off = (d) => dstr(at(d, 12, 0))
	const excuses = []
	for (let i = 0; i < 28; i++) {
		const s = pick(stu), start = Math.floor(rnd() * 14), len = Math.floor(rnd() * 4)
		excuses.push({ schoolId: sid, student: s._id, sinf: s.sinf, startDate: off(start), endDate: i % 7 === 0 ? null : off(Math.max(start - len, -3)), type: pick(['kasallik', 'kasallik', 'oilaviy', 'musobaqa', 'boshqa']), comment: pick(['Shifokor ma’lumotnomasi bor', 'Oilaviy sabab', 'Tuman olimpiadasida qatnashmoqda', 'Ota-onasi xabar berdi', 'Isitma, shamollash']) })
	}
	await M.EX.insertMany(excuses)
	const comments = []
	const leaveTypes = [['kasallik', 'Shamollash, shifokor ko‘rigi'], ['safar', 'Tuman ta’lim bo‘limiga xizmat safari'], ['tatil', 'Yillik mehnat ta’tili'], ['boshqa', 'Malaka oshirish kursi']]
	for (let i = 0; i < 9; i++) {
		const u = staff[3 + Math.floor(rnd() * (staff.length - 3))], [type, comment] = pick(leaveTypes)
		const start = Math.floor(rnd() * 20), open = i % 3 === 0
		comments.push({ schoolId: sid, employee: u._id, startDate: off(start), endDate: open ? null : off(Math.max(start - 2 - Math.floor(rnd() * 4), -2)), closed: !open && start > 6, comment, type })
	}
	await M.EC.insertMany(comments)

	// --- Sinfxona kameralari: odam soni o'lchovlari (oxirgi 7 kun, dars soatlarida) ---
	const cams = await M.HC.find({ schoolId: sid, sinfId: { $ne: null } }).lean()
	const metrics = []
	for (const c of cams) {
		const size = stu.filter(s => String(s.sinf) === String(c.sinfId)).length || 16
		for (let back = 0; back < 7; back++) {
			if (at(back, 9, 0).getUTCDay() === 0) continue
			for (let h = 9; h <= 14; h++) for (let mi = 0; mi < 60; mi += 10) {
				if (back === 0 && h * 60 + mi > nowMin) continue
				const t = at(back, h, mi)
				metrics.push({ schoolId: sid, camera: c._id, sinfId: c.sinfId, count: Math.max(0, Math.round(size * (h === 12 ? 0.35 : 0.85) + (rnd() - 0.5) * 6)), activity: Math.round(rnd() * 70) / 100, time: t, hour: h, dateString: dstr(t), ms: -1 })
			}
		}
	}
	await batch(M.VM, metrics)
	console.log(`yaratildi (${school.name}): ${sinfs.length} sinf (${add.length} tasi yangi), ${staff.length} xodim, ${stu.length} o'quvchi, ${sa.length} o'quvchi davomati, ${aa.length} xodim davomati, ${excuses.length} sababli, ${comments.length} izoh, ${metrics.length} kamera o'lchovi`)
}

mongoose.connect(process.env.MONGO_URI).then(async () => {
	const [mode, code = 'maktab-12'] = process.argv.slice(2)
	const school = await M.S.findOne({ code }).lean()
	if (!school) { console.log(`Maktab topilmadi: ${code}`); return }
	if (mode === 'seed') { await clean(school); await seedAll(school) }
	else if (mode === 'clean') await clean(school)
	else console.log('Ishlatish: node scripts/seed-school.js seed|clean [maktab-kodi]')
}).catch(e => { console.error(e); process.exitCode = 1 }).finally(() => mongoose.disconnect())
