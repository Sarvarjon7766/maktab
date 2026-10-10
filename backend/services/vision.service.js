// Sinfxona kameralaridagi odamlarni sanash va AI isbotlari (yuz tanilmaydi).
//
// Tamoyillar (Hik-Connect qurilmasi sust tarmoqda ham jonli ko'rishga xalaqit bermasligi uchun):
//  - Qurilma bo'yicha NAVBAT: bitta qurilmaga (NVR) so'rovlar ketma-ket, orasida pauza bilan boradi;
//    turli qurilmalar parallel (DEVICE_PARALLEL tagacha).
//  - Qurilma xato bersa (offline / javob bermadi / Hik buluti band) shu qurilma uchun kutish vaqti
//    2 baravar oshib boradi (circuit breaker), hammasi tinchisa asta-sekin kamayadi.
//  - Qurilmada jonli ko'rish ochilsa, tahlil shu qurilmaga tegmaydi (jonli ko'rish ustuvor).
//  - Og'ir hisob (model, rasm chizish) alohida worker oqimida: server so'rovlari sekinlashmaydi.
//  - Hodisada bitta emas, bir nechta rasm: oldin / hodisa / keyin + qisqa lavha.
// O'chirish: VISION_ENABLED=0
const fs = require('fs')
const { inScope } = require('../utils/monitorScope')
const path = require('path')
const mongoose = require('mongoose')
const hikCameraModel = require('../models/hik.camera.model')
const visionMetricModel = require('../models/hik.visionmetric.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const ai = require('../ai/aiPool')
const { activityBetween } = require('../ai/activity')
const { LESSON_START, LESSON_END } = require('../utils/lessonHours')
const Snapshots = require('./hik.snapshot.service')
const HikService = require('./hikconnect.service')

const DIR = path.join(__dirname, '..', 'private', 'hik-vision')
const EVENT_DIR = path.join(__dirname, '..', 'private', 'hik-events') // isbot kadrlari umumiy galereya bilan bir joyda
// Dars soatlari (Toshkent): qoidalar va avtomatik namunalar faqat shu vaqtda ishlaydi (utils/lessonHours.js)
const LESSON = [LESSON_START, LESSON_END]
const HOURS = [6, 20] // faqat shu soatlar oralig'ida (Toshkent vaqti) tahlil qilinadi
const INTERVAL_MS = Math.max(15, Number(process.env.VISION_INTERVAL_SEC) || 60) * 1000
const STALE_MS = 5 * 60 * 1000 // shundan eski natija "eskirgan" hisoblanadi
const SMOOTH_N = 3 // jonli son — oxirgi N o'lchovning medianasi (bitta xato kadr sonni sakratmasin)

// Qurilma yuklamasi
const DEVICE_GAP_MS = Math.max(2, Number(process.env.VISION_DEVICE_GAP_SEC) || 8) * 1000 // bir qurilmadagi ketma-ket so'rovlar orasida
const DEVICE_PARALLEL = Math.max(1, Number(process.env.VISION_DEVICE_PARALLEL) || 3)
const OFFLINE_BASE_MS = 2 * 60 * 1000 // offline: 2, 4, 8, 15 daqiqa
const BUSY_BASE_MS = 60 * 1000 // javob bermadi / bulut band: 1, 2, 4, 8, 15 daqiqa
const DEVICE_MAX_MS = 15 * 60 * 1000
const CAMERA_BACKOFF_MAX_MS = 10 * 60 * 1000 // kamera darajasidagi xato (shifrlash kodi va h.k.)
// Qurilmada jonli ko'rish ochilgan bo'lsa (shuncha vaqt "ochiq" hisoblanadi), tahlil to'xtamaydi, lekin siyrakroq bo'ladi:
// har LIVE_INTERVAL_MS da bir marta. Sinfxonalar sahifasi ochilishi bilan jonli oqim boshlanadi, to'liq to'xtatish esa
// ko'rsatilayotgan tahlilni eskirtirib qo'yardi
const LIVE_PAUSE_MS = Math.max(1, Number(process.env.VISION_PAUSE_ON_LIVE_MIN) || 5) * 60 * 1000
const LIVE_INTERVAL_MS = Math.max(1, Number(process.env.VISION_LIVE_INTERVAL_MIN) || 3) * 60 * 1000

// Isbot qoidalari
const COOLDOWN_MS = 15 * 60 * 1000 // bir kamerada bir xil isbot shuncha vaqtda bir martadan ko'p olinmaydi
const SAMPLE_EVERY_MS = 30 * 60 * 1000 // hodisa bo'lmasa ham AI har 30 daqiqada tahlil namunasini saqlaydi
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000
const SURGE_MIN_DELTA = 6 // odamlar soni oldingi medianadan kamida shuncha taga ...
const SURGE_RATIO = 1.5 // ... va shuncha baravar oshsa
const SURGE_MIN_BASE = 3 // sinf allaqachon band bo'lsagina (bo'sh sinfga dars boshida kirish "keskin oshish" emas)
const EMPTY_PEAK = 5 // "bo'sh qoldi" deyish uchun avval kamida shuncha odam bo'lgan bo'lishi kerak
const EMPTY_MIN_MS = Math.max(1, Number(process.env.VISION_EMPTY_MIN) || 15) * 60 * 1000 // tanafus (5-15 daqiqa) emas, shundan uzoq bo'sh turishi kerak
const OVER_ROSTER = 4 // ro'yxatdagi o'quvchilardan shuncha ko'p odam (o'qituvchi +1 va xato +-2 hisobida)
const PRE_IMAGES = 3 // hodisadan oldingi nechta kadr rasm sifatida saqlanadi
const FOLLOW_UPS_MS = [45 * 1000, 150 * 1000] // hodisadan keyingi kadrlar (har biri shu vaqtdan keyin, navbat bilan)
const FOLLOW_UP_EXPIRE_MS = 10 * 60 * 1000
const ACTIVITY_GAP_MS = 8 * 60 * 1000 // ikki o'lchov orasi shundan uzoq bo'lsa harakat hisoblanmaydi

const SAFE_IMAGE = /^[a-f0-9]{24}(_(pre|post)\d+)?\.jpg$/
const validId = (id) => mongoose.isValidObjectId(id)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const fileOf = (cameraId) => path.join(DIR, `${cameraId}.jpg`)
const tzParts = (d = new Date()) => ({
	dateString: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(d),
	hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(d)) % 24
})
const median = (arr) => {
	const s = [...arr].sort((a, b) => a - b)
	const m = Math.floor(s.length / 2)
	return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
async function writeAtomic(file, data) {
	await fs.promises.mkdir(path.dirname(file), { recursive: true })
	const tmp = `${file}.tmp`
	await fs.promises.writeFile(tmp, data)
	await fs.promises.rename(tmp, file)
}
// Bir vaqtda `limit` tagacha vazifa
async function runPool(items, limit, fn) {
	const queue = [...items]
	await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
		while (queue.length) await fn(queue.shift()).catch((e) => console.log('Vision qurilma xatosi:', e.message))
	}))
}

