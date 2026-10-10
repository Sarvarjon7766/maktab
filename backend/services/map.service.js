// Xarita statistikasi: tuman chegaralari + maktablar nuqtalari (bugungi davomat, kechikish, kameralar).
// Monitor so'rovida natija avtomatik uning tumani bilan cheklanadi (utils/monitorScope), tizim egasi hamma tumanni ko'radi.
const MonitorService = require('./monitor.service')
const DistrictService = require('./district.service')
const { scopeDistrict, scopeNarrow, scopeRegion, scopeLevel, scopeIds } = require('../utils/monitorScope')
const MonitorService_ = require('./monitor.service')
const districtModel = require('../models/district.model')

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const key = (t) => String(t || '').trim().toLowerCase()

class MapService {
	async overview(date) {
		const [ov, geojson] = await Promise.all([
			MonitorService.overview(date),
			(async () => {
				const d = scopeDistrict() || scopeNarrow(), level = scopeLevel()
				// tuman monitori: faqat o'z tumani; viloyat monitori: viloyatdagi hamma tuman; cheklovsiz: hammasi + viloyat konturi
				return DistrictService.features({ visibleDistricts: d ? [d] : null, withRegion: !level, region: level === 'region' ? scopeRegion() : null })
			})()
		])
		const schools = ov.schools.filter((s) => s.isActive !== false).map((s) => {
			const st = s.stats || {}
			return {
				_id: s._id, name: s.name, code: s.code, region: s.region, district: s.district,
				location: s.location?.lat != null ? { lat: s.location.lat, lng: s.location.lng, address: s.location.address || '' } : null,
				studentTotal: st.studentTotal || 0, studentCame: st.studentCame || 0, studentLate: st.studentLate || 0, studentAbsent: st.studentAbsent || 0,
				staffTotal: st.staffTotal || 0, staffCame: st.staffCame || 0,
				studentPercent: pct(st.studentCame, st.studentTotal), staffPercent: pct(st.staffCame, st.staffTotal),
				cameraTotal: st.cameraTotal || 0, cameraOnline: st.cameraOnline || 0
			}
		})
		const byDistrict = new Map()
		for (const s of schools) {
			const k = key(s.district) || '—'
			if (!byDistrict.has(k)) byDistrict.set(k, { name: s.district || 'Tumansiz', schools: 0, located: 0, studentTotal: 0, studentCame: 0, studentLate: 0, staffTotal: 0, staffCame: 0 })
			const d = byDistrict.get(k)
			d.schools++; if (s.location) d.located++
			d.studentTotal += s.studentTotal; d.studentCame += s.studentCame; d.studentLate += s.studentLate; d.staffTotal += s.staffTotal; d.staffCame += s.staffCame
		}
		const districts = [...byDistrict.values()].map((d) => ({ ...d, studentPercent: pct(d.studentCame, d.studentTotal), staffPercent: pct(d.staffCame, d.staffTotal) }))
		return { success: true, dateString: ov.dateString, scope: { scoped: scopeLevel() !== null, level: scopeLevel(), region: scopeRegion(), district: scopeDistrict() || scopeNarrow() }, geojson, districts, schools, unlocated: schools.filter((s) => !s.location).length }
	}
}

