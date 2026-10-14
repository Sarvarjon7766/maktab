// Yuz tanish sinovi (diagnostika): bitta kamera + bitta o'quvchi. Hozirgi kadr olinadi, yuzlar topiladi, har biri baza bilan
// solishtiriladi va har bosqich ko'rsatiladi. Hech narsa saqlanmaydi ("ko'rindi" yozuvi ham, avto-o'rganish ham yo'q).
const mongoose = require('mongoose')
const sharp = require('sharp')
const ai = require('../ai/aiPool')
const match = require('../ai/faceMatch')
const AiSettings = require('./ai.settings.service')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')

const oid = (v) => new mongoose.Types.ObjectId(String(v))
const r2 = (x) => Math.round(x * 100) / 100
const COLOR = { target: '#22c55e', other: '#3b82f6', weak: '#f59e0b', none: '#ef4444' } // yashil: izlanayotgan, ko'k: boshqa o'quvchi, sariq: kuchsiz, qizil: tanilmadi

// buffer berilsa — kadr tayyor (brauzerdagi jonli videodan, real vaqt rejimi): Hik'dan kadr olinmaydi, rasm chizilmaydi (faqat ramka koordinatalari)
async function diagnose(schoolId, { cameraId, studentId = null, sinfId: sinfIn = null, buffer = null }) {
	const Faces = require('./face.service')
	const Camera = require('../models/hik.camera.model')
	const Snapshots = require('./hik.snapshot.service')
	const cfg = await AiSettings.get()
	const model = await Faces.modelOf(cfg)
	const camera = mongoose.isValidObjectId(cameraId) ? await Camera.findOne({ _id: cameraId, schoolId: oid(schoolId) }).lean() : null
	if (!camera) return { success: false, message: 'Kamera topilmadi' }
	// O'quvchi berilsa — shu o'quvchi izlanadi; berilmasa — kameraning sinfidagi hamma o'quvchilar (jonli rejim)
	const student = mongoose.isValidObjectId(studentId) ? await studentModel.findOne({ _id: studentId, schoolId: oid(schoolId), isActive: { $ne: false } }).select('fullName sinf studentIdNumber').lean() : null
	if (studentId && !student) return { success: false, message: "O'quvchi topilmadi" }
	const sinfId = String(student?.sinf || (mongoose.isValidObjectId(sinfIn) ? sinfIn : null) || camera.sinfId || '')
	if (!sinfId) return { success: false, message: "Kamera sinfga biriktirilmagan: o'quvchi yoki sinf tanlang" }
	const sinfs = await sinfModel.find({ schoolId: oid(schoolId) }).select('name').lean()
	const sinfName = new Map(sinfs.map((x) => [String(x._id), x.name]))

	const t = { start: Date.now() }
	const gallery = await Faces.galleryOf(schoolId, model)
	const mine = student ? gallery.filter((g) => g.studentId === String(student._id)) : []
	const classTemplates = gallery.filter((g) => g.sinfId === sinfId)
	const out = {
		success: true,
		camera: { id: camera._id, name: camera.name },
		student: student ? { id: student._id, name: student.fullName, sinf: sinfName.get(String(student.sinf)) || '', idNumber: student.studentIdNumber || '', templates: mine.length } : null,
		sinf: { id: sinfId, name: sinfName.get(sinfId) || '', students: new Set(classTemplates.map((g) => g.studentId)).size, templates: classTemplates.length },
		settings: { model, threshold: cfg.faceThreshold, voteThreshold: cfg.faceVoteThreshold, margin: cfg.faceMargin, minSize: cfg.faceMinSize, upscale: cfg.faceUpscale, galleryTemplates: gallery.length, galleryStudents: new Set(gallery.map((g) => g.studentId)).size, faceEnabled: !!cfg.faceEnabled },
		timings: {}, faces: [], image: null, verdict: null
	}
	if (student ? !mine.length : !classTemplates.length) {
		out.verdict = { status: 'no_templates', text: student ? "Bu o'quvchining yuz izi yo'q: avval o'quvchi kartasidan 3–5 ta rasm yuklang yoki «Suratlardan baza yaratish» ni bosing" : "Bu sinfda yuz izi bor o'quvchi yo'q: avval o'quvchilarga rasm yuklang" }
		return out
	}

	let buf
	try { buf = buffer || await Snapshots.captureBuffer(camera) } catch (e) { return { ...out, success: false, message: `Kadr olinmadi: ${e.message}` } }
	t.capture = Date.now()
	const meta = await sharp(buf).metadata()
	out.camera.width = meta.width; out.camera.height = meta.height; out.camera.kb = Math.round(buf.length / 1024)
	// Jonli oqim kadri kichik (masalan 856×480): yuzlar kichik bo'ladi, shuning uchun kattalashtirib topiladi
	const upscale = buffer && meta.width < 1100 ? Math.max(2, cfg.faceUpscale) : cfg.faceUpscale
	// Real vaqt kadrida odamlar ham sanaladi (odam topuvchi, yuz topish bilan parallel)
	const peoplePromise = buffer ? ai.detect(buf, { tiled: false, score: cfg.detectorScore, lane: 'live' }).catch(() => null) : null
	const faces = await ai.faces(buf, { lane: buffer ? 'live' : undefined, score: cfg.faceScore, upscale, minSize: cfg.faceMinSize, maxFaces: 80, model })
	t.detect = Date.now()
	const people = peoplePromise ? await peoplePromise : null
	if (people) out.people = { count: people.count, boxes: people.boxes.map((b) => [b.x1 / meta.width, b.y1 / meta.height, b.x2 / meta.width, b.y2 / meta.height].map((v) => Math.round(v * 10000) / 10000)) }

	const raw = faces.map((f, i) => {
		const all = match.topMatches(f.embedding, gallery)
		const inClass = match.topMatches(f.embedding, gallery, sinfId)
		let own = -1
		for (const g of mine) own = Math.max(own, match.dot(f.embedding, g.emb))
		const r = match.identifyInClass(f.embedding, f.size, gallery, sinfId, { threshold: cfg.faceThreshold, margin: cfg.faceMargin })
		const thr = match.thresholdFor(f.size, cfg.faceThreshold)
		let decision = 'none', reason = ''
		if (r && student && r.studentId === String(student._id)) { decision = 'target'; reason = `Aniqlandi: o'xshashlik ${own.toFixed(2)} ≥ chegara ${thr.toFixed(2)}, farq ${r.margin.toFixed(2)}` }
		else if (r) { decision = 'other'; reason = student ? "Sinfning boshqa o'quvchisi sifatida tanildi" : `Tanildi: o'xshashlik ${r.score.toFixed(2)}, farq ${r.margin.toFixed(2)}` }
		else if (!inClass.best) reason = "Sinfda yuz izi yo'q"
		else if (inClass.best.score < thr) { decision = 'weak'; reason = `Sinfdagi eng yaxshi moslik ${inClass.best.score.toFixed(2)} < chegara ${thr.toFixed(2)}` }
		else if (inClass.second && inClass.margin < cfg.faceMargin) { decision = 'weak'; reason = `Ikki o'quvchi bir-biriga yaqin (farq ${inClass.margin.toFixed(2)} < ${cfg.faceMargin})` }
		else { decision = 'weak'; reason = 'Boshqa sinfdan ancha yaxshi moslik bor (rad etildi)' }
		return { n: i + 1, f, own: r2(own), all, inClass, thr: r2(thr), decision, reason, who: r ? r.studentId : null, whoScore: r ? r2(r.score) : null }
	})
	t.match = Date.now()

	const ids = [...new Set(raw.flatMap((r) => [r.all.best?.studentId, r.inClass.best?.studentId, r.who]).filter(Boolean))]
	const names = new Map((ids.length ? await studentModel.find({ _id: { $in: ids.map(oid) } }).select('fullName').lean() : []).map((s) => [String(s._id), s.fullName]))
	out.faces = raw.map((r) => ({
		box: [r.f.x1 / meta.width, r.f.y1 / meta.height, r.f.x2 / meta.width, r.f.y2 / meta.height].map((v) => Math.round(v * 10000) / 10000), n: r.n, who: r.who ? { name: names.get(r.who) || '?', score: r.whoScore } : null, size: Math.round(r.f.size), detScore: r2(r.f.score), quality: r.f.quality, own: r.own, threshold: r.thr, decision: r.decision, reason: r.reason,
		bestAll: r.all.best ? { name: names.get(r.all.best.studentId) || '?', sinf: sinfName.get(String(r.all.best.sinfId)) || '', score: r2(r.all.best.score) } : null,
		bestClass: r.inClass.best ? { name: names.get(r.inClass.best.studentId) || '?', score: r2(r.inClass.best.score) } : null
	}))

	if (buffer) out.frame = { width: meta.width, height: meta.height, upscale }
	// Annotatsiyali kadr (real vaqt rejimida chizilmaydi: ramkani brauzer videoning ustiga o'zi chizadi)
	if (!buffer) {
		const W = Math.min(1600, meta.width), k = W / meta.width, H = Math.round(meta.height * k), fz = Math.max(12, Math.round(W / 90))
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${raw.map((r) => {
			const x1 = r.f.x1 * k, y1 = r.f.y1 * k, x2 = r.f.x2 * k, y2 = r.f.y2 * k, c = COLOR[r.decision]
			return `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="${c}" stroke-width="${r.decision === 'target' ? 4 : 2}"/><rect x="${x1}" y="${Math.max(0, y1 - fz - 4)}" width="${fz * 1.6 + 6}" height="${fz + 4}" fill="${c}"/><text x="${x1 + 3}" y="${Math.max(fz, y1 - 5)}" font-size="${fz}" font-family="Arial, sans-serif" font-weight="bold" fill="#fff">${r.n}</text>`
		}).join('')}</svg>`
		const jpg = await sharp(buf).resize(W, H).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 80 }).toBuffer()
		out.image = `data:image/jpeg;base64,${jpg.toString('base64')}`

	}

	const known = [...new Map(out.faces.filter((f) => f.who).sort((a, b) => b.who.score - a.who.score).map((f) => [f.who.name, f])).values()]
	out.recognized = known.map((f) => ({ name: f.who.name, score: f.who.score, faceNo: f.n, size: f.size }))
	const hit = out.faces.filter((f) => f.decision === 'target').sort((a, b) => b.own - a.own)[0]
	const bestOwn = out.faces.reduce((m, f) => (f.own > (m ? m.own : -2) ? f : m), null)
	if (!student) {
		out.verdict = !faces.length ? { status: 'no_faces', text: `Kadrda yuz topilmadi (kadr ${meta.width}×${meta.height})` }
			: known.length ? { status: 'found', text: `TANILDI (${known.length}): ${known.map((f) => `${f.who.name} (${f.who.score})`).join(', ')} — kadrda ${faces.length} yuz` }
			: { status: 'not_found', text: `Hech kim tanilmadi: kadrda ${faces.length} yuz, ${out.sinf.name || 'sinf'} bazasida ${out.sinf.students} o'quvchi` }
	} else if (!faces.length) out.verdict = { status: 'no_faces', text: `Kadrda yuz topilmadi (kadr ${meta.width}×${meta.height}). Xona bo'sh yoki yuzlar juda kichik bo'lishi mumkin` }
	else if (hit) out.verdict = { status: 'found', faceNo: hit.n, score: hit.own, text: `ANIQLANDI: ${student.fullName} — yuz №${hit.n} (o'xshashlik ${hit.own}, yuz ${hit.size} px)` }
	else out.verdict = { status: 'not_found', faceNo: bestOwn.n, score: bestOwn.own, text: `ANIQLANMADI: ${student.fullName} ga eng yaqin yuz №${bestOwn.n} — o'xshashlik ${bestOwn.own} (chegara ${bestOwn.threshold}). ${bestOwn.reason}` }
	out.timings = { capture: t.capture - t.start, detect: t.detect - t.capture, match: t.match - t.detect, total: Date.now() - t.start }
	return out
}