// Bitta qurilmaning (NVR/kamera) sog'lig'i. fails oshgani sari kutish ham oshadi
class DeviceState {
	constructor(serial) { this.serial = serial; this.fails = 0; this.until = 0; this.kind = null; this.at = null; this.lastCapture = 0 }
	get down() { return this.until > Date.now() && !!this.kind }
	success() {
		if (this.fails > 0) {
			this.fails--
			if (this.fails === 0) console.log(`Vision: qurilma ${this.serial} tiklandi`)
		}
		this.kind = null
		// Yaqinda xato bo'lgan qurilmani asta-sekin tiklaymiz: har qolgan "xato" uchun 30 soniya qo'shimcha pauza
		this.until = this.fails ? Date.now() + this.fails * 30 * 1000 : 0
	}
	failure(kind) {
		const first = this.fails === 0
		this.fails = Math.min(this.fails + 1, 6)
		const base = kind === 'offline' ? OFFLINE_BASE_MS : BUSY_BASE_MS
		const wait = Math.min(DEVICE_MAX_MS, base * 2 ** (this.fails - 1))
		this.until = Date.now() + wait
		this.kind = kind
		this.at = new Date()
		if (first) console.log(`Vision: qurilma ${this.serial} ${kind === 'offline' ? 'Hik bulutida offline' : 'javob bermayapti (tarmoq sust yoki bulut band)'}, ${Math.round(wait / 60000)} daqiqa kutiladi`)
	}
}

class VisionService {
	constructor() {
		this.timer = null
		this.running = false
		this.devices = new Map() // serial -> DeviceState
		this.failures = new Map() // camera -> { n, until } (kamera darajasidagi xatolar)
		this.lastError = new Map() // camera -> { at, message }: oxirgi muvaffaqiyatsiz urinish sababi (sahifada ko'rsatiladi)
		this.hist = new Map() // camera -> [{ t, count }] oxirgi 60 o'lchov (xotirada)
		this.frames = new Map() // camera -> [{ jpeg, t, count }] oxirgi 6 tahlil kadri (lavha va oldingi rasmlar uchun)
		this.state = new Map() // camera -> { emptyFired }
		this.cooldown = new Map() // camera:kind -> vaqt
		this.lastSample = new Map() // camera -> oxirgi avtomatik namuna vaqti
		this.rosters = new Map() // sinfId -> { n, name, until }
		this.followUps = [] // hodisadan keyingi kadrlar navbati
		this.prevBoxes = new Map() // camera -> { t, boxes }: harakat (faollik) hisoblash uchun oldingi kadr
		this.lastPurge = 0
		this.lastCycle = null
	}

	deviceFor(serial) {
		if (!this.devices.has(serial)) this.devices.set(serial, new DeviceState(serial))
		return this.devices.get(serial)
	}

	classify(error) {
		if (error?.name === 'AiError') return 'other'
		if (HikService.isOfflineError(error)) return 'offline'
		if (HikService.isBusyError(error)) return 'busy'
		if (error?.reason) return 'camera' // kadr xatosi: shifrlash kodi noto'g'ri va h.k.
		return 'other'
	}

