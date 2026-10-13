// Hik-Connect (HikCentral Connect) orqali xodim va o'quvchilarni boshqarish: qo'shish, yangilash, rasm (yuz) yuklash, o'chirish.
// Ilgari buni LAN dagi server_proxy (ISUP) qilardi; endi hammasi bulut API orqali, hech qanday qo'shimcha dastur kerak emas.
//
// Tasdiqlangan (haqiqiy bulutda sinalgan) endpoint'lar, hammasi POST /api/hccgw/person/v1/persons/...:
//   add     { firstName, lastName, groupId, personCode, gender(1|2), startDate, endDate }  -> { personId, personCode }
//   update  { personId, ...add maydonlari }
//   photo   { personId, photoData: <base64 JPEG, <=200KB> }
//   delete  { personId }
//   get     { personId }, list { pageIndex, pageSize }
//   groups/search { pageNo, pageSize } -> { personGroupList: [{ groupId, groupName, parentId }] }
// Sanalar ISO 8601 + vaqt zonasi ("2026-10-12T00:00:00+05:00"). So'rovlar tezligi chegarasi: sekundiga 5 ta.
//
// Ish tartibi: user.service / student.service allaqachon "outbox" (adduser / deleteuser) yozuvlarini yaratadi. Bu xizmat
// shu navbatni o'zi o'qib bulutga yuboradi va natijani avvalgi ack mantig'i bilan yozadi (xodim kartasidagi holat va xato o'zgarmaydi).
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const mongoose = require('mongoose')
const hikCameraModel = require('../models/hik.camera.model')
const hikAccountModel = require('../models/hik.account.model')
const hikPersonModel = require('../models/hik.person.model')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')
const adduserModel = require('../models/add.user.model')
const deleteUserModel = require('../models/delete.user.model')
const Hik = require('./hikconnect.service')
const EmployeeSync = require('./employee.sync.service')

const P = '/api/hccgw/person/v1/persons/'
const UPLOADS = path.join(__dirname, '..', 'uploads')
const END_DATE = '2037-12-31T23:59:59+05:00'
const MAX_B64 = 190 * 1024 // bulut chegarasi 200 KB
const CYCLE_MS = 15 * 1000
const BATCH = 15 // bir sikl, bir maktab uchun eng ko'pi bilan nechta yozuv
const CALL_GAP_MS = 260 // sekundiga ~4 so'rov (chegara 5)
const EXCLUDED_ROLES = ['post', 'admin', 'user'] // kameraga yuborilmaydigan rollar (user.service bilan bir xil)
const DEVICE = 'Hik-Connect'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]+/gi, ' ').trim()
const enabled = () => process.env.HIK_PERSONS !== '0'

class PersonError extends Error {}

// Bulutga so'rovlar orasida pauza (butun jarayon bo'yicha)
let nextAt = 0
async function call(accountId, path_, body) {
	const wait = Math.max(0, nextAt - Date.now())
	nextAt = Date.now() + wait + CALL_GAP_MS
	if (wait) await sleep(wait)
	return Hik.call(accountId, 'post', path_, body)
}

const isMissing = (e) => /CCF038063|CCF038023|not exist|No person matched/i.test(String(e?.message || ''))
const tashkentDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// "Abdullayev Ali Valiyevich" -> familiya birinchi so'z, qolgani ism
function splitName(full) {
	const parts = String(full || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
	if (parts.length <= 1) return { firstName: parts[0] || '-', lastName: '' }
	return { lastName: parts[0], firstName: parts.slice(1).join(' ') }
}

// Rasmni bulut talabiga moslaydi: JPEG, <=190 KB (base64), kamida ~640 px
async function preparePhoto(photo) {
	const file = path.join(UPLOADS, path.basename(String(photo || '')))
	if (!photo || !fs.existsSync(file)) return null
	let width = 720, quality = 84, buf
	for (let i = 0; i < 7; i++) {
		buf = await sharp(file).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality }).toBuffer()
		if (buf.toString('base64').length <= MAX_B64) break
		quality = Math.max(40, quality - 10); width = Math.max(480, width - 80)
	}
	if (buf.toString('base64').length > MAX_B64) throw new PersonError("Rasm juda katta: 200 KB dan kichraytirib bo'lmadi")
	return { b64: buf.toString('base64'), hash: crypto.createHash('sha1').update(buf).digest('hex') }
}

