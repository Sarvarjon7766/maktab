// Hik-Connect kamera kadrlari: aniqlangan lahzalarda (zichlik, odamlar soni signali va h.k.) avtomatik va
// qo'lda saqlanadi. Kadrlar ochiq papkada emas, `private/hik-events` da turadi va faqat huquqi bor
// foydalanuvchiga (tizim egasi, monitor, o'z maktabi admini) autentifikatsiya orqali beriladi.
const fs = require('fs')
const { inScope } = require('../utils/monitorScope')
const crypto = require('crypto')
const path = require('path')
const axios = require('axios')
const mongoose = require('mongoose')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const HikService = require('./hikconnect.service')

const DIR = path.join(__dirname, '..', 'private', 'hik-events')
const MAX_BYTES = 6 * 1024 * 1024
const AUTO_KINDS = ['density', 'people', 'multi']
const AUTO_COOLDOWN_MS = 5 * 60 * 1000
const lastAuto = new Map() // camera -> vaqt

const validId = (id) => mongoose.isValidObjectId(id)
const fileOf = (eventId) => path.join(DIR, `${eventId}.jpg`)

// Hik shifrlangan kadr: "hikencodepicture" (16 bayt) + 32 belgi xesh (= md5(md5(kod))) + AES-128-CBC ma'lumot.
// Kalit — kod (nol bilan 16 baytgacha to'ldirilgan), IV — "0123456789012345". Kod noto'g'ri bo'lsa xesh mos kelmaydi
const MAGIC = 'hikencodepicture'
class PictureError extends Error { constructor(reason, message) { super(message); this.reason = reason } }
const md5 = (t) => crypto.createHash('md5').update(t).digest('hex')

function decryptPicture(buf, code) {
	if (buf.slice(0, 16).toString('latin1') !== MAGIC) return buf // shifrlanmagan
	if (!code) throw new PictureError('no_code', "Kamerada video shifrlash yoqilgan. Akkaunt sahifasida shifrlash kodini kiriting")
	if (buf.slice(16, 48).toString('latin1') !== md5(md5(code))) throw new PictureError('wrong_code', "Video shifrlash kodi noto'g'ri. Akkaunt sahifasida kodni tekshiring")
	const body = buf.slice(48)
	const len = body.length - (body.length % 16)
	const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(code.padEnd(16, '\0').slice(0, 16)), Buffer.from('0123456789012345'))
	decipher.setAutoPadding(false)
	const out = Buffer.concat([decipher.update(body.slice(0, len)), decipher.final()])
	const end = out.lastIndexOf(Buffer.from([0xff, 0xd9])) // JPEG oxiri: ortiqcha to'ldirish baytlarini kesamiz
	const jpeg = end > 0 ? out.slice(0, end + 2) : out
	if (!(jpeg[0] === 0xff && jpeg[1] === 0xd8)) throw new PictureError('bad_data', "Kadrni ochib bo'lmadi")
	return jpeg
}

// Bir vaqtda ko'pi bilan MAX_DOWNLOADS ta yuklash; navbat chegaralangan (to'lsa ortiqchasi tashlanadi)
const MAX_DOWNLOADS = 8
const MAX_WAITING = 200
let active = 0
const waiting = []
function acquire() {
	if (active < MAX_DOWNLOADS) { active++; return Promise.resolve() }
	if (waiting.length >= MAX_WAITING) return Promise.reject(new PictureError('busy', 'Kadr yuklash navbati to\'la'))
	return new Promise(resolve => waiting.push(resolve))
}
function release() {
	const next = waiting.shift()
	if (next) next() // faol slot keyingisiga o'tadi
	else active--
}

async function download(url, token) {
	await acquire()
	try { return await downloadNow(url, token) } finally { release() }
}

async function downloadNow(url, token) {
	const get = (headers) => axios.get(url, { responseType: 'arraybuffer', timeout: 30000, maxContentLength: MAX_BYTES, headers })
	let res
	try { res = await get({}) } catch (e) {
		if (token && [401, 403].includes(e.response?.status)) res = await get({ Token: token })
		else if (!e.response) res = await get({}) // tarmoq xatosi/vaqt tugashi: bir marta qayta urinamiz (HTTP javobi bo'lsa — yo'q)
		else throw e
	}
	const buf = Buffer.from(res.data)
	// JPEG/PNG imzosini tekshiramiz (shifrlangan yoki xato javob rasm sifatida saqlanmasin)
	return buf
}