	// Oldingi kadrga nisbatan harakat (0..1); oldingi kadr ACTIVITY_GAP_MS dan eski yoki yo'q bo'lsa null.
	// Oldingi kadr xotirada bo'lmasa (server qayta ishga tushgan) oxirgi o'lchovdan bazadan tiklanadi
	async activityOf(camera, result, now) {
		const key = String(camera._id)
		let prev = this.prevBoxes.get(key)
		this.prevBoxes.set(key, { t: now, boxes: result.boxes })
		if (!prev) {
			const last = await visionMetricModel.findOne({ camera: camera._id }).sort({ time: -1 }).select('time boxes').lean()
			if (last && Array.isArray(last.boxes)) {
				const boxes = []
				for (let k = 0; k + 3 < last.boxes.length; k += 4) boxes.push({ x1: last.boxes[k], y1: last.boxes[k + 1], x2: last.boxes[k + 2], y2: last.boxes[k + 3] })
				prev = { t: last.time, boxes }
			}
		}
		if (!prev || now - prev.t > ACTIVITY_GAP_MS) return null
		const a = activityBetween(prev.boxes, result.boxes)
		return a === null ? null : Math.round(a * 1000) / 1000
	}

	// Bitta kamerani tahlil qiladi va natijani yozadi. followUp berilsa — hodisaning keyingi kadri
	async analyze(camera, followUp = null) {
		const started = Date.now()
		const buf = await Snapshots.captureBuffer(camera)
		const result = await ai.detect(buf)
		const now = new Date()
		const { dateString, hour } = tzParts(now)
		const activity = await this.activityOf(camera, result, now)
		await visionMetricModel.create({
			schoolId: camera.schoolId, camera: camera._id, sinfId: camera.sinfId || null,
			count: result.count, activity, boxes: result.boxes.flatMap((b) => [b.x1, b.y1, b.x2, b.y2]), time: now, hour, dateString, ms: Date.now() - started
		})
		// Panel uchun oxirgi tahlil kadri (qutilar bilan)
		await ai.smallFrame(buf, result, 1280, '#22c55e', 72)
			.then((jpeg) => writeAtomic(fileOf(String(camera._id)), jpeg))
			.catch((e) => console.log('Vision kadr saqlash xatosi:', e.message))
		await this.observe(camera, buf, result, now).catch((e) => console.log('Vision isbot xatosi:', e.message))
		if (followUp) await this.attachFollowUp(followUp, buf, result, now).catch((e) => console.log('Vision keyingi kadr xatosi:', e.message))
		return result.count
	}

	async rosterOf(camera) {
		if (!camera.sinfId) return { n: 0, name: '' }
		const key = String(camera.sinfId)
		const cached = this.rosters.get(key)
		if (cached && cached.until > Date.now()) return cached
		const [n, sinf] = await Promise.all([
			studentModel.countDocuments({ schoolId: camera.schoolId, sinf: camera.sinfId, isActive: { $ne: false } }),
			sinfModel.findById(camera.sinfId).select('name').lean()
		])
		const entry = { n, name: sinf?.name || '', until: Date.now() + 10 * 60 * 1000 }
		this.rosters.set(key, entry)
		return entry
	}

	// Har o'lchovdan keyin: tarixni yangilaydi, qoidalarni tekshiradi va topilsa isbotni avtomatik saqlaydi
	async observe(camera, buf, result, now) {
		const key = String(camera._id)
		const hist = this.hist.get(key) || []
		const prev = hist.filter((p) => now - p.t <= 30 * 60 * 1000) // eskirgan (uzilishdan oldingi) tarix hisobga olinmaydi
		hist.push({ t: now, count: result.count })
		while (hist.length > 60) hist.shift()
		this.hist.set(key, hist)
		const frames = this.frames.get(key) || []
		frames.push({ jpeg: await ai.smallFrame(buf, result, 640), t: now, count: result.count })
		while (frames.length > 6) frames.shift()
		this.frames.set(key, frames)

		const state = this.state.get(key) || { emptyFired: false }
		this.state.set(key, state)
		if (result.count > 0) state.emptyFired = false

		const { hour } = tzParts(now)
		if (hour < LESSON[0] || hour >= LESSON[1]) return
		const roster = await this.rosterOf(camera)
		const finding = this.evaluate(result.count, prev, roster, state, now)
		if (!finding) {
			// Hodisa yo'q: AI baribir tahlil qilganini isbotlash uchun vaqti-vaqti bilan namuna kadr saqlaydi (lavhasiz)
			if (!this.lastSample.has(key)) {
				const lastDb = await hikCameraEventModel.findOne({ camera: camera._id, kind: 'vision_sample' }).sort({ time: -1 }).select('time').lean()
				this.lastSample.set(key, lastDb ? new Date(lastDb.time).getTime() : 0)
			}
			if (now - this.lastSample.get(key) >= SAMPLE_EVERY_MS) {
				this.lastSample.set(key, now.getTime())
				const detail = roster.n ? `${result.count} odam · sinf ro'yxatida ${roster.n} o'quvchi · holat me'yorda` : `${result.count} odam · holat me'yorda`
				await this.emit(camera, buf, result, now, { kind: 'vision_sample', title: 'Avtomatik kuzatuv namunasi', detail }, hist, [], roster)
			}
			return
		}
		if (finding.kind === 'vision_empty') state.emptyFired = true
		else {
			const ck = `${key}:${finding.kind}`
			if (now - (this.cooldown.get(ck) || 0) < COOLDOWN_MS) return
			this.cooldown.set(ck, now.getTime())
		}
		await this.emit(camera, buf, result, now, finding, hist, frames, roster)
	}