class HikPersonService {
	constructor() { this.timer = null; this.running = false; this.stopped = true }

	// Maktabning Hik akkaunti: kameralari qaysi akkauntda bo'lsa, o'sha; bo'lmasa yagona akkaunt
	async accountOf(schoolId) {
		const accounts = await hikCameraModel.distinct('accountId', { schoolId, inCloud: { $ne: false } })
		if (accounts.length) return accounts[0]
		const all = await hikAccountModel.find().select('_id').lean()
		return all.length === 1 ? all[0]._id : null
	}

	// Shaxs guruhi: maktabda saqlangan, bo'lmasa nom bo'yicha topiladi, bo'lmasa yagona/ildiz guruh
	async groupOf(school, accountId) {
		if (school.hikGroupId) return school.hikGroupId
		const r = await call(accountId, '/api/hccgw/person/v1/groups/search', { pageNo: 1, pageSize: 100 })
		const list = r.personGroupList || []
		const n = norm(school.name)
		const pick = list.find((g) => norm(g.groupName) === n) || list.find((g) => n && (n.includes(norm(g.groupName)) || norm(g.groupName).includes(n))) || (list.length === 1 ? list[0] : null) || list.find((g) => !g.parentId)
		if (!pick) throw new PersonError("Hik-Connect'da shaxs guruhi topilmadi: avval guruh yarating")
		await schoolModel.updateOne({ _id: school._id }, { $set: { hikGroupId: String(pick.groupId) } })
		return String(pick.groupId)
	}

	// Kirish huquqi (access level): shaxs qurilmalarga shu orqali yetkaziladi. Topilmasa null (shaxs bulutda yaratiladi, lekin qurilmaga tushmaydi)
	async accessLevelOf(school, accountId) {
		if (school.hikAccessLevelId) return school.hikAccessLevelId
		let list = []
		try {
			const r = await call(accountId, '/api/hccgw/acspm/v1/accesslevel/list', { accessLevelSearchRequest: { pageIndex: 1, pageSize: 100 } })
			list = r?.accessLevelResponse?.accessLevelList || []
		} catch { return null }
		if (!list.length) return null
		const idOf = (x) => String(x.accessLevelId ?? x.id ?? '')
		const nameOf = (x) => norm(x.accessLevelName ?? x.name)
		const n = norm(school.name)
		const pick = list.find((x) => nameOf(x) === n) || list.find((x) => n && nameOf(x) && (n.includes(nameOf(x)) || nameOf(x).includes(n))) || (list.length === 1 ? list[0] : null)
		if (!pick || !idOf(pick)) return null
		await schoolModel.updateOne({ _id: school._id }, { $set: { hikAccessLevelId: idOf(pick) } })
		return idOf(pick)
	}

	// personCode: bulut faqat harf/raqamga va ENG KO'PI 16 BELGIGA ruxsat beradi (sinab aniqlangan), akkaunt bo'yicha noyob bo'lishi kerak.
	// Bizning identifikatorlar (24 belgili Mongo id) sig'maydi, shuning uchun maktab+identifikatordan barqaror 16 belgili xesh olinadi
	// (bir xil shaxs uchun har doim bir xil kod). Qaysi shaxsligi hikpersons jadvalidagi bog'lanishdan topiladi.
	async codeFor(school, accountId, hodimID) {
		if (!hodimID) throw new PersonError("Identifikator noto'g'ri (hodimID bo'sh)")
		return crypto.createHash('sha1').update(`${school._id}:${hodimID}`).digest('hex').slice(0, 16)
	}

