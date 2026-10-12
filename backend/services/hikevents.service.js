// Hik-Connect for Teams yuz aniqlash hodisalarini (Face Recognition, event 10018)
// olib turadi. Kamera qurilmaning O'Z yuz kutubxonasi bilan solishtiradi; bulut
// aniqlangan shaxsning humanId/humanName va similarity'sini yuboradi (qo'llanma: 5.3.1,
// AlarmFileExtendInfo). Bu yerda:
//   1. FaceControl (kirish/chiqish) deb belgilangan kameralari bor akkauntlarga obuna bo'linadi
//   2. Hodisalar har ~3 soniyada olinadi (`alarm/v1/mq/messages`) va tasdiqlanadi (`.../complete`)
//   3. humanId bo'yicha maktab o'quvchisi (studentIdNumber) yoki xodimi (hodimID) topiladi
//   4. Kamerada `autoAttendance` yoqilgan bo'lsa, mavjud davomat xizmatlari orqali kirish/chiqish yoziladi
//
// DIQQAT: bulutda "Face Recognition" signal qoidasi yoqilgan bo'lishi kerak, yuz kutubxonasi
// esa qurilmaning o'zida bo'ladi (humanId = o'quvchi ID raqami / xodim ID'si bo'lishi shart).
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const tz = require('dayjs/plugin/timezone')
dayjs.extend(utc)
dayjs.extend(tz)

const hikCameraModel = require('../models/hik.camera.model')
const hikEventModel = require('../models/hik.event.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')
const HikService = require('./hikconnect.service')
const SnapshotService = require('./hik.snapshot.service')
const AttandanceService = require('./attandance.service')
const StudentAttandanceService = require('./student.attandance.service')

const FACE_RECOGNITION = 10018
// Sinfxona/xona kameralari uchun tahliliy hodisalar (qo'llanma: Alarm Type, Video Security)
const ANALYTICS = { 10002: 'motion', 10019: 'density', 100105: 'density', 10621: 'people', 10101: 'enter', 10102: 'exit', 10035: 'multi' }
const SUBSCRIBE_TYPES = [FACE_RECOGNITION, ...Object.keys(ANALYTICS).map(Number)]
const POLL_MS = 3000
const RESUBSCRIBE_MS = 6 * 3600 * 1000
const MAX_ROUNDS = 5
const MAX_BATCH_TRIES = 3
const batchTries = new Map() // batchId -> muvaffaqiyatsiz urinishlar soni

const subscribed = new Map() // accountId -> vaqt
const status = new Map() // accountId -> { lastPollAt, lastError, lastEventAt }
let timer = null
let running = false

const str = (v) => (v === undefined || v === null ? '' : String(v))

function eventTime(msg) {
	const raw = msg.timeInfo?.startTimeLocal || msg.timeInfo?.startTime
	const d = raw ? new Date(raw) : null
	return d && !Number.isNaN(d.getTime()) ? d : new Date()
}

// Hodisadagi yuz ma'lumotini topadi (fayl ma'lumotlari ichida)
function faceInfo(msg) {
	const files = msg.fileInfo?.file || []
	const f = files.find(x => x.extendInfo && (x.extendInfo.humanId || x.extendInfo.humanName)) || files.find(x => x.extendInfo)
	return f?.extendInfo || {}
}

async function findPerson(schoolId, humanId) {
	if (!humanId) return null
	const student = await studentModel.findOne({ schoolId, studentIdNumber: humanId, isActive: { $ne: false } }).select('fullName sinf').lean()
	if (student) return { type: 'student', doc: student, name: student.fullName, sinf: student.sinf || null }
	const user = await userModel.findOne({ schoolId, hodimID: humanId, role: { $in: ['viewer', 'leader'] }, isActive: { $ne: false } }).select('fullName sinf').lean()
	if (user) return { type: 'staff', doc: user, name: user.fullName, sinf: user.sinf || null }
	return null
}