const isImage = (buf) => !!buf && ((buf[0] === 0xff && buf[1] === 0xd8) || (buf[0] === 0x89 && buf[1] === 0x50))

async function save(eventId, buf) {
	await fs.promises.mkdir(DIR, { recursive: true })
	await fs.promises.writeFile(fileOf(eventId), buf)
	await hikCameraEventModel.updateOne({ _id: eventId }, { $set: { snapshot: `${eventId}.jpg`, snapshotAt: new Date() } })
	return true
}

// Tahlil uchun tiniq kadr: capturePic ko'p qurilmada (NVR/DVR) past o'lchamli (taxminan 960x576) va qattiq siqilgan kadr beradi,
// jonli oqimning asosiy kanali esa to'liq sifatli. Shuning uchun avval asosiy oqimdan (HLS) ffmpeg bilan bitta kadr kesamiz.
// ffmpeg yo'q, oqim shifrlangan yoki ochilmasa — capturePic ga qaytamiz va shu kamerada LIVE_RETRY_MS davomida qayta urinmaymiz.
// FRAME_SOURCE=snapshot — faqat capturePic; FFMPEG_PATH — ffmpeg joylashuvi
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const GRAB_TIMEOUT_MS = 25000
const MAX_GRABS = 3
const LIVE_RETRY_MS = 30 * 60 * 1000
const liveFail = new Map() // camera -> qayta urinish vaqti (ms)
let ffmpegOk = null
let grabbing = 0
const grabWaiting = []

function hasFfmpeg() {
	if (process.env.FRAME_SOURCE === 'snapshot') return false
	if (ffmpegOk === null) {
		const r = require('child_process').spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' })
		ffmpegOk = !r.error && r.status === 0
		if (!ffmpegOk) console.log("Kadr manbai: ffmpeg topilmadi, capturePic ishlatiladi (past sifatli bo'lishi mumkin)")
	}
	return ffmpegOk
}

async function grabSlot() {
	if (grabbing < MAX_GRABS) { grabbing++; return }
	await new Promise((resolve) => grabWaiting.push(resolve))
}
function grabDone() {
	const next = grabWaiting.shift()
	if (next) next()
	else grabbing--
}

// Oqimdan bitta JPEG kadr (to'liq o'lcham). ffmpeg kalit kadrni kutib, bitta kadrni olib chiqadi
function grabFrame(url) {
	return new Promise((resolve, reject) => {
		const args = ['-nostdin', '-loglevel', 'error', '-rw_timeout', '15000000', '-i', url, '-frames:v', '1', '-q:v', '2', '-f', 'mjpeg', 'pipe:1']
		const child = require('child_process').spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] })
		const chunks = []
		let size = 0, err = ''
		const timer = setTimeout(() => child.kill('SIGKILL'), GRAB_TIMEOUT_MS)
		child.stdout.on('data', (d) => { size += d.length; if (size <= MAX_BYTES) chunks.push(d) })
		child.stderr.on('data', (d) => { if (err.length < 400) err += d })
		child.on('error', (e) => { clearTimeout(timer); reject(new PictureError('no_image', e.message)) })
		child.on('close', () => {
			clearTimeout(timer)
			const buf = Buffer.concat(chunks)
			if (size <= MAX_BYTES && buf.length > 2000 && isImage(buf)) resolve(buf)
			else reject(new PictureError('no_image', `Oqimdan kadr olinmadi${err ? ': ' + err.trim().split(/\r?\n/)[0] : ''}`))
		})
	})
}

async function captureLive(camera) {
	const url = await HikService.streamUrl(camera, { protocol: '2', quality: 1 })
	await grabSlot()
	try { return await grabFrame(url) } finally { grabDone() }
}

