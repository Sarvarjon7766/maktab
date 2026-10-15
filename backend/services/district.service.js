// Tumanlar: chegarasi (GeoJSON) bilan saqlanadi. Tizim egasi qo'shadi, maktab va monitor shu tumanga biriktiriladi.
// `backend/data/*.json` — Samarqand viloyati tumanlarining tayyor chegaralari: bir tugma bilan yuklanadi.
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const districtModel = require('../models/district.model')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const geo = require('../utils/geo')

const DATA_DIR = path.join(__dirname, '..', 'data')
const REGION = 'Samarqand'
// fayl nomi -> tuman nomi (fayllarning ko'pida nom yo'q)
const BUNDLED = {
	bulungur: "Bulung'ur", ishtixon: 'Ishtixon', jomboy: 'Jomboy', kattaqorgonsh: "Kattaqo'rg'on shahri", kattaqorgont: "Kattaqo'rg'on tumani",
	narpay: 'Narpay', nurobod: 'Nurobod', oqdaryo: 'Oqdaryo', pastdargom: "Pastdarg'om", paxtachi: 'Paxtachi', payariq: 'Payariq',
	qoshrabot: "Qo'shrabot", samarqandsh: 'Samarqand shahri', samarqandt: 'Samarqand tumani', toyloq: 'Toyloq', urgut: 'Urgut',
	samarqand: 'Samarqand viloyati'
}
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ci = (t) => new RegExp('^\\s*' + esc(String(t || '').trim()) + '\\s*$', 'i')
const slugOf = (region, name) => `${region}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `d-${Date.now()}`
const validId = (id) => mongoose.isValidObjectId(id)

// Qaytaradi { geometry, bbox, center, info } yoki { error }. info — nechta nuqta/qism va soddalashtirilganmi
function prepare(geometry) {
	const r = geo.parseGeometry(geometry)
	if (r.error) return { error: r.error }
	const g = r.geometry
	return { geometry: g, bbox: geo.bboxOf(g), center: geo.centerOf(g), info: { points: r.points, parts: r.parts, simplified: r.simplified } }
}
// slug noyob bo'lishi shart: bir xil slug chiqib qolsa (masalan, turli yozilgan nomlar) oxiriga raqam qo'shiladi
async function uniqueSlug(base, exceptId = null) {
	let slug = base
	for (let n = 2; n < 50; n++) {
		if (!(await districtModel.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }))) return slug
		slug = `${base}-${n}`
	}
	return `${base}-${Date.now()}`
}
const friendly = (e) => e && e.code === 11000 ? 'Bu tuman allaqachon mavjud' : e && /too large|exceeds|BSONObj size/i.test(String(e.message)) ? "Chegara juda katta: soddaroq (kam nuqtali) fayl yuklang" : null

class DistrictService {
	// Ro'yxat (chegarasiz): har bir tumanda nechta maktab bor va nechtasining joylashuvi belgilangan
	async list() {
		const [districts, schools] = await Promise.all([
			districtModel.find().select('-geometry').sort({ isRegion: 1, region: 1, name: 1 }).lean(),
			schoolModel.find().select('region district location').lean()
		])
		const items = districts.map((d) => {
			const mine = d.isRegion ? [] : schools.filter((s) => ci(d.region).test(s.region || '') && ci(d.name).test(s.district || ''))
			return { ...d, hasBoundary: !!d.bbox?.length, schools: mine.length, located: mine.filter((s) => s.location?.lat != null).length }
		})
		const known = new Set(items.filter((d) => !d.isRegion).map((d) => `${(d.region || '').toLowerCase()}|${d.name.toLowerCase()}`))
		const orphans = schools.filter((s) => (s.district || '').trim() && !known.has(`${(s.region || '').trim().toLowerCase()}|${s.district.trim().toLowerCase()}`)).length
		return { success: true, districts: items, schoolsWithoutDistrict: orphans, bundledAvailable: Object.keys(BUNDLED).filter((k) => fs.existsSync(path.join(DATA_DIR, `${k}.json`))).length }
	}

	// backend/data papkasidagi tayyor chegaralarni bazaga yuklaydi (mavjudlarini o'zgartirmaydi, faqat chegarasi yo'qlarni to'ldiradi)
	async importBundled() {
		let created = 0, updated = 0, skipped = 0
		for (const [key, name] of Object.entries(BUNDLED)) {
			const file = path.join(DATA_DIR, `${key}.json`)
			if (!fs.existsSync(file)) { skipped++; continue }
			const prepared = prepare(JSON.parse(fs.readFileSync(file, 'utf8')))
			if (prepared.error) { skipped++; continue }
			const isRegion = key === 'samarqand'
			const slug = slugOf(REGION, name)
			const existing = await districtModel.findOne({ $or: [{ slug }, { region: ci(REGION), name: ci(name) }] })
			if (existing) {
				if (!existing.geometry) { Object.assign(existing, { geometry: prepared.geometry, bbox: prepared.bbox, center: prepared.center }); await existing.save(); updated++ } else skipped++
				continue
			}
			await districtModel.create({ name, region: REGION, slug, isRegion, source: 'bundled', geometry: prepared.geometry, bbox: prepared.bbox, center: prepared.center })
			created++
		}
		return { success: true, created, updated, skipped, message: `${created} ta qo'shildi, ${updated} ta chegarasi to'ldirildi, ${skipped} ta o'tkazib yuborildi` }
	}

	async create({ name, region, geometry }) {
		const n = String(name || '').trim(), r = String(region || '').trim()
		if (!n) return { success: false, message: 'Tuman nomini kiriting' }
		if (await districtModel.exists({ region: ci(r), name: ci(n) })) return { success: false, message: 'Bu tuman allaqachon mavjud' }
		let prepared = {}
		if (geometry) {
			prepared = prepare(geometry)
			if (prepared.error) return { success: false, message: `Chegara noto'g'ri: ${prepared.error}` }
		}
		const { info, ...fields } = prepared
		try {
			const d = await districtModel.create({ name: n, region: r, slug: await uniqueSlug(slugOf(r, n)), source: 'custom', ...fields })
			return { success: true, district: { ...d.toObject(), geometry: undefined }, geometry: info || null, message: info ? `Qo'shildi (${info.points} nuqta${info.parts > 1 ? `, ${info.parts} qism` : ''}${info.simplified ? ', fayl katta bo\'lgani uchun soddalashtirildi' : ''})` : undefined }
		} catch (e) {
			const m = friendly(e)
			if (m) return { success: false, message: m }
			throw e
		}
	}

	// Nom o'zgarsa, shu tumandagi maktablar va monitorlardagi yozuvlar ham yangilanadi
	async update(id, { name, region, geometry, isActive }) {
		if (!validId(id)) return { success: false, message: 'Tuman topilmadi' }
		const d = await districtModel.findById(id)
		if (!d) return { success: false, message: 'Tuman topilmadi' }
		const oldName = d.name, oldRegion = d.region
		if (name !== undefined) {
			if (!String(name).trim()) return { success: false, message: "Nom bo'sh bo'lmasin" }
			d.name = String(name).trim()
		}
		if (region !== undefined) d.region = String(region).trim()
		if (geometry) {
			const p = prepare(geometry)
			if (p.error) return { success: false, message: `Chegara noto'g'ri: ${p.error}` }
			Object.assign(d, { geometry: p.geometry, bbox: p.bbox, center: p.center })
		}
		if (isActive !== undefined) d.isActive = !!isActive
		const renamed = d.name !== oldName || d.region !== oldRegion
		if (renamed && await districtModel.exists({ _id: { $ne: d._id }, region: ci(d.region), name: ci(d.name) })) return { success: false, message: 'Bu nomli tuman allaqachon mavjud' }
		d.slug = await uniqueSlug(slugOf(d.region, d.name), d._id)
		try { await d.save() } catch (e) { const m = friendly(e); if (m) return { success: false, message: m }; throw e }
		if (!d.isRegion && renamed) {
			await schoolModel.updateMany({ region: ci(oldRegion), district: ci(oldName) }, { $set: { region: d.region, district: d.name } })
			await userModel.updateMany({ role: 'monitor', 'monitorScope.region': ci(oldRegion), 'monitorScope.district': ci(oldName) }, { $set: { 'monitorScope.region': d.region, 'monitorScope.district': d.name } })
		}
		return { success: true }
	}

	async remove(id) {
		if (!validId(id)) return { success: false, message: 'Tuman topilmadi' }
		const d = await districtModel.findById(id)
		if (!d) return { success: false, message: 'Tuman topilmadi' }
		if (!d.isRegion) {
			const n = await schoolModel.countDocuments({ region: ci(d.region), district: ci(d.name) })
			if (n) return { success: false, message: `Bu tumanda ${n} ta maktab bor: avval ularni boshqa tumanga o'tkazing` }
			if (await userModel.exists({ role: 'monitor', 'monitorScope.district': ci(d.name) })) return { success: false, message: "Bu tumanga monitor biriktirilgan: avval monitorni o'zgartiring" }
		}
		await d.deleteOne()
		return { success: true }
	}

	async get(id) {
		if (!validId(id)) return null
		return districtModel.findById(id).lean()
	}

	// Maktab uchun tuman hujjati (viloyat va tuman nomi bo'yicha)
	async forSchool(school) {
		if (!school?.district) return null
		return districtModel.findOne({ isRegion: { $ne: true }, name: ci(school.district), ...(school.region ? { region: ci(school.region) } : {}) }).lean()
	}

	// Xarita uchun chegaralar (FeatureCollection). visibleDistricts: ko'rinadigan tuman nomlari (null = hammasi)
	async features({ visibleDistricts = null, withRegion = true, region = null } = {}) {
		const docs = await districtModel.find({ isActive: { $ne: false }, geometry: { $ne: null }, ...(region ? { region: ci(region) } : {}) }).select('name region isRegion geometry bbox center').lean()
		const list = docs.filter((d) => (d.isRegion ? withRegion : !visibleDistricts || visibleDistricts.some((n) => ci(n).test(d.name))))
		return {
			type: 'FeatureCollection',
			features: list.map((d) => ({ type: 'Feature', properties: { id: String(d._id), name: d.name, region: d.region, isRegion: !!d.isRegion, bbox: d.bbox, center: d.center }, geometry: d.geometry }))
		}
	}
}

module.exports = new DistrictService()