	// personCode bo'yicha bulutdan mavjud shaxsni topadi (takroriy personCode xatosida)
	async findByCode(accountId, code) {
		for (let page = 1; page <= 60; page++) {
			const r = await call(accountId, P + 'list', { pageIndex: page, pageNo: page, pageSize: 100 })
			const list = r.personList || []
			const hit = list.find((x) => String(x.personInfo?.personCode) === String(code))
			if (hit) return String(hit.personInfo.personId)
			if (list.length < 100) break
		}
		return null
	}

	// Xodim/o'quvchini bulutga qo'shadi yoki yangilaydi (+rasm, +kirish huquqi). Xato bo'lsa PersonError/Error tashlaydi
	async upsert(entry) {
		const school = await schoolModel.findById(entry.schoolId).lean()
		if (!school) throw new PersonError('Maktab topilmadi')
		const accountId = await this.accountOf(entry.schoolId)
		if (!accountId) throw new PersonError("Maktabga Hik-Connect kamerasi biriktirilmagan: tizim egasi kamerani biriktirishi kerak")
		const groupId = await this.groupOf(school, accountId)
		const entity = entry.kind === 'student'
			? await studentModel.findOne({ _id: entry.studentId, schoolId: entry.schoolId }).lean()
			: await userModel.findOne({ _id: entry.userId, schoolId: entry.schoolId }).lean()
		const name = entity?.fullName || entry.full_name
		const code = await this.codeFor(school, accountId, entry.hodimID)
		const fields = { ...splitName(name), groupId, personCode: code, gender: entity?.gender === 'ayol' ? 2 : 1, startDate: `${tashkentDate()}T00:00:00+05:00`, endDate: END_DATE }

		let map = await hikPersonModel.findOne({ schoolId: entry.schoolId, hodimID: entry.hodimID })
		if (map && String(map.accountId) !== String(accountId)) { map = null } // kamera boshqa akkauntga ko'chirilgan
		let personId = map?.personId
		if (personId) {
			try { await call(accountId, P + 'update', { personId, ...fields }) } catch (e) { if (isMissing(e)) personId = null; else throw e }
		}
		if (!personId) {
			try {
				const r = await call(accountId, P + 'add', fields)
				personId = String(r.personId)
			} catch (e) {
				// takroriy personCode: avval shu kod bilan yaratilgan shaxsni topib, uni yangilaymiz
				const found = await this.findByCode(accountId, code).catch(() => null)
				if (!found) throw e
				personId = found
				await call(accountId, P + 'update', { personId, ...fields })
			}
		}

		const photo = await preparePhoto(entry.photo || entity?.photo)
		let photoHash = map && String(map.accountId) === String(accountId) && map.personId === personId ? map.photoHash : null
		if (photo && photo.hash !== photoHash) {
			await call(accountId, P + 'photo', { personId, photoData: photo.b64 })
			photoHash = photo.hash
		}

		let accessLevelId = map?.accessLevelId || null
		const level = await this.accessLevelOf(school, accountId)
		if (level && accessLevelId !== level) {
			await call(accountId, '/api/hccgw/acspm/v1/accesslevel/person/add', { accessLevelId: level, personList: [{ personId }] })
			accessLevelId = level
		}

		await hikPersonModel.updateOne(
			{ schoolId: entry.schoolId, hodimID: entry.hodimID },
			{ $set: { accountId, kind: entry.kind || 'user', personId, personCode: code, groupId, name, photoHash, accessLevelId, syncedAt: new Date() } },
			{ upsert: true }
		)
		return { personId, photo: !!photo, accessLevel: !!level }
	}

	// Bulutdan o'chiradi. Allaqachon yo'q bo'lsa muvaffaqiyat hisoblanadi
	async remove(entry) {
		const map = await hikPersonModel.findOne({ schoolId: entry.schoolId, hodimID: entry.hodimID })
		if (!map) return { removed: false }
		try { await call(map.accountId, P + 'delete', { personId: map.personId }) } catch (e) { if (!isMissing(e)) throw e }
		await hikPersonModel.deleteOne({ _id: map._id })
		return { removed: true }
	}

