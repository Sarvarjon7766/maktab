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
const AiSettings = require('./ai.settings.service')
const { ALERT_KINDS, ALL_KINDS } = require('../ai/kinds')
const { activityBetween } = require('../ai/activity')
const { LESSON_START, LESSON_END } = require('../utils/lessonHours')
const Snapshots = require('./hik.snapshot.service')
const HikService = require('./hikconnect.service')
const schedule = require('../ai/schedule')
const { monitorEventLoopDelay } = require('perf_hooks')

const DIR = path.join(__dirname, '..', 'private', 'hik-vision')
const EVENT_DIR = path.join(__dirname, '..', 'private', 'hik-events') // isbot kadrlari umumiy galereya bilan bir joyda
// Dars soatlari (Toshkent): qoidalar va avtomatik namunalar faqat shu vaqtda ishlaydi (utils/lessonHours.js)
const LESSON = [LESSON_START, LESSON_END]
const HOURS = [6, 20] // faqat shu soatlar oralig'ida (Toshkent vaqti) tahlil qilinadi
let INTERVAL_MS = 60 * 1000 // tizim egasi panelidagi 'intervalSec' bilan har siklda yangilanadi (refreshCfg)
const STALE_MS = 5 * 60 * 1000 // shundan eski natija "eskirgan" hisoblanadi
const SMOOTH_N = 3 // jonli son — oxirgi N o'lchovning medianasi (bitta xato kadr sonni sakratmasin)

