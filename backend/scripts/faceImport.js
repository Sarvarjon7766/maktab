// O'quvchilar yuz suratlarini papkadan ommaviy yuklash (yuz tanish bazasi uchun).
//   node scripts/faceImport.js <schoolId> <papka> [--dry]
// Moslik: fayl nomi `<studentIdNumber>.jpg`, `<studentIdNumber>_2.jpg`, `<studentIdNumber>-3.png` yoki
// `<studentIdNumber>/istalgan.jpg` (o'quvchi papkasi). studentIdNumber o'quvchi kartasidagi ID raqami.
// Har o'quvchiga 5 tagacha rasm olinadi; sifatsizi sababi bilan o'tkaziladi (services/face.service.js addPhoto).
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

const [schoolId, dir] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const dry = process.argv.includes('--dry')
if (!schoolId || !dir || !fs.existsSync(dir)) { console.error('Ishlatish: node scripts/faceImport.js <schoolId> <papka> [--dry]'); process.exit(1) }

const IMG = /\.(jpe?g|png|webp)$/i
function collect(root) {
	const out = []
	for (const e of fs.readdirSync(root, { withFileTypes: true })) {
		const p = path.join(root, e.name)
		if (e.isDirectory()) { for (const f of fs.readdirSync(p)) if (IMG.test(f)) out.push({ key: e.name, file: path.join(p, f) }) }
		else if (IMG.test(e.name)) out.push({ key: path.parse(e.name).name.replace(/[_\- ]\d{1,2}$/, ''), file: p })
	}
	return out
}

;(async () => {
	await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
	const Student = require('../models/student.model')
	const Faces = require('../services/face.service')
	const students = await Student.find({ schoolId, isActive: { $ne: false } }).select('studentIdNumber fullName schoolId sinf').lean()
	const byKey = new Map(students.map((s) => [String(s.studentIdNumber || '').trim(), s]))
	const files = collect(dir)
	const stat = { ok: 0, rejected: {}, noStudent: new Set(), students: new Set() }
	for (const f of files) {
		const s = byKey.get(f.key.trim())
		if (!s) { stat.noStudent.add(f.key); continue }
		if (dry) { stat.ok++; stat.students.add(String(s._id)); continue }
		const r = await Faces.addPhoto(s, fs.readFileSync(f.file))
		if (r.ok) { stat.ok++; stat.students.add(String(s._id)) } else { stat.rejected[r.reason] = (stat.rejected[r.reason] || 0) + 1; console.log(`  rad: ${path.basename(f.file)} (${s.fullName}) — ${r.reason}`) }
	}
	console.log(`${dry ? '[sinov] ' : ''}Fayllar: ${files.length}; qabul: ${stat.ok}; o'quvchilar: ${stat.students.size}/${students.length}`)
	console.log('Rad etilgan sabablar:', JSON.stringify(stat.rejected))
	if (stat.noStudent.size) console.log(`ID topilmadi (${stat.noStudent.size}):`, [...stat.noStudent].slice(0, 20).join(', '))
	process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
