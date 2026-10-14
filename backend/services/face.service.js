// Sinfxona kameralarida yuz orqali "ko'rindi" dalilini yig'ish (Hik-Connect snapshot kadrlari asosida).
//   1) Bazaga olish: o'quvchining asosiy surati + admin yuklagan qo'shimcha suratlar (3–5 ta) -> yuz izlari (FaceTemplate).
//   2) Har tahlil kadrida (services/vision.service.js): yuzlar topiladi, izlari olinadi (AI worker, GPU bo'lsa GPU'da).
//   3) Sinfni aniqlash: butun maktab bo'yicha ishonchli moslikka ega yuzlar o'z sinflariga OVOZ beradi; xona qaysi sinfda ekani ovozlardan
//      aniqlanadi (kameraga biriktirilgan sinf faqat taxmin: informatika xonasida boshqa sinf dars o'tishi mumkin).
//   4) Aniqlangan sinf ichida yuz o'quvchiga bog'lanadi (ai/faceMatch.js) va ClassroomPresence'ga yoziladi.
//   5) Avto-o'rganish: juda ishonchli va sifatli tanilgan kesmaning izi o'quvchiga qo'shiladi (rasm saqlanmaydi) — kamera sharoitiga moslashadi.
// DIQQAT: bu davomat emas, dalil. Tanilmagan o'quvchi "kelmagan" hisoblanmaydi.
const path = require('path')
const fs = require('fs')
const mongoose = require('mongoose')
const sharp = require('sharp')
const ai = require('../ai/aiPool')
const match = require('../ai/faceMatch')
const AiSettings = require('./ai.settings.service')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const FaceTemplate = require('../models/face.template.model')
const Presence = require('../models/classroom.presence.model')
const StaffPresence = require('../models/staff.presence.model')
const userModel = require('../models/user.model')

const UPLOADS = path.join(__dirname, '..', 'uploads')
const GALLERY_TTL_MS = 5 * 60 * 1000
const TEACHER_RX = /(o['‘’`ʻ]?qituvchi|ustoz|teacher|pedagog|sinf\s*rahbari)/i
const MAX_EXTRA = 5 // admin yuklaydigan qo'shimcha suratlar (asosiy suratdan tashqari)
const MAX_AUTO = 12 // kameradan avto-o'rganilgan izlar
const AUTO_EVERY_MS = 10 * 60 * 1000 // bir o'quvchiga avto-iz qo'shish oralig'i
// Bazaga olish (ro'yxatga olish) suratlari uchun sifat talablari
const ENROLL = { minSize: 60, minSharp: 60, maxYaw: 0.5, minScore: 0.7 }
// Avto-o'rganish: faqat juda ishonchli (yuqori o'xshashlik va katta farq) hamda sifatli kesmalar
const AUTO = { minScore: 0.5, minMargin: 0.1, minSize: 36, minSharp: 30, maxYaw: 0.5, dup: 0.93, anchor: 0.35 } // anchor: odam kiritgan izga kamida shuncha o'xshash bo'lsin
const oid = (v) => new mongoose.Types.ObjectId(String(v))
const todayStr = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d)

// lean() Buffer maydonini mongodb Binary sifatida qaytaradi: oddiy Buffer ga o'tkazib, Float32Array qilamiz
const toF32 = (x) => {
	const b = Buffer.isBuffer(x) ? x : (x && x.buffer ? Buffer.from(x.buffer.subarray(0, x.position ?? x.buffer.length)) : Buffer.from(x))
	return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
}
const toBuf = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength)
const dot = match.dot
// 'model' maydoni yo'q eski izlar sface hisoblanadi
const modelFilter = (model) => model === 'sface' ? { $or: [{ model: 'sface' }, { model: { $exists: false } }] } : { model }

// Surat sifatini tekshiradi: { ok, reason } (reason: low_score | small_face | blurry | turned)
function checkQuality(q, rules) {
	if (q.score < rules.minScore) return { ok: false, reason: 'low_score' }
	if (q.size < rules.minSize) return { ok: false, reason: 'small_face' }
	if (q.sharp < rules.minSharp) return { ok: false, reason: 'blurry' }
	if (q.yaw > rules.maxYaw) return { ok: false, reason: 'turned' }
	return { ok: true }
}

class FaceService {
	constructor() {
		this.galleries = new Map() // schoolId -> { until, items }
		this.rooms = new Map() // camera -> { votes: Map, at }
		this.lastRun = new Map() // camera -> xulosa (panel uchun)
		this.jobs = new Map() // schoolId -> bazaga olish jarayoni
		this.autoAt = new Map() // studentId -> oxirgi avto-iz vaqti
		this.streaks = new Map() // `kind:odam:kamera` -> { n, at }: ketma-ket kadrlarda tanilish hisobi (davomat uchun)
		this.errAt = 0
		this.indexed = false
	}

	// Eski versiyada (studentId, source) noyob indeksi bor edi: bir o'quvchida bir nechta iz bo'lishi uchun olib tashlanadi
	async ensureIndexes() {
		if (this.indexed) return
		this.indexed = true
		await FaceTemplate.collection.dropIndex('studentId_1_source_1').catch(() => {})
		await FaceTemplate.syncIndexes().catch(() => {})
	}

	invalidate(schoolId) {
		if (!schoolId) return
		for (const k of [...this.galleries.keys()]) if (k.startsWith(`${schoolId}:`)) this.galleries.delete(k)
	}

	// Faol yuz izi modeli (AI sozlamalari -> faceModel). Boshqa model izlari ishlatilmaydi: o'lcham va masshtab farq qiladi
	async modelOf(cfgIn = null) { return ((cfgIn || await AiSettings.get()).faceModel === 'arcface') ? 'arcface' : 'sface' }

