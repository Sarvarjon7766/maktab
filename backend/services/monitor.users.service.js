// Tizim egasi (superadmin) uchun: 'monitor' roli akkauntlarini boshqarish. Faqat role='monitor'
// hujjatlariga tegadi — boshqa rol egalarini shu orqali o'zgartirib bo'lmaydi.
const crypto = require('crypto')
const bcrypt = require('bcrypt')
const mongoose = require('mongoose')
const userModel = require('../models/user.model')
const schoolModel = require('../models/school.model')
const scopeUtil = require('../utils/monitorScope')
const districtModel = require('../models/district.model')

const SELECT = 'fullName username position phone_personal isActive createdAt updatedAt monitorScope'
const generatePassword = () => crypto.randomBytes(9).toString('base64url')
const validId = (id) => mongoose.isValidObjectId(id)

async function findMonitor(id) {
	if (!validId(id)) return null
	return userModel.findOne({ _id: id, role: 'monitor' })
}

class MonitorUsersService {
	// Maktablardagi mavjud hududlar (viloyat/tuman) va ulardagi maktablar soni: monitorga hudud berish uchun
	// Monitorga berish mumkin bo'lgan tumanlar: tizim egasi qo'shgan tumanlar (maktablar soni bilan) +
	// tumani ro'yxatda yo'q maktablardan olingan hududlar
	async areas() {
		const [docs, rows] = await Promise.all([
			districtModel.find({ isRegion: { $ne: true }, isActive: { $ne: false } }).select('name region').lean(),
			schoolModel.aggregate([{ $group: { _id: { region: { $trim: { input: { $ifNull: ['$region', ''] } } }, district: { $trim: { input: { $ifNull: ['$district', ''] } } } }, schools: { $sum: 1 } } }])
		])
		const k = (r, d) => `${String(r || '').trim().toLowerCase()}|${String(d || '').trim().toLowerCase()}`
		const count = new Map(rows.map((r) => [k(r._id.region, r._id.district), r.schools]))
		const areas = docs.map((d) => ({ region: d.region, district: d.name, schools: count.get(k(d.region, d.name)) || 0, registered: true }))
		const known = new Set(areas.map((a) => k(a.region, a.district)))
		for (const r of rows) if (r._id.district && !known.has(k(r._id.region, r._id.district))) areas.push({ region: r._id.region, district: r._id.district, schools: r.schools, registered: false })
		areas.sort((a, b) => a.region.localeCompare(b.region, 'uz') || a.district.localeCompare(b.district, 'uz'))
		const regions = new Map()
		for (const a of areas) { const r = regions.get(a.region) || { region: a.region, districts: 0, schools: 0 }; r.districts++; r.schools += a.schools; regions.set(a.region, r) }
		return { success: true, areas, regions: [...regions.values()].filter(r => r.region) }
	}

