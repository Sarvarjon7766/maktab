// Hik-Connect for Teams (HikCentral Connect) OpenAPI mijozi — `hik/` papkasidagi
// ishlaydigan namunalar (hik_team_api_live_FIXED.py) asosida.
//
// Tizim egasi BIR NECHTA Hik akkaunt (API Key/Secret) qo'sha oladi. Akkauntdagi
// kameralar HikCamera'ga sinxronlanadi; har bir kamera faqat BITTA maktabga
// biriktiriladi (`schoolId`). Biriktirilgan kamera maktabning Kameralar qismida
// ko'rinadi, boshqa maktablar uchun esa "band" hisoblanadi.
//
// Endpointlar (hammasi hccgw):
//   POST /api/hccgw/platform/v1/token/get            -> accessToken, areaDomain
//   POST /api/hccgw/resource/v1/areas/cameras/get    -> data.camera[]
//   GET  /api/hccgw/platform/v1/streamtoken/get      -> appToken, streamAreaDomain
//   POST /api/hccgw/video/v1/live/address/get        -> data.url (ezopen://...)
const axios = require('axios')
const { inScope } = require('../utils/monitorScope')
const crypto = require('crypto')
const mongoose = require('mongoose')
const hikAccountModel = require('../models/hik.account.model')
const hikCameraModel = require('../models/hik.camera.model')
const schoolModel = require('../models/school.model')
const sinfModel = require('../models/sinf.model')
const hikEventModel = require('../models/hik.event.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const visionMetricModel = require('../models/hik.visionmetric.model')
const staffAttendanceModel = require('../models/attandance.model')
const StudentExcuse = require('./student.excuse.service')
const StaffExcuse = require('./excuse.service')
const { LESSON_START: LESSON_START_H, LESSON_END: LESSON_END_H } = require('../utils/lessonHours')
const studentModel = require('../models/student.model')
const studentAttendanceModel = require('../models/student.attandance.model')
const { encrypt, decrypt } = require('../utils/secretBox')

const DEFAULT_SERVER = 'https://isgp.hikcentralconnect.com'
// Hik-Connect for Teams hudud serverlari (hik/ papkadagi test dasturidan). Akkaunt bitta hududda
// ro'yxatdan o'tgan bo'ladi; noto'g'ri serverda kalit "AK_NOT_FOUND" (OPEN000001) beradi
const REGION_SERVERS = [
	DEFAULT_SERVER,
	'https://ieu.hikcentralconnect.com',
	'https://isa.hikcentralconnect.com',
	'https://ius.hikcentralconnect.com',
	'https://hikcentralconnectru.com'
]
const KEY_NOT_FOUND = 'OPEN000001'
const PAGE_SIZE = 500
const MAX_PAGES = 40
const CRED_FIELDS = '+appKey +secretKey +encryptionCode'

const sessions = new Map() // accountId -> { token, areaDomain, expiresAt }
const syncing = new Map() // accountId -> Promise
const tokenFlights = new Map() // accountId -> Promise (bir vaqtda bitta token so'rovi)
const tokenFails = new Map() // accountId -> { until, delay, message } (xato keshi: har tickda qayta urinmaslik uchun)
const TOKEN_FAIL_MIN = 15 * 1000
const TOKEN_FAIL_MAX = 2 * 60 * 1000
const forgetSession = (accountId) => { sessions.delete(String(accountId)); tokenFails.delete(String(accountId)); streamTokens.delete(String(accountId)) }
let syncAllRunning = false
// Stream token (jonli ko'rish uchun) har safar so'ralmasin: akkaunt bo'yicha qisqa muddat keshlanadi va bir vaqtdagi so'rovlar birlashtiriladi
// ("Hamma kameralar" sahifasida o'nlab oqim bir vaqtda ochilganda Hik bulutiga ortiqcha yuk tushmasin)
const STREAM_TOKEN_TTL_MS = 5 * 60 * 1000
const streamTokens = new Map() // accountId -> { at, data }
const streamFlights = new Map() // accountId -> Promise
async function getStreamToken(accountId, creds, force = false) {
	const key = String(accountId)
	const hit = streamTokens.get(key)
	if (!force && hit && Date.now() - hit.at < STREAM_TOKEN_TTL_MS) return hit.data
	if (streamFlights.has(key)) return streamFlights.get(key)
	const p = hik(accountId, creds, 'get', '/api/hccgw/platform/v1/streamtoken/get')
		.then((data) => { if (data.appToken && data.streamAreaDomain) streamTokens.set(key, { at: Date.now(), data }); return data })
		.finally(() => streamFlights.delete(key))
	streamFlights.set(key, p)
	return p
}
// Hik buluti kamera ro'yxatida "online" deydi, lekin qurilmaning o'zi (NVR) ulanmagan bo'lishi mumkin (jonli ko'rish/kadr EVZ20007 xatosini beradi).
// Shunday qurilma 10 daqiqa offline hisoblanadi: har 5 daqiqalik sinxronlash uni qayta "online" qilib yubormasin
const OFFLINE_HOLD_MS = 10 * 60 * 1000
const offlineSerials = new Map() // serial -> vaqt (ms) gacha offline
const isHeldOffline = (serial) => { const t = offlineSerials.get(serial); if (!t) return false; if (t < Date.now()) { offlineSerials.delete(serial); return false } return true }
const liveSeen = new Map() // qurilma serial -> oxirgi jonli ko'rish so'ralgan vaqt (odam sanash shu qurilmaga tegmasligi uchun)

const okOf = (body) => String(body?.errorCode) === '0'
const errorOf = (body) => `${body?.errorCode ?? ''} ${body?.message ?? ''}`.trim()
const cleanServer = (s) => (s || DEFAULT_SERVER).trim().replace(/\/+$/, '')
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')
const validId = (id) => mongoose.isValidObjectId(id)

async function loadCreds(accountId) {
	const acc = await hikAccountModel.findById(accountId).select(CRED_FIELDS).lean()
	if (!acc) throw new Error('Hik akkaunti topilmadi')
	// Kalitlar o'qilmasa (masalan JWT_SECRET/HIK_SECRETS_KEY o'zgargan) tushunarli xabar beramiz
	try {
		return { server: cleanServer(acc.server), appKey: decrypt(acc.appKey), secretKey: decrypt(acc.secretKey), code: acc.encryptionCode ? decrypt(acc.encryptionCode) : '' }
	} catch {
		throw new Error("Akkaunt kalitlarini o'qib bo'lmadi — kalitlarni akkaunt sahifasida qayta kiriting")
	}
}

const requestToken = (server, creds, timeout = 20000) =>
	axios.post(`${server}/api/hccgw/platform/v1/token/get`, { appKey: creds.appKey, secretKey: creds.secretKey }, { timeout })

async function fetchTokenRaw(accountId, creds) {
	let res = await requestToken(creds.server, creds)
	// Kalit shu serverda topilmasa — boshqa hudud serverlarini sinab, to'g'risini akkauntga saqlaymiz
	if (!okOf(res.data) && String(res.data?.errorCode) === KEY_NOT_FOUND) {
		for (const server of REGION_SERVERS.filter(x => x !== creds.server)) {
			try {
				const attempt = await requestToken(server, creds, 8000)
				if (okOf(attempt.data)) {
					res = attempt
					creds.server = server
					await hikAccountModel.updateOne({ _id: accountId }, { $set: { server } })
					console.log(`Hik akkaunt ${accountId}: to'g'ri hudud serveri topildi — ${server}`)
					break
				}
			} catch { /* bu server javob bermadi — keyingisini sinaymiz */ }
		}
	}
	if (!okOf(res.data)) {
		const hint = String(res.data?.errorCode) === KEY_NOT_FOUND ? " — API Key hech bir hudud serverida topilmadi. Kalit (AK) to'g'ri ko'chirilganini, bo'sh joy/qator qo'shilmaganini va AK/SK adashtirilmaganini tekshiring" : ''
		throw new Error(`Hik token olinmadi: ${errorOf(res.data)}${hint}`)
	}
	const data = res.data.data || {}
	if (!data.accessToken) throw new Error("Hik javobida accessToken yo'q")
	const expire = Number(data.expireTime)
	const session = {
		token: data.accessToken,
		areaDomain: (data.areaDomain || creds.server).replace(/\/+$/, ''),
		expiresAt: Number.isFinite(expire) && expire > Date.now() ? expire - 60 * 1000 : Date.now() + 6 * 24 * 3600 * 1000
	}
	sessions.set(String(accountId), session)
	return session
}

// Bir akkaunt uchun bir vaqtda bitta token so'rovi (qolganlari shuni kutadi); xato bo'lsa
// bir muddat qayta urinmaymiz (4 hudud x 8s har tickda takrorlanmasin)
function fetchToken(accountId, creds) {
	const key = String(accountId)
	const fail = tokenFails.get(key)
	if (fail && Date.now() < fail.until) return Promise.reject(new Error(fail.message))
	if (tokenFlights.has(key)) return tokenFlights.get(key)
	const p = fetchTokenRaw(accountId, creds).then(
		(session) => { tokenFails.delete(key); return session },
		(error) => {
			const delay = Math.min(TOKEN_FAIL_MAX, (fail?.delay || TOKEN_FAIL_MIN / 2) * 2)
			tokenFails.set(key, { until: Date.now() + delay, delay, message: error.message })
			throw error
		}
	).finally(() => tokenFlights.delete(key))
	tokenFlights.set(key, p)
	return p
}

async function getSession(accountId, creds, force = false) {
	const cached = sessions.get(String(accountId))
	if (!force && cached && Date.now() < cached.expiresAt) return cached
	return fetchToken(accountId, creds)
}

// Token yaroqsiz bo'lsa (HTTP 401 yoki xabarda "token") bir marta yangilab qayta urinadi
async function hik(accountId, creds, method, path, body, retry = true) {
	const session = await getSession(accountId, creds)
	let res
	try {
		res = await axios({ method, url: `${session.areaDomain}${path}`, data: body, headers: { Token: session.token, Accept: 'application/json' }, timeout: 30000 })
	} catch (error) {
		if (retry && error.response?.status === 401) { await getSession(accountId, creds, true); return hik(accountId, creds, method, path, body, false) }
		throw error
	}
	if (!okOf(res.data)) {
		if (retry && /token/i.test(res.data?.message || '')) { await getSession(accountId, creds, true); return hik(accountId, creds, method, path, body, false) }
		throw new Error(`Hik xatosi: ${errorOf(res.data)}`)
	}
	return res.data.data || {}
}

function normalize(c) {
	const dev = c.device || {}
	const info = dev.devInfo || {}
	const cameraId = c.id ?? c.cameraId
	if (!cameraId) return null
	return {
		cameraId: String(cameraId),
		serial: String(info.serialNo || info.deviceSerial || dev.deviceSerial || '').trim(),
		channelNo: Number(dev.channelInfo?.no) > 0 ? Number(dev.channelInfo.no) : 1,
		name: c.name || '',
		areaName: c.area?.name || '',
		online: c.online === undefined || c.online === null ? null : String(c.online) === '1'
	}
}

async function fetchAllCameras(accountId, creds) {
	const all = new Map()
	let lastFirst = null
	let finished = false
	for (let page = 1; page <= MAX_PAGES; page++) {
		const data = await hik(accountId, creds, 'post', '/api/hccgw/resource/v1/areas/cameras/get', {
			pageIndex: page, pageSize: PAGE_SIZE,
			filter: { areaID: '-1', includeSubArea: '1', deviceID: '', deviceSerialNo: '' }
		})
		const list = (data.camera || []).map(normalize).filter(Boolean)
		// Server sahifalashni qo'llamasa har safar bir xil ro'yxat qaytadi — takrorni to'xtatamiz
		if (list.length === 0 || list[0].cameraId === lastFirst) { finished = true; break }
		lastFirst = list[0].cameraId
		list.forEach(c => all.set(c.cameraId, c))
		if (list.length < PAGE_SIZE) { finished = true; break }
	}
	const result = [...all.values()]
	result.partial = !finished // MAX_PAGES'ga yetib to'xtagan — ro'yxat to'liq emas
	return result
}

// Qurilma Hik bulutida ulanmagan (EVZ20007): foydalanuvchiga tushunarli xabar
const OFFLINE_RE = /EVZ20007|device is offline/i
// Qurilma kadr so'roviga javob bermadi / Hik buluti band (OPEN000555, OPEN000550) yoki tarmoq vaqti tugadi
const BUSY_RE = /OPEN000555|OPEN000550|timeout|ETIMEDOUT|ECONNABORTED|ECONNRESET|socket hang up/i
const friendly = (message) => {
	if (OFFLINE_RE.test(message || '')) return "Kamera (qurilma) hozir offline: Hik-Connect'ga ulanmagan. Qurilma yoqilgan va internetga ulanganini tekshiring"
	if (BUSY_RE.test(message || '')) return "Qurilma javob bermadi yoki Hik buluti band (tarmoq sust bo'lishi mumkin). Tizim avtomatik sekinlashtirib qayta uriniladi"
	return message
}

const failure = (error) => {
	const detail = error.response?.data ? errorOf(error.response.data) : ''
	return `Hik-Connect bilan bog'lanib bo'lmadi: ${detail || error.message}`
}

// ---------- Aqlli kuzatuv (kameradan odam sanash) asosida dars holati va faollik ----------
const medianOf = (arr) => {
	const a = [...arr].sort((x, y) => x - y)
	const m = Math.floor(a.length / 2)
	return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
// Darsga kamida shuncha odam kerak: yolg'iz o'qituvchi (1 odam) yoki ikki kishi dars hisoblanmaydi. Sozlash: VISION_MIN_PEOPLE
const MIN_LESSON_PEOPLE = Math.max(1, Number(process.env.VISION_MIN_PEOPLE) || 3)
const FRESH_MS = 6 * 60 * 1000 // oxirgi o'lchov shundan eski bo'lsa "hozirgi holat" noma'lum
const ACTIVE_WINDOW_MS = 15 * 60 * 1000

// Sinf bo'yicha: hozirgi holat (active | empty | unknown), faollik va soatlik grafiklar
async function visionSummary(school, cameras, dateString, days, isToday) {
	const vcams = cameras.filter(c => c.visionEnabled)
	if (!vcams.length) return new Map()
	const camIds = vcams.map(c => c._id)
	const dates = [...days, dateString]
	const [recent, agg] = await Promise.all([
		isToday ? visionMetricModel.find({ schoolId: school, camera: { $in: camIds }, time: { $gte: new Date(Date.now() - ACTIVE_WINDOW_MS) } }).sort({ time: 1 }).select('camera count activity time').lean() : [],
		visionMetricModel.aggregate([
			{ $match: { schoolId: school, camera: { $in: camIds }, dateString: { $in: dates }, count: { $gt: 0 } } },
			{ $group: { _id: { sinf: '$sinfId', date: '$dateString', hour: '$hour' }, sum: { $sum: { $cond: [{ $isNumber: '$activity' }, '$activity', 0] } }, n: { $sum: { $cond: [{ $isNumber: '$activity' }, 1, 0] } }, cMax: { $max: '$count' }, cSum: { $sum: '$count' }, cN: { $sum: 1 } } }
		])
	])
	const now = Date.now()
	const out = new Map()
	for (const sid of new Set(vcams.map(c => String(c.sinfId)))) {
		const camSet = new Set(vcams.filter(c => String(c.sinfId) === sid).map(c => String(c._id)))
		const rows = recent.filter(r => camSet.has(String(r.camera)))

		// Hozirgi holat: har kameraning oxirgi 3 o'lchovi medianasi, sinf bo'yicha eng kattasi
		let state = 'unknown', count = null, at = null, emptyMin = null
		const perCam = new Map()
		rows.forEach(r => { const k = String(r.camera); if (!perCam.has(k)) perCam.set(k, []); perCam.get(k).push(r) })
		let best = null, latest = 0
		perCam.forEach(list => {
			const last = list[list.length - 1]
			if (now - last.time.getTime() > FRESH_MS) return
			const c = medianOf(list.slice(-3).map(r => r.count))
			best = best === null ? c : Math.max(best, c)
			latest = Math.max(latest, last.time.getTime())
		})
		if (best !== null) {
			count = Math.round(best); at = new Date(latest); state = count >= MIN_LESSON_PEOPLE ? 'active' : 'empty'
			if (state === 'empty') {
				let since = latest
				for (let i = rows.length - 1; i >= 0 && rows[i].count < MIN_LESSON_PEOPLE; i--) since = rows[i].time.getTime()
				emptyMin = Math.max(0, Math.round((latest - since) / 60000))
			}
		}

		// Faollik: hozirgi (oxirgi 15 daqiqa, odam bor o'lchovlar o'rtachasi) va soatlik/kunlik grafiklar
		const acts = rows.filter(r => r.count >= MIN_LESSON_PEOPLE && typeof r.activity === 'number').map(r => r.activity)
		const today = Array(24).fill(0), baseSum = Array(24).fill(0), baseN = Array(24).fill(0)
		const dailySum = new Map(), dailyN = new Map()
		let pastSum = 0, pastN = 0, maxToday = 0, cSumToday = 0, cNToday = 0
		for (const a of agg) {
			if (String(a._id.sinf) !== sid) continue
			const d = a._id.date, h = a._id.hour
			if (d === dateString) { maxToday = Math.max(maxToday, a.cMax); cSumToday += a.cSum; cNToday += a.cN }
			dailySum.set(d, (dailySum.get(d) || 0) + a.sum); dailyN.set(d, (dailyN.get(d) || 0) + a.n)
			if (d === dateString) today[h] = a.n ? Math.round(a.sum / a.n * 1000) / 10 : 0
			else { baseSum[h] += a.sum; baseN[h] += a.n; pastSum += a.sum; pastN += a.n }
		}
		const daily = new Map()
		dailySum.forEach((sum, d) => { if (dailyN.get(d)) daily.set(d, Math.round(sum / dailyN.get(d) * 1000) / 10) })
		const dayMean = dailyN.get(dateString) ? dailySum.get(dateString) / dailyN.get(dateString) : null
		out.set(sid, {
			state, count, at, emptyMin,
			actNow: isToday ? (acts.length ? acts.reduce((a, b) => a + b, 0) / acts.length : null) : dayMean,
			today, baseline: baseSum.map((x, h) => (baseN[h] ? Math.round(x / baseN[h] * 1000) / 10 : 0)), daily,
			baseNow: pastN ? Math.round(pastSum / pastN * 1000) / 10 : null,
			hasDay: dailyN.has(dateString),
			maxToday: maxToday || null, avgToday: cNToday ? Math.round(cSumToday / cNToday) : null,
			spark: acts.slice(-12).map(a => Math.round(a * 100))
		})
	}
	return out
}

// Aqlli kuzatuv ma'lumotidan omillar: dars holati, xona faolligi, sinf to'lishi (zichlik).
// icon — belgi nomi, meter — chiziqli ko'rsatkich ({ pct, zones? }), spark — mini-grafik (so'nggi qiymatlar, %)
function visionFactors(vz, students, lessonNow, isToday, bd = null) {
	const idle = isToday && vz.state === 'empty' && lessonNow
	let lesson
	if (!isToday) lesson = { value: "Kunlik ma'lumot", status: 'unknown', note: vz.hasDay ? "Tanlangan kun bo'yicha o'lchovlar mavjud" : "Bu kunda kuzatuv o'lchovi yo'q" }
	else if (vz.state === 'active') lesson = { value: 'Dars bormoqda', status: 'good', note: `Kamerada ${vz.count} odam aniqlandi${bd && bd.basis === 'faceid' ? ` · FaceID bo'yicha maktabda ${bd.inside} o'quvchi` : ''}` }
	else if (vz.state === 'empty') lesson = lessonNow
		? { value: "Dars bo'lmayapti", status: 'bad', note: `${vz.count > 0 ? `Sinfda atigi ${vz.count} odam (o'qituvchi bo'lishi mumkin)` : 'Sinfda odam aniqlanmadi'}${vz.emptyMin ? ` (${vz.emptyMin}+ daqiqadan beri)` : ''}${bd && bd.basis === 'faceid' && bd.expected ? ` · FaceID bo'yicha maktabda ${bd.expected} o'quvchi bor, ular boshqa xonada bo'lishi mumkin` : ''}` }
		: { value: "Sinf bo'sh", status: 'unknown', note: 'Dars vaqtidan tashqari' }
	else lesson = { value: "Ma'lumot yo'q", status: 'unknown', note: "Kameradan yaqinda kadr olinmadi (qurilma offline yoki jonli ko'rish ochiq bo'lishi mumkin)" }

	const noFresh = isToday && vz.state === 'unknown'
	const noDataNote = "Kameradan yaqinda kadr olinmadi"
	let activity
	if (noFresh) activity = { value: "Ma'lumot yo'q", status: 'unknown', note: noDataNote, score: 70, skip: true }
	else if (isToday && vz.state === 'empty') activity = { value: "Sinf bo'sh", status: 'unknown', note: "Odam yo'q, harakat o'lchanmaydi", score: 70 }
	else if (vz.actNow === null || vz.actNow === undefined) activity = { value: 'Hisoblanmoqda', status: 'unknown', note: 'Kamida ikkita ketma-ket kadr kerak (taxminan 2 daqiqa). Kunlik tarix shart emas', score: 70 }
	else {
		const pct = Math.round(vz.actNow * 100)
		const cls = pct < 20 ? ['Tinch', 'good', 100] : pct < 40 ? ["O'rtacha harakat", 'mid', 65] : ['Yuqori harakat', 'bad', 35]
		activity = {
			value: cls[0], status: cls[1], score: cls[2],
			note: `Odamlarning ${pct}% i oldingi kadrga nisbatan joyidan siljigan yoki almashgan${vz.baseNow !== null ? ` · odatiy ${vz.baseNow}%` : ''}${pct >= 40 ? " (tanafus yoki guruh ishi bo'lishi mumkin)" : ''}`,
			meter: { pct: Math.min(100, pct), zones: [20, 40] }, spark: vz.spark
		}
	}

	// Sinfdagi o'quvchilar: kamera soni (o'qituvchi hisobiga -1) FaceID asosidagi KUTILGAN son bilan solishtiriladi.
	// Kutilgan = ro'yxat − sababli kelmaganlar − kelmaganlar − maktabdan ketganlar. Ro'yxat yo'q bo'lsa faqat kamera bo'yicha
	let density = null
	if (isToday && (vz.state === 'active' || vz.state === 'empty') && bd) {
		const cam = vz.count
		const pupils = Math.max(0, cam - (cam > 0 ? 1 : 0))
		const exp = bd.expected
		const tol = Math.max(2, Math.round(exp * 0.15))
		const diff = pupils - exp
		const parts = `Kutilgan ${exp}: ro'yxat ${bd.roster}${bd.excused ? ` − sababli ${bd.excused}` : ''}${bd.absent ? ` − kelmagan ${bd.absent}` : ''}${bd.left ? ` − ketgan ${bd.left}` : ''}${bd.basis === 'roster' ? ' (FaceControl hali qayd etmagan)' : ''}`
		const meter = { pct: exp > 0 ? Math.min(100, Math.round(pupils / exp * 100)) : (pupils ? 100 : 0), over: diff > tol }
		if (vz.state === 'empty') {
			density = exp > 0
				? { value: `0 / ${exp}`, status: 'mid', score: 100, skip: true, note: `${parts} · kamerada ${cam > 0 ? `atigi ${cam} odam` : 'hech kim yo\'q'}`, meter }
				: { value: '0 / 0', status: 'unknown', score: 100, skip: true, note: parts, meter }
		} else if (Math.abs(diff) <= tol) density = { value: `${pupils} / ${exp}`, status: 'good', score: 100, note: `${parts} · kamerada ${cam} odam (o'qituvchi hisobiga +1)`, meter }
		else if (diff < 0) {
			const bad = -diff / Math.max(1, exp) >= 0.3
			density = { flag: 'missing', value: `${pupils} / ${exp}`, status: bad ? 'bad' : 'mid', score: bad ? 35 : 65, note: `${parts} · ${-diff} nafar o'quvchi maktabda, lekin sinfda emas`, meter }
		} else density = { flag: 'extra', value: `${pupils} / ${exp}`, status: diff > tol * 2 ? 'bad' : 'mid', score: diff > tol * 2 ? 35 : 65, note: `${parts} · kutilganidan ${diff} ta ortiq odam`, meter }
	} else if (isToday && vz.state === 'active') {
		density = {
			value: `${vz.count} odam`, status: 'unknown', score: 100, skip: true,
			note: vz.maxToday ? `Bugun eng ko'pi ${vz.maxToday}${vz.avgToday ? `, o'rtachasi ${vz.avgToday}` : ''} · sinf ro'yxati yo'q, shu sababli faqat kamera bo'yicha` : "Sinf ro'yxati yo'q: faqat kamera bo'yicha",
			meter: vz.maxToday ? { pct: Math.min(100, Math.round(vz.count / vz.maxToday * 100)) } : null
		}
	} else if (isToday && vz.state === 'empty') density = { value: '0 odam', status: 'unknown', score: 100, note: "Sinf bo'sh", meter: { pct: 0 }, skip: true }
	else if (noFresh) density = { value: "Ma'lumot yo'q", status: 'unknown', score: 100, note: noDataNote, meter: null, skip: true }
	return {
		idle,
		lesson: { key: 'lesson', icon: 'lesson', label: 'Dars holati', ...lesson },
		activity: { key: 'activity', icon: 'activity', label: 'Xona faolligi', ...activity },
		density: density && { key: 'density', icon: 'density', label: bd ? "Sinfdagi o'quvchilar" : "Sinf to'lishi", ...density },
		info: { state: vz.state, count: vz.count, at: vz.at, emptyMin: vz.emptyMin }
	}
}
const agoText = (d) => {
	if (!d) return null
	const sec = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000))
	return sec < 60 ? 'hozirgina' : sec < 3600 ? `${Math.round(sec / 60)} daqiqa oldin` : `${Math.round(sec / 3600)} soat oldin`
}
const withoutScore = ({ score, skip, flag, ...rest }) => rest // eslint-disable-line no-unused-vars

class HikConnectService {
	// Shu qurilmada oxirgi `withinMs` ichida jonli ko'rish ochilganmi
	liveActive(serial, withinMs) { return !!serial && Date.now() - (liveSeen.get(serial) || 0) < withinMs }
	isBusyError(error) { return BUSY_RE.test(`${error?.message || ''} ${error?.code || ''}`) }
	isOfflineError(error) { return OFFLINE_RE.test(error?.message || '') }

	// Qurilma haqiqatan ulanmaganligi aniqlandi (jonli ko'rish yoki kadr olishda): shu qurilma kameralarini offline qiladi
	async markDeviceOffline(accountId, serial) {
		if (!serial) return
		offlineSerials.set(serial, Date.now() + OFFLINE_HOLD_MS)
		await hikCameraModel.updateMany({ accountId, serial }, { $set: { online: false } }).catch(() => { })
		await hikCameraModel.updateMany({ accountId, serial, offlineSince: null }, { $set: { offlineSince: new Date() } }).catch(() => { })
	}
	// Qurilma qayta ulandi (jonli ko'rish ochildi): offline belgisini olib tashlaydi
	async markDeviceOnline(accountId, serial) {
		if (!serial) return
		offlineSerials.delete(serial)
		await hikCameraModel.updateMany({ accountId, serial, offlineSince: { $ne: null } }, { $set: { offlineSince: null, online: true, lastSeenAt: new Date() } }).catch(() => { })
	}
	// Offline deb belgilangan har qurilmadan bitta kameraning jonli manzilini so'rab ko'radi: ochilsa qurilma qaytgan
	async reprobeDown(accountId, creds, serials) {
		for (const serial of serials) {
			const cam = await hikCameraModel.findOne({ accountId, serial, inCloud: true }).select('cameraId').lean()
			if (!cam) continue
			try {
				const body = { resourceId: cam.cameraId, deviceSerial: serial, type: '1', protocol: '1' }
				if (creds.code) body.code = creds.code
				const r = await hik(accountId, creds, 'post', '/api/hccgw/video/v1/live/address/get', body)
				if (r.url) await this.markDeviceOnline(accountId, serial)
			} catch (e) {
				if (OFFLINE_RE.test(e.message || '')) await this.markDeviceOffline(accountId, serial)
			}
			await new Promise((r) => setTimeout(r, 300))
		}
	}
	friendly(message) { return friendly(message) }

	// ---------- Akkauntlar ----------

	// Yangi akkaunt qo'shadi; xuddi shu API Key allaqachon bo'lsa — yangisini yaratmay, o'shani yangilaydi.
	// `id` berilsa — shu akkauntni tahrirlaydi (secret/shifrlash kodi bo'sh bo'lsa eskisi saqlanadi)
	async saveAccount({ id, name, server, appKey, secretKey, encryptionCode }) {
		const key = (appKey || '').trim()
		const secret = (secretKey || '').trim()
		let acc = null
		if (id) {
			if (!validId(id)) return { success: false, message: "Akkaunt id noto'g'ri" }
			acc = await hikAccountModel.findById(id).select('+appKeyHash')
			if (!acc) return { success: false, message: 'Akkaunt topilmadi' }
		} else {
			if (!key || !secret) return { success: false, message: 'API Key va API Secret majburiy' }
			acc = await hikAccountModel.findOne({ appKeyHash: sha(key) })
		}
		const existed = !!acc
		if (!acc) acc = new hikAccountModel({ name: (name || '').trim() || 'Hik-Connect akkaunt' })
		if (name && name.trim()) acc.name = name.trim()
		if (key) { acc.appKey = encrypt(key); acc.appKeyHash = sha(key); acc.appKeyHint = key.slice(0, 4) + '…' + key.slice(-3) }
		if (secret) acc.secretKey = encrypt(secret)
		if (typeof encryptionCode === 'string' && encryptionCode.trim()) acc.encryptionCode = encrypt(encryptionCode.trim())
		if (server || !acc.server) acc.server = cleanServer(server)
		acc.lastSyncError = null
		try {
			await acc.save()
		} catch (error) {
			if (error.code === 11000) return { success: false, message: 'Bu API Key bilan akkaunt allaqachon mavjud' }
			throw error
		}
		forgetSession(acc._id)
		return { success: true, accountId: acc._id, existed }
	}

	async deleteAccount(id) {
		if (!validId(id)) return { success: false, message: "Akkaunt id noto'g'ri" }
		const res = await hikAccountModel.deleteOne({ _id: id })
		if (!res.deletedCount) return { success: false, message: 'Akkaunt topilmadi' }
		await hikCameraModel.deleteMany({ accountId: id })
		forgetSession(id)
		return { success: true }
	}

	// Kalitlar to'g'riligini tekshiradi (token + kameralar soni), hech narsa saqlamaydi
	async test(id) {
		if (!validId(id)) return { success: false, message: "Akkaunt id noto'g'ri" }
		try {
			const creds = await loadCreds(id)
			const cameras = await fetchAllCameras(id, creds)
			return { success: true, total: cameras.length, online: cameras.filter(c => c.online === true).length }
		} catch (error) {
			return { success: false, message: failure(error) }
		}
	}

	// Akkauntdagi kameralarni bulutdan olib HikCamera'ni yangilaydi. Maktabga biriktirishga (`schoolId`) TEGMAYDI
	async sync(id) {
		if (!validId(id)) return { success: false, message: "Akkaunt id noto'g'ri" }
		const key = String(id)
		if (syncing.has(key)) return syncing.get(key)
		const job = (async () => {
			try {
				const creds = await loadCreds(id)
				const cameras = await fetchAllCameras(id, creds)
				const now = new Date()
				const ids = cameras.map(c => c.cameraId)
				// Bulut "online" deydi, lekin qurilma jonli ko'rishda offline chiqqan bo'lsa — qayta tekshirib ko'rilmaguncha offline
				const downSerials = new Set((await hikCameraModel.distinct('serial', { accountId: id, offlineSince: { $ne: null } })).filter(Boolean))
				const isDown = (c) => !!c.serial && (downSerials.has(c.serial) || isHeldOffline(c.serial))
				const existing = new Set((await hikCameraModel.find({ accountId: id, cameraId: { $in: ids } }).select('cameraId').lean()).map(c => c.cameraId))
				if (cameras.length) {
					await hikCameraModel.bulkWrite(cameras.map(c => ({
						updateOne: {
							filter: { accountId: id, cameraId: c.cameraId },
							update: { $set: { serial: c.serial, channelNo: c.channelNo, name: c.name, areaName: c.areaName, online: isDown(c) ? false : c.online, inCloud: true, syncedAt: now, ...(c.online === true && !isDown(c) ? { lastSeenAt: now } : {}) } },
							upsert: true
						}
					})))
				}
				if (downSerials.size) await this.reprobeDown(id, creds, downSerials).catch((e) => console.log('Hik qayta tekshiruv xatosi:', e.message))
				// Bo'sh yoki to'liq bo'lmagan ro'yxat bo'yicha kameralarni "bulutda yo'q" deb belgilamaymiz
				let gone = { modifiedCount: 0 }
				if (cameras.length && !cameras.partial) gone = await hikCameraModel.updateMany({ accountId: id, cameraId: { $nin: ids }, inCloud: true }, { $set: { inCloud: false, online: null } })
				await hikAccountModel.updateOne({ _id: id }, { $set: { lastSyncAt: now, lastSyncError: null } })
				return { success: true, total: cameras.length, added: cameras.filter(c => !existing.has(c.cameraId)).length, missing: gone.modifiedCount, syncedAt: now }
			} catch (error) {
				const message = failure(error)
				console.log(`Hik sync xatosi (${key}):`, error.message)
				await hikAccountModel.updateOne({ _id: id }, { $set: { lastSyncError: message } }).catch(() => { })
				return { success: false, message }
			} finally {
				syncing.delete(key)
			}
		})()
		syncing.set(key, job)
		return job
	}

	// Barcha akkauntlarni ketma-ket yangilaydi (cron uchun)
	async syncAll() {
		if (syncAllRunning) return
		syncAllRunning = true
		try {
			const accounts = await hikAccountModel.find().select('_id').lean()
			for (const a of accounts) await this.sync(a._id)
		} finally {
			syncAllRunning = false
		}
	}

	// Tizim egasi: akkauntlar va ulardagi kameralar soni
	async accountsOverview() {
		const [accounts, counts] = await Promise.all([
			hikAccountModel.find().sort({ createdAt: 1 }).lean(),
			hikCameraModel.aggregate([{ $match: { inCloud: true } }, { $group: { _id: '$accountId', total: { $sum: 1 }, assigned: { $sum: { $cond: [{ $ne: ['$schoolId', null] }, 1, 0] } }, online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } } } }])
		])
		const map = new Map(counts.map(c => [String(c._id), c]))
		return {
			success: true,
			accounts: accounts.map(a => ({
				_id: a._id, name: a.name, server: a.server, appKeyHint: a.appKeyHint, lastSyncAt: a.lastSyncAt, lastSyncError: a.lastSyncError,
				cameraTotal: map.get(String(a._id))?.total || 0, cameraAssigned: map.get(String(a._id))?.assigned || 0, cameraOnline: map.get(String(a._id))?.online || 0
			}))
		}
	}

	// Tizim egasi, "Maktablar" sahifasi: har maktabdagi kameralar TUR bo'yicha alohida —
	// oddiy (monitor), FaceControl kirish (in) va chiqish (out); har birida jami va online soni
	async schoolsSummary() {
		const rows = await hikCameraModel.aggregate([
			{ $match: { schoolId: { $ne: null }, inCloud: true } },
			{ $group: { _id: { school: '$schoolId', role: '$role' }, total: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } } } }
		])
		const summary = {}
		for (const r of rows) {
			const id = String(r._id.school)
			if (!summary[id]) summary[id] = { monitor: { total: 0, online: 0 }, in: { total: 0, online: 0 }, out: { total: 0, online: 0 } }
			summary[id][r._id.role || 'monitor'] = { total: r.total, online: r.online }
		}
		return { success: true, summary }
	}

	// Tizim egasi: barcha akkauntlardagi kameralar, qaysi maktabga biriktirilgani bilan
	async listCameras() {
		const [cameras, schools, accounts] = await Promise.all([
			hikCameraModel.find({ inCloud: true }).sort({ areaName: 1, name: 1 }).lean(),
			schoolModel.find().select('name').lean(),
			hikAccountModel.find().select('name').lean()
		])
		const schoolNames = new Map(schools.map(s => [String(s._id), s.name]))
		const accountNames = new Map(accounts.map(a => [String(a._id), a.name]))
		return {
			success: true,
			cameras: cameras.map(c => ({ ...c, schoolName: c.schoolId ? schoolNames.get(String(c.schoolId)) || null : null, accountName: accountNames.get(String(c.accountId)) || '' }))
		}
	}

	// Maktabga biriktiriladigan kameralar TO'PLAMI, TUR bo'yicha alohida:
	//   kind='monitor'     — oddiy kuzatuv kameralari (maktab adminiga umumiy ko'rinadi)
	//   kind='facecontrol' — FaceControl kirish/chiqish kameralari: [{ id, role: 'in' | 'out' }]
	// Har bir tur faqat O'Z kameralariga tegadi: tanlanmagan (shu maktabdagi, shu turdagi) kameralar
	// yechiladi, boshqa turdagi kameralar o'zgarmaydi. Faqat biriktirilmagan yoki shu maktabning shu
	// turdagi kameralari biriktiriladi; boshqa maktabga yoki boshqa turga biriktirilganlar tegilmaydi
	// va `conflicts` sifatida qaytariladi
	async saveAssignment(schoolId, items, userId, kind = 'monitor') {
		if (!validId(schoolId) || !(await schoolModel.exists({ _id: schoolId }))) return { success: false, message: 'Maktab topilmadi' }
		const faceControl = kind === 'facecontrol'
		const KIND_ROLES = faceControl ? ['in', 'out'] : ['monitor']
		const wanted = new Map()
		for (const it of (Array.isArray(items) ? items : [])) {
			const id = typeof it === 'string' ? it : it?.id
			if (!validId(id)) continue
			wanted.set(String(id), faceControl ? (it?.role === 'out' ? 'out' : 'in') : 'monitor')
		}
		const ids = [...wanted.keys()]
		const now = new Date()
		const school = new mongoose.Types.ObjectId(String(schoolId))
		// shu turga mos keladigan kameralar: biriktirilmagan yoki shu maktabning shu turdagisi
		const allowed = { $or: [{ schoolId: null }, { schoolId, role: { $in: KIND_ROLES } }] }
		const okDocs = await hikCameraModel.find({ _id: { $in: ids }, inCloud: true, ...allowed }).select('_id').lean()
		const okIds = new Set(okDocs.map(c => String(c._id)))
		const blocked = await hikCameraModel.find({ _id: { $in: ids.filter(id => !okIds.has(id)) } }).select('name').lean()
		for (const role of KIND_ROLES) {
			const group = ids.filter(id => okIds.has(id) && wanted.get(id) === role)
			if (!group.length) continue
			await hikCameraModel.updateMany({ _id: { $in: group } }, { $set: { schoolId, role, assignedBy: userId || null, assignedAt: now, ...(role === 'monitor' ? { autoAttendance: false } : {}) } })
		}
		const off = await hikCameraModel.updateMany({ schoolId, role: { $in: KIND_ROLES }, _id: { $nin: [...okIds] } }, { $set: { schoolId: null, assignedBy: null, assignedAt: null, role: 'monitor', sinfId: null, autoAttendance: false, visionEnabled: false } })
		return { success: true, assigned: await hikCameraModel.countDocuments({ schoolId, role: { $in: KIND_ROLES } }), detached: off.modifiedCount, conflicts: blocked.map(c => c.name) }
	}

	// Tizim egasi: tanlangan kameralarni biriktirilgan maktabdan ajratadi (yechadi). Kamera Hik akkauntida qoladi va qayta
	// biriktirilishi mumkin; maktabdagi sinf bog'lanishi va avto-davomat o'chadi, eski hodisalar maktabda saqlanib qoladi
	async detachCameras(ids) {
		const list = (Array.isArray(ids) ? ids : []).filter(validId)
		if (!list.length) return { success: false, message: 'Kamera tanlanmagan' }
		const r = await hikCameraModel.updateMany({ _id: { $in: list }, schoolId: { $ne: null } }, { $set: { schoolId: null, assignedBy: null, assignedAt: null, role: 'monitor', sinfId: null, autoAttendance: false, visionEnabled: false } })
		return { success: true, detached: r.modifiedCount }
	}

	// Maktab admini uchun: faqat o'z maktabiga BIRIKTIRILGANLAR (o'qish)
	async listForSchool(schoolId) {
		const cameras = await hikCameraModel.find({ schoolId }).sort({ areaName: 1, name: 1 }).select('cameraId serial name areaName online lastSeenAt syncedAt inCloud role zone capacity sinfId autoAttendance visionEnabled faceDirection lastEventAt').populate('sinfId', 'name').lean()
		return { success: true, cameras: cameras.map(c => ({ ...c, faceDirection: c.faceDirection || 'in', sinf: c.sinfId ? { _id: c.sinfId._id, name: c.sinfId.name } : null, sinfId: c.sinfId?._id || null })) }
	}

	// Maktab admini: o'z maktabiga biriktirilgan kamerani sinfga bog'laydi va (FaceControl kamerasida)
	// avto-davomatni yoqadi. Vazifani (kirish/chiqish) faqat tizim egasi belgilaydi. Boshqa maktab kamerasiga tegib bo'lmaydi
	// `role`: maktab admini faqat 'monitor' (sinfxona kamerasi) va 'hall' (zal/koridor kamerasi) o'rtasida almashtira oladi;
	// 'in'/'out' (FaceControl) ni faqat tizim egasi belgilaydi. `capacity` — zal kamerasida "zich" hisoblanadigan odam soni
	async updateCameraSettings(schoolId, id, { sinfId, autoAttendance, visionEnabled, role, capacity, faceDirection }) {
		if (!validId(id)) return { success: false, message: "Kamera id noto'g'ri" }
		const camera = await hikCameraModel.findOne({ _id: id, schoolId })
		if (!camera) return { success: false, message: 'Kamera topilmadi' }
		const SCHOOL_ROLES = ['monitor', 'hall']
		if (role !== undefined && role !== camera.role) {
			if (!SCHOOL_ROLES.includes(role) || !SCHOOL_ROLES.includes(camera.role)) return { success: false, message: "Kamera vazifasini o'zgartirib bo'lmaydi (FaceControl kamerasini tizim egasi belgilaydi)" }
			camera.role = role
			if (role === 'hall') { camera.sinfId = null; if (visionEnabled === undefined) camera.visionEnabled = true } // zal kamerasi sinfga bog'lanmaydi, tahlil o'zi yoqiladi
		}
		if (sinfId !== undefined) {
			if (sinfId) {
				if (!validId(sinfId) || !(await sinfModel.exists({ _id: sinfId, schoolId }))) return { success: false, message: 'Sinf topilmadi' }
				if (!SCHOOL_ROLES.includes(camera.role)) return { success: false, message: "FaceControl kamerasi sinfga biriktirilmaydi" }
				camera.sinfId = sinfId
				camera.role = 'monitor' // sinfga biriktirilgan kamera — sinfxona kamerasi
				if (camera.faceDirection === 'out') camera.faceDirection = 'in' // sinfxona kamerasi chiqishni aniqlamaydi
				// Sinfga biriktirilgan oddiy kamerada AI odam sanash o'zi yoqiladi (xohlasa admin o'chira oladi)
				if (visionEnabled === undefined) camera.visionEnabled = true
			} else camera.sinfId = null
		}
		if (capacity !== undefined) {
			const n = Number(capacity)
			if (capacity !== null && capacity !== '' && (!Number.isFinite(n) || n < 5 || n > 5000)) return { success: false, message: "Zichlik chegarasi 5 dan 5000 gacha bo'lishi kerak" }
			camera.capacity = capacity === null || capacity === '' ? null : Math.round(n)
		}
		if (faceDirection !== undefined) {
			if (!['in', 'out', 'off'].includes(faceDirection)) return { success: false, message: "Yuz tanish yo'nalishi noto'g'ri" }
			// «Chiqdi» faqat darvoza kamerasidan: sinfga biriktirilgan kamera chiqishni aniqlamaydi (sinfxona kamerasi = maktab hududida)
			if (faceDirection === 'out' && (camera.sinfId || !SCHOOL_ROLES.includes(camera.role))) return { success: false, message: "Chiqishni faqat sinfga biriktirilmagan (darvoza) kamera aniqlaydi" }
			camera.faceDirection = faceDirection
		}
		if (autoAttendance !== undefined) camera.autoAttendance = !SCHOOL_ROLES.includes(camera.role) && !!autoAttendance
		// Odam sanash: sinfxona kamerasida sinfga biriktirilgan bo'lsa, zal kamerasida har doim ma'noli
		const canCount = SCHOOL_ROLES.includes(camera.role) && (camera.role === 'hall' || !!camera.sinfId)
		if (visionEnabled !== undefined) {
			if (visionEnabled && !canCount) return { success: false, message: "Odam sanash uchun kamerani sinfga biriktiring yoki zal kamerasi qiling" }
			camera.visionEnabled = !!visionEnabled
		}
		if (!canCount) camera.visionEnabled = false
		await camera.save()
		return { success: true, camera: { _id: camera._id, role: camera.role, sinfId: camera.sinfId || null, visionEnabled: camera.visionEnabled, capacity: camera.capacity ?? null, faceDirection: camera.faceDirection || 'in' } }
	}

	// Bir nechta kamerani birdan sozlash (masalan hammasini bitta sinfga biriktirish yoki sanashni yoqish)
	async bulkUpdateCameras(schoolId, ids, settings) {
		const list = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(validId).slice(0, 200)
		if (!list.length) return { success: false, message: 'Kamera tanlanmagan' }
		const allowed = {}
		for (const k of ['sinfId', 'visionEnabled', 'role', 'faceDirection']) if (settings && settings[k] !== undefined) allowed[k] = settings[k]
		if (!Object.keys(allowed).length) return { success: false, message: "O'zgartirish tanlanmagan" }
		let done = 0
		const failed = []
		for (const id of list) {
			const r = await this.updateCameraSettings(schoolId, id, allowed)
			if (r.success) done++; else failed.push({ id, message: r.message })
		}
		return { success: done > 0, done, failed, message: done ? undefined : (failed[0]?.message || 'Saqlanmadi') }
	}

	// FaceControl sahifasi: yuz aniqlash kameralari, tanlangan kun hodisalari va sanoq
	async facecontrol(schoolId, dateString) {
		const cameras = await hikCameraModel.find({ schoolId, role: { $in: ['in', 'out'] } }).sort({ role: -1, areaName: 1, name: 1 })
			.select('cameraId serial name areaName online lastSeenAt inCloud role sinfId autoAttendance lastEventAt').populate('sinfId', 'name').lean()
		const ids = cameras.map(c => c._id)
		const [perCamera, recent, totals] = await Promise.all([
			hikEventModel.aggregate([
				{ $match: { camera: { $in: ids }, dateString } },
				{ $group: { _id: '$camera', events: { $sum: 1 }, people: { $addToSet: '$humanId' }, matched: { $sum: { $cond: [{ $ne: ['$personType', null] }, 1, 0] } } } }
			]),
			hikEventModel.find({ schoolId, dateString }).sort({ time: -1 }).limit(40).populate('sinf', 'name').lean(),
			hikEventModel.aggregate([
				{ $match: { schoolId: new mongoose.Types.ObjectId(String(schoolId)), dateString } },
				{ $group: { _id: { dir: '$direction', person: '$personType' }, people: { $addToSet: { $ifNull: ['$student', '$user'] } }, events: { $sum: 1 } } }
			])
		])
		const stat = new Map(perCamera.map(r => [String(r._id), { events: r.events, people: r.people.length, matched: r.matched }]))
		const count = (dir, person) => totals.find(t => t._id.dir === dir && t._id.person === person)?.people.length || 0
		const camName = new Map(cameras.map(c => [String(c._id), c.name]))
		return {
			success: true, dateString,
			cameras: cameras.map(c => ({ ...c, sinf: c.sinfId ? { _id: c.sinfId._id, name: c.sinfId.name } : null, sinfId: c.sinfId?._id || null, today: stat.get(String(c._id)) || { events: 0, people: 0, matched: 0 } })),
			totals: { studentsIn: count('in', 'student'), studentsOut: count('out', 'student'), staffIn: count('in', 'staff'), staffOut: count('out', 'staff'), events: totals.reduce((a, t) => a + t.events, 0) },
			events: recent.map(e => ({ _id: e._id, time: e.time, direction: e.direction, camera: camName.get(String(e.camera)) || '', humanId: e.humanId, humanName: e.humanName, personName: e.personName, personType: e.personType, sinf: e.sinf?.name || '', similarity: e.similarity, recorded: e.recorded, note: e.note }))
		}
	}

	// Sinfxonalar tahlili: FAQAT sinfga biriktirilgan oddiy kameralar. Hik API kadrdagi odamlarni sanab
	// bermaydi, shuning uchun dars holati to'rt omil bo'yicha baholanadi: sinf davomati, xona faolligi
	// (sinfning O'Z odatiy — oxirgi 7 kunlik — faolligiga nisbatan), odam zichligi signallari va kamera holati.
	// options.all — kamerasiz sinflar ham kiradi (faqat davomat asosida baholanadi); options.sinfId — faqat shu sinf
	async classrooms(schoolId, dateString, { all = false, sinfId = null } = {}) {
		const LESSON_START = LESSON_START_H
		const LESSON_END = LESSON_END_H
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
		const isToday = dateString === todayStr
		const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hour12: false }).format(new Date())) % 24
		const untilHour = isToday ? nowHour : 23
		const lessonNow = isToday && nowHour >= LESSON_START && nowHour < LESSON_END

		const cameras = await hikCameraModel.find({ schoolId, role: 'monitor', sinfId: { $ne: null } }).sort({ name: 1 })
			.select('cameraId serial name areaName online lastSeenAt inCloud sinfId visionEnabled').lean()
		const camIds = cameras.map(c => c._id)
		let sinfIds = [...new Set(cameras.map(c => String(c.sinfId)))]
		if (all) {
			const filter = { schoolId }
			if (sinfId && mongoose.isValidObjectId(sinfId)) filter._id = sinfId
			sinfIds = (await sinfModel.find(filter).select('_id').lean()).map(x => String(x._id))
		}
		const days = []
		for (let i = 1; i <= 7; i++) { const d = new Date(`${dateString}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - i); days.push(d.toISOString().slice(0, 10)) }
		const since = new Date(Date.now() - 60 * 60 * 1000)
		const vision = await visionSummary(school, cameras, dateString, days, isToday).catch(() => new Map())

		const [sinfs, rosters, attendance, today, past, recent] = await Promise.all([
			sinfModel.find({ _id: { $in: sinfIds } }).populate('head', 'fullName photo').lean(),
			studentModel.aggregate([{ $match: { schoolId: school, isActive: { $ne: false } } }, { $group: { _id: '$sinf', total: { $sum: 1 } } }]),
			studentAttendanceModel.aggregate([
				{ $match: { schoolId: school, dateString, status: { $in: ['ishda', 'tashqarida'] } } },
				{ $lookup: { from: 'students', localField: 'student', foreignField: '_id', as: 's' } }, { $unwind: '$s' },
				{ $group: { _id: '$s.sinf', came: { $sum: 1 }, inside: { $sum: { $cond: [{ $eq: ['$status', 'ishda'] }, 1, 0] } }, ids: { $push: '$student' } } }
			]),
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, dateString, camera: { $in: camIds } } },
				{ $group: { _id: { camera: '$camera', kind: '$kind', hour: '$hour' }, n: { $sum: 1 }, last: { $max: '$time' } } }
			]),
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, dateString: { $in: days }, camera: { $in: camIds } } },
				{ $group: { _id: { camera: '$camera', date: '$dateString', hour: '$hour', kind: '$kind' }, n: { $sum: 1 } } }
			]),
			isToday ? hikCameraEventModel.aggregate([
				{ $match: { schoolId: school, camera: { $in: camIds }, time: { $gte: since } } },
				{ $group: { _id: { camera: '$camera', kind: '$kind' }, n: { $sum: 1 } } }
			]) : Promise.resolve([])
		])

		// FaceID ma'lumotlari: sinf ro'yxati (o'quvchi id'lari), sababli kelmaganlar, sinf rahbarlari holati
		const headIds = sinfs.map(x => x.head?._id).filter(Boolean)
		const [rosterRows, excuseMap, staffExcuse, headAtt, schoolAttCount] = await Promise.all([
			studentModel.find({ schoolId: school, isActive: { $ne: false }, sinf: { $in: sinfIds } }).select('_id sinf').lean(),
			StudentExcuse.mapForDate(dateString, school),
			headIds.length ? StaffExcuse.mapForDate(dateString, [school]) : Promise.resolve(new Map()),
			headIds.length ? staffAttendanceModel.find({ user: { $in: headIds }, dateString }).select('user status').lean() : Promise.resolve([]),
			studentAttendanceModel.countDocuments({ schoolId: school, dateString })
		])
		const rosterByS = new Map()
		rosterRows.forEach(r => { const k = String(r.sinf); if (!rosterByS.has(k)) rosterByS.set(k, []); rosterByS.get(k).push(r._id) })
		const headStatus = new Map(headAtt.map(a => [String(a.user), a.status]))
		const total = new Map(rosters.map(r => [String(r._id), r.total]))
		const att = new Map(attendance.map(r => [String(r._id), r]))
		const camSinf = new Map(cameras.map(c => [String(c._id), String(c.sinfId)]))
		const ACTIVITY = ['motion', 'enter', 'exit', 'multi']
		const SIGNALS = ['density', 'people']

		const perCamera = new Map()
		for (const e of today) {
			const key = String(e._id.camera)
			if (!perCamera.has(key)) perCamera.set(key, { kinds: {}, hours: Array(24).fill(0), act: Array(24).fill(0), last: null })
			const c = perCamera.get(key)
			c.kinds[e._id.kind] = (c.kinds[e._id.kind] || 0) + e.n
			c.hours[e._id.hour] += e.n
			if (!SIGNALS.includes(e._id.kind) && !e._id.kind.startsWith('vision_')) c.act[e._id.hour] += e.n
			if (!c.last || e.last > c.last) c.last = e.last
		}
		// oxirgi 7 kun: sinf bo'yicha soatlik odatiy faollik (hodisasi bo'lgan kunlar bo'yicha o'rtacha) va kunlik jami
		const pastBySinf = new Map()
		for (const e of past) {
			if (SIGNALS.includes(e._id.kind) || e._id.kind.startsWith('vision_')) continue
			const sid = camSinf.get(String(e._id.camera)); if (!sid) continue
			if (!pastBySinf.has(sid)) pastBySinf.set(sid, { hours: Array(24).fill(0), dates: new Set(), daily: new Map() })
			const p = pastBySinf.get(sid)
			p.hours[e._id.hour] += e.n; p.dates.add(e._id.date); p.daily.set(e._id.date, (p.daily.get(e._id.date) || 0) + e.n)
		}
		const recentBySinf = new Map()
		for (const e of recent) {
			const sid = camSinf.get(String(e._id.camera)); if (!sid) continue
			if (!recentBySinf.has(sid)) recentBySinf.set(sid, {})
			const r = recentBySinf.get(sid); r[e._id.kind] = (r[e._id.kind] || 0) + e.n
		}

		const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)))
		const classes = sinfs.map(sinf => {
			const id = String(sinf._id)
			const list = cameras.filter(c => String(c.sinfId) === id).map(c => {
				const ev = perCamera.get(String(c._id)) || { kinds: {}, hours: Array(24).fill(0), act: Array(24).fill(0), last: null }
				return { ...c, events: ev.kinds, hours: ev.hours, act: ev.act, lastEventAt: ev.last }
			})
			const hours = Array(24).fill(0)
			const actHours = Array(24).fill(0)
			list.forEach(c => c.hours.forEach((n, h) => { hours[h] += n }))
			list.forEach(c => c.act.forEach((n, h) => { actHours[h] += n }))
			const kinds = {}
			list.forEach(c => Object.entries(c.events).forEach(([k, n]) => { kinds[k] = (kinds[k] || 0) + n }))
			const students = total.get(id) || 0
			const came = att.get(id)?.came || 0
			const inside = att.get(id)?.inside || 0
			// Kutilgan tarkib: ro'yxat − sababli kelmaganlar − kelmaganlar − maktabdan ketganlar = hozir sinfda bo'lishi kerak o'quvchilar.
			// FaceControl davomati bo'lmasa (bugun hech kim qayd etilmagan) — faqat ro'yxat va sababli bo'yicha taxminiy
			const cameSet = new Set((att.get(id)?.ids || []).map(String))
			const excusedAbsent = (rosterByS.get(id) || []).filter(i => excuseMap.has(String(i)) && !cameSet.has(String(i))).length
			const basis = isToday && schoolAttCount === 0 ? 'roster' : 'faceid'
			const unexcused = basis === 'roster' ? 0 : Math.max(0, students - came - excusedAbsent)
			const leftN = isToday && basis === 'faceid' ? Math.max(0, came - inside) : 0
			const expected = students ? Math.max(0, basis === 'roster' ? students - excusedAbsent : (isToday ? inside : came)) : null
			const bd = students ? { roster: students, excused: excusedAbsent, absent: unexcused, left: leftN, came, inside, expected, basis } : null
			const head = sinf.head || null

			const p = pastBySinf.get(id)
			const baseline = Array(24).fill(0)
			if (p && p.dates.size) p.hours.forEach((n, h) => { baseline[h] = Math.round((n / p.dates.size) * 10) / 10 })
			const daily = [...days].reverse().map(d => ({ date: d, events: p?.daily.get(d) || 0 }))
			daily.push({ date: dateString, events: actHours.reduce((a, b) => a + b, 0) })
			// Aqlli kuzatuv bor bo'lsa, faollik grafiklari kameradagi harakat (%) asosida
			const vz = vision.get(id)
			const vf = vz ? visionFactors(vz, students, lessonNow, isToday, bd) : null
			if (vz) {
				vz.today.forEach((v, h) => { actHours[h] = v })
				vz.baseline.forEach((v, h) => { baseline[h] = v })
				daily.length = 0
				;[...days].reverse().concat(dateString).forEach(d => daily.push({ date: d, events: vz.daily.get(d) || 0 }))
			}

			// ---- omillar ----
			const factors = []
			// 1) davomat
			// Davomat: sababli kelmaganlar kutilmaydi, shuning uchun nisbat "kelishi kerak bo'lganlar"ga nisbatan
			const due = Math.max(0, students - excusedAbsent)
			const attPct = due ? Math.min(100, Math.round((came / due) * 100)) : (students ? 100 : 0)
			const attScore = clamp(attPct)
			const hasRoster = students > 0
			factors.push(hasRoster
				? { key: 'attendance', icon: 'attendance', label: 'Sinf davomati', value: `${attPct}%`, status: attPct >= 85 ? 'good' : attPct >= 60 ? 'mid' : 'bad', note: `${students} o'quvchidan${excusedAbsent ? ` ${excusedAbsent} tasi sababli (hisobga olinmaydi),` : ''} ${came} tasi kelgan`, meter: { pct: attPct } }
				: { key: 'attendance', icon: 'attendance', label: 'Sinf davomati', value: "Ro'yxat yo'q", status: 'unknown', note: "Sinfga o'quvchilar biriktirilmagan, davomat hisoblanmaydi. O'quvchilarni sinfga qo'shing", meter: null })
			// 2) zichlik signallari
			const signalsDay = SIGNALS.reduce((a, k) => a + (kinds[k] || 0), 0)
			const signalsNow = SIGNALS.reduce((a, k) => a + (recentBySinf.get(id)?.[k] || 0), 0)
			let sigScore = signalsDay === 0 ? 100 : signalsDay <= 3 ? 70 : signalsDay <= 10 ? 40 : 10
			factors.push({ key: 'density', icon: 'density', label: 'Odam zichligi', value: signalsDay === 0 ? 'Me\'yorda' : `${signalsDay} ta signal`, status: signalsDay === 0 ? 'good' : signalsDay <= 3 ? 'mid' : 'bad', note: signalsDay === 0 ? "Zichlik yoki odamlar soni signali kelmagan" : (isToday ? `Oxirgi soatda ${signalsNow} ta` : "Kun davomida") })
			if (vf?.density) { sigScore = vf.density.score; factors[factors.length - 1] = withoutScore(vf.density) }
			// 3) faollik (sinfning odatiy holatiga nisbatan)
			const activityNow = actHours.slice(LESSON_START, untilHour + 1).reduce((a, b) => a + b, 0)
			const baselineNow = baseline.slice(LESSON_START, untilHour + 1).reduce((a, b) => a + b, 0)
			let actScore = 70
			let actStatus = 'unknown'
			let actValue = "Ma'lumot yetarli emas"
			let actNote = 'Sinfning odatiy faolligini aniqlash uchun kamida bir kunlik tarix kerak'
			if (baselineNow > 0) {
				const ratio = activityNow / baselineNow
				const pctText = Math.round(ratio * 100)
				if (ratio >= 0.4 && ratio <= 1.8) { actScore = 100; actStatus = 'good'; actValue = "Odatdagidek" }
				else if (ratio < 0.4) { actScore = ratio < 0.15 ? 35 : 65; actStatus = ratio < 0.15 ? 'bad' : 'mid'; actValue = 'Odatdagidan sokin' }
				else { actScore = ratio <= 3 ? 65 : 35; actStatus = ratio <= 3 ? 'mid' : 'bad'; actValue = 'Odatdagidan faol' }
				actNote = `Odatiy holatning ${pctText}%`
			} else if (activityNow > 0) { actStatus = 'unknown'; actValue = `${activityNow} ta hodisa`; actNote = "Solishtirish uchun tarix hali yo'q" }
			if (vf) { actScore = vf.activity.score; factors.push(withoutScore(vf.activity)) }
			else factors.push({ key: 'activity', icon: 'activity', label: 'Xona faolligi', value: actValue, status: actStatus, note: actNote })
			// 3.5) sinf rahbari (xodim): bugun maktabdami, sababli yoki kelmaganmi
			if (head && isToday) {
				const st = headStatus.get(String(head._id))
				const ex = staffExcuse.get(String(head._id))
				const here = st === 'ishda', out = st === 'tashqarida'
				factors.push({ key: 'teacher', icon: 'teacher', label: 'Sinf rahbari', note: head.fullName,
					...(here ? { value: 'Maktabda', status: 'good' } : out ? { value: 'Maktabdan chiqqan', status: 'mid' } : ex ? { value: `Sababli: ${ex.label}`, status: 'unknown' } : { value: 'Kelmagan', status: 'mid' }) })
			}
			// 4) kameralar
			const onlineCams = list.filter(c => c.online === true).length
			const camScore = list.length ? clamp((onlineCams / list.length) * 100) : 0
			factors.push({ key: 'cameras', icon: 'cameras', label: 'Kameralar', value: `${onlineCams}/${list.length} online`, status: onlineCams === list.length ? 'good' : onlineCams ? 'mid' : 'bad', note: !onlineCams ? 'Barcha kameralar offline — tahlil ishonchsiz' : vz?.at ? `Oxirgi tahlil: ${agoText(vz.at)}` : vz ? 'Jonli kuzatuv mavjud, tahlil kutilmoqda' : 'Jonli kuzatuv mavjud', meter: { pct: list.length ? Math.round(onlineCams / list.length * 100) : 0 } })

			// Ro'yxat yo'q sinfda davomat (0%) ballni sun'iy pasaytirmasligi uchun hisobdan chiqariladi
			const parts = [[attScore, 0.35, hasRoster], [sigScore, 0.25, !vf?.density?.skip], [actScore, 0.25, !vf?.activity?.skip], [camScore, 0.15, true]]
			const wsum = parts.reduce((a, [, w, on]) => a + (on ? w : 0), 0)
			let score = clamp(parts.reduce((a, [sc, w, on]) => a + (on ? sc * w : 0), 0) / wsum)
			const hasData = vz ? (isToday ? vz.state !== 'unknown' : vz.hasDay) : (onlineCams > 0 || activityNow > 0 || signalsDay > 0)
			if (vf && list.length) factors.unshift(withoutScore(vf.lesson))
			let level = !hasData ? 'nodata' : score >= 75 ? 'good' : score >= 50 ? 'mid' : 'attention'
			let headline = { good: "Dars jarayoni yaxshi", mid: "Dars jarayoni o'rtacha", attention: "Diqqat talab qiladi", nodata: "Tahlil uchun ma'lumot yo'q" }[level]
			// Dars vaqtida sinfda hech kim yo'q: baho o'rniga aniq holat (ball ko'rsatilmaydi)
			const idle = !!(vf?.idle && list.length)
			if (idle) { level = 'nodata'; headline = "Dars bo'lmayapti (sinf bo'sh)" }
			// Kamera soni FaceID bo'yicha kutilgan sondan sezilarli farq qilsa, umumiy "yaxshi" baho berilmaydi
			const dflag = !idle && vf?.density?.flag
			if (dflag && vf.density.status !== 'good') {
				if (vf.density.status === 'bad') { level = 'attention'; score = Math.min(score, 49) }
				else if (level === 'good') { level = 'mid'; score = Math.min(score, 74) }
				headline = dflag === 'missing' ? "Sinfda o'quvchilar yetishmayapti" : "Sinfda ortiqcha odam"
			}

			// Kamerasiz sinf: baho faqat davomat asosida; kameraga bog'liq omillar "biriktirilmagan" deb belgilanadi
			const noCamera = list.length === 0
			const noCam = { status: 'unknown', note: 'Sinfga kamera biriktirilmagan' }
			const camLessLevel = students === 0 ? 'nodata' : attScore >= 75 ? 'good' : attScore >= 50 ? 'mid' : 'attention'
			const analysis = noCamera
				? {
					score: attScore, level: camLessLevel, hasCamera: false, lessonNow, breakdown: bd,
					headline: { good: "Sinf davomati yaxshi", mid: "Sinf davomati o'rtacha", attention: "Sinf davomati past", nodata: "Tahlil uchun ma'lumot yo'q" }[camLessLevel],
					factors: [factors[0], { key: 'density', label: 'Odam zichligi', value: "Kamera yo'q", ...noCam }, { key: 'activity', label: 'Xona faolligi', value: "Kamera yo'q", ...noCam }, { key: 'cameras', label: 'Kameralar', value: 'Biriktirilmagan', ...noCam }]
				}
				: { score, level, headline, lessonNow, hasCamera: true, factors, idle, lesson: vf ? vf.info : null, breakdown: bd }
			return {
				_id: sinf._id, name: sinf.name, description: sinf.description, head: sinf.head?.fullName || null, headPhoto: sinf.head?.photo || null,
				students, came, inside, absent: Math.max(0, students - came),
				cameras: list.map(({ act, ...rest }) => rest), events: kinds, hours, actHours, baseline, daily,
				analysis
			}
		}).sort((a, b) => a.name.localeCompare(b.name))

		const withoutCameras = await sinfModel.countDocuments({ schoolId, _id: { $nin: sinfIds } })
		return { success: true, dateString, isToday, lessonNow, lessonHours: [LESSON_START, LESSON_END], classes, withoutCameras }
	}

	// Kameradan hozirgi kadrni oladi (capturePic). Havola 15 daqiqa amal qiladi; oqim shifrlangan bo'lsa
	// kadr ham shifrlangan bo'ladi va brauzerda ochilmaydi
	async snapshot(id, user) {
		if (!validId(id)) return { success: false, message: "Kamera id noto'g'ri" }
		const camera = await hikCameraModel.findById(id).lean()
		if (!camera || camera.inCloud === false) return { success: false, message: 'Kamera topilmadi' }
		const platformWide = user.role === 'superadmin' || user.role === 'monitor'
		if (!platformWide && (!camera.schoolId || String(camera.schoolId) !== String(user.school))) return { success: false, message: "Bu kamera sizning maktabingizga biriktirilmagan" }
		if (!camera.serial) return { success: false, message: 'Kamera serial raqami topilmadi' }
		try {
			const data = await this.call(camera.accountId, 'post', '/api/hccgw/resource/v1/device/capturePic', { deviceSerial: camera.serial, channelNo: camera.channelNo || 1 })
			if (!data.captureUrl) return { success: false, message: 'Kadr qaytmadi' }
			return { success: true, url: data.captureUrl, encrypted: Number(data.isEncrypted) === 1, name: camera.name }
		} catch (error) {
			return { success: false, message: error.response?.data ? failure(error) : friendly(error.message) }
		}
	}

	// Akkauntning video shifrlash kodi (kadrlarni ochish uchun); kiritilmagan bo'lsa bo'sh qator
	async encryptionCode(accountId) {
		const creds = await loadCreds(accountId)
		return creds.code || ''
	}

	// Boshqa xizmatlar (hodisalarni olib turuvchi) uchun: akkaunt nomidan Hik API chaqiruvi
	async call(accountId, method, path, body) {
		const creds = await loadCreds(accountId)
		return hik(accountId, creds, method, path, body)
	}

	// Jonli ko'rish: stream token + ezopen manzil. Maktab adminlari faqat o'z maktabiga
	// biriktirilgan kamerani ko'ra oladi
	// fresh=true (foydalanuvchi "Qayta urinish" bosdi): xato keshi va eski stream token tashlab yuboriladi
	async live(id, user, { fresh = false } = {}) {
		if (!validId(id)) return { success: false, message: "Kamera id noto'g'ri" }
		const camera = await hikCameraModel.findById(id).lean()
		if (!camera || camera.inCloud === false) return { success: false, message: 'Kamera topilmadi' }
		const platformWide = user.role === 'superadmin' || user.role === 'monitor'
		if (!platformWide && (!camera.schoolId || String(camera.schoolId) !== String(user.school))) {
			return { success: false, message: "Bu kamera sizning maktabingizga biriktirilmagan" }
		}
		if (!camera.serial) return { success: false, message: 'Kamera qurilma serial raqami topilmadi' }
		try {
			const creds = await loadCreds(camera.accountId)
			liveSeen.set(camera.serial, Date.now())
			if (fresh) { tokenFails.delete(String(camera.accountId)); streamTokens.delete(String(camera.accountId)) }
			const stream = await getStreamToken(camera.accountId, creds, fresh)
			if (!stream.appToken || !stream.streamAreaDomain) return { success: false, message: 'Stream token olinmadi' }
			const body = { resourceId: camera.cameraId, deviceSerial: camera.serial, type: '1', protocol: '1' }
			if (creds.code) body.code = creds.code
			const live = await hik(camera.accountId, creds, 'post', '/api/hccgw/video/v1/live/address/get', body)
			if (!live.url) return { success: false, message: 'Jonli oqim manzili qaytmadi' }
			if (camera.offlineSince) await this.markDeviceOnline(camera.accountId, camera.serial)
			return { success: true, name: camera.name, streamToken: stream.appToken, domain: stream.streamAreaDomain, url: live.url }
		} catch (error) {
			console.log('Hik live xatosi:', error.message)
			if (OFFLINE_RE.test(error.message || '')) await this.markDeviceOffline(camera.accountId, camera.serial)
			return { success: false, message: error.response?.data ? failure(error) : friendly(error.message) }
		}
	}
}

module.exports = new HikConnectService()