// Sinfxona kamerasi hodisasi (harakat, odam zichligi, ...) — faqat maktabga biriktirilgan kameralar uchun
async function processAnalytics(account, msg) {
	const src = msg.eventSource || {}
	// Bitta kamera bir nechta maktabda ko'rsatilgan bo'lsa (sinov), hodisa har biriga yoziladi
	const cameras = await hikCameraModel.find({ accountId: account, cameraId: str(src.sourceID), schoolId: { $ne: null } }).select('schoolId sinfId serial accountId').lean()
	if (!cameras.length) return
	const time = eventTime(msg)
	const local = dayjs(time).tz('Asia/Tashkent')
	for (const camera of cameras) {
		let created
		try {
			created = await hikCameraEventModel.create({
				schoolId: camera.schoolId, accountId: account, camera: camera._id, sinfId: camera.sinfId || null, guid: cameras.length > 1 ? `${str(msg.guid)}#${camera._id}` : str(msg.guid),
				eventType: Number(src.eventType), kind: ANALYTICS[Number(src.eventType)], time, hour: local.hour(), dateString: local.format('YYYY-MM-DD')
			})
		} catch (error) {
			if (error.code === 11000) continue
			throw error
		}
		await hikCameraModel.updateOne({ _id: camera._id }, { $set: { lastEventAt: time } })
		// Aniqlangan lahzadan kadr saqlash (signal bilan kelgan rasm yoki muhim turlarda hozirgi kadr) — kutib o'tirmaymiz
		if (created.kind !== 'motion') SnapshotService.attachToEvent(created, camera, msg).catch(() => { })
	}
}

// Bitta hodisani qayta ishlaydi: jurnalga yozadi, kerak bo'lsa davomatga yuboradi
async function processMessage(account, msg) {
	const src = msg.eventSource || {}
	if (!msg.guid) return
	if (ANALYTICS[Number(src.eventType)]) return processAnalytics(account, msg)
	if (Number(src.eventType) !== FACE_RECOGNITION) return
	const camera = await hikCameraModel.findOne({ accountId: account, cameraId: str(src.sourceID), role: { $in: ['in', 'out'] }, schoolId: { $ne: null } })
	if (!camera) return

	const info = faceInfo(msg)
	const time = eventTime(msg)
	const humanId = str(info.humanId)
	const person = await findPerson(camera.schoolId, humanId)
	const similarity = typeof info.similarity === 'number' ? info.similarity : null
	const threshold = typeof info.faceLibThreshold === 'number' ? info.faceLibThreshold : null

	const event = {
		schoolId: camera.schoolId, accountId: account, camera: camera._id, guid: str(msg.guid), direction: camera.role,
		humanId, humanName: str(info.humanName), similarity, threshold, faceLibName: str(info.faceLibName),
		personType: person?.type || null, student: person?.type === 'student' ? person.doc._id : null, user: person?.type === 'staff' ? person.doc._id : null,
		personName: person?.name || '', sinf: person?.sinf || camera.sinfId || null,
		time, dateString: dayjs(time).tz('Asia/Tashkent').format('YYYY-MM-DD')
	}

	// Idempotentlik: avval hodisani yozamiz (unique {accountId, guid}); takroriy bo'lsa davomat qayta yozilmaydi
	let attendanceMode = null // 'skip' | 'send'
	if (!person) event.note = "Bazada bunday ID'li o'quvchi/xodim topilmadi"
	else if (camera.autoAttendance) {
		if (similarity !== null && threshold !== null && similarity < threshold) event.note = "O'xshashlik chegaradan past"
		else attendanceMode = 'send'
	}

	let created
	try {
		created = await hikEventModel.create(event)
	} catch (error) {
		if (error.code === 11000) return // takroriy hodisa
		throw error
	}

	// Davomatga yozish: faqat yoqilgan kamerada, shaxs topilgan va o'xshashlik chegaradan past bo'lmasa
	if (attendanceMode === 'send') {
		let patch
		try {
			const payload = { employee_id: humanId, camera_time: time.toISOString(), where: camera.role === 'in' ? 2 : 1 }
			const result = person.type === 'student'
				? await StudentAttandanceService.checkInAttendance(payload, camera.schoolId)
				: await AttandanceService.checkInAttendance(payload, camera.schoolId)
			patch = { recorded: !!result.success }
			if (!result.success) patch.note = result.message || ''
		} catch (error) {
			patch = { recorded: false, note: `Davomat yozishda xatolik: ${error.message}` }
			console.log('Hik davomat yozish xatosi:', error.message)
		}
		await hikEventModel.updateOne({ _id: created._id }, { $set: patch }).catch(e => console.log('Hik hodisani yangilash xatosi:', e.message))
	}
	await hikCameraModel.updateOne({ _id: camera._id }, { $set: { lastEventAt: time } })
	const st = status.get(String(account)) || {}
	status.set(String(account), { ...st, lastEventAt: time })
}

async function ensureSubscribed(account) {
	const last = subscribed.get(String(account))
	if (last && Date.now() - last < RESUBSCRIBE_MS) return
	await HikService.call(account, 'post', '/api/hccgw/alarm/v1/mq/subscribe', { subscribeType: 1, subscribeMode: 1, eventType: SUBSCRIBE_TYPES })
	subscribed.set(String(account), Date.now())
}