module.exports = { diagnose }

// Sinov uchun o'quvchi qidirish: ism yoki ID raqami bo'yicha (maktab ichida), yuz izlari soni bilan
async function searchStudents(schoolId, q) {
	const text = String(q || '').trim().slice(0, 60)
	if (text.length < 2) return { success: true, items: [] }
	const rx = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
	const FaceTemplate = require('../models/face.template.model')
	const rows = await studentModel.find({ schoolId: oid(schoolId), isActive: { $ne: false }, $or: [{ fullName: rx }, { studentIdNumber: rx }] }).select('fullName sinf studentIdNumber').limit(12).lean()
	const sinfs = new Map((await sinfModel.find({ _id: { $in: rows.map((r) => r.sinf).filter(Boolean) } }).select('name').lean()).map((x) => [String(x._id), x.name]))
	const counts = await FaceTemplate.aggregate([{ $match: { studentId: { $in: rows.map((r) => r._id) } } }, { $group: { _id: '$studentId', n: { $sum: 1 } } }])
	const cnt = new Map(counts.map((c) => [String(c._id), c.n]))
	return { success: true, items: rows.map((r) => ({ _id: r._id, fullName: r.fullName, sinf: sinfs.get(String(r.sinf)) || '', idNumber: r.studentIdNumber || '', templates: cnt.get(String(r._id)) || 0 })) }
}
module.exports.searchStudents = searchStudents
