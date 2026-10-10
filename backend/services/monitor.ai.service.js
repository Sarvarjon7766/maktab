// Monitor (tuman/viloyat) uchun "Aqlli kuzatuv" jamlanmasi: AI aniqlagan muhim hodisalar, avtomatik lahzalar (kadr va qisqa lavhalar).
// Natija monitorning hududi bilan cheklanadi (utils/monitorScope): tuman monitori o'z tumanini, viloyat monitori butun viloyatni ko'radi.
// Kadr va lavhalarning o'zi /api/hik/events/:id/(snapshot|clip|frame) orqali hudud tekshiruvi bilan beriladi.
const mongoose = require('mongoose')
const schoolModel = require('../models/school.model')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const Vision = require('./vision.service')
const { schoolFilter, schoolCond } = require('../utils/monitorScope')

const ALERTS = ['vision_empty', 'vision_surge', 'vision_overcrowd']
const KINDS = [...ALERTS, 'vision_sample']
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const { isDate } = require('../utils/dateStr')
const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

class MonitorAIService {
	// Hudud ichidagi maktablar (tuman bo'yicha filtrlash mumkin)
	async schools(district) {
		const filter = schoolFilter({ isActive: { $ne: false } })
		if (district) filter.district = new RegExp('^\\s*' + esc(district.trim()) + '\\s*$', 'i')
		return schoolModel.find(filter).select('name district region').lean()
	}

	// Tuman va maktablar kesimida: muhim hodisalar, jami lahzalar, AI kameralar (online/jami)
	async overview({ date } = {}) {
		const day = isDate(date) ? date : todayStr()
		const schools = await this.schools()
		const ids = schools.map((s) => s._id)
		const [events, cams] = await Promise.all([
			hikCameraEventModel.aggregate([
				{ $match: { schoolId: { $in: ids }, dateString: day, kind: { $in: KINDS } } },
				{ $group: { _id: '$schoolId', total: { $sum: 1 }, alerts: { $sum: { $cond: [{ $in: ['$kind', ALERTS] }, 1, 0] } }, clips: { $sum: { $cond: [{ $ifNull: ['$clip', false] }, 1, 0] } }, last: { $max: '$time' } } }
			]),
			hikCameraModel.aggregate([
				{ $match: { schoolId: { $in: ids }, visionEnabled: true, role: 'monitor', inCloud: { $ne: false } } },
				{ $group: { _id: '$schoolId', total: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } } } }
			])
		])
		const ev = new Map(events.map((e) => [String(e._id), e])), cm = new Map(cams.map((c) => [String(c._id), c]))
		const rows = schools.map((s) => {
			const e = ev.get(String(s._id)) || {}, c = cm.get(String(s._id)) || {}
			return { _id: s._id, name: s.name, district: s.district || '', alerts: e.alerts || 0, total: e.total || 0, clips: e.clips || 0, last: e.last || null, cameras: c.total || 0, online: c.online || 0 }
		}).sort((a, b) => b.alerts - a.alerts || b.total - a.total || a.name.localeCompare(b.name, 'uz', { numeric: true }))
		const byD = new Map()
		for (const r of rows) {
			const k = (r.district || '—').trim()
			if (!byD.has(k)) byD.set(k, { name: r.district || 'Tumansiz', schools: 0, withAI: 0, alerts: 0, total: 0, cameras: 0, online: 0 })
			const d = byD.get(k)
			d.schools++; if (r.cameras) d.withAI++
			d.alerts += r.alerts; d.total += r.total; d.cameras += r.cameras; d.online += r.online
		}
		const districts = [...byD.values()].sort((a, b) => b.alerts - a.alerts || b.total - a.total || a.name.localeCompare(b.name, 'uz'))
		const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
		return { success: true, dateString: day, totals: { schools: rows.length, withAI: rows.filter((r) => r.cameras).length, alerts: sum('alerts'), total: sum('total'), clips: sum('clips'), cameras: sum('cameras'), online: sum('online') }, districts, schools: rows }
	}

	// Hodisalar ro'yxati (kadr/lavha) hudud bo'yicha: tuman yoki maktab filtri bilan, sahifalab
	async evidence({ date, district, schoolId, group = 'all', page = 1 } = {}) {
		const schools = await this.schools(district)
		let ids = schools.map((s) => s._id)
		if (schoolId) {
			if (!mongoose.isValidObjectId(schoolId)) return { success: false, message: "Maktab id noto'g'ri" }
			const c = schoolCond(schoolId)
			ids = c && c.$in ? [] : ids.filter((x) => String(x) === String(schoolId))
		}
		const base = { schoolId: { $in: ids }, kind: { $in: KINDS } }
		if (isDate(date)) base.dateString = date
		const match = { ...base }
		if (group === 'alerts') match.kind = { $in: ALERTS }
		else if (group === 'samples') match.kind = 'vision_sample'
		else if (group === 'clips') match.clip = { $exists: true, $ne: null }
		const size = 24, current = Math.max(1, Number(page) || 1)
		const names = new Map(schools.map((s) => [String(s._id), { name: s.name, district: s.district || '' }]))
		const [total, rows, kinds] = await Promise.all([
			hikCameraEventModel.countDocuments(match),
			hikCameraEventModel.find(match).sort({ time: -1 }).skip((current - 1) * size).limit(size)
				.populate('camera', 'name').populate('sinfId', 'name').select('schoolId kind time camera sinfId title detail count clip images scene').lean(),
			hikCameraEventModel.aggregate([{ $match: base }, { $group: { _id: '$kind', n: { $sum: 1 } } }])
		])
		return {
			success: true, total, page: current, pages: Math.max(1, Math.ceil(total / size)),
			byKind: Object.fromEntries(kinds.map((k) => [k._id, k.n])),
			items: rows.map((e) => {
				const sc = names.get(String(e.schoolId)) || { name: '', district: '' }
				const item = Vision.mapEvidence(e)
				return { ...item, schoolId: e.schoolId, school: sc.name, district: sc.district, sinf: [sc.name, item.sinf].filter(Boolean).join(' · ') }
			})
		}
	}
}

module.exports = new MonitorAIService()