	// Qoidalar. prev — shu kameraning oldingi o'lchovlari (oxirgi 30 daqiqa), count — hozirgi
	evaluate(count, prev, roster, state, now) {
		const last = prev[prev.length - 1]
		const peak = Math.max(0, ...prev.map((p) => p.count))

		// 1) Dars vaqtida sinf uzoq bo'sh qoldi: oxirgi o'lchovlar ketma-ket nol va kamida EMPTY_MIN_MS davom etgan
		// (tanafusda bolalar chiqib ketishi odatiy, shuning uchun qisqa bo'shlik hisobga olinmaydi), avval odam bo'lgan
		if (count === 0 && peak >= EMPTY_PEAK && !state.emptyFired) {
			let since = null
			for (let i = prev.length - 1; i >= 0 && prev[i].count === 0; i--) since = prev[i].t
			if (since && now - since >= EMPTY_MIN_MS) {
				return { kind: 'vision_empty', title: "Sinf bo'sh qoldi", detail: `Dars vaqtida ${Math.round((now - since) / 60000)} daqiqadan beri kamerada 0 odam. Oldin eng ko'pi: ${peak} odam` }
			}
		}
		// 2) Ro'yxatdagidan ortiq odam: ketma-ket 2 o'lchovda
		if (roster.n >= 5 && count >= roster.n + OVER_ROSTER && last && last.count >= roster.n + OVER_ROSTER) {
			return { kind: 'vision_overcrowd', title: 'Sinfda ortiqcha odam', detail: `Kamerada ${count} odam, sinf ro'yxatida ${roster.n} o'quvchi (o'qituvchi hisobiga +1)` }
		}
		// 3) Odamlar soni keskin oshdi: oxirgi 3 o'lchov medianasiga nisbatan
		if (prev.length >= 3) {
			const med = median(prev.slice(-3).map((p) => p.count))
			if (med >= SURGE_MIN_BASE && count - med >= SURGE_MIN_DELTA && count >= med * SURGE_RATIO) {
				return { kind: 'vision_surge', title: 'Odamlar soni keskin oshdi', detail: `${med} → ${count} odam (so'nggi daqiqalarda). Zichlik yoki to'planish bo'lishi mumkin` }
			}
		}
		return null
	}

	// Isbotni chizib saqlaydi: hodisa kadri (sabab va chizma bilan), hodisadan oldingi kadrlar va qisqa lavha.
	// Hodisadan keyingi kadrlar keyinroq navbat bilan qo'shiladi (attachFollowUp)
	async emit(camera, buf, result, now, finding, hist, frames, roster) {
		const id = new mongoose.Types.ObjectId()
		const isSample = finding.kind === 'vision_sample'
		const { dateString, hour } = tzParts(now)
		const image = await ai.renderEvidence({ buf, result, kind: finding.kind, title: finding.title, detail: finding.detail, history: hist, cameraName: camera.name, sinfName: roster.name, at: now })
		await writeAtomic(path.join(EVENT_DIR, `${id}.jpg`), image)

		const images = []
		let clip = null
		if (!isSample) {
			const pre = frames.slice(0, -1).slice(-PRE_IMAGES)
			for (let k = 0; k < pre.length; k++) {
				const file = `${id}_pre${k}.jpg`
				await writeAtomic(path.join(EVENT_DIR, file), pre[k].jpeg)
				images.push({ file, label: 'oldin', t: pre[k].t, count: pre[k].count })
			}
			images.push({ file: `${id}.jpg`, label: 'hodisa', t: now, count: result.count })
			if (frames.length >= 3) {
				clip = await ai.renderClip(frames, { kind: finding.kind, title: finding.title })
				await writeAtomic(path.join(EVENT_DIR, `${id}.webp`), clip)
			}
		}
		await hikCameraEventModel.create({
			_id: id, schoolId: camera.schoolId, accountId: camera.accountId, camera: camera._id, sinfId: camera.sinfId || null,
			guid: `vision-${camera._id}-${finding.kind}-${now.getTime()}`, eventType: 0, kind: finding.kind, time: now, hour, dateString,
			snapshot: `${id}.jpg`, snapshotAt: now, title: finding.title, detail: finding.detail, count: result.count,
			clip: clip ? `${id}.webp` : null, images
		})
		if (!isSample && camera.serial) {
			FOLLOW_UPS_MS.forEach((after, i) => this.followUps.push({
				serial: camera.serial, camera, eventId: id, kind: finding.kind, title: finding.title,
				due: now.getTime() + after, n: i + 1, last: i === FOLLOW_UPS_MS.length - 1, frames: [...frames]
			}))
		}
		console.log(`Vision isbot: ${finding.title} (${camera.name || camera._id}, ${result.count} odam, ${images.length || 1} rasm)`)
	}