async function pollAccount(account) {
	await ensureSubscribed(account)
	for (let round = 0; round < MAX_ROUNDS; round++) {
		const data = await HikService.call(account, 'post', '/api/hccgw/alarm/v1/mq/messages', { maxNumberPerTime: 100 })
		const list = data.alarmMsg || []
		let failed = 0
		for (const msg of list) {
			try { await processMessage(account, msg) } catch (error) { failed++; console.log('Hik hodisani qayta ishlash xatosi:', error.message) }
		}
		if (data.batchId) {
			// Xato bo'lgan (masalan baza vaqtincha ishlamagan) paket tasdiqlanmaydi: Hik uni qayta yuboradi (takroriy hodisalar guid bo'yicha o'tkazib yuboriladi).
			// Doimiy xato beruvchi paket navbatni to'sib qo'ymasligi uchun 3 urinishdan keyin baribir tasdiqlanadi
			const tries = failed ? (batchTries.get(data.batchId) || 0) + 1 : 0
			if (!failed || tries >= MAX_BATCH_TRIES) {
				batchTries.delete(data.batchId)
				await HikService.call(account, 'post', '/api/hccgw/alarm/v1/mq/messages/complete', { batchId: data.batchId })
			} else {
				batchTries.set(data.batchId, tries)
				if (batchTries.size > 200) batchTries.delete(batchTries.keys().next().value)
				break // qayta yuborilishini keyingi so'rovda kutamiz
			}
		}
		if (!list.length || !(Number(data.remainingNumber) > 0)) break
	}
}

// Akkaunt ro'yxatini qisqa muddat keshlaymiz (har 3 soniyada distinct so'rovi bo'lmasin)
const ACCOUNTS_TTL_MS = 45 * 1000
let accountsCache = { at: 0, list: [] }
async function activeAccounts() {
	if (Date.now() - accountsCache.at < ACCOUNTS_TTL_MS) return accountsCache.list
	const list = await hikCameraModel.distinct('accountId', { $or: [{ role: { $in: ['in', 'out'] } }, { sinfId: { $ne: null } }], schoolId: { $ne: null }, inCloud: true })
	accountsCache = { at: Date.now(), list }
	return list
}

const CONCURRENCY = 5
const BACKOFF_MIN_MS = 3000
const BACKOFF_MAX_MS = 15 * 60 * 1000
const inFlight = new Set() // accountId
const backoff = new Map() // accountId -> { nextAt, delay }

async function pollOne(account) {
	const key = String(account)
	if (inFlight.has(key)) return
	const b = backoff.get(key)
	if (b && Date.now() < b.nextAt) return
	inFlight.add(key)
	try {
		await pollAccount(account)
		backoff.delete(key)
		status.set(key, { ...(status.get(key) || {}), lastPollAt: new Date(), lastError: null })
	} catch (error) {
		subscribed.delete(key) // keyingi safar qayta obuna bo'lamiz
		const delay = Math.min(BACKOFF_MAX_MS, b ? b.delay * 2 : BACKOFF_MIN_MS)
		backoff.set(key, { nextAt: Date.now() + delay, delay })
		const message = error.response?.data ? `${error.response.data.errorCode} ${error.response.data.message}` : error.message
		if ((status.get(key) || {}).lastError !== message) console.log(`Hik hodisalarini olish xatosi (${key}):`, message)
		status.set(key, { ...(status.get(key) || {}), lastPollAt: new Date(), lastError: message })
	} finally {
		inFlight.delete(key)
	}
}

async function tick() {
	if (running) return
	running = true
	try {
		const accounts = await activeAccounts()
		const queue = [...accounts]
		const worker = async () => { while (queue.length) await pollOne(queue.shift()) }
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))
	} finally {
		running = false
	}
}

module.exports = {
	start() {
		if (timer) return
		timer = setInterval(() => { tick().catch(err => console.log('Hik poller:', err.message)) }, POLL_MS)
		timer.unref?.()
	},
	stop() {
		if (timer) clearInterval(timer)
		timer = null
	},
	// UI uchun: shu maktab kameralari akkauntlarining so'nggi so'rov holati
	async statusForSchool(schoolId) {
		const accounts = await hikCameraModel.distinct('accountId', { schoolId, role: { $in: ['in', 'out'] } })
		const list = accounts.map(a => status.get(String(a))).filter(Boolean)
		return {
			lastPollAt: list.map(s => s.lastPollAt).filter(Boolean).sort((a, b) => b - a)[0] || null,
			lastError: list.find(s => s.lastError)?.lastError || null
		}
	},
	// Sinov uchun
	processMessage
}