// Qurilma yuklamasi
let DEVICE_GAP_MS = 8 * 1000 // bir qurilmadagi ketma-ket so'rovlar orasida
let DEVICE_PARALLEL = 3
let TICK_MS = 60 * 1000 // sikl shuncha tez-tez uyg'onadi (kamera turi oraliqlarining eng qisqasi)
// Tizim egasi panelidagi (AI sozlamalari) qiymatlarni o'qib, tahlil tezligini yangilaydi
async function refreshCfg() {
	const cfg = await AiSettings.get()
	INTERVAL_MS = Math.max(15, Number(cfg.intervalSec) || 60) * 1000
	DEVICE_GAP_MS = Math.max(2, Number(cfg.deviceGapSec) || 8) * 1000
	DEVICE_PARALLEL = Math.max(1, Number(cfg.deviceParallel) || 3)
	TICK_MS = schedule.tickMs(cfg, INTERVAL_MS)
	return cfg
}
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
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000
const SURGE_MIN_DELTA = 6 // odamlar soni oldingi medianadan kamida shuncha taga ...
const SURGE_RATIO = 1.5 // ... va shuncha baravar oshsa
const SURGE_MIN_BASE = 3 // sinf allaqachon band bo'lsagina (bo'sh sinfga dars boshida kirish "keskin oshish" emas)
const EMPTY_PEAK = 5 // "bo'sh qoldi" deyish uchun avval kamida shuncha odam bo'lgan bo'lishi kerak
const OVER_ROSTER = 4 // ro'yxatdagi o'quvchilardan shuncha ko'p odam (o'qituvchi +1 va xato +-2 hisobida)
const PRE_IMAGES = 3 // hodisadan oldingi nechta kadr rasm sifatida saqlanadi
const FOLLOW_UPS_MS = [45 * 1000, 150 * 1000] // hodisadan keyingi kadrlar (har biri shu vaqtdan keyin, navbat bilan)
const FOLLOW_UP_EXPIRE_MS = 10 * 60 * 1000
// Ikki o'lchov orasi shundan uzoq bo'lsa harakat hisoblanmaydi: oraliq cho'zilgan sari odamlar tabiiy ravishda joyini o'zgartiradi (o'lchov: 4 daqiqadan uzoqda "faollik" 31% hollarda 0.6 dan oshadi, 2 daqiqagacha 9–13%), shuning uchun yolg'on "sinf notinch" chiqmasin
const ACTIVITY_GAP_MS = 3 * 60 * 1000
const CYCLE_WATCHDOG_MS = 30 * 60 * 1000
const MASS_SHARE = 0.55 // holati aniqlangan odamlarning shuncha ulushi tik turgan bo'lsa "ko'pchilik o'rnidan turgan"
const MASS_MIN = 6 // ... va kamida shuncha odamning holati aniqlangan bo'lsa
const POSE_SELECT = 'kind time camera sinfId title detail count clip images scene pose'
// Holatlar soni: eski yozuvlarda `analyzed` yo'q (o'tirgan + tik turgan)
const anOf = (p) => (p ? (p.analyzed ?? (p.seated || 0) + (p.standing || 0)) : 0)
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)

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
		this.tileTick = new Map() // camera -> sikl raqami (bo'sh xonada bo'laklab tahlilni siyrak qilish uchun)
		this.lastAt = new Map() // camera -> oxirgi tahlil boshlangan vaqt (ms): kamera turi bo'yicha oraliq uchun
		this.poseTick = new Map() // camera -> tahlil raqami (skeletni har N-kadrda hisoblash uchun)
		this.lag = monitorEventLoopDelay({ resolution: 20 }) // yuklama himoyasi: event loop kechikishi
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

	// Odam holatlari sanog'i (o'tirgan, tik turgan, boshi egilgan, qo'l ko'targan ...). Model yo'q yoki xato bo'lsa null (tahlil to'xtamaydi)
	async poseOf(buf, result, cfg) {
		if (!result.boxes.length) return null
		try {
			return await ai.pose(buf, result.boxes, { model: cfg.poseModel, conf: cfg.poseConf })
		} catch (e) {
			if (Date.now() - (this.poseErrAt || 0) > 10 * 60 * 1000) { this.poseErrAt = Date.now(); console.log('Vision holatlarni aniqlash xatosi:', e.message) }
			return null
		}
	}

	// Bitta kamerani tahlil qiladi va natijani yozadi. followUp berilsa — hodisaning keyingi kadri
	async analyze(camera, followUp = null) {
		const started = Date.now()
		const cfg = await AiSettings.get()
		const buf = await Snapshots.captureBuffer(camera)
		// Bo'laklab tahlil (butun kadr + 4 burchak = 5 marta model) eng og'ir qism. Xona oxirgi o'lchovda bo'sh yoki deyarli bo'sh bo'lsa
		// uni har 3-siklda bir marta bajaramiz (qolganida faqat butun kadr): bo'sh xonalarda protsessor ~4 baravar kam ketadi
		const camKey = String(camera._id)
		const lastCount = (this.hist.get(camKey) || []).slice(-1)[0]?.count
		const tick = (this.tileTick.get(camKey) || 0) + 1
		this.tileTick.set(camKey, tick)
		const sparse = lastCount !== undefined && lastCount <= 1 && tick % 3 !== 0
		const result = await ai.detect(buf, { tiled: cfg.tiled && !sparse, score: cfg.detectorScore })
		const now = new Date()
		const { dateString, hour } = tzParts(now)
		const activity = await this.activityOf(camera, result, now)
		// Odam holatlari (skelet): "Har tahlilda hisoblash" yoqilgan bo'lsa shu yerda, aks holda faqat hodisa/namuna paytida (emit)
		const poseEvery = Math.max(1, Math.round(Number(cfg.poseEveryN) || 1)) // skelet qimmat (~1 s): sekin o'zgaradigan holatlar uchun har N-tahlilda
		const poseN = (this.poseTick.get(camKey) || 0) + 1
		this.poseTick.set(camKey, poseN)
		if (cfg.poseEnabled && cfg.poseLive && poseN % poseEvery === 0) result.pose = await this.poseOf(buf, result, cfg)
		await visionMetricModel.create({
			schoolId: camera.schoolId, camera: camera._id, sinfId: camera.sinfId || null,
			count: result.count, activity, pose: result.pose || undefined, boxes: result.boxes.flatMap((b) => [b.x1, b.y1, b.x2, b.y2]), time: now, hour, dateString, ms: Date.now() - started
		})
		// Yuz tanish (ixtiyoriy, sukut bo'yicha o'chiq): dars soatlarida sinfga biriktirilgan kameralarda. Xato tahlilni to'xtatmaydi
		// Sinfxona kamerasi: dars soatlarida. Sinfsiz zal/koridor/darvoza kamerasi: butun tahlil vaqtida (chiqish dars tugagach bo'ladi), «yozmaydi» deb belgilangan bo'lsa tahlil qilinmaydi
		const faceCam = camera.sinfId ? hour >= LESSON[0] && hour < LESSON[1] : (camera.role === 'hall' || camera.faceDirection === 'out') && camera.faceDirection !== 'off'
		if (cfg.faceEnabled && faceCam) {
			const Faces = require('./face.service')
			await Faces.processFrame(camera, buf, now, cfg).catch((e) => Faces.logError(e))
		}
		// Panel uchun oxirgi tahlil kadri (qutilar bilan)
		await ai.smallFrame(buf, result, 1280, '#22c55e', 72)
			.then((jpeg) => writeAtomic(fileOf(String(camera._id)), jpeg))
			.catch((e) => console.log('Vision kadr saqlash xatosi:', e.message))
		await this.observe(camera, buf, result, now, { cfg, activity }).catch((e) => console.log('Vision isbot xatosi:', e.message))
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
	async observe(camera, buf, result, now, { cfg = {}, activity = null } = {}) {
		const key = String(camera._id)
		const hist = this.hist.get(key) || []
		const prev = hist.filter((p) => now - p.t <= 30 * 60 * 1000) // eskirgan (uzilishdan oldingi) tarix hisobga olinmaydi
		hist.push({ t: now, count: result.count, activity })
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
		const finding = this.evaluate(result.count, prev, roster, state, now, { cfg, activity, pose: result.pose, hall: !camera.sinfId, capacity: camera.capacity })
		if (!finding) {
			// Hodisa yo'q: AI baribir tahlil qilganini isbotlash uchun vaqti-vaqti bilan namuna kadr saqlaydi (lavhasiz)
			if (!this.lastSample.has(key)) {
				const lastDb = await hikCameraEventModel.findOne({ camera: camera._id, kind: 'vision_sample' }).sort({ time: -1 }).select('time').lean()
				this.lastSample.set(key, lastDb ? new Date(lastDb.time).getTime() : 0)
			}
			if (now - this.lastSample.get(key) >= Math.max(5, Number(cfg.sampleEveryMin) || 30) * 60 * 1000) {
				this.lastSample.set(key, now.getTime())
				const detail = roster.n ? `${result.count} odam · sinf ro'yxatida ${roster.n} o'quvchi · holat me'yorda` : `${result.count} odam · holat me'yorda`
				await this.emit(camera, buf, result, now, { kind: 'vision_sample', title: 'Avtomatik kuzatuv namunasi', detail }, hist, [], roster, cfg)
			}
			return
		}
		if (finding.kind === 'vision_empty') state.emptyFired = true
		else {
			const ck = `${key}:${finding.kind}`
			if (now - (this.cooldown.get(ck) || 0) < COOLDOWN_MS) return
			this.cooldown.set(ck, now.getTime())
		}
		await this.emit(camera, buf, result, now, finding, hist, frames, roster, cfg)
	}

	// Qoidalar. prev — shu kameraning oldingi o'lchovlari (oxirgi 30 daqiqa), count — hozirgi
	evaluate(count, prev, roster, state, now, ctx = {}) {
		const cfg = ctx.cfg || {}
		const EMPTY_MIN_MS = Math.max(1, Number(cfg.emptyMin) || 15) * 60 * 1000 // tanafus (5-15 daqiqa) emas, shundan uzoq bo'sh turishi kerak
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
		// 2b) Zal kamerasi (sinfga biriktirilmagan): odamlar soni belgilangan zichlikdan oshsa, ketma-ket 2 o'lchovda
		const hallCrowd = Number(ctx.capacity) || Number(cfg.hallCrowd) || 40
		if (ctx.hall && count >= hallCrowd && last && last.count >= hallCrowd) {
			return { kind: 'vision_overcrowd', title: 'Zalda odamlar zich', detail: `Kamerada ${count} odam (chegara: ${hallCrowd}). Zich to'planish bo'lishi mumkin` }
		}
		// 2c) Notinchlik / to'polon: ko'pchilik tez harakatlanyapti (ketma-ket 2 o'lchovda). Zalda tartibsizlik, sinfda "sinf notinch"
		const actMin = Number(cfg.restlessAct) || 0.6
		const peopleMin = Number(cfg.restlessMinPeople) || 8
		const act = ctx.activity
		if (typeof act === 'number' && act >= actMin && count >= peopleMin && last && typeof last.activity === 'number' && last.activity >= actMin && last.count >= peopleMin) {
			const v = Math.round(((act + last.activity) / 2) * 100)
			const detail = `${count} odam tez harakatlanyapti (harakat ${v}%, ketma-ket ikki o'lchovda). To'polon yoki janjal bo'lishi mumkin (taxminiy, kadr orqali)`
			return ctx.hall
				? { kind: 'vision_commotion', title: 'Zalda tartibsizlik belgisi', detail }
				: { kind: 'vision_restless', title: 'Sinf notinch', detail }
		}
		// 2d) Ko'pchilik o'rnidan turgan (skelet bo'yicha), ketma-ket 2 o'lchovda: sinf notinch hisoblanadi
		const pose = ctx.pose
		const mass = !!(pose && pose.analyzed >= MASS_MIN && pose.standing / pose.analyzed >= MASS_SHARE)
		const massBefore = state.lastStandMass
		if (!ctx.hall && pose) state.lastStandMass = mass // skelet hisoblanmagan tahlil ketma-ketlikni uzmaydi
		if (!ctx.hall && mass && massBefore) {
			return { kind: 'vision_restless', title: 'Sinf notinch', detail: `Holati aniqlangan ${pose.analyzed} odamdan ${pose.standing} tasi tik turibdi (${Math.round(pose.standing / pose.analyzed * 100)}%): ko'pchilik o'rnidan turgan yoki yurib yuribdi` }
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
	async emit(camera, buf, result, now, finding, hist, frames, roster, cfg = {}) {
		const id = new mongoose.Types.ObjectId()
		const isSample = finding.kind === 'vision_sample'
		const { dateString, hour } = tzParts(now)
		if (!result.pose && cfg.poseEnabled) result.pose = await this.poseOf(buf, result, cfg)
		// Telefon nomzodlari (ishonchsiz: faqat dalil rasmida belgilanadi, ogohlantirishga ta'sir qilmaydi)
		const phones = cfg.phoneEnabled ? await ai.phones(buf, result.boxes, { score: cfg.phoneScore }).catch(() => []) : []
		const image = await ai.renderEvidence({ buf, result, phones, kind: finding.kind, title: finding.title, detail: finding.detail, history: hist, cameraName: camera.name, sinfName: roster.name, at: now })
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
			snapshot: `${id}.jpg`, snapshotAt: now, title: finding.title, detail: finding.detail, count: result.count, pose: result.pose || null,
			clip: clip ? `${id}.webp` : null, images
		})
		if (!isSample && camera.serial) {
			FOLLOW_UPS_MS.forEach((after, i) => this.followUps.push({
				serial: camera.serial, camera, eventId: id, kind: finding.kind, title: finding.title,
				due: now.getTime() + after, n: i + 1, last: i === FOLLOW_UPS_MS.length - 1, frames: [...frames]
			}))
		}
		if (!isSample && cfg.vlmEnabled) require('./vlm.service').enqueue(id, buf).catch(() => {})
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
			this.lastAt.set(key, dev.lastCapture)
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
					if (kind === 'offline') await HikService.markDeviceOffline(camera.accountId, serial)
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
		for (const m of [this.failures, this.lastError, this.hist, this.frames, this.state, this.lastSample, this.prevBoxes, this.tileTick, this.lastAt, this.poseTick]) {
			for (const k of m.keys()) if (!ids.has(k)) m.delete(k)
		}
		for (const k of this.cooldown.keys()) if (!ids.has(k.split(':')[0])) this.cooldown.delete(k)
		for (const k of this.devices.keys()) if (!serials.has(k)) this.devices.delete(k)
	}

	async cycle() {
		// Qotib qolgan sikl butun tahlilni abadiy to'xtatib qo'ymasin: 30 daqiqadan uzoq davom etsa, yangisi ruxsat etiladi
		if (this.running && Date.now() - (this.cycleStartedAt || 0) < CYCLE_WATCHDOG_MS) return
		if (this.running) console.log('Vision: oldingi sikl 30 daqiqadan beri tugamadi, yangisi boshlanmoqda')
		this.running = true
		this.cycleStartedAt = Date.now()
		try {
			const cfg = await refreshCfg()
			if (cfg.enabled === false) return
			const { hour } = tzParts()
			if (hour < HOURS[0] || hour >= HOURS[1]) return
			const cameras = await hikCameraModel.find({
				visionEnabled: true, inCloud: { $ne: false }, online: { $ne: false },
				schoolId: { $ne: null }, role: { $in: ['monitor', 'hall'] }, serial: { $ne: '' }
			}).lean()
			this.evictInactive(cameras)
			// Yuklama himoyasi: event loop kechikishi chegaradan oshsa (backend sekinlashdi) faqat darvoza kameralari tahlil qilinadi, qolganlari keyingi siklga
			const lagMs = this.takeLag()
			const shed = Number(cfg.shedLagMs) > 0 && lagMs > Number(cfg.shedLagMs)
			if (shed && Date.now() - (this.shedLogAt || 0) > 10 * 60 * 1000) { this.shedLogAt = Date.now(); console.log(`Vision: yuklama yuqori (event loop kechikishi ${Math.round(lagMs)} ms): faqat darvoza kameralari tahlil qilinadi`) }
			const dueCams = schedule.selectDue(cameras, { now: Date.now(), lastAt: this.lastAt, cfg, baseMs: INTERVAL_MS, shed })
			const byDevice = new Map()
			for (const c of dueCams) {
				if (!byDevice.has(c.serial)) byDevice.set(c.serial, [])
				byDevice.get(c.serial).push(c)
			}
			for (const list of byDevice.values()) list.sort((a, b) => schedule.PRIORITY[schedule.tierOf(a)] - schedule.PRIORITY[schedule.tierOf(b)]) // darvoza birinchi
			// Kutayotgan keyingi kadrlari bor qurilmalar kameralari bo'lmasa ham ishlanadi
			for (const fu of this.followUps) if (!byDevice.has(fu.serial)) byDevice.set(fu.serial, [])
			const total = { cameras: cameras.length, ok: 0, failed: 0, skipped: 0 }
			await runPool([...byDevice.entries()], DEVICE_PARALLEL, async ([serial, list]) => {
				const s = await this.runDevice(serial, list)
				total.ok += s.ok; total.failed += s.failed; total.skipped += s.skipped
			})
			this.lastCycle = { at: new Date(), ...total, due: dueCams.length, shed, lagMs: Math.round(lagMs) }
			if (Date.now() - this.lastPurge > PURGE_EVERY_MS) await this.purge().catch((e) => console.log('Vision tozalash xatosi:', e.message))
		} catch (error) {
			console.log('Vision sikl xatosi:', error.message)
		} finally {
			this.running = false
		}
	}

	// Oxirgi tekshiruvdan beri event loop kechikishining 99-persentili (ms); hisoblagich nolga tushadi
	takeLag() {
		const v = this.lag.count ? this.lag.percentile(99) / 1e6 : 0
		this.lag.reset()
		return Number.isFinite(v) ? v : 0
	}

	stop() {
		try { this.lag.disable() } catch { /* o'chiq edi */ }
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
		this.stopped = true
	}

	start() {
		this.stopped = false
		if (this.timer || process.env.VISION_ENABLED === '0') return
		this.lag.enable()
		// setInterval emas: sikl tugamasdan keyingisi boshlanmasligi uchun zanjirli setTimeout
		const loop = async () => {
			await this.cycle()
			if (this.stopped) return
			this.timer = setTimeout(loop, TICK_MS)
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
			title: e.title || '', detail: e.detail || '', count: e.count ?? null, pose: e.pose || null, scene: e.scene || null, hasClip: !!e.clip,
			images: (e.images || []).map((i) => ({ label: i.label, t: i.t, count: i.count }))
		}
	}

	// "Aqlli kuzatuv" sahifasi uchun jamlama: kun bo'yicha ko'rsatkichlar, muhim hodisalar (oxirgi 8 ta) va har sinf uchun
	// lahzalar soni + eng oxirgisi. Hamma kadrlarni emas, faqat xulosani beradi; to'liq ro'yxat `evidence()` orqali (batafsil ko'rish)
	async summary(schoolId, date = null) {
		const ALERTS = ALERT_KINDS
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tzParts().dateString
		const base = { schoolId: school, dateString: day, kind: { $in: ALL_KINDS } }
		const [perSinf, lastIds, alerts, cams, lastMetric] = await Promise.all([
			hikCameraEventModel.aggregate([{ $match: base }, { $group: { _id: '$sinfId', total: { $sum: 1 }, alerts: { $sum: { $cond: [{ $in: ['$kind', ALERTS] }, 1, 0] } } } }]),
			hikCameraEventModel.aggregate([{ $match: base }, { $sort: { time: -1 } }, { $group: { _id: '$sinfId', id: { $first: '$_id' } } }]),
			hikCameraEventModel.find({ ...base, kind: { $in: ALERTS } }).sort({ time: -1 }).limit(8)
				.populate('camera', 'name').populate('sinfId', 'name').select(POSE_SELECT).lean(),
			hikCameraModel.find({ schoolId, visionEnabled: true, role: 'monitor' }).select('name sinfId online').populate('sinfId', 'name').lean(),
			visionMetricModel.findOne({ schoolId: school }).sort({ time: -1 }).select('time').lean()
		])
		const lastRows = await hikCameraEventModel.find({ _id: { $in: lastIds.map((x) => x.id) } })
			.populate('camera', 'name').populate('sinfId', 'name').select(POSE_SELECT).lean()
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
		const base = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), kind: { $in: ALL_KINDS } }
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) base.dateString = date
		const grouped = await hikCameraEventModel.aggregate([
			{ $match: base }, { $sort: { time: -1 } },
			{ $group: { _id: '$sinfId', ids: { $push: '$_id' } } },
			{ $project: { ids: { $slice: ['$ids', Math.max(1, Math.min(12, Number(per) || 4))] } } }
		])
		const rows = await hikCameraEventModel.find({ _id: { $in: grouped.flatMap((g) => g.ids) } }).sort({ time: -1 })
			.populate('camera', 'name').populate('sinfId', 'name').select(POSE_SELECT).lean()
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
		const base = { schoolId: new mongoose.Types.ObjectId(String(schoolId)), kind: { $in: ALL_KINDS } }
		if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) base.dateString = date
		if (sinfId) {
			if (!validId(sinfId)) return { success: false, message: "Sinf id noto'g'ri" }
			base.sinfId = new mongoose.Types.ObjectId(String(sinfId))
		}
		const match = { ...base }
		if (group === 'alerts') match.kind = { $in: ALERT_KINDS }
		else if (group === 'samples') match.kind = 'vision_sample'
		const size = 24
		const current = Math.max(1, Number(page) || 1)
		const [total, rows, kinds] = await Promise.all([
			hikCameraEventModel.countDocuments(match),
			hikCameraEventModel.find(match).sort({ time: -1 }).skip((current - 1) * size).limit(size)
				.populate('camera', 'name').populate('sinfId', 'name').select(POSE_SELECT).lean(),
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
		const cameras = await hikCameraModel.find({ schoolId, visionEnabled: true, role: { $in: ['monitor', 'hall'] } }).select('name sinfId online serial role capacity').lean()
		if (!cameras.length) return { success: true, items: [], intervalSec: INTERVAL_MS / 1000 }
		const since = new Date(Date.now() - 60 * 60 * 1000)
		const rows = await visionMetricModel.find({ schoolId: school, camera: { $in: cameras.map((c) => c._id) }, time: { $gte: since } })
			.sort({ time: 1 }).select('camera count time activity pose').lean()
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
			// Holatlar: eng oxirgi (eskirmagan) o'lchov va oxirgi 15 daqiqadagi o'rtacha ulushlar
			const poseRows = list.filter((r) => anOf(r.pose) > 0)
			const lastPose = poseRows[poseRows.length - 1]
			const win = poseRows.filter((r) => Date.now() - r.time.getTime() <= 15 * 60 * 1000)
			const sumOf = (k) => win.reduce((a, r) => a + (r.pose[k] || 0), 0)
			const winAn = win.reduce((a, r) => a + anOf(r.pose), 0)
			return {
				cameraId: c._id, name: c.name, role: c.role || 'monitor', capacity: c.capacity ?? null, sinfId: c.sinfId || null, online: c.online,
				count: recent.length ? median(recent.map((r) => r.count)) : null,
				lastCount: last ? last.count : null,
				activity: acts.length ? Math.round(acts.reduce((a, b) => a + b, 0) / acts.length * 1000) / 1000 : null,
				pose: lastPose && Date.now() - lastPose.time.getTime() <= STALE_MS ? { ...lastPose.pose, analyzed: anOf(lastPose.pose) } : null,
				poseShare: winAn ? { standing: pct(sumOf('standing'), winAn), headDown: pct(sumOf('headDown'), winAn), raised: pct(sumOf('raised'), winAn) } : null,
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
			{ $group: { _id: { sinf: '$sinfId', camera: '$camera', hour: '$hour' }, avg: { $avg: '$count' }, max: { $max: '$count' }, n: { $sum: 1 },
				pAn: { $sum: { $ifNull: ['$pose.analyzed', { $add: [{ $ifNull: ['$pose.seated', 0] }, { $ifNull: ['$pose.standing', 0] }] }] } }, pStand: { $sum: { $ifNull: ['$pose.standing', 0] } }, pHead: { $sum: { $ifNull: ['$pose.headDown', 0] } }, pHand: { $sum: { $ifNull: ['$pose.raised', 0] } }, handPeak: { $max: { $ifNull: ['$pose.raised', 0] } } } }
		])
		const sinfs = new Map()
		const poseAcc = new Map()
		for (const r of rows) {
			const k = String(r._id.sinf)
			if (!sinfs.has(k)) { sinfs.set(k, Array.from({ length: 24 }, () => ({ avg: 0, max: 0 }))); poseAcc.set(k, Array.from({ length: 24 }, () => ({ an: 0, stand: 0, head: 0, hand: 0, peak: 0 }))) }
			const slot = sinfs.get(k)[r._id.hour]
			slot.avg = Math.max(slot.avg, Math.round(r.avg * 10) / 10)
			slot.max = Math.max(slot.max, r.max)
			const a = poseAcc.get(k)[r._id.hour]
			a.an += r.pAn; a.stand += r.pStand; a.head += r.pHead; a.hand += r.pHand; a.peak = Math.max(a.peak, r.handPeak || 0)
		}
		// Soatlik holatlar ulushi (%): tik turgan, boshi egilgan, qo'l ko'targan; handPeak — soat ichidagi eng ko'p ko'tarilgan qo'l soni
		const pose = {}
		for (const [k, hours] of poseAcc) pose[k] = hours.map((a) => ({ standing: pct(a.stand, a.an) ?? 0, headDown: pct(a.head, a.an) ?? 0, raised: pct(a.hand, a.an) ?? 0, handPeak: a.peak, analyzed: a.an }))
		return { success: true, dateString, sinfs: Object.fromEntries(sinfs), pose }
	}

	// Maktab admini uchun umumiy nazorat: sinflar kesimida hozirgi holat va kun bo'yicha tahlil (odam soni, tik turganlar, boshi egilganlar,
	// qo'l ko'targanlar, harakat/notinchlik, hodisalar) hamda butun maktab bo'yicha soatlik dinamika. Hammasi taxminiy (kadr va skelet bo'yicha)
	async overview(schoolId, date = null) {
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : tzParts().dateString
		const cfg = await AiSettings.get()
		const MIN = Math.max(1, Number(process.env.VISION_MIN_PEOPLE) || 3) // dars borgan hisoblash chegarasi
		const [live, perSinf, perHour, kinds, cams] = await Promise.all([
			this.live(schoolId),
			visionMetricModel.aggregate([
				{ $match: { schoolId: school, dateString: day } },
				{ $group: {
					_id: '$sinfId', n: { $sum: 1 }, avg: { $avg: '$count' }, max: { $max: '$count' }, last: { $max: '$time' },
					lessonN: { $sum: { $cond: [{ $gte: ['$count', MIN] }, 1, 0] } },
					actSum: { $sum: { $cond: [{ $and: [{ $isNumber: '$activity' }, { $gte: ['$count', MIN] }] }, '$activity', 0] } },
					actN: { $sum: { $cond: [{ $and: [{ $isNumber: '$activity' }, { $gte: ['$count', MIN] }] }, 1, 0] } },
					pN: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$pose.analyzed', { $add: [{ $ifNull: ['$pose.seated', 0] }, { $ifNull: ['$pose.standing', 0] }] }] }, 0] }, 1, 0] } },
					pAn: { $sum: { $ifNull: ['$pose.analyzed', { $add: [{ $ifNull: ['$pose.seated', 0] }, { $ifNull: ['$pose.standing', 0] }] }] } }, pStand: { $sum: { $ifNull: ['$pose.standing', 0] } },
					pHead: { $sum: { $ifNull: ['$pose.headDown', 0] } }, pHand: { $sum: { $ifNull: ['$pose.raised', 0] } },
					handPeak: { $max: { $ifNull: ['$pose.raised', 0] } },
					handMoments: { $sum: { $cond: [{ $gt: [{ $ifNull: ['$pose.raised', 0] }, 0] }, 1, 0] } }
				} }
			]),
			visionMetricModel.aggregate([
				{ $match: { schoolId: school, dateString: day, count: { $gte: MIN } } },
				{ $group: {
					_id: '$hour', n: { $sum: 1 }, avg: { $avg: '$count' },
					actSum: { $sum: { $cond: [{ $isNumber: '$activity' }, '$activity', 0] } }, actN: { $sum: { $cond: [{ $isNumber: '$activity' }, 1, 0] } },
					pAn: { $sum: { $ifNull: ['$pose.analyzed', { $add: [{ $ifNull: ['$pose.seated', 0] }, { $ifNull: ['$pose.standing', 0] }] }] } }, pStand: { $sum: { $ifNull: ['$pose.standing', 0] } },
					pHead: { $sum: { $ifNull: ['$pose.headDown', 0] } }, pHand: { $sum: { $ifNull: ['$pose.raised', 0] } }
				} }
			]),
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, dateString: day, kind: { $in: ALERT_KINDS } } },
				{ $group: { _id: { sinf: '$sinfId', kind: '$kind' }, n: { $sum: 1 }, last: { $max: '$time' } } }
			]),
			hikCameraModel.find({ schoolId: school, visionEnabled: true, role: 'monitor' }).select('name sinfId online').populate('sinfId', 'name').lean()
		])

		const names = new Map()
		for (const c of cams) if (c.sinfId) names.set(String(c.sinfId._id), c.sinfId.name)
		const extra = [...new Set([...perSinf.map((x) => String(x._id)), ...kinds.map((x) => String(x._id.sinf))])].filter((id) => validId(id) && !names.has(id))
		if (extra.length) for (const x of await sinfModel.find({ _id: { $in: extra } }).select('name').lean()) names.set(String(x._id), x.name)

		const todayBySinf = new Map(perSinf.map((x) => [String(x._id), x]))
		const alertsBySinf = new Map()
		const alertsByKind = {}
		for (const k of kinds) {
			const id = String(k._id.sinf)
			if (!alertsBySinf.has(id)) alertsBySinf.set(id, { total: 0, kinds: {}, last: null })
			const a = alertsBySinf.get(id)
			a.total += k.n; a.kinds[k._id.kind] = k.n
			if (!a.last || k.last > a.last) a.last = k.last
			alertsByKind[k._id.kind] = (alertsByKind[k._id.kind] || 0) + k.n
		}

		const actMin = Number(cfg.restlessAct) || 0.6
		const rowsBySinf = new Map()
		for (const it of live.items) {
			const id = String(it.sinfId || '')
			if (!id) continue
			if (!rowsBySinf.has(id)) rowsBySinf.set(id, { sinfId: id, sinf: names.get(id) || '', cameras: [], online: false, live: null })
			const row = rowsBySinf.get(id)
			row.cameras.push(it.name)
			row.online = row.online || it.online === true
			if (!it.stale && it.count !== null && (!row.live || it.count > row.live.count)) {
				const an = anOf(it.pose)
				row.live = { count: it.count, activity: it.activity, at: it.at, pose: it.pose || null, poseShare: it.poseShare || null, cameraId: it.cameraId,
					standingPct: an ? pct(it.pose.standing, an) : null, headDownPct: an ? pct(it.pose.headDown, an) : null, handsNow: an ? it.pose.raised : null }
			}
		}
		for (const id of [...todayBySinf.keys(), ...alertsBySinf.keys()]) if (id && id !== 'null' && !rowsBySinf.has(id)) rowsBySinf.set(id, { sinfId: id, sinf: names.get(id) || '', cameras: [], online: false, live: null })

		const classes = [...rowsBySinf.values()].map((row) => {
			const t = todayBySinf.get(row.sinfId)
			const al = alertsBySinf.get(row.sinfId)
			const today = t ? {
				n: t.n, avgCount: Math.round(t.avg * 10) / 10, maxCount: t.max, lessonPct: Math.round(t.lessonN / t.n * 100),
				activityPct: t.actN ? Math.round(t.actSum / t.actN * 1000) / 10 : null,
				standingPct: pct(t.pStand, t.pAn), headDownPct: pct(t.pHead, t.pAn), handsPct: pct(t.pHand, t.pAn),
				handPeak: t.handPeak, handMoments: t.handMoments, poseCoverage: Math.round(t.pN / t.n * 100), lastAt: t.last
			} : null
			const live_ = row.live
			const flags = []
			if (live_) {
				if (typeof live_.activity === 'number' && live_.activity >= actMin && live_.count >= (Number(cfg.restlessMinPeople) || 8)) flags.push('restless')
				if (anOf(live_.pose) >= MASS_MIN && live_.pose.standing / anOf(live_.pose) >= MASS_SHARE) flags.push('standing')
				if (anOf(live_.pose) >= MASS_MIN && live_.pose.headDown / anOf(live_.pose) >= 0.5) flags.push('headDown')
				if (live_.pose && live_.pose.raised > 0) flags.push('hands')
			}
			return { ...row, today, alerts: al ? { total: al.total, kinds: al.kinds, last: al.last } : { total: 0, kinds: {}, last: null }, flags }
		}).sort((a, b) => b.alerts.total - a.alerts.total || b.flags.length - a.flags.length || String(a.sinf).localeCompare(String(b.sinf), 'uz', { numeric: true }))

		const fresh = classes.filter((c) => c.live)
		const sum = (f) => fresh.reduce((a, c) => a + (f(c) || 0), 0)
		const hourly = Array.from({ length: 24 }, (_, h) => {
			const r = perHour.find((x) => x._id === h)
			return r ? { hour: h, avgPeople: Math.round(r.avg * 10) / 10, activityPct: r.actN ? Math.round(r.actSum / r.actN * 1000) / 10 : null,
				standingPct: pct(r.pStand, r.pAn), headDownPct: pct(r.pHead, r.pAn), handsPct: pct(r.pHand, r.pAn), n: r.n } : { hour: h, avgPeople: 0, activityPct: null, standingPct: null, headDownPct: null, handsPct: null, n: 0 }
		})
		const totalAn = perSinf.reduce((a, x) => a + x.pAn, 0)
		return {
			success: true, date: day, intervalSec: live.intervalSec, poseEnabled: cfg.poseEnabled !== false,
			totals: {
				classes: classes.length, classesLive: fresh.length, camerasOnline: cams.filter((c) => c.online === true).length, cameras: cams.length,
				peopleNow: sum((c) => c.live.count), standingNow: sum((c) => c.live.pose?.standing), headDownNow: sum((c) => c.live.pose?.headDown), handsNow: sum((c) => c.live.pose?.raised),
				analyzedNow: sum((c) => anOf(c.live.pose)),
				restlessNow: classes.filter((c) => c.flags.includes('restless') || c.flags.includes('standing')).length,
				alerts: Object.values(alertsByKind).reduce((a, b) => a + b, 0), alertsByKind,
				standingPctDay: pct(perSinf.reduce((a, x) => a + x.pStand, 0), totalAn), headDownPctDay: pct(perSinf.reduce((a, x) => a + x.pHead, 0), totalAn), handsPctDay: pct(perSinf.reduce((a, x) => a + x.pHand, 0), totalAn)
			},
			// Zal / koridor kameralari (sinfga bog'lanmagan): hozirgi odam soni va zichlik chegarasi
			halls: live.items.filter((i) => i.role === 'hall').map((i) => {
				const limit = i.capacity || Number(cfg.hallCrowd) || 40
				return { cameraId: i.cameraId, name: i.name, online: i.online, count: i.stale ? null : i.count, limit, activity: i.activity, pose: i.pose, at: i.at, crowded: !i.stale && i.count !== null && i.count >= limit, error: i.error }
			}),
			classes, hourly: hourly.filter((x) => x.hour >= 6 && x.hour <= 20)
		}
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