// Kameradan hozirgi kadrni oladi: asosiy oqimdan, bo'lmasa capturePic. Shifrlangan bo'lsa akkauntdagi kod bilan ochadi.
// Muvaffaqiyatsiz bo'lsa PictureError (sabab: no_code | wrong_code | bad_data | no_image) tashlaydi
async function captureBuffer(camera) {
	if (!camera.serial) throw new PictureError('no_serial', 'Kamera serial raqami topilmadi')
	const key = String(camera._id)
	if (camera.cameraId && hasFfmpeg() && (liveFail.get(key) || 0) < Date.now()) {
		try { return await captureLive(camera) } catch (e) {
			liveFail.set(key, Date.now() + LIVE_RETRY_MS)
			console.log(`Kadr manbai: ${camera.name || key} asosiy oqimdan olinmadi (${e.message}), capturePic ishlatiladi`)
		}
	}
	const data = await HikService.call(camera.accountId, 'post', '/api/hccgw/resource/v1/device/capturePic', { deviceSerial: camera.serial, channelNo: camera.channelNo || 1 })
	if (!data.captureUrl) throw new PictureError('no_image', 'Kamera kadr qaytarmadi')
	const raw = await download(data.captureUrl)
	const buf = Number(data.isEncrypted) === 1 || raw.slice(0, 16).toString('latin1') === MAGIC
		? decryptPicture(raw, await HikService.encryptionCode(camera.accountId))
		: raw
	if (!isImage(buf)) throw new PictureError('no_image', "Kamera rasm o'rniga boshqa ma'lumot qaytardi")
	return buf
}

class HikSnapshotService {
	// Yangi hodisaga kadr biriktiradi: avval signal bilan kelgan rasm, bo'lmasa (faqat muhim turlarda) hozirgi kadr.
	// Xato bo'lsa jim o'tadi — hodisaning o'zi allaqachon yozilgan
	async attachToEvent(event, camera, msg) {
		if (event?.kind === 'motion') return false // harakat hodisalari ko'p — kadr saqlanmaydi
		try {
			const files = msg?.fileInfo?.file || []
			for (const f of files) {
				if (!f.url) continue
				try {
					let buf = await download(f.url)
					if (String(f.encrypted) === '1' || buf.slice(0, 16).toString('latin1') === MAGIC) buf = decryptPicture(buf, await HikService.encryptionCode(camera.accountId))
					if (isImage(buf)) return save(event._id, buf)
				} catch { /* bu rasm o'tmadi — keyingisini yoki hozirgi kadrni sinaymiz */ }
			}
			if (!AUTO_KINDS.includes(event.kind)) return false
			const last = lastAuto.get(String(camera._id)) || 0
			if (Date.now() - last < AUTO_COOLDOWN_MS) return false
			lastAuto.set(String(camera._id), Date.now())
			return save(event._id, await captureBuffer(camera))
		} catch (error) {
			console.log('Hik kadr saqlash xatosi:', error.message)
			return false
		}
	}

	// Qo'lda: "hozirgi kadrni saqlash" — galereyaga yangi yozuv qo'shadi
	async capture(cameraId, user) {
		if (!validId(cameraId)) return { success: false, message: "Kamera id noto'g'ri" }
		const camera = await hikCameraModel.findById(cameraId).lean()
		if (!camera || camera.inCloud === false || !camera.schoolId) return { success: false, message: 'Kamera topilmadi' }
		const platformWide = user.role === 'superadmin' || user.role === 'monitor'
		if (!platformWide && String(camera.schoolId) !== String(user.school)) return { success: false, message: 'Bu kamera sizning maktabingizga biriktirilmagan' }
		try {
			const buf = await captureBuffer(camera)
			const now = new Date()
			const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(now)
			const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(now)) % 24
			const event = await hikCameraEventModel.create({
				schoolId: camera.schoolId, accountId: camera.accountId, camera: camera._id, sinfId: camera.sinfId || null, guid: `manual-${camera._id}-${now.getTime()}`,
				eventType: 0, kind: 'manual', time: now, hour, dateString: local
			})
			await save(event._id, buf)
			return { success: true, eventId: event._id }
		} catch (error) {
			if (error instanceof PictureError) return { success: false, reason: error.reason, message: error.message }
			return { success: false, message: error.response?.data ? "Hik-Connect bilan bog'lanib bo'lmadi" : HikService.friendly(error.message) }
		}
	}

	// Kadr faylini beradi (huquq tekshiruvi bilan)
	async fileFor(eventId, user) {
		if (!validId(eventId)) return null
		const event = await hikCameraEventModel.findById(eventId).select('schoolId snapshot').lean()
		if (!event?.snapshot) return null
		const platformWide = user.role === 'superadmin' || user.role === 'monitor'
		if (!platformWide && String(event.schoolId) !== String(user.school)) return null
		const file = fileOf(eventId)
		return fs.existsSync(file) ? file : null
	}
}

const service = new HikSnapshotService()
service.decryptPicture = decryptPicture // sinov uchun
service.PictureError = PictureError
service.captureBuffer = captureBuffer // vision.service uchun
module.exports = service