	// Maktabning yuz izlari (faqat faol o'quvchilarniki)
	async galleryOf(schoolId, model = 'sface') {
		const key = `${schoolId}:${model}`
		const hit = this.galleries.get(key)
		if (hit && hit.until > Date.now()) return hit.items
		for (const [k, v] of this.galleries) if (v.until < Date.now() - GALLERY_TTL_MS) this.galleries.delete(k) // xotira: eskirgan maktab galereyalari
		const [templates, active, staffActive] = await Promise.all([
			FaceTemplate.find({ schoolId: oid(schoolId), ...modelFilter(model) }).select('studentId sinfId embedding source kind').lean(),
			studentModel.find({ schoolId: oid(schoolId), isActive: { $ne: false } }).select('_id sinf').lean(),
			userModel.find({ schoolId: oid(schoolId), isActive: { $ne: false }, hodimID: { $nin: [null, ''] } }).select('_id fullName position').lean()
		])
		const sinfOf = new Map(active.map((s) => [String(s._id), s.sinf]))
		const staffInfo = new Map(staffActive.map((u) => [String(u._id), { fullName: u.fullName, position: u.position || '' }]))
		const items = [], staffItems = []
		for (const t of templates) {
			if (t.kind === 'staff') { // xodim izlari alohida ro'yxatda: sinf ovozi va o'quvchi tanlashga aralashmaydi
				if (staffInfo.has(String(t.studentId))) staffItems.push({ studentId: String(t.studentId), sinfId: 'staff', emb: toF32(t.embedding), src: t.source })
				continue
			}
			const sinf = sinfOf.get(String(t.studentId))
			if (!sinf) continue // nofaol yoki o'chirilgan o'quvchi izi ishlatilmaydi
			items.push({ studentId: String(t.studentId), sinfId: String(sinf), emb: toF32(t.embedding), src: t.source })
		}
		match.attachIndex(items, active)
		match.attachIndex(staffItems, [])
		items.staff = staffItems
		items.staffInfo = staffInfo
		this.galleries.set(key, { until: Date.now() + GALLERY_TTL_MS, items })
		return items
	}

	// ---------- Bazaga olish ----------
	async embedPhoto(buf, model = 'sface') {
		const r = await ai.faceEnroll(buf, { score: 0.6, model })
		if (!r) return { ok: false, reason: 'no_face' }
		const q = { ...r.quality, score: r.score }
		const chk = checkQuality(q, ENROLL)
		return { ...chk, embedding: r.embedding, quality: q, faces: r.faces }
	}

	// Asosiy surat (Student.photo): bitta 'photo' izi, surat o'zgarsa yangilanadi. Sifat talabi yumshoqroq (Hik terminal uchun tayyorlangan surat)
	async enrollStudent(student, { force = false, model = null, kind = 'student' } = {}) {
		await this.ensureIndexes()
		model = model || await this.modelOf()
		const photo = String(student.photo || '')
		if (!photo) return { ok: false, reason: 'no_photo' }
		const existing = await FaceTemplate.findOne({ studentId: student._id, source: 'photo', ...modelFilter(model) }).select('file').lean()
		if (existing && existing.file === photo && !force) return { ok: true, skipped: true }
		let buf
		try { buf = await fs.promises.readFile(path.join(UPLOADS, path.basename(photo))) } catch { return { ok: false, reason: 'no_file' } }
		const r = await this.embedPhoto(buf, model)
		if (r.reason === 'no_face') return { ok: false, reason: 'no_face' }
		if (r.quality.size < 40) return { ok: false, reason: 'small_face', size: Math.round(r.quality.size) }
		await FaceTemplate.deleteMany({ studentId: student._id, source: 'photo', ...modelFilter(model) })
		await FaceTemplate.create({ schoolId: student.schoolId, studentId: student._id, sinfId: kind === 'staff' ? null : student.sinf || null, kind, embedding: toBuf(r.embedding), model, source: 'photo', file: photo, size: r.quality.size, score: r.quality.score, sharp: r.quality.sharp, yaw: r.quality.yaw })
		this.invalidate(student.schoolId)
		return { ok: true, size: Math.round(r.quality.size), faces: r.faces, quality: r.quality }
	}

	// Qo'shimcha yuz surati (admin yuklaydi). Sifat tekshiriladi; rad etilsa sababi qaytadi va fayl saqlanmaydi
	async addPhoto(student, buffer, kind = 'student') {
		await this.ensureIndexes()
		const model = await this.modelOf()
		const count = await FaceTemplate.countDocuments({ studentId: student._id, source: 'extra' })
		if (count >= MAX_EXTRA) return { ok: false, reason: 'limit', limit: MAX_EXTRA }
		let img
		try { img = await sharp(buffer).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer() } catch { return { ok: false, reason: 'bad_image' } }
		const r = await this.embedPhoto(img, model)
		if (!r.ok) return { ok: false, reason: r.reason, quality: r.quality || null }
		// Aynan shu suratning nusxasi (yoki juda o'xshashi) allaqachon bo'lsa — qo'shilmaydi
		const have = await FaceTemplate.find({ studentId: student._id, ...modelFilter(model) }).select('embedding').lean()
		if (have.some((t) => dot(toF32(t.embedding), r.embedding) > 0.97)) return { ok: false, reason: 'duplicate' }
		const file = `face-${student._id}-${Date.now()}.jpg`
		await fs.promises.writeFile(path.join(UPLOADS, file), img)
		const doc = await FaceTemplate.create({ schoolId: student.schoolId, studentId: student._id, sinfId: kind === 'staff' ? null : student.sinf || null, kind, embedding: toBuf(r.embedding), model, source: 'extra', file, size: r.quality.size, score: r.quality.score, sharp: r.quality.sharp, yaw: r.quality.yaw })
		this.invalidate(student.schoolId)
		return { ok: true, id: doc._id, file, quality: r.quality, faces: r.faces }
	}

	async listPhotos(studentId) {
		const rows = await FaceTemplate.find({ studentId: oid(studentId) }).select('source file size score sharp yaw createdAt').sort({ createdAt: 1 }).lean()
		const count = (s) => rows.filter((r) => r.source === s).length
		return {
			success: true, limits: { extra: MAX_EXTRA, auto: MAX_AUTO },
			counts: { photo: count('photo'), extra: count('extra'), auto: count('auto') },
			items: rows.filter((r) => r.source !== 'auto').map((r) => ({ _id: r._id, source: r.source, file: r.file, size: Math.round(r.size), sharp: Math.round(r.sharp), yaw: r.yaw, at: r.createdAt }))
		}
	}

