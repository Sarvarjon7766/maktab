// Tizim egasi (superadmin) bosh sahifasi: butun tizim holati bitta javobda.
// Bo'limlar bir-biriga bog'liq emas: biri xato bersa qolganlari ko'rsatiladi (`errors` ichida qaysi bo'lim olinmagani aytiladi)
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const schoolModel = require('../models/school.model')
const userModel = require('../models/user.model')
const studentModel = require('../models/student.model')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const hikVisionMetricModel = require('../models/hik.visionmetric.model')
const hikPersonModel = require('../models/hik.person.model')
const adduserModel = require('../models/add.user.model')
const deleteUserModel = require('../models/delete.user.model')
const impersonationLogModel = require('../models/impersonation.log.model')
const { ALERT_KINDS } = require('../ai/kinds')
const { runWithScope } = require('../utils/monitorScope')

const ROOT = path.join(__dirname, '..')
const todayString = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())

// Papka hajmi (rekursiv): og'ir bo'lgani uchun uzoq keshlanadi
const sizeCache = new Map()
async function dirSize(dir, ttl = 15 * 60 * 1000) {
	const hit = sizeCache.get(dir)
	if (hit && Date.now() - hit.at < ttl) return hit.value
	let bytes = 0, files = 0
	const walk = async (d, depth) => {
		let entries
		try { entries = await fs.promises.readdir(d, { withFileTypes: true }) } catch { return }
		for (const e of entries) {
			const p = path.join(d, e.name)
			if (e.isDirectory()) { if (depth < 4) await walk(p, depth + 1) } else if (e.isFile()) {
				const st = await fs.promises.stat(p).catch(() => null)
				if (st) { bytes += st.size; files++ }
			}
		}
	}
	await walk(dir, 0)
	const value = { bytes, files }
	sizeCache.set(dir, { at: Date.now(), value })
	return value
}

async function section(errors, name, fn) {
	try { return await fn() } catch (error) { console.log(`Platforma sahifasi: «${name}» olinmadi:`, error.message); errors.push(name); return null }
}