	// Hodisadan keyingi kadr: rasm sifatida qo'shiladi, oxirgisidan keyin lavha butun ketma-ketlik bilan qayta yig'iladi
	async attachFollowUp(fu, buf, result, now) {
		const file = `${fu.eventId}_post${fu.n}.jpg`
		await writeAtomic(path.join(EVENT_DIR, file), await ai.smallFrame(buf, result, 960, '#22c55e', 70))
		await hikCameraEventModel.updateOne({ _id: fu.eventId }, { $push: { images: { file, label: 'keyin', t: now, count: result.count } } })
		fu.frames.push({ jpeg: await ai.smallFrame(buf, result, 640), t: now, count: result.count })
		if (fu.last || fu.frames.length >= 8) {
			const clip = await ai.renderClip(fu.frames.slice(-8), { kind: fu.kind, title: fu.title })
			await writeAtomic(path.join(EVENT_DIR, `${fu.eventId}.webp`), clip)
			await hikCameraEventModel.updateOne({ _id: fu.eventId }, { $set: { clip: `${fu.eventId}.webp` } })
		}
	}

	// Bitta qurilma: kameralari ketma-ket (orasida pauza), keyin shu qurilmaga tegishli keyingi kadrlar
	async runDevice(serial, cameras) {
		const dev = this.deviceFor(serial)
		const stats = { ok: 0, failed: 0, skipped: 0 }
		if (dev.until > Date.now()) { stats.skipped = cameras.length; return stats }

		let first = true
		// Jonli ko'rish ochiq bo'lsa tahlil davom etadi, lekin qurilmaga so'rov siyrakroq (LIVE_INTERVAL_MS) yuboriladi
		const guard = () => !HikService.liveActive(serial, LIVE_PAUSE_MS) || Date.now() - dev.lastCapture >= LIVE_INTERVAL_MS
		const handle = async (camera, fu) => {
			const key = String(camera._id)
			dev.lastCapture = Date.now()
			try {
				await this.analyze(camera, fu)
				dev.success()
				this.failures.delete(key)
				this.lastError.delete(key)
				stats.ok++
				return true
			} catch (error) {
				const kind = this.classify(error)
				this.lastError.set(key, { at: new Date(), message: HikService.friendly(error.message) })
				stats.failed++
				if (kind === 'offline' || kind === 'busy') {
					// Qurilma darajasidagi xato: qolgan kameralarga ham tegmaymiz, kutish vaqti oshadi
					dev.failure(kind)
					if (kind === 'offline') await hikCameraModel.updateMany({ accountId: camera.accountId, serial }, { $set: { online: false } }).catch(() => {})
					return false
				}
				// Kamera darajasidagi xato: faqat shu kamera uchun kutish (1, 2, 4 ... 10 daqiqa)
				const prev = this.failures.get(key)
				const n = (prev?.n || 0) + 1
				this.failures.set(key, { n, until: Date.now() + Math.min(CAMERA_BACKOFF_MAX_MS, INTERVAL_MS * 2 ** (n - 1)) })
				if (n === 1 || n % 10 === 0) console.log(`Vision xatosi (${camera.name || key}):`, error.reason || error.message)
				return true
			}
		}

		for (const camera of cameras) {
			if (!guard()) { stats.skipped++; break }
			const f = this.failures.get(String(camera._id))
			if (f && f.until > Date.now()) { stats.skipped++; continue }
			if (!first) await sleep(DEVICE_GAP_MS)
			first = false
			if (!(await handle(camera, null))) return stats
		}

		// Hodisadan keyingi kadrlar (xuddi shu navbat va pauza bilan)
		const now = Date.now()
		this.followUps = this.followUps.filter((f) => now - f.due < FOLLOW_UP_EXPIRE_MS) // eskirganlari tashlanadi
		const due = this.followUps.filter((f) => f.serial === serial && f.due <= now)
		for (const fu of due) {
			if (!guard()) break
			this.followUps = this.followUps.filter((f) => f !== fu)
			if (!first) await sleep(DEVICE_GAP_MS)
			first = false
			if (!(await handle(fu.camera, fu))) break
		}
		return stats
	}

	// Faol ro'yxatda yo'q kameralar/qurilmalar holatini xotiradan chiqaradi (o'chirilgan kameralar xotirani to'ldirmasin)
	evictInactive(cameras) {
		const ids = new Set(cameras.map((c) => String(c._id)))
		const serials = new Set(cameras.map((c) => c.serial))
		for (const fu of this.followUps) serials.add(fu.serial)
		for (const m of [this.failures, this.lastError, this.hist, this.frames, this.state, this.lastSample, this.prevBoxes]) {
			for (const k of m.keys()) if (!ids.has(k)) m.delete(k)
		}
		for (const k of this.cooldown.keys()) if (!ids.has(k.split(':')[0])) this.cooldown.delete(k)
		for (const k of this.devices.keys()) if (!serials.has(k)) this.devices.delete(k)
	}