	// Hudud tekshiruvi: tuman majburiy va kamida bitta maktab shu hududda bo'lishi kerak
	async checkScope(scope, level = 'district') {
		const region = String(scope?.region || '').trim(), district = String(scope?.district || '').trim()
		if (level === 'region') {
			if (!region) return { ok: false, message: 'Monitor qaysi viloyat uchun ekanini tanlang' }
			const ids = await scopeUtil.schoolsOf({ region, district: '' })
			const known = await districtModel.exists({ region: new RegExp('^\\s*' + region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') })
			if (!ids.length && !known) return { ok: false, message: "Bunday viloyat yo'q: avval «Tumanlar» bo'limida viloyat tumanlarini yuklang" }
			return { ok: true, region, district: '', schools: ids.length }
		}
		if (!district) return { ok: false, message: 'Monitor qaysi tuman uchun ekanini tanlang' }
		const ids = await scopeUtil.schoolsOf({ region, district })
		// Tuman tizim egasi tomonidan qo'shilgan bo'lsa, maktablar hali bo'lmasa ham monitor biriktirish mumkin
		const known = await districtModel.exists({ isRegion: { $ne: true }, name: new RegExp('^\\s*' + district.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') })
		if (!ids.length && !known) return { ok: false, message: "Bunday tuman yo'q: avval «Tumanlar» bo'limida tumanni qo'shing" }
		return { ok: true, region, district, schools: ids.length }
	}

	async list() {
		const users = await userModel.find({ role: 'monitor' }).select(SELECT).sort({ createdAt: -1 }).lean()
		const out = await Promise.all(users.map(async (u) => {
			const has = u.monitorScope && (u.monitorScope.region || u.monitorScope.district)
			const level = !has ? null : u.monitorScope.district ? 'district' : 'region'
			return { ...u, level, schoolCount: has ? (await scopeUtil.schoolsOf(u.monitorScope)).length : null }
		}))
		return { success: true, users: out }
	}

	// password bo'sh bo'lsa avtomatik yaratiladi va javobda BIR MARTA qaytariladi
	async create({ fullName, username, password, position, phone, region, district, level }) {
		const name = String(fullName || '').trim()
		const login = String(username || '').trim()
		if (!name || !login) return { success: false, message: 'Ism va login majburiy' }
		if (login.length < 3) return { success: false, message: "Login kamida 3 belgidan iborat bo'lishi kerak" }
		if (password && String(password).length < 6) return { success: false, message: "Parol kamida 6 belgidan iborat bo'lishi kerak" }
		if (await userModel.exists({ username: login })) return { success: false, message: 'Bu login band' }
		const isRegion = level === 'region'
		const area = await this.checkScope({ region, district: isRegion ? '' : district }, isRegion ? 'region' : 'district')
		if (!area.ok) return { success: false, message: area.message }
		const raw = password ? String(password) : generatePassword()
		const user = new userModel({
			fullName: name, username: login, role: 'monitor', schoolId: null, isActive: true, monitorScope: { region: area.region, district: area.district },
			position: String(position || '').trim() || (isRegion ? `${area.region} viloyati nazorati` : `${area.district} nazorati`), phone_personal: String(phone || '').trim() || undefined,
			password: await bcrypt.hash(raw, 10)
		})
		user.hodimID = user._id.toString()
		await user.save()
		return { success: true, user: { _id: user._id, fullName: user.fullName, username: user.username }, password: password ? undefined : raw }
	}

	// Ism, lavozim, telefon, login, faollik. `resetPassword: true` — yangi parol yaratib bir marta qaytaradi
	async update(id, { fullName, username, position, phone, isActive, password, resetPassword, region, district, level }) {
		const user = await findMonitor(id)
		if (!user) return { success: false, message: 'Monitor topilmadi' }
		if (fullName !== undefined) { if (!String(fullName).trim()) return { success: false, message: 'Ism bo\'sh bo\'lmasin' }; user.fullName = String(fullName).trim() }
		if (position !== undefined) user.position = String(position).trim() || user.position
		if (phone !== undefined) user.phone_personal = String(phone).trim() || undefined
		if (username !== undefined && String(username).trim() !== user.username) {
			const login = String(username).trim()
			if (login.length < 3) return { success: false, message: "Login kamida 3 belgidan iborat bo'lishi kerak" }
			if (await userModel.exists({ username: login, _id: { $ne: user._id } })) return { success: false, message: 'Bu login band' }
			user.username = login
		}
		if (isActive !== undefined) user.isActive = !!isActive
		// Tuman va viloyat monitorlari aralashmasligi uchun: mavjud monitorning darajasi o'zgarmaydi (yangisini yarating)
		const currentLevel = user.monitorScope?.district ? 'district' : user.monitorScope?.region ? 'region' : null
		if (level && currentLevel && level !== currentLevel) return { success: false, message: `Bu ${currentLevel === 'region' ? 'viloyat' : 'tuman'} monitori: darajasini o'zgartirib bo'lmaydi, yangi monitor yarating` }
		if (district !== undefined || region !== undefined) {
			const isRegion = (level || currentLevel) === 'region'
			const area = await this.checkScope({ region: region ?? user.monitorScope?.region, district: isRegion ? '' : (district ?? user.monitorScope?.district) }, isRegion ? 'region' : 'district')
			if (!area.ok) return { success: false, message: area.message }
			user.monitorScope = { region: area.region, district: area.district }
		}
		let newPassword
		if (password) {
			if (String(password).length < 6) return { success: false, message: "Parol kamida 6 belgidan iborat bo'lishi kerak" }
			user.password = await bcrypt.hash(String(password), 10)
		} else if (resetPassword) {
			newPassword = generatePassword()
			user.password = await bcrypt.hash(newPassword, 10)
		}
		await user.save()
		scopeUtil.forget(user._id)
		return { success: true, password: newPassword }
	}

	async remove(id) {
		const user = await findMonitor(id)
		if (!user) return { success: false, message: 'Monitor topilmadi' }
		await user.deleteOne()
		return { success: true }
	}
}

module.exports = new MonitorUsersService()