	async removeTemplate(templateId, schoolId) {
		const t = await FaceTemplate.findOneAndDelete({ _id: oid(templateId), schoolId: oid(schoolId), source: { $in: ['extra', 'auto'] } }).lean()
		if (!t) return { success: false, message: 'Surat topilmadi' }
		if (t.file) await fs.promises.unlink(path.join(UPLOADS, path.basename(t.file))).catch(() => {})
		this.invalidate(schoolId)
		return { success: true }
	}

	// O'quvchi o'chirilganda yoki nofaol bo'lganda: izlar, qo'shimcha suratlar fayllari va "ko'rindi" yozuvlari
	async removeStudent(studentId, schoolId = null) {
		const rows = await FaceTemplate.find({ studentId: oid(studentId) }).select('file source schoolId').lean()
		for (const t of rows) if (t.source === 'extra' && t.file) await fs.promises.unlink(path.join(UPLOADS, path.basename(t.file))).catch(() => {})
		const r = await FaceTemplate.deleteMany({ studentId: oid(studentId) })
		await Presence.deleteMany({ student: oid(studentId) })
		this.invalidate(schoolId || rows[0]?.schoolId)
		return { templates: r.deletedCount }
	}

	// Maktab o'quvchilarining asosiy suratlarini bazaga oladi. Uzoq davom etadi — fon rejimida, holat status() da
	async enrollSchool(schoolId, { force = false } = {}) {
		await this.ensureIndexes()
		const key = String(schoolId)
		const cur = this.jobs.get(key)
		if (cur && cur.running) return { success: true, started: false, job: cur }
		const model = await this.modelOf()
		const students = await studentModel.find({ schoolId: oid(schoolId), isActive: { $ne: false }, photo: { $nin: [null, ''] } }).select('_id schoolId sinf photo').lean()
		const staffList = await userModel.find({ schoolId: oid(schoolId), isActive: { $ne: false }, hodimID: { $nin: [null, ''] }, photo: { $nin: [null, ''] } }).select('_id schoolId photo').lean()
		const job = { running: true, total: students.length + staffList.length, done: 0, enrolled: 0, skipped: 0, failed: { no_file: 0, no_face: 0, small_face: 0, no_photo: 0 }, startedAt: new Date(), finishedAt: null }
		this.jobs.set(key, job)
		;(async () => {
			try {
				for (const s of students) {
					try {
						const r = await this.enrollStudent(s, { force, model })
						if (r.ok) { if (r.skipped) job.skipped++; else job.enrolled++ } else job.failed[r.reason] = (job.failed[r.reason] || 0) + 1
					} catch (e) { job.failed.error = (job.failed.error || 0) + 1 }
					job.done++
				}
				for (const u of staffList) {
					try {
						const r = await this.enrollStudent(u, { force, model, kind: 'staff' })
						if (r.ok) { if (r.skipped) job.skipped++; else job.enrolled++ } else job.failed[r.reason] = (job.failed[r.reason] || 0) + 1
					} catch (e) { job.failed.error = (job.failed.error || 0) + 1 }
					job.done++
				}
				await this.reembedExtras(schoolId, model, job)
				await this.syncSinf(schoolId)
			} finally {
				job.running = false; job.finishedAt = new Date()
				this.invalidate(schoolId)
			}
		})()
		return { success: true, started: true, job }
	}

	// Model almashganda: qo'shimcha suratlar (fayli saqlangan) yangi modelda qayta olinadi. Kameradan avto-o'rganilgan izlarning fayli yo'q — ular yangi model bilan qaytadan o'rganiladi
	async reembedExtras(schoolId, model, job = null) {
		const have = new Set((await FaceTemplate.find({ schoolId: oid(schoolId), source: 'extra', ...modelFilter(model) }).select('file').lean()).map((t) => t.file))
		const rows = await FaceTemplate.find({ schoolId: oid(schoolId), source: 'extra', file: { $nin: [...have] } }).select('studentId sinfId file kind').lean()
		const seen = new Set()
		for (const t of rows) {
			if (!t.file || seen.has(t.file)) continue
			seen.add(t.file)
			try {
				const buf = await fs.promises.readFile(path.join(UPLOADS, path.basename(t.file)))
				const r = await this.embedPhoto(buf, model)
				if (!r.embedding) continue
				await FaceTemplate.create({ schoolId: oid(schoolId), studentId: t.studentId, sinfId: t.sinfId, kind: t.kind || 'student', embedding: toBuf(r.embedding), model, source: 'extra', file: t.file, size: r.quality.size, score: r.quality.score, sharp: r.quality.sharp, yaw: r.quality.yaw })
				if (job) job.enrolled++
			} catch { if (job) job.failed.error = (job.failed.error || 0) + 1 }
		}
	}