	async cycle() {
		if (this.running) return
		this.running = true
		try {
			const { hour } = tzParts()
			if (hour < HOURS[0] || hour >= HOURS[1]) return
			const cameras = await hikCameraModel.find({
				visionEnabled: true, inCloud: { $ne: false }, online: { $ne: false },
				schoolId: { $ne: null }, role: 'monitor', serial: { $ne: '' }
			}).lean()
			this.evictInactive(cameras)
			const byDevice = new Map()
			for (const c of cameras) {
				if (!byDevice.has(c.serial)) byDevice.set(c.serial, [])
				byDevice.get(c.serial).push(c)
			}
			// Kutayotgan keyingi kadrlari bor qurilmalar kameralari bo'lmasa ham ishlanadi
			for (const fu of this.followUps) if (!byDevice.has(fu.serial)) byDevice.set(fu.serial, [])
			const total = { cameras: cameras.length, ok: 0, failed: 0, skipped: 0 }
			await runPool([...byDevice.entries()], DEVICE_PARALLEL, async ([serial, list]) => {
				const s = await this.runDevice(serial, list)
				total.ok += s.ok; total.failed += s.failed; total.skipped += s.skipped
			})
			this.lastCycle = { at: new Date(), ...total }
			if (Date.now() - this.lastPurge > PURGE_EVERY_MS) await this.purge().catch((e) => console.log('Vision tozalash xatosi:', e.message))
		} catch (error) {
			console.log('Vision sikl xatosi:', error.message)
		} finally {
			this.running = false
		}
	}

	stop() {
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
		this.stopped = true
	}

	start() {
		this.stopped = false
		if (this.timer || process.env.VISION_ENABLED === '0') return
		// setInterval emas: sikl tugamasdan keyingisi boshlanmasligi uchun zanjirli setTimeout
		const loop = async () => {
			await this.cycle()
			if (this.stopped) return
			this.timer = setTimeout(loop, INTERVAL_MS)
		}
		this.timer = setTimeout(loop, 20000)
		console.log(`Vision: odam sanash yoqildi (har ${INTERVAL_MS / 1000}s, ${HOURS[0]}:00–${HOURS[1]}:00, qurilma pauzasi ${DEVICE_GAP_MS / 1000}s)`)
	}

	// Muddati o'tgan isbotlarni (rasm va lavha fayllari bilan) o'chiradi: muddatlar platforma sozlamalaridan olinadi (services/retention.service.js)
	async purge() {
		await require('./retention.service').run({ maxBatches: 10 })
		this.lastPurge = Date.now()
	}

	mapEvidence(e) {
		return {
			_id: e._id, kind: e.kind, time: e.time, camera: e.camera?.name || '', sinf: e.sinfId?.name || '', sinfId: e.sinfId?._id || null,
			title: e.title || '', detail: e.detail || '', count: e.count ?? null, hasClip: !!e.clip,
			images: (e.images || []).map((i) => ({ label: i.label, t: i.t, count: i.count }))
		}
	}

	// "Aqlli kuzatuv" sahifasi uchun jamlama: kun bo'yicha ko'rsatkichlar, muhim hodisalar (oxirgi 8 ta) va har sinf uchun
	// lahzalar soni + eng oxirgisi. Hamma kadrlarni emas, faqat xulosani beradi; to'liq ro'yxat `evidence()` orqali (batafsil ko'rish)
	async summary(schoolId, date = null) {
		const ALERTS = ['vision_empty', 'vision_surge', 'vision_overcrowd']
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tzParts().dateString
		const base = { schoolId: school, dateString: day, kind: { $in: [...ALERTS, 'vision_sample'] } }
		const [perSinf, lastIds, alerts, cams, lastMetric] = await Promise.all([
			hikCameraEventModel.aggregate([{ $match: base }, { $group: { _id: '$sinfId', total: { $sum: 1 }, alerts: { $sum: { $cond: [{ $in: ['$kind', ALERTS] }, 1, 0] } } } }]),
			hikCameraEventModel.aggregate([{ $match: base }, { $sort: { time: -1 } }, { $group: { _id: '$sinfId', id: { $first: '$_id' } } }]),
			hikCameraEventModel.find({ ...base, kind: { $in: ALERTS } }).sort({ time: -1 }).limit(8)
				.populate('camera', 'name').populate('sinfId', 'name').select('kind time camera sinfId title detail count clip images scene').lean(),
			hikCameraModel.find({ schoolId, visionEnabled: true, role: 'monitor' }).select('name sinfId online').populate('sinfId', 'name').lean(),
			visionMetricModel.findOne({ schoolId: school }).sort({ time: -1 }).select('time').lean()
		])
		const lastRows = await hikCameraEventModel.find({ _id: { $in: lastIds.map((x) => x.id) } })
			.populate('camera', 'name').populate('sinfId', 'name').select('kind time camera sinfId title detail count clip images scene').lean()
		const lastBySinf = new Map(lastRows.map((e) => [String(e.sinfId?._id || ''), this.mapEvidence(e)]))
		const counts = new Map(perSinf.map((x) => [String(x._id || ''), x]))
		const classes = new Map()
		for (const c of cams) {
			const k = String(c.sinfId?._id || '')
			if (!k) continue
			if (!classes.has(k)) classes.set(k, { sinfId: c.sinfId._id, sinf: c.sinfId.name, cameras: [], online: false })
			const x = classes.get(k)
			x.cameras.push(c.name)
			x.online = x.online || c.online === true
		}
		for (const e of lastRows) { // kamerasi endi o'chirilgan, lekin lahzalari bor sinflar
			const k = String(e.sinfId?._id || '')
			if (k && !classes.has(k)) classes.set(k, { sinfId: e.sinfId._id, sinf: e.sinfId.name, cameras: [], online: false })
		}
		const list = [...classes.entries()].map(([k, x]) => ({ ...x, total: counts.get(k)?.total || 0, alerts: counts.get(k)?.alerts || 0, last: lastBySinf.get(k) || null }))
			.sort((a, b) => b.alerts - a.alerts || a.sinf.localeCompare(b.sinf, 'uz', { numeric: true }))
		const totalAlerts = perSinf.reduce((a, x) => a + x.alerts, 0)
		const totalAll = perSinf.reduce((a, x) => a + x.total, 0)
		return {
			success: true, date: day,
			totals: { alerts: totalAlerts, samples: totalAll - totalAlerts, classes: classes.size, lastAt: lastMetric?.time || null },
			alerts: alerts.map((e) => this.mapEvidence(e)), classes: list
		}
	}

