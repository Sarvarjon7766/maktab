// Yuz tanish tayyorlik tekshiruvi (serverga ko'chirgandan keyin birinchi ishga tushiriladi):
//   node scripts/faceCheck.js
// Tekshiradi: modellar (fayl, yuklanishi, tezligi, GPU/CPU), baza (kolleksiyalar, indekslar, izlar), uploads (suratlar), bazadagi izlar shu serverdagi
// model bilan mos kelishi (suratdan qayta hisoblab solishtiriladi), sozlamalar, sinflar qamrovi, kameralar, resurslar.
// Natija: har qator OK / OGOHLANTIRISH / XATO; XATO bo'lsa chiqish kodi 1.
require('dotenv').config()
const fs = require('fs')
const os = require('os')
const path = require('path')
const mongoose = require('mongoose')

const rows = []
const add = (level, name, detail = '') => { rows.push({ level, name, detail }); console.log(`${{ OK: ' OK ', WARN: 'WARN', FAIL: 'FAIL' }[level]}  ${name}${detail ? ' — ' + detail : ''}`) }
const MB = (n) => `${(n / 1048576).toFixed(1)} MB`

;(async () => {
	console.log('=== Yuz tanish tayyorlik tekshiruvi ===\n')
	// ---- 1) resurslar
	add('OK', 'Server', `${os.cpus().length} yadro, ${MB(os.totalmem())} RAM (bo'sh ${MB(os.freemem())}), Node ${process.version}, AI_PROVIDER=${process.env.AI_PROVIDER || '(standart: cpu)'}`)
	if (os.freemem() < 1.5 * 1073741824) add('WARN', 'Bo\'sh xotira kam', 'AI modellari va yuz galereyasi uchun kamida ~1.5 GB bo\'sh joy tavsiya etiladi')

	// ---- 2) modellar
	const MODELS = path.join(__dirname, '..', 'ai', 'models')
	const need = [['face_detection_yunet_2023mar.onnx', true], ['face_recognition_sface_2021dec.onnx', true], ['yolox_s.onnx', true], ['rtmpose_m.onnx', true], ['face_recognition_arcface_r100.onnx', false]]
	for (const [f, req] of need) {
		const p = path.join(MODELS, f)
		if (fs.existsSync(p)) add('OK', `Model fayli: ${f}`, MB(fs.statSync(p).size))
		else add(req ? 'FAIL' : 'WARN', `Model fayli yo'q: ${f}`, req ? 'majburiy (gitga qo\'shilganini tekshiring)' : 'ixtiyoriy (ArcFace, faqat GPU serverda kerak bo\'lsa)')
	}
	let FE
	try {
		FE = require('../ai/faceEngine')
		const sharp = require('sharp')
		const img = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#808080' } }).jpeg().toBuffer()
		const t0 = Date.now()
		await FE.detectFaces(img)
		const cold = Date.now() - t0
		const t1 = Date.now(); for (let i = 0; i < 5; i++) await FE.detectFaces(img); const warm = (Date.now() - t1) / 5
		add('OK', 'YuNet (yuz topish) yuklandi', `birinchi chaqiruv ${cold} ms, keyingilari ~${Math.round(warm)} ms`)
		const t2 = Date.now(); for (let i = 0; i < 5; i++) await FE.embedAligned(new Float32Array(3 * 112 * 112), 'sface');
		add('OK', 'SFace (yuz izi) yuklandi', `~${Math.round((Date.now() - t2) / 5)} ms/yuz`)
	} catch (e) { add('FAIL', 'Yuz modellari yuklanmadi', e.message) }

	// ---- 3) baza
	try {
		await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
		add('OK', 'MongoDB ulandi', mongoose.connection.name)
	} catch (e) { add('FAIL', 'MongoDB ulanmadi', e.message); return finish() }
	const db = mongoose.connection.db
	const Face = require('../models/face.template.model')
	const Student = require('../models/student.model')
	const User = require('../models/user.model')
	const Sinf = require('../models/sinf.model')
	const Camera = require('../models/hik.camera.model')
	const AiSettings = require('../services/ai.settings.service')
	await require('../services/face.service').ensureIndexes().catch(() => {})
	const names = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name))
	for (const c of ['facetemplates', 'classroompresences', 'staffpresences']) add(names.has(c) ? 'OK' : 'WARN', `Kolleksiya: ${c}`, names.has(c) ? `${await db.collection(c).countDocuments()} hujjat` : 'hali yaratilmagan (birinchi yozuvda yaratiladi)')

	const cfg = await AiSettings.get(true)
	add(cfg.faceEnabled ? 'OK' : 'WARN', 'Yuz tanish sozlamasi', cfg.faceEnabled ? `yoqilgan, model: ${cfg.faceModel}, chegara ${cfg.faceThreshold}` : "O'CHIQ: Platforma → AI sozlamalari → «Yuz tanishni yoqish»")
	if (cfg.faceModel === 'arcface' && !fs.existsSync(path.join(MODELS, 'face_recognition_arcface_r100.onnx'))) add('FAIL', 'Model arcface tanlangan, lekin fayl yo\'q')
	add(cfg.faceAttendance ? 'WARN' : 'OK', 'Yuz orqali davomat', cfg.faceAttendance ? 'YOQILGAN: avval kichik sinfda sinab ko\'ring' : "o'chiq (xavfsiz standart)")

	// ---- 4) izlar va suratlar
	const total = await Face.countDocuments()
	const byKind = await Face.aggregate([{ $group: { _id: { kind: { $ifNull: ['$kind', 'student'] }, model: { $ifNull: ['$model', 'sface'] }, source: '$source' }, n: { $sum: 1 } } }])
	add(total ? 'OK' : 'WARN', 'Yuz izlari bazasi', total ? byKind.map((g) => `${g._id.kind}/${g._id.model}/${g._id.source}: ${g.n}`).join(', ') : "bo'sh: o'quvchi/xodim suratlari yuklanib «Suratlardan baza yaratish» bosilishi kerak")
	const wrongModel = await Face.countDocuments({ $nor: [{ model: cfg.faceModel === 'arcface' ? 'arcface' : 'sface' }, ...(cfg.faceModel === 'arcface' ? [] : [{ model: { $exists: false } }])] })
	if (wrongModel) add('WARN', `Faol modelga mos kelmaydigan izlar: ${wrongModel}`, "«Yuz tanish» sahifasida «Qaytadan olish» bosilsin")
	const withFile = await Face.find({ file: { $nin: [null, ''] } }).select('file source embedding model').lean()
	const UP = path.join(__dirname, '..', 'uploads')
	const missing = withFile.filter((t) => !fs.existsSync(path.join(UP, path.basename(t.file))))
	add(!fs.existsSync(UP) ? 'FAIL' : missing.length ? 'WARN' : 'OK', 'Yuz suratlari (uploads)', !fs.existsSync(UP) ? 'uploads papkasi yo\'q' : missing.length ? `${missing.length}/${withFile.length} ta surat fayli yo'q: uploads papkasini ham ko'chirdingizmi?` : `${withFile.length} ta fayl bor`)

	// bazadagi izlar shu serverdagi model bilan mos: suratdan qayta hisoblab solishtirish
	if (FE) {
		const toF32 = require('../services/face.service').toF32
		const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }
		const sample = withFile.filter((t) => t.source === 'photo' && (t.model || 'sface') === 'sface' && fs.existsSync(path.join(UP, path.basename(t.file)))).slice(0, 5)
		if (!sample.length) add('WARN', 'Izlar bilan model mosligi tekshirilmadi', 'asosiy suratli iz topilmadi (surat yuklangach qayta ishga tushiring)')
		else {
			const sims = []
			for (const t of sample) {
				try {
					const buf = fs.readFileSync(path.join(UP, path.basename(t.file)))
					const f = (await FE.detectInPhoto(buf, { score: 0.6 })).sort((a, b) => b.size - a.size)[0]
					if (!f) continue
					const [o] = await FE.embedFaces(buf, [f], { model: 'sface' })
					sims.push(dot(o.embedding, toF32(t.embedding)))
				} catch { /* surat o'qilmadi */ }
			}
			const avg = sims.reduce((a, b) => a + b, 0) / (sims.length || 1)
			add(!sims.length ? 'WARN' : avg >= 0.9 ? 'OK' : 'FAIL', 'Bazadagi izlar shu serverdagi model bilan mos', sims.length ? `o'rtacha o'xshashlik ${avg.toFixed(3)} (${sims.length} ta namuna; ≥0.90 bo'lishi kerak)` : 'surat ochilmadi')
		}
	}

	// ---- 5) qamrov: o'quvchi va xodimlar
	const staffTotal = await User.countDocuments({ isActive: { $ne: false }, hodimID: { $nin: [null, ''] } })
	const staffEnrolled = (await Face.distinct('studentId', { kind: 'staff' })).length
	add('OK', 'Xodimlar', `${staffEnrolled}/${staffTotal} tasida yuz izi bor`)
	const students = await Student.find({ isActive: { $ne: false } }).select('_id schoolId sinf').lean()
	const enrolled = new Set((await Face.distinct('studentId', { kind: { $ne: 'staff' } })).map(String))
	const bySinf = new Map()
	for (const s of students) { const k = String(s.sinf); const c = bySinf.get(k) || { total: 0, enr: 0 }; c.total++; if (enrolled.has(String(s._id))) c.enr++; bySinf.set(k, c) }
	const classes = [...bySinf.values()]
	const ready = classes.filter((c) => c.enr / c.total >= 0.8).length
	add(ready ? 'OK' : 'WARN', "Sinflar qamrovi (izi bor o'quvchilar ≥80%)", `${ready}/${classes.length} sinf tayyor; avtomatik davomat faqat shu sinflarda yoziladi`)
	void Sinf

	// ---- 6) kameralar
	const cams = await Camera.find({ inCloud: { $ne: false }, schoolId: { $ne: null } }).select('role sinfId visionEnabled faceDirection online').lean()
	const classCams = cams.filter((c) => c.role === 'monitor' && c.sinfId && c.visionEnabled)
	const gate = cams.filter((c) => !c.sinfId && c.faceDirection === 'out')
	add(classCams.length ? 'OK' : 'WARN', 'Kameralar', `sinfxona (tahlil yoqilgan): ${classCams.length}, darvoza (chiqish): ${gate.length}, jami: ${cams.length}`)
	if (!gate.length) add('WARN', 'Darvoza kamerasi belgilanmagan', "chiqish yuz orqali yozilmaydi (Kamera sozlamalari → zal kamerasi → «Chiqish (darvoza)»)")

	// ---- 7) xotira bahosi
	const dim = cfg.faceModel === 'arcface' ? 512 : 128
	add('OK', 'Galereya xotirasi bahosi', `1 maktab (500 o'quvchi × ~18 iz) ≈ ${MB(500 * 18 * dim * 4)}; 80 maktab ≈ ${MB(80 * 500 * 18 * dim * 4)}`)
	finish()
})().catch((e) => { add('FAIL', 'Kutilmagan xato', e.stack || e.message); finish() })

function finish() {
	const f = rows.filter((r) => r.level === 'FAIL').length, w = rows.filter((r) => r.level === 'WARN').length
	console.log(`\nNatija: ${rows.length - f - w} OK, ${w} ogohlantirish, ${f} xato`)
	mongoose.disconnect().finally(() => process.exit(f ? 1 : 0))
}