	// FaceTemplate.sinfId ni o'quvchining hozirgi sinfiga moslab, nofaol o'quvchilar izlarini o'chiradi
	async syncSinf(schoolId) {
		const students = await studentModel.find({ schoolId: oid(schoolId) }).select('_id sinf isActive').lean()
		const active = new Map(students.filter((s) => s.isActive !== false).map((s) => [String(s._id), s.sinf]))
		const templates = await FaceTemplate.find({ schoolId: oid(schoolId), kind: { $ne: 'staff' } }).select('_id studentId sinfId').lean()
		const del = [], ops = []
		for (const t of templates) {
			const sinf = active.get(String(t.studentId))
			if (!sinf) del.push(t._id)
			else if (String(t.sinfId) !== String(sinf)) ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { sinfId: sinf } } } })
		}
		if (del.length) await FaceTemplate.deleteMany({ _id: { $in: del } })
		if (ops.length) await FaceTemplate.bulkWrite(ops)
		this.invalidate(schoolId)
		return { removed: del.length, updated: ops.length }
	}

	// Biometrik ma'lumotni to'liq o'chirish: izlar, qo'shimcha suratlar fayllari va "ko'rindi" yozuvlari
	async purgeSchool(schoolId) {
		const extras = await FaceTemplate.find({ schoolId: oid(schoolId), source: 'extra' }).select('file').lean()
		for (const t of extras) if (t.file) await fs.promises.unlink(path.join(UPLOADS, path.basename(t.file))).catch(() => {})
		const [t, p] = await Promise.all([FaceTemplate.deleteMany({ schoolId: oid(schoolId) }), Presence.deleteMany({ schoolId: oid(schoolId) })])
		this.invalidate(schoolId)
		return { templates: t.deletedCount, presence: p.deletedCount }
	}

	// ---------- Avto-o'rganish ----------
	// Juda ishonchli va sifatli tanilgan yuzning izini o'quvchiga qo'shadi (rasm saqlanmaydi). To'lsa eng eskisi almashadi
	async learn(studentId, schoolId, sinfId, face, score, margin, now, model = 'sface') {
		const sid = String(studentId)
		if (score < AUTO.minScore || margin < AUTO.minMargin) return false
		const q = face.quality
		if (!q || q.size < AUTO.minSize || q.sharp < AUTO.minSharp || q.yaw > AUTO.maxYaw) return false
		if (now - (this.autoAt.get(sid) || 0) < AUTO_EVERY_MS) return false
		const have = await FaceTemplate.find({ studentId: oid(studentId), ...modelFilter(model) }).select('embedding source createdAt').sort({ createdAt: 1 }).lean()
		if (have.some((t) => dot(toF32(t.embedding), face.embedding) > AUTO.dup)) return false // deyarli bir xil iz allaqachon bor
		const autos = have.filter((t) => t.source === 'auto')
		if (autos.length >= MAX_AUTO) await FaceTemplate.deleteOne({ _id: autos[0]._id })
		await FaceTemplate.create({ schoolId: oid(schoolId), studentId: oid(studentId), sinfId: sinfId ? oid(sinfId) : null, embedding: toBuf(face.embedding), model, source: 'auto', size: q.size, score: q.score, sharp: q.sharp, yaw: q.yaw })
		this.autoAt.set(sid, now.getTime())
		// Galereya keshi bekor qilinmaydi: yangi avto-iz keyingi yangilanishda (<= 5 daqiqa) qo'shiladi. Aks holda har o'rganishda butun maktab izlari qayta o'qilardi
		return true
	}

	// ---------- Kadrni qayta ishlash ----------
	// Kadrdagi yuzlar: avval xodimlar (butun maktab izlari bo'yicha), qolganlari uchun sinf aniqlanib o'quvchilar. Natija — «ko'rindi» dalili;
	// davomat yoqilgan bo'lsa (faceAttendance) — kamera yo'nalishiga (faceDirection: kirdi/chiqdi/o'chiq) qarab davomatga ham yoziladi
	async processFrame(camera, buf, now = new Date(), cfgIn = null) {
		const cfg = cfgIn || await AiSettings.get()
		const key = String(camera._id)
		if (!camera.sinfId && camera.role !== 'hall' && camera.faceDirection !== 'out') return { skipped: 'sinfga biriktirilmagan kamera' }
		const model = await this.modelOf(cfg)
		const gallery = await this.galleryOf(camera.schoolId, model)
		const staff = gallery.staff || []
		if (!gallery.length && !staff.length) return { skipped: "yuz izlari yo'q" }

		const faces = await ai.faces(buf, { score: cfg.faceScore, upscale: cfg.faceUpscale, minSize: cfg.faceMinSize, maxFaces: 80, model })
		const run = { at: now, faces: faces.length, matched: 0, staff: 0, learned: 0, room: null }
		this.lastRun.set(key, run)
		if (!faces.length) return run
		const direction = camera.faceDirection || 'in'
		const staleMs = Math.max(4 * 60000, (cfg.intervalSec || 60) * 3000 + 60000) // shundan uzoq tanilmasa ketma-ket hisob uziladi
		const dateString = todayStr(now)

		// 0) xodimlar: yuz xodim izlariga o'quvchilarnikidan aniqroq mos kelsa — xodim (sinf ovoziga va o'quvchi tanlashga qo'shilmaydi)
		const blank = { best: null, second: null, margin: 0 }
		const matches = faces.map((f) => (gallery.length ? match.topMatches(f.embedding, gallery) : blank))
		const studentFaces = []
		const staffFound = new Map()
		faces.forEach((f, i) => {
			if (staff.length) {
				const sm = match.topMatches(f.embedding, staff)
				const stuBest = matches[i].best ? matches[i].best.score : -1
				if (sm.best && sm.best.score >= match.thresholdFor(f.size, cfg.faceThreshold) && sm.margin >= cfg.faceMargin && sm.best.score > stuBest) {
					const prev = staffFound.get(sm.best.studentId)
					if (!prev || sm.best.score > prev.score) staffFound.set(sm.best.studentId, { score: sm.best.score, margin: sm.margin, size: f.size })
					return
				}
			}
			studentFaces.push({ f, m: matches[i] })
		})
		run.staff = staffFound.size
		for (const [userId, r] of staffFound) {
			const doc = await StaffPresence.findOneAndUpdate(
				{ user: oid(userId), camera: camera._id, dateString },
				{ $inc: { hits: 1 }, $max: { bestScore: r.score }, $set: { lastSeen: now, schoolId: camera.schoolId, sinfId: camera.sinfId }, $setOnInsert: { firstSeen: now } },
				{ upsert: true, new: true }
			)
			if (cfg.faceAttendance) {
				const act = await this.applyAttendance({ kind: 'staff', personId: userId, camera, direction, r, cfg: camera.sinfId ? cfg : { ...cfg, faceAttendanceHits: cfg.faceGateHits ?? 1, faceAttendanceScore: cfg.faceGateScore ?? 0.55 }, now, key: `s:${userId}:${key}`, staleMs, presenceModel: StaffPresence, presenceId: doc._id }).catch((e) => { this.logError(e); return null })
				if (act) run.attendance = (run.attendance || 0) + 1
			}
		}
		if (!gallery.length || !studentFaces.length) return run
		if (!camera.sinfId) return this.processSchoolStudents({ camera, studentFaces, gallery, cfg, now, run, direction, staleMs, key, dateString }) // darvoza/koridor: sinf taxmini yo'q

		// 1) sinfni aniqlash: butun maktab bo'yicha ishonchli mosliklar ovoz beradi
		const room = this.rooms.get(key) || { votes: new Map(), at: 0 }
		this.rooms.set(key, room)
		if (now - room.at > 20 * 60 * 1000) room.votes.clear() // uzoq tanaffusdan keyin eski dars ovozlari unutiladi
		room.at = now
		match.decayVotes(room.votes)
		match.addVotes(room.votes, studentFaces.map((x) => x.m), { voteThreshold: cfg.faceVoteThreshold })
		const chosen = match.chooseClass(room.votes, camera.sinfId)
		run.room = { sinfId: chosen.sinfId, source: chosen.source, votes: Math.round(chosen.votes * 10) / 10 }
		if (!chosen.sinfId) return run

		// 2) aniqlangan sinf ichida yuzni o'quvchiga bog'lash (bitta o'quvchi kadrda bir marta: eng yaxshi moslik)
		const found = new Map()
		for (const { f } of studentFaces) {
			const r = match.identifyInClass(f.embedding, f.size, gallery, chosen.sinfId, { threshold: cfg.faceThreshold, margin: cfg.faceMargin })
			if (!r) continue
			const prev = found.get(r.studentId)
			if (!prev || r.score > prev.score) found.set(r.studentId, { ...r, size: f.size, face: f })
		}
		run.matched = found.size

		// 3) dalilni yozish, davomat va avto-o'rganish
		const sinfOf = new Map(gallery.map((g) => [g.studentId, g.sinfId]))
		for (const [studentId, r] of found) {
			const doc = await Presence.findOneAndUpdate(
				{ student: oid(studentId), camera: camera._id, dateString },
				{
					$inc: { hits: 1 }, $max: { bestScore: r.score, bestSize: r.size },
					$set: { lastSeen: now, schoolId: camera.schoolId, sinfId: oid(sinfOf.get(studentId) || chosen.sinfId), roomSinf: oid(chosen.sinfId), roomSource: chosen.source },
					$setOnInsert: { firstSeen: now }
				},
				{ upsert: true, new: true }
			)
			if (doc.status !== 'confirmed' && doc.hits >= (cfg.faceMinHits || 2)) await Presence.updateOne({ _id: doc._id }, { $set: { status: 'confirmed' } })
			if (cfg.faceAttendance) {
				const act = await this.applyAttendance({
					kind: 'student', personId: studentId, camera, direction, r, cfg, now, key: `p:${studentId}:${key}`, staleMs, studentSinf: sinfOf.get(studentId), roomSinf: chosen.sinfId,
					coverage: gallery.coverage && gallery.coverage.get(String(chosen.sinfId)), presenceModel: Presence, presenceId: doc._id
				}).catch((e) => { this.logError(e); return null })
				if (act) run.attendance = (run.attendance || 0) + 1
			}
			// Faqat tasdiqlangan (kamida 2 kadr) va xonaning o'z sinfi o'quvchisidan o'rganiladi
			if (cfg.faceAutoLearn !== false && doc.hits >= 2 && String(sinfOf.get(studentId)) === String(chosen.sinfId) && match.anchorScore(gallery, studentId, r.face.embedding) >= AUTO.anchor) {
				if (await this.learn(studentId, camera.schoolId, chosen.sinfId, r.face, r.score, r.margin, now, model).catch(() => false)) run.learned++
			}
		}
		return run
	}

	// Sinfsiz kamera (darvoza, koridor, zal): yuz butun maktab o'quvchilari orasidan aniqlanadi. Maktab hududida ko'ringan o'quvchi «kirdi» (kamera yo'nalishi 'in'),
	// darvoza kamerasida (yo'nalish 'out') esa faqat ichkaridagi o'quvchi «chiqdi» yoziladi. Avto-o'rganish bu yerda yo'q: sinf bilan tekshirib bo'lmaydi
	async processSchoolStudents({ camera, studentFaces, gallery, cfg, now, run, direction, staleMs, key, dateString }) {
		const gateCfg = { ...cfg, faceAttendanceHits: cfg.faceGateHits ?? 1, faceAttendanceScore: cfg.faceGateScore ?? 0.55 }
		const found = new Map()
		for (const { f } of studentFaces) {
			const r = match.identifySchool(f.embedding, f.size, gallery, { threshold: cfg.faceThreshold, margin: cfg.faceMargin })
			if (!r) continue
			const prev = found.get(r.studentId)
			if (!prev || r.score > prev.score) found.set(r.studentId, { ...r, size: f.size })
		}
		run.matched = found.size
		for (const [studentId, r] of found) {
			const doc = await Presence.findOneAndUpdate(
				{ student: oid(studentId), camera: camera._id, dateString },
				{
					$inc: { hits: 1 }, $max: { bestScore: r.score, bestSize: r.size },
					$set: { lastSeen: now, schoolId: camera.schoolId, sinfId: oid(r.sinfId), roomSource: 'school' },
					$setOnInsert: { firstSeen: now }
				},
				{ upsert: true, new: true }
			)
			if (doc.status !== 'confirmed' && doc.hits >= (cfg.faceMinHits || 2)) await Presence.updateOne({ _id: doc._id }, { $set: { status: 'confirmed' } })
			if (cfg.faceAttendance) {
				const act = await this.applyAttendance({
					kind: 'student', personId: studentId, camera, direction, r, cfg: gateCfg, now, key: `p:${studentId}:${key}`, staleMs, studentSinf: r.sinfId, roomSinf: r.sinfId,
					coverage: gallery.coverage && gallery.coverage.get(String(r.sinfId)), presenceModel: Presence, presenceId: doc._id
				}).catch((e) => { this.logError(e); return null })
				if (act) run.attendance = (run.attendance || 0) + 1
			}
		}
		return run
	}

	// Yuz orqali davomatga yozish (o'quvchi ham, xodim ham). Kamera yo'nalishi (faceDirection) va hozirgi holat bo'yicha harakat tanlanadi:
	//  'in'  — «kirdi» (chiqib ketgan bo'lsa ham qayta «kirdi»; allaqachon «ishda» bo'lsa yozilmaydi),  'out' — faqat «ishda» bo'lganga «chiqdi»,  'off' — yozilmaydi.
	// Shartlar: ketma-ket kamida N kadrda tanilgan, o'xshashlik va 1-/2-o'quvchi farqi yetarli, yuz katta; o'quvchida — xona sinfi va sinf bazasi qamrovi.
	// Tebranmasligi uchun oxirgi kirish/chiqishdan keyin faceAttendanceCooldownMin daqiqa kutiladi. Qaytaradi: 'in' | 'out' | null
	async applyAttendance({ kind, personId, camera, direction, r, cfg, now, key, staleMs, studentSinf, roomSinf, coverage, presenceModel, presenceId }) {
		if (direction === 'off') return null
		const streak = match.bumpStreak(this.streaks, key, now.getTime(), staleMs)
		const gate = match.attendanceGate({ hits: streak, score: r.score, margin: r.margin, size: r.size, studentSinf, roomSinf, coverage, needClass: kind === 'student' }, cfg)
		if (!gate.ok) return null
		const dateString = todayStr(now)
		let idNumber, att, lastLog, svc
		if (kind === 'student') {
			const person = await studentModel.findOne({ _id: oid(personId), schoolId: camera.schoolId, isActive: { $ne: false } }).select('studentIdNumber').lean()
			idNumber = person && person.studentIdNumber
			att = await require('../models/student.attandance.model').findOne({ student: oid(personId), dateString }).select('status').lean()
			lastLog = await require('../models/student.attandance.log.model').findOne({ student: oid(personId) }).sort({ date: -1 }).select('checkout checkInTime checkOutTime').lean()
			svc = require('./student.attandance.service')
		} else {
			const person = await userModel.findOne({ _id: oid(personId), schoolId: camera.schoolId, isActive: { $ne: false } }).select('hodimID').lean()
			idNumber = person && person.hodimID
			att = await require('../models/attandance.model').findOne({ user: oid(personId), dateString }).select('status').lean()
			lastLog = await require('../models/attandance.log.model').findOne({ user: oid(personId) }).sort({ date: -1 }).select('checkout checkInTime checkOutTime').lean()
			svc = require('./attandance.service')
		}
		if (!idNumber) return null
		const lastChangeAt = lastLog ? (lastLog.checkout ? lastLog.checkOutTime : lastLog.checkInTime) : null
		const action = match.attendanceDecision({ direction, status: att ? att.status : null, lastChangeAt, now, cooldownMin: cfg.faceAttendanceCooldownMin ?? 5 })
		if (!action) return null
		const res = await svc.checkInAttendance({
			employee_id: idNumber, where: action === 'in' ? 2 : 1, silent: !cfg.faceNotifyParents,
			comment: `Yuz tanish: ${camera.name || 'kamera'}, o'xshashlik ${r.score.toFixed(2)}, ${streak} kadr`
		}, camera.schoolId)
		if (!res || !res.success) return null
		await presenceModel.updateOne({ _id: presenceId }, { $set: { attendanceAt: now, attendanceAction: action } })
		this.streaks.set(key, { n: 0, at: now.getTime() }) // yangi harakat uchun yana ketma-ket tanilish kerak
		return action
	}

	// Sinfxonada o'qituvchi bormi: kamera bo'yicha oxirgi 15 daqiqada xodim yuzi ko'ringanmi.
	//  'present' — o'qituvchi (lavozimi yoki sinf rahbari bo'yicha) ko'rindi; 'staff' — boshqa xodim ko'rindi; 'absent' — xonada odamlar bor (oxirgi tahlilda 3+ yuz), lekin xodim ko'rinmadi;
	//  'unknown' — ma'lumot yo'q (kamera yaqinda tahlil qilinmagan yoki xonada odam yo'q). Yuz tanishga asoslangan: xodimda yuz izi bo'lmasa 'absent' xato bo'lishi mumkin
	async teachers(schoolId, cameraIds, now = new Date()) {
		const since = new Date(now.getTime() - 15 * 60 * 1000)
		const rows = cameraIds.length ? await StaffPresence.find({ schoolId: oid(schoolId), camera: { $in: cameraIds }, lastSeen: { $gte: since } }).populate('user', 'fullName position sinf').lean() : []
		const out = new Map()
		for (const cid of cameraIds) {
			const mine = rows.filter((r) => String(r.camera) === String(cid) && r.user)
			const sinfId = mine[0] && mine[0].sinfId
			const people = mine.map((r) => ({ name: r.user.fullName, position: r.user.position || '', lastSeen: r.lastSeen, teacher: TEACHER_RX.test(r.user.position || '') || (!!sinfId && String(r.user.sinf || '') === String(sinfId)) }))
			const last = this.lastRun.get(String(cid))
			const roomBusy = last && now - new Date(last.at) < 20 * 60 * 1000 && last.faces >= 3
			const state = people.some((p) => p.teacher) ? 'present' : people.length ? 'staff' : roomBusy ? 'absent' : 'unknown'
			out.set(String(cid), { state, people, lastSeen: people.length ? new Date(Math.max(...people.map((p) => new Date(p.lastSeen).getTime()))) : null })
		}
		return out
	}

	// Kunlik tozalash (cron, 03:30): biometrik ma'lumotni kerak bo'lgandan ortiq saqlamaslik va xotirani bo'shatish
	//  1) o'chirilgan yoki nofaol o'quvchilarning izlari, qo'shimcha suratlari va «ko'rindi» yozuvlari
	//  2) hech bir izga bog'lanmagan yetim yuz suratlari (uploads/face-*.jpg, 1 kundan eski)
	//  3) xotiradagi eskirgan galereya, xona ovozlari va hisoblagichlar
	async sweep() {
		const out = { templates: 0, files: 0, memory: 0 }
		const people = [...(await FaceTemplate.distinct('studentId', { kind: { $ne: 'staff' } })).map((id) => ({ id, staff: false })), ...(await FaceTemplate.distinct('studentId', { kind: 'staff' })).map((id) => ({ id, staff: true }))]
		for (let i = 0; i < people.length; i += 2000) {
			const part = people.slice(i, i + 2000)
			const ids = part.map((p) => p.id)
			const [stu, usr] = await Promise.all([
				studentModel.find({ _id: { $in: ids }, isActive: { $ne: false } }).select('_id').lean(),
				userModel.find({ _id: { $in: ids }, isActive: { $ne: false } }).select('_id').lean()
			])
			const aliveStu = new Set(stu.map((s) => String(s._id))), aliveUsr = new Set(usr.map((s) => String(s._id)))
			const chunk = part.filter((p) => !(p.staff ? aliveUsr : aliveStu).has(String(p.id))).map((p) => p.id)
			const alive = new Set(part.filter((p) => (p.staff ? aliveUsr : aliveStu).has(String(p.id))).map((p) => String(p.id)))
			const dead = chunk.filter((id) => !alive.has(String(id)))
			if (!dead.length) continue
			const rows = await FaceTemplate.find({ studentId: { $in: dead } }).select('file source').lean()
			for (const t of rows) if (t.source === 'extra' && t.file) await fs.promises.unlink(path.join(UPLOADS, path.basename(t.file))).catch(() => {})
			out.templates += (await FaceTemplate.deleteMany({ studentId: { $in: dead } })).deletedCount || 0
			await Presence.deleteMany({ student: { $in: dead } })
		}
		try {
			const used = new Set((await FaceTemplate.find({ file: { $nin: [null, ''] } }).select('file').lean()).map((t) => path.basename(t.file)))
			const cutoff = Date.now() - 24 * 3600 * 1000
			for (const f of await fs.promises.readdir(UPLOADS)) {
				if (!/^face-[a-f0-9]{24}-\d+\.jpg$/.test(f) || used.has(f)) continue
				const fp = path.join(UPLOADS, f)
				const st = await fs.promises.stat(fp).catch(() => null)
				if (st && st.isFile() && st.mtimeMs < cutoff) { await fs.promises.unlink(fp).catch(() => {}); out.files++ }
			}
		} catch { /* papka yo'q */ }
		const now = Date.now()
		for (const [k, v] of this.galleries) if (v.until < now) { this.galleries.delete(k); out.memory++ }
		for (const [k, v] of this.rooms) if (now - v.at > 3600 * 1000) { this.rooms.delete(k); out.memory++ }
		for (const [k, v] of this.lastRun) if (now - new Date(v.at).getTime() > 24 * 3600 * 1000) { this.lastRun.delete(k); out.memory++ }
		for (const [k, v] of this.autoAt) if (now - v > 24 * 3600 * 1000) { this.autoAt.delete(k); out.memory++ }
		for (const [k, v] of this.streaks) if (now - v.at > 24 * 3600 * 1000) { this.streaks.delete(k); out.memory++ }
		return out
	}

	// Kamerani tahlil qilayotganda xatolar tahlilni to'xtatmasin va jurnalni to'ldirmasin
	logError(e) {
		if (Date.now() - this.errAt > 10 * 60 * 1000) { this.errAt = Date.now(); console.log('Yuz tanish xatosi:', e.message) }
	}

	// ---------- Panel uchun ----------
	async status(schoolId) {
		const cfg = await AiSettings.get()
		const sid = oid(schoolId)
		const [students, withPhoto, byStudent, cameras, sinfs] = await Promise.all([
			studentModel.find({ schoolId: sid, isActive: { $ne: false } }).select('_id sinf').lean(),
			studentModel.countDocuments({ schoolId: sid, isActive: { $ne: false }, photo: { $nin: [null, ''] } }),
			FaceTemplate.aggregate([{ $match: { schoolId: sid, kind: { $ne: 'staff' } } }, { $group: { _id: '$studentId', n: { $sum: 1 }, extra: { $sum: { $cond: [{ $eq: ['$source', 'extra'] }, 1, 0] } }, auto: { $sum: { $cond: [{ $eq: ['$source', 'auto'] }, 1, 0] } } } }]),
			require('../models/hik.camera.model').find({ schoolId: sid, inCloud: { $ne: false }, $or: [{ role: 'monitor', sinfId: { $ne: null } }, { role: 'hall', faceDirection: { $ne: 'off' } }] }).select('_id name sinfId role faceDirection').lean(),
			sinfModel.find({ schoolId: sid }).select('name').lean()
		])
		const [staffTotal, staffWithPhoto, staffIds] = await Promise.all([
			userModel.countDocuments({ schoolId: sid, isActive: { $ne: false }, hodimID: { $nin: [null, ''] } }),
			userModel.countDocuments({ schoolId: sid, isActive: { $ne: false }, hodimID: { $nin: [null, ''] }, photo: { $nin: [null, ''] } }),
			FaceTemplate.distinct('studentId', { schoolId: sid, kind: 'staff' })
		])
		const teacher = await this.teachers(schoolId, cameras.map((c) => c._id))
		const tpl = new Map(byStudent.map((t) => [String(t._id), t]))
		const sinfName = new Map(sinfs.map((s) => [String(s._id), s.name]))
		const perClass = new Map()
		for (const s of students) {
			const k = String(s.sinf)
			const c = perClass.get(k) || { sinfId: k, name: sinfName.get(k) || '—', students: 0, enrolled: 0, rich: 0 }
			c.students++
			const t = tpl.get(String(s._id))
			if (t) { c.enrolled++; if (t.n >= 3) c.rich++ }
			perClass.set(k, c)
		}
		const classes = [...perClass.values()].sort((a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true }))
		// Aniqlik: admin tekshirganlar bo'yicha (to'g'ri / xato)
		const verdicts = await Presence.aggregate([{ $match: { schoolId: sid, verdict: { $ne: null } } }, { $group: { _id: '$verdict', n: { $sum: 1 } } }])
		const ok = verdicts.find((v) => v._id === 'ok')?.n || 0, wrong = verdicts.find((v) => v._id === 'wrong')?.n || 0
		return {
			success: true, enabled: !!cfg.faceEnabled, autoLearn: cfg.faceAutoLearn !== false,
			students: students.length, withPhoto, enrolledStudents: byStudent.length, templates: byStudent.reduce((a, t) => a + t.n, 0),
			staff: { total: staffTotal, withPhoto: staffWithPhoto, enrolled: staffIds.length },
			attendance: { enabled: !!cfg.faceAttendance, minCoverage: cfg.faceAttendanceMinCoverage ?? 0.8, hits: cfg.faceAttendanceHits, score: cfg.faceAttendanceScore, cooldownMin: cfg.faceAttendanceCooldownMin ?? 5 },
			classes, job: this.jobs.get(String(schoolId)) || null,
			accuracy: { checked: ok + wrong, correct: ok, wrong, percent: ok + wrong ? Math.round((ok / (ok + wrong)) * 1000) / 10 : null },
			settings: { threshold: cfg.faceThreshold, voteThreshold: cfg.faceVoteThreshold, margin: cfg.faceMargin, minSize: cfg.faceMinSize, minHits: cfg.faceMinHits },
			limits: { extra: MAX_EXTRA, auto: MAX_AUTO, enroll: ENROLL },
			cameras: cameras.map((c) => ({ _id: c._id, name: c.name, sinf: sinfName.get(String(c.sinfId)) || '', gate: !c.sinfId && c.faceDirection === 'out', hall: !c.sinfId, direction: c.faceDirection || 'in', last: this.lastRun.get(String(c._id)) || null, teacher: teacher.get(String(c._id)) || null }))
		}
	}

	async presence(schoolId, { sinfId = null, date = null } = {}) {
		const filter = { schoolId: oid(schoolId), dateString: date || todayStr() }
		if (sinfId && mongoose.isValidObjectId(sinfId)) filter.sinfId = oid(sinfId)
		const rows = await Presence.find(filter).sort({ firstSeen: 1 }).populate('student', 'fullName photo').populate('camera', 'name').populate('roomSinf', 'name').populate('sinfId', 'name').lean()
		return {
			success: true, date: filter.dateString,
			rows: rows.filter((r) => r.student).map((r) => ({
				_id: r._id, studentId: r.student._id, fullName: r.student.fullName, photo: r.student.photo || null, sinf: r.sinfId?.name || '', camera: r.camera?.name || '',
				room: r.roomSinf?.name || '', roomSource: r.roomSource, firstSeen: r.firstSeen, lastSeen: r.lastSeen, hits: r.hits,
				score: Math.round(r.bestScore * 100) / 100, size: Math.round(r.bestSize), status: r.status, verdict: r.verdict || null, attendanceAt: r.attendanceAt || null, attendanceAction: r.attendanceAction || (r.attendanceAt ? 'in' : null)
			}))
		}
	}

	// Yuz orqali yozilgan «kirdi» xato deb belgilansa qaytariladi: faqat shu kunning yagona kirishi bo'lsa va uni yuz tanish yozgan bo'lsa (izohdan ma'lum).
	// Terminal yoki qo'lda yozilgan davomatga tegilmaydi
	async revertAttendance(presence) {
		if (!presence.attendanceAt || presence.attendanceAction === 'out') return false
		const Attendance = require('../models/student.attandance.model')
		const Log = require('../models/student.attandance.log.model')
		const log = await Log.findOne({ student: presence.student, dateString: presence.dateString, checkin: true, comment: /^Yuz tanish/ }).lean()
		if (!log) return false
		const att = await Attendance.findOne({ student: presence.student, dateString: presence.dateString }).lean()
		if (!att || att.totalEntries !== 1 || att.status !== 'ishda') return false
		await Log.deleteOne({ _id: log._id })
		await Attendance.deleteOne({ _id: att._id })
		await Presence.updateOne({ _id: presence._id }, { $set: { attendanceAt: null } })
		return true
	}

	// Xodimlar yuz orqali ko'ringanlari (kun bo'yicha)
	async staffPresence(schoolId, { date = null } = {}) {
		const rows = await StaffPresence.find({ schoolId: oid(schoolId), dateString: date || todayStr() }).sort({ firstSeen: 1 }).populate('user', 'fullName position photo').populate('camera', 'name faceDirection').populate('sinfId', 'name').lean()
		return {
			success: true, date: date || todayStr(),
			rows: rows.filter((r) => r.user).map((r) => ({
				_id: r._id, userId: r.user._id, fullName: r.user.fullName, position: r.user.position || '', photo: r.user.photo || null, sinf: r.sinfId?.name || '', camera: r.camera?.name || '',
				direction: r.camera?.faceDirection || 'in', firstSeen: r.firstSeen, lastSeen: r.lastSeen, hits: r.hits, score: Math.round(r.bestScore * 100) / 100,
				attendanceAt: r.attendanceAt || null, attendanceAction: r.attendanceAction || null
			}))
		}
	}

	// Admin/o'qituvchi tekshiruvi: to'g'ri yoki xato. 'wrong' bo'lsa shu o'quvchining avto-izlari ishonchsiz deb tozalanadi (xato o'rganilgan bo'lishi mumkin)
	async setVerdict(schoolId, presenceId, verdict) {
		if (!['ok', 'wrong', null].includes(verdict)) return { success: false, message: "Noto'g'ri qiymat" }
		const doc = await Presence.findOneAndUpdate({ _id: oid(presenceId), schoolId: oid(schoolId) }, { $set: { verdict } }, { new: true }).lean()
		if (!doc) return { success: false, message: 'Yozuv topilmadi' }
		let reverted = false
		if (verdict === 'wrong') {
			await FaceTemplate.deleteMany({ studentId: doc.student, source: 'auto' })
			this.invalidate(schoolId)
			reverted = await this.revertAttendance(doc)
		}
		return { success: true, reverted }
	}
}

module.exports = new FaceService()
module.exports.toF32 = toF32
module.exports.checkQuality = checkQuality