	// Har sinf uchun eng oxirgi `per` ta kuzatuv lahzasi (sinfxonalar ro'yxati sahifasi uchun)
	async evidenceRecent(schoolId, { date = null, per = 4 } = {}) {
		const base = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), kind: { $in: ['vision_empty', 'vision_surge', 'vision_overcrowd', 'vision_sample'] } }
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) base.dateString = date
		const grouped = await hikCameraEventModel.aggregate([
			{ $match: base }, { $sort: { time: -1 } },
			{ $group: { _id: '$sinfId', ids: { $push: '$_id' } } },
			{ $project: { ids: { $slice: ['$ids', Math.max(1, Math.min(12, Number(per) || 4))] } } }
		])
		const rows = await hikCameraEventModel.find({ _id: { $in: grouped.flatMap((g) => g.ids) } }).sort({ time: -1 })
			.populate('camera', 'name').populate('sinfId', 'name').select('kind time camera sinfId title detail count clip images scene').lean()
		const bySinf = {}
		for (const e of rows) {
			const k = String(e.sinfId?._id || '')
			if (!k) continue
			;(bySinf[k] = bySinf[k] || []).push(this.mapEvidence(e))
		}
		// Har sinfdagi jami lahzalar va muhim hodisalar soni ("Batafsil ko'rish (N)" uchun)
		const cnt = await hikCameraEventModel.aggregate([{ $match: base }, { $group: { _id: '$sinfId', total: { $sum: 1 }, alerts: { $sum: { $cond: [{ $ne: ['$kind', 'vision_sample'] }, 1, 0] } } } }])
		const counts = Object.fromEntries(cnt.filter(x => x._id).map(x => [String(x._id), { total: x.total, alerts: x.alerts }]))
		return { success: true, bySinf, counts }
	}

	// Kuzatuv lahzalari ro'yxati (sahifalab): sana, sinf va guruh (alerts | samples | hammasi) bo'yicha
	async evidence(schoolId, { date = null, sinfId = null, group = 'all', page = 1 } = {}) {
		const base = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), kind: { $in: ['vision_empty', 'vision_surge', 'vision_overcrowd', 'vision_sample'] } }
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) base.dateString = date
		if (sinfId) {
			if (!validId(sinfId)) return { success: false, message: "Sinf id noto'g'ri" }
			base.sinfId = new mongoose.Types.ObjectId(String(sinfId))
		}
		const match = { ...base }
		if (group === 'alerts') match.kind = { $in: ['vision_empty', 'vision_surge', 'vision_overcrowd'] }
		else if (group === 'samples') match.kind = 'vision_sample'
		const size = 24
		const current = Math.max(1, Number(page) || 1)
		const [total, rows, kinds] = await Promise.all([
			hikCameraEventModel.countDocuments(match),
			hikCameraEventModel.find(match).sort({ time: -1 }).skip((current - 1) * size).limit(size)
				.populate('camera', 'name').populate('sinfId', 'name').select('kind time camera sinfId title detail count clip images scene').lean(),
			hikCameraEventModel.aggregate([{ $match: base }, { $group: { _id: '$kind', n: { $sum: 1 } } }])
		])
		return {
			success: true, total, page: current, pages: Math.max(1, Math.ceil(total / size)),
			byKind: Object.fromEntries(kinds.map((k) => [k._id, k.n])),
			items: rows.map((e) => this.mapEvidence(e))
		}
	}

	async canSee(event, user) {
		const platformWide = user.role === 'superadmin' || (user.role === 'monitor' && inScope(event.schoolId))
		return platformWide || String(event.schoolId) === String(user.school)
	}

	// Isbot lavhasi (huquq tekshiruvi bilan)
	async clipFor(eventId, user) {
		if (!validId(eventId)) return null
		const event = await hikCameraEventModel.findById(eventId).select('schoolId clip').lean()
		if (!event?.clip || !(await this.canSee(event, user))) return null
		const file = path.join(EVENT_DIR, `${eventId}.webp`)
		return fs.existsSync(file) ? file : null
	}

	// Isbotning idx-chi rasmi (oldin / hodisa / keyin)
	async imageFor(eventId, idx, user) {
		if (!validId(eventId) || !Number.isInteger(idx) || idx < 0) return null
		const event = await hikCameraEventModel.findById(eventId).select('schoolId images').lean()
		const name = event?.images?.[idx]?.file
		if (!name || !SAFE_IMAGE.test(name) || !(await this.canSee(event, user))) return null
		const file = path.join(EVENT_DIR, name)
		return fs.existsSync(file) ? file : null
	}

	// Maktabdagi vision kameralarining hozirgi holati: sinf bo'yicha silliqlangan son va oxirgi soat qatori
	async live(schoolId) {
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const cameras = await hikCameraModel.find({ schoolId, visionEnabled: true, role: 'monitor' }).select('name sinfId online serial').lean()
		if (!cameras.length) return { success: true, items: [], intervalSec: INTERVAL_MS / 1000 }
		const since = new Date(Date.now() - 60 * 60 * 1000)
		const rows = await visionMetricModel.find({ schoolId: school, camera: { $in: cameras.map((c) => c._id) }, time: { $gte: since } })
			.sort({ time: 1 }).select('camera count time activity').lean()
		const byCam = new Map()
		for (const r of rows) {
			const k = String(r.camera)
			if (!byCam.has(k)) byCam.set(k, [])
			byCam.get(k).push(r)
		}
		const items = cameras.map((c) => {
			const list = byCam.get(String(c._id)) || []
			const last = list[list.length - 1]
			const dev = c.serial ? this.devices.get(c.serial) : null
			const le = this.lastError.get(String(c._id))
			const recent = list.filter((r) => Date.now() - r.time.getTime() <= STALE_MS).slice(-SMOOTH_N)
			const acts = list.filter((r) => Date.now() - r.time.getTime() <= 15 * 60 * 1000 && r.count > 0 && typeof r.activity === 'number').map((r) => r.activity)
			return {
				cameraId: c._id, name: c.name, role: c.role || 'monitor', sinfId: c.sinfId || null, online: c.online,
				count: recent.length ? median(recent.map((r) => r.count)) : null,
				lastCount: last ? last.count : null,
				activity: acts.length ? Math.round(acts.reduce((a, b) => a + b, 0) / acts.length * 1000) / 1000 : null,
				at: last ? last.time : null,
				stale: !last || Date.now() - last.time.getTime() > STALE_MS,
				series: list.map((r) => ({ t: r.time, count: r.count })),
				hasFrame: fs.existsSync(fileOf(String(c._id))),
				// Oxirgi urinish muvaffaqiyatsiz bo'lsa sababi (qurilma offline / javob bermadi / jonli ko'rish ochiq)
				error: dev?.down ? { message: HikService.friendly(dev.kind === 'offline' ? 'EVZ20007' : 'OPEN000555'), at: dev.at } : le ? { message: le.message, at: le.at } : null
			}
		})
		return { success: true, items, intervalSec: INTERVAL_MS / 1000 }
	}

	// Kun bo'yicha soatlik o'rtacha va eng ko'p son (sinf bo'yicha; bir sinfda bir nechta kamera bo'lsa eng kattasi)
	async day(schoolId, dateString, sinfId = null) {
		const match = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), dateString }
		if (sinfId) {
			if (!validId(sinfId)) return { success: false, message: "Sinf id noto'g'ri" }
			match.sinfId = new mongoose.Types.ObjectId(String(sinfId))
		}
		const rows = await visionMetricModel.aggregate([
			{ $match: match },
			{ $group: { _id: { sinf: '$sinfId', camera: '$camera', hour: '$hour' }, avg: { $avg: '$count' }, max: { $max: '$count' }, n: { $sum: 1 } } }
		])
		const sinfs = new Map()
		for (const r of rows) {
			const k = String(r._id.sinf)
			if (!sinfs.has(k)) sinfs.set(k, Array.from({ length: 24 }, () => ({ avg: 0, max: 0 })))
			const slot = sinfs.get(k)[r._id.hour]
			slot.avg = Math.max(slot.avg, Math.round(r.avg * 10) / 10)
			slot.max = Math.max(slot.max, r.max)
		}
		return { success: true, dateString, sinfs: Object.fromEntries(sinfs) }
	}

	// Kameraning oxirgi tahlil kadri (huquq tekshiruvi bilan). Fayl yo'lini qaytaradi yoki null
	async frameFor(cameraId, user) {
		if (!validId(cameraId)) return null
		const camera = await hikCameraModel.findById(cameraId).select('schoolId').lean()
		if (!camera?.schoolId || !(await this.canSee(camera, user))) return null
		const file = fileOf(String(cameraId))
		return fs.existsSync(file) ? file : null
	}
}

module.exports = new VisionService()