class DistrictsReport {
	// Viloyat panel uchun: tumanlar kesimida bugungi holat va davr bo'yicha o'rtacha davomat, o'rin va jami ko'rsatkichlar.
	// Monitor so'rovida natija o'z hududi bilan cheklanadi (ichkarida MonitorService hududni o'zi qo'llaydi).
	async report({ from, to }) {
		const [ov, cmp, docs] = await Promise.all([
			MonitorService_.overview(),
			MonitorService_.schoolsCompare({ from, to }),
			districtModel.find({ isRegion: { $ne: true }, ...(scopeRegion() ? { region: new RegExp('^\\s*' + scopeRegion().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') } : {}) }).select('name region').lean()
		])
		const period = new Map((cmp.schools || cmp.rows || []).map((r) => [String(r._id), r]))
		const map = new Map()
		const ensure = (name, region) => { const k = key(name) || '—'; if (!map.has(k)) map.set(k, { name: name || 'Tumansiz', region: region || '', schools: 0, located: 0, students: 0, studentCame: 0, studentLate: 0, staff: 0, staffCame: 0, cameraTotal: 0, cameraOnline: 0, _sp: 0, _spw: 0, _fp: 0, _fpw: 0 }); return map.get(k) }
		docs.forEach((d) => ensure(d.name, d.region))
		for (const s of ov.schools.filter((x) => x.isActive !== false)) {
			const d = ensure(s.district, s.region), st = s.stats || {}
			d.schools++; if (s.location?.lat != null) d.located++
			d.students += st.studentTotal || 0; d.studentCame += st.studentCame || 0; d.studentLate += st.studentLate || 0
			d.staff += st.staffTotal || 0; d.staffCame += st.staffCame || 0
			d.cameraTotal += st.cameraTotal || 0; d.cameraOnline += st.cameraOnline || 0
			const p = period.get(String(s._id))
			if (p && p.studentPercent !== null && p.studentPercent !== undefined && st.studentTotal) { d._sp += p.studentPercent * st.studentTotal; d._spw += st.studentTotal }
			if (p && p.staffPercent !== null && p.staffPercent !== undefined && st.staffTotal) { d._fp += p.staffPercent * st.staffTotal; d._fpw += st.staffTotal }
		}
		const r1 = (n) => Math.round(n * 10) / 10
		const rows = [...map.values()].map(({ _sp, _spw, _fp, _fpw, ...d }) => ({
			...d,
			studentToday: pct(d.studentCame, d.students), staffToday: pct(d.staffCame, d.staff),
			studentPeriod: _spw ? r1(_sp / _spw) : null, staffPeriod: _fpw ? r1(_fp / _fpw) : null,
			latePercent: d.studentCame ? r1((d.studentLate / d.studentCame) * 100) : null,
			cameraPercent: d.cameraTotal ? r1((d.cameraOnline / d.cameraTotal) * 100) : null
		})).sort((a, b) => (b.studentPeriod ?? -1) - (a.studentPeriod ?? -1) || a.name.localeCompare(b.name))
		rows.forEach((r, i) => { r.rank = r.studentPeriod === null ? null : i + 1 })
		const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
		const wp = rows.filter((r) => r.studentPeriod !== null)
		return {
			success: true, dateString: ov.dateString, from: cmp.from, to: cmp.to, rows,
			totals: {
				districts: rows.length, schools: sum('schools'), students: sum('students'), studentCame: sum('studentCame'), staff: sum('staff'), staffCame: sum('staffCame'), studentLate: sum('studentLate'),
				studentToday: pct(sum('studentCame'), sum('students')), cameraTotal: sum('cameraTotal'), cameraOnline: sum('cameraOnline'),
				studentPeriod: wp.length ? r1(wp.reduce((a, r) => a + r.studentPeriod * r.students, 0) / (wp.reduce((a, r) => a + r.students, 0) || 1)) : null
			}
		}
	}
}

// Tanlagich uchun: monitor hududidagi tumanlar nomi (tizim egasi uchun hamma)
class DistrictList {
	async names() {
		const schools = await require('../models/school.model').find(require('../utils/monitorScope').schoolFilter()).select('district region').lean()
		const reg = scopeRegion()
		const docs = await districtModel.find({ isRegion: { $ne: true }, ...(reg ? { region: new RegExp('^\\s*' + reg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i') } : {}) }).select('name').lean()
		const set = new Map()
		for (const n of [...docs.map((d) => d.name), ...schools.map((s) => s.district)]) { const t = String(n || '').trim(); if (t) set.set(t.toLowerCase(), t) }
		return { success: true, districts: [...set.values()].sort((a, b) => a.localeCompare(b, 'uz')) }
	}
}

module.exports = new MapService()
module.exports.names = new DistrictList()
module.exports.districts = new DistrictsReport()