class PlatformOverviewService {
	async build() {
		const errors = []
		const today = todayString()

		const [schoolsBlock, peopleBlock, attendance, hik, persons, ai, bot, storage, audit] = await Promise.all([
			section(errors, 'schools', async () => {
				const rows = await schoolModel.find().select('name region district isActive createdAt location').lean()
				const districts = new Set(rows.map((s) => `${s.region}|${s.district}`).filter((x) => x !== '|'))
				return {
					total: rows.length, active: rows.filter((s) => s.isActive !== false).length, inactive: rows.filter((s) => s.isActive === false).length,
					districts: districts.size, withLocation: rows.filter((s) => s.location?.lat != null).length,
					latest: rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 3).map((s) => ({ _id: s._id, name: s.name, district: s.district, createdAt: s.createdAt }))
				}
			}),
			section(errors, 'people', async () => {
				const [students, byRole] = await Promise.all([
					studentModel.countDocuments({ isActive: { $ne: false } }),
					userModel.aggregate([{ $match: { isActive: { $ne: false } } }, { $group: { _id: '$role', n: { $sum: 1 } } }])
				])
				const role = Object.fromEntries(byRole.map((r) => [r._id, r.n]))
				return { students, staff: (role.viewer || 0) + (role.leader || 0), schoolAdmins: (role.user || 0) + (role.admin || 0), monitors: role.monitor || 0, owners: role.superadmin || 0 }
			}),
			// Bugungi davomat: monitor hisobotining o'zi (cheklovsiz), shuning uchun raqamlar monitor panelidagi bilan bir xil
			section(errors, 'attendance', async () => {
				const MonitorService = require('./monitor.service')
				const r = await runWithScope(null, () => MonitorService.overview(today))
				const list = (r.schools || []).filter((s) => s.isActive !== false)
				const sum = (k) => list.reduce((a, s) => a + (s.stats?.[k] || 0), 0)
				const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
				const rows = list.map((s) => ({ _id: s._id, name: s.name, district: s.district, studentTotal: s.stats.studentTotal, studentCame: s.stats.studentCame, staffTotal: s.stats.staffTotal, staffCame: s.stats.staffCame, percent: pct(s.stats.studentCame, s.stats.studentTotal) }))
				const withData = rows.filter((s) => s.studentCame + s.staffCame > 0)
				return {
					date: r.dateString,
					students: { total: sum('studentTotal'), came: sum('studentCame'), late: sum('studentLate'), percent: pct(sum('studentCame'), sum('studentTotal')) },
					staff: { total: sum('staffTotal'), came: sum('staffCame'), late: sum('staffLate'), percent: pct(sum('staffCame'), sum('staffTotal')) },
					schoolsWithData: withData.length,
					noDataCount: rows.filter((s) => s.studentTotal > 0 && s.studentCame + s.staffCame === 0).length,
					lowest: withData.filter((s) => s.percent !== null).sort((a, b) => a.percent - b.percent).slice(0, 5)
				}
			}),
			section(errors, 'hik', async () => {
				const HikService = require('./hikconnect.service')
				const [overview, cams] = await Promise.all([
					HikService.accountsOverview(),
					hikCameraModel.aggregate([{ $match: { inCloud: true } }, { $group: { _id: { assigned: { $ne: ['$schoolId', null] }, online: '$online', role: '$role' }, n: { $sum: 1 } } }])
				])
				const c = { total: 0, assigned: 0, unassigned: 0, online: 0, offline: 0, unknown: 0, faceControl: 0 }
				for (const r of cams) {
					c.total += r.n
					if (r._id.assigned) {
						c.assigned += r.n
						if (r._id.online === true) c.online += r.n; else if (r._id.online === false) c.offline += r.n; else c.unknown += r.n
						if (r._id.role === 'in' || r._id.role === 'out') c.faceControl += r.n
					} else c.unassigned += r.n
				}
				const accounts = overview.accounts.map((a) => ({ _id: a._id, name: a.name, server: a.server, lastSyncAt: a.lastSyncAt, lastSyncError: a.lastSyncError, cameraTotal: a.cameraTotal, cameraOnline: a.cameraOnline }))
				const offlineSchools = await hikCameraModel.aggregate([
					{ $match: { inCloud: true, schoolId: { $ne: null }, online: false } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 5 },
					{ $lookup: { from: 'schools', localField: '_id', foreignField: '_id', as: 's' } }, { $project: { n: 1, name: { $arrayElemAt: ['$s.name', 0] } } }
				])
				return { accounts, cameras: c, offlineSchools: offlineSchools.map((x) => ({ _id: x._id, name: x.name || '—', offline: x.n })) }
			}),
			// Hik-Connect bilan xodim/o'quvchi sinxronlash holati
			section(errors, 'persons', async () => {
				const [synced, pendingAdd, pendingDelete, failed] = await Promise.all([
					hikPersonModel.estimatedDocumentCount(), adduserModel.estimatedDocumentCount(), deleteUserModel.estimatedDocumentCount(),
					adduserModel.countDocuments({ attempts: { $gt: 0 }, lastError: { $nin: [null, ''] } })
				])
				return { synced, pendingAdd, pendingDelete, failed }
			}),
			section(errors, 'ai', async () => {
				const AiSettings = require('./ai.settings.service')
				const [settings, lastMetric, alertsToday, samplesToday, metricsToday] = await Promise.all([
					AiSettings.get(),
					hikVisionMetricModel.findOne().sort({ time: -1 }).select('time').lean(),
					hikCameraEventModel.countDocuments({ dateString: today, kind: { $in: ALERT_KINDS } }),
					hikCameraEventModel.countDocuments({ dateString: today, kind: 'vision_sample' }),
					hikVisionMetricModel.countDocuments({ dateString: today })
				])
				return { enabled: settings.enabled !== false, pose: settings.poseEnabled !== false, lastAnalysisAt: lastMetric?.time || null, alertsToday, samplesToday, analysesToday: metricsToday }
			}),
			section(errors, 'bot', async () => {
				const Parents = require('./parent.service')
				const r = await Parents.platformStatus()
				return { ready: !!r.bot?.ready, username: r.bot?.username || '', error: r.bot?.error || '', guardians: r.totals?.guardians || 0, sentToday: r.totals?.sentToday || 0, failedToday: r.totals?.failedToday || 0, queue: r.bot?.queue?.length || 0 }
			}),
			section(errors, 'storage', async () => {
				const [uploads, evidence, dbStats, disk] = await Promise.all([
					dirSize(path.join(ROOT, 'uploads')), dirSize(path.join(ROOT, 'private')),
					mongoose.connection.db.stats().catch(() => null),
					fs.promises.statfs ? fs.promises.statfs(ROOT).catch(() => null) : null
				])
				return {
					uploads, evidence,
					db: dbStats ? { dataBytes: dbStats.dataSize, storageBytes: dbStats.storageSize, objects: dbStats.objects, collections: dbStats.collections } : null,
					disk: disk ? { freeBytes: Number(disk.bavail) * Number(disk.bsize), totalBytes: Number(disk.blocks) * Number(disk.bsize) } : null
				}
			}),
			section(errors, 'audit', async () => {
				const rows = await impersonationLogModel.find().sort({ createdAt: -1 }).limit(6).populate('school', 'name').lean()
				return rows.map((r) => ({ _id: r._id, at: r.createdAt, who: r.superadminUsername, school: r.school?.name || '—', schoolId: r.school?._id || null }))
			})
		])