	// Xato bo'lgan yozuvni har safar emas, kutib (30 soniya, 1, 2, ... 30 daqiqa) qayta urinish uchun
	due(entry) {
		if (!entry.attempts || !entry.lastAttemptAt) return true
		const wait = Math.min(30 * 60 * 1000, 30 * 1000 * 2 ** Math.min(entry.attempts - 1, 6))
		return Date.now() - new Date(entry.lastAttemptAt).getTime() >= wait
	}

	// Bitta maktabning navbati: qo'shish/yangilash va o'chirish
	async processSchool(schoolId) {
		const out = { added: 0, removed: 0, failed: 0 }
		const adds = (await adduserModel.find({ schoolId }).sort({ createdAt: 1 }).limit(BATCH * 3)).filter((e) => this.due(e)).slice(0, BATCH)
		for (const e of adds) {
			try {
				await this.upsert(e)
				await EmployeeSync.ack(e.hodimID, true, null, [{ device: DEVICE, success: true }], schoolId)
				out.added++
			} catch (err) {
				const msg = String(err.message || err).replace(/^Hik xatosi: /, '').slice(0, 300)
				await EmployeeSync.ack(e.hodimID, false, msg, [{ device: DEVICE, success: false, error: msg }], schoolId).catch(() => { })
				out.failed++
				if (/token|akkaunt|Hik akkaunti/i.test(msg)) break // akkaunt muammosi: qolganlarini keyingi siklga
			}
		}
		const dels = (await deleteUserModel.find({ schoolId }).sort({ createdAt: 1 }).limit(BATCH)).filter((e) => this.due(e))
		for (const e of dels) {
			try {
				await this.remove(e)
				await EmployeeSync.ackDelete(e.hodimID, true, schoolId)
				out.removed++
			} catch (err) {
				await deleteUserModel.updateOne({ _id: e._id }, { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date(), lastError: String(err.message).slice(0, 300) } }).catch(() => { })
				out.failed++
			}
		}
		return out
	}

	// Barcha navbat: yozuvi bor maktablar bo'yicha
	async cycle() {
		if (this.running || !enabled()) return
		this.running = true
		try {
			const [a, d] = await Promise.all([adduserModel.distinct('schoolId'), deleteUserModel.distinct('schoolId')])
			const ids = [...new Set([...a, ...d].map(String))]
			for (const id of ids) {
				if (this.stopped) break
				if (!(await this.accountOf(id))) continue // Hik akkaunti yo'q maktab (eski LAN rejimi): tegilmaydi
				const r = await this.processSchool(id).catch((e) => { console.log('Hik shaxslar xatosi:', e.message); return null })
				if (r && (r.added || r.removed || r.failed)) console.log(`Hik-Connect shaxslar (${id}): qo'shildi/yangilandi ${r.added}, o'chirildi ${r.removed}, xato ${r.failed}`)
			}
		} finally { this.running = false }
	}

	start() {
		this.stopped = false
		if (this.timer || !enabled()) return
		const loop = async () => {
			await this.cycle().catch((e) => console.log('Hik shaxslar sikli:', e.message))
			if (!this.stopped) this.timer = setTimeout(loop, CYCLE_MS)
		}
		this.timer = setTimeout(loop, 10000)
		console.log('Hik-Connect shaxslar sinxronizatsiyasi yoqildi (xodim/o\'quvchi qo\'shish, yangilash, rasm, o\'chirish)')
	}

	stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null }

	// Hodisadagi humanId (personId yoki personCode) bo'yicha bizning xodim/o'quvchi identifikatorini topadi
	async hodimIdFor(schoolId, humanId) {
		if (!humanId) return null
		const m = await hikPersonModel.findOne({ schoolId, $or: [{ personId: String(humanId) }, { personCode: String(humanId) }] }).select('hodimID').lean()
		return m ? m.hodimID : null
	}

	// Hali bulutga yuborilmagan (xaritada yo'q), rasmi bor xodim va o'quvchilarni navbatga qo'yadi (bir martalik to'liq sinxronizatsiya)
	async enqueueAll(schoolId) {
		const sid = new mongoose.Types.ObjectId(String(schoolId))
		const [mapped, queued] = await Promise.all([
			hikPersonModel.distinct('hodimID', { schoolId: sid }),
			adduserModel.distinct('hodimID', { schoolId: sid })
		])
		const skip = new Set([...mapped, ...queued].map(String))
		const [staff, students] = await Promise.all([
			userModel.find({ schoolId: sid, role: { $nin: EXCLUDED_ROLES.concat(['superadmin', 'monitor']) }, isActive: { $ne: false }, photo: { $nin: [null, ''] }, hodimID: { $nin: [null, ''] } }).select('fullName hodimID photo').lean(),
			studentModel.find({ schoolId: sid, isActive: { $ne: false }, photo: { $nin: [null, ''] }, studentIdNumber: { $nin: [null, ''] } }).select('fullName studentIdNumber photo').lean()
		])
		const docs = []
		for (const u of staff) if (!skip.has(String(u.hodimID))) docs.push({ schoolId: sid, kind: 'user', userId: u._id, full_name: u.fullName, action: 'create', hodimID: String(u.hodimID), photo: `/uploads/${u.photo}` })
		for (const s of students) if (!skip.has(String(s.studentIdNumber))) docs.push({ schoolId: sid, kind: 'student', studentId: s._id, full_name: s.fullName, action: 'create', hodimID: String(s.studentIdNumber), photo: `/uploads/${s.photo}` })
		if (docs.length) await adduserModel.insertMany(docs, { ordered: false })
		return { queued: docs.length, staff: docs.filter((d) => d.kind === 'user').length, students: docs.filter((d) => d.kind === 'student').length, alreadySynced: mapped.length }
	}

	// Maktab uchun holat: nechta shaxs bulutda, nechtasi navbatda, xatolar
	async status(schoolId) {
		const sid = new mongoose.Types.ObjectId(String(schoolId))
		const school = await schoolModel.findById(sid).select('hikGroupId hikAccessLevelId name').lean()
		const accountId = await this.accountOf(sid)
		const [mapped, pendingAdd, pendingDelete, failed, errors, eligibleStaff, eligibleStudents] = await Promise.all([
			hikPersonModel.countDocuments({ schoolId: sid }),
			adduserModel.countDocuments({ schoolId: sid }),
			deleteUserModel.countDocuments({ schoolId: sid }),
			adduserModel.countDocuments({ schoolId: sid, attempts: { $gt: 0 }, lastError: { $nin: [null, ''] } }),
			adduserModel.find({ schoolId: sid, attempts: { $gt: 0 }, lastError: { $nin: [null, ''] } }).sort({ lastAttemptAt: -1 }).limit(5).select('full_name lastError attempts lastAttemptAt').lean(),
			userModel.countDocuments({ schoolId: sid, role: { $nin: EXCLUDED_ROLES.concat(['superadmin', 'monitor']) }, isActive: { $ne: false }, photo: { $nin: [null, ''] } }),
			studentModel.countDocuments({ schoolId: sid, isActive: { $ne: false }, photo: { $nin: [null, ''] }, studentIdNumber: { $nin: [null, ''] } })
		])
		return {
			success: true, enabled: enabled(), connected: !!accountId, groupId: school?.hikGroupId || null, accessLevelId: school?.hikAccessLevelId || null,
			mapped, pendingAdd, pendingDelete, failed, eligible: eligibleStaff + eligibleStudents, eligibleStaff, eligibleStudents,
			errors: errors.map((e) => ({ name: e.full_name, error: e.lastError, attempts: e.attempts, at: e.lastAttemptAt }))
		}
	}
}

module.exports = new HikPersonService()
module.exports.PersonError = PersonError
module.exports._internals = { splitName, preparePhoto, isMissing }