		return {
			success: true, at: new Date(), date: today, errors,
			schools: schoolsBlock, people: peopleBlock, attendance, hik, persons, ai, bot, storage, audit
		}
	}
	// "Maktablar nazorati" jadvali: har maktab bo'yicha bugungi holat va aniqlangan muammolar (filtrlash uchun kodlar bilan)
	async schoolsHealth() {
		const today = todayString()
		const MonitorService = require('./monitor.service')
		const [schools, overview, admins, cams, failed] = await Promise.all([
			schoolModel.find().select('name code region district phone isActive location createdAt').sort({ name: 1 }).lean(),
			runWithScope(null, () => MonitorService.overview(today)),
			userModel.aggregate([{ $match: { role: { $in: ['user', 'admin'] }, isActive: { $ne: false }, schoolId: { $ne: null } } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }]),
			hikCameraModel.aggregate([{ $match: { inCloud: true, schoolId: { $ne: null } } }, { $group: { _id: '$schoolId', total: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$online', true] }, 1, 0] } }, offline: { $sum: { $cond: [{ $eq: ['$online', false] }, 1, 0] } }, fc: { $sum: { $cond: [{ $in: ['$role', ['in', 'out']] }, 1, 0] } } } }]),
			adduserModel.aggregate([{ $match: { attempts: { $gt: 0 }, lastError: { $nin: [null, ''] } } }, { $group: { _id: '$schoolId', n: { $sum: 1 } } }])
		])
		const stats = new Map((overview.schools || []).map((s) => [String(s._id), s.stats || {}]))
		const adminMap = new Map(admins.map((a) => [String(a._id), a.n]))
		const camMap = new Map(cams.map((c) => [String(c._id), c]))
		const failMap = new Map(failed.map((f) => [String(f._id), f.n]))
		const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
		const rows = schools.map((s) => {
			const id = String(s._id)
			const st = stats.get(id) || {}
			const cam = camMap.get(id) || { total: 0, online: 0, offline: 0, fc: 0 }
			const row = {
				_id: s._id, name: s.name, code: s.code, region: s.region, district: s.district, phone: s.phone, isActive: s.isActive !== false, hasLocation: s.location?.lat != null, createdAt: s.createdAt,
				students: st.studentTotal || 0, studentCame: st.studentCame || 0, studentLate: st.studentLate || 0, staff: st.staffTotal || 0, staffCame: st.staffCame || 0, classes: st.classTotal || 0,
				studentPercent: pct(st.studentCame || 0, st.studentTotal || 0), staffPercent: pct(st.staffCame || 0, st.staffTotal || 0),
				admins: adminMap.get(id) || 0, cameras: { total: cam.total, online: cam.online, offline: cam.offline, faceControl: cam.fc }, syncFailed: failMap.get(id) || 0
			}
			const problems = []
			if (!row.isActive) problems.push('inactive')
			else {
				if (row.admins === 0) problems.push('no_admin')
				if (row.students > 0 && row.studentCame + row.staffCame === 0) problems.push('no_attendance')
				else if (row.studentPercent !== null && row.studentPercent < 60) problems.push('low_attendance')
				if (cam.offline > 0) problems.push('cam_offline')
				if (cam.total === 0) problems.push('no_camera')
				if (row.syncFailed > 0) problems.push('sync_failed')
				if (!row.hasLocation) problems.push('no_location')
			}
			row.problems = problems
			return row
		})
		const counts = {}
		rows.forEach((r) => r.problems.forEach((p) => { counts[p] = (counts[p] || 0) + 1 }))
		return { success: true, date: today, total: rows.length, counts, problemSchools: rows.filter((r) => r.problems.length).length, schools: rows }
	}
}

module.exports = new PlatformOverviewService()
