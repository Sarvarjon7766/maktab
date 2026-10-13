// Monitor (nazoratchi) hududi: har bir monitor ma'lum bir tuman (yoki viloyat) maktablarini ko'radi.
// Monitor so'rovi davomida hudud maktablari ro'yxati AsyncLocalStorage'da turadi, monitor/tahlil xizmatlari
// maktablarni tanlashda shu ro'yxatdan foydalanadi. `monitorScope` belgilanmagan eski monitor — hamma maktabni ko'radi.
const { AsyncLocalStorage } = require('async_hooks')
const mongoose = require('mongoose')

const als = new AsyncLocalStorage()
const TTL = 60 * 1000
const cache = new Map() // userId -> { at, value }

const esc = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const norm = (t) => String(t || '').trim()

// Maktablarni hudud bo'yicha topadi (katta-kichik harf va ortiqcha bo'shliqlarga e'tibor berilmaydi)
async function schoolsOf(scope) {
	const schoolModel = require('../models/school.model')
	if (!scope?.region && !scope?.district) return null
	const filter = {}
	if (norm(scope.region)) filter.region = new RegExp('^\\s*' + esc(norm(scope.region)) + '\\s*$', 'i')
	if (norm(scope.district)) filter.district = new RegExp('^\\s*' + esc(norm(scope.district)) + '\\s*$', 'i')
	return (await schoolModel.find(filter).setOptions({ unscoped: true }).select('_id').lean()).map((s) => s._id)
}

// Foydalanuvchining hududi: { schoolIds, region, district } yoki null (cheklovsiz)
// `active` false (hujjat yo'q / nofaol / endi monitor emas) bo'lsa so'rov rad etiladi;
// value = null — hudud belgilanmagan "global" monitor (cheklovsiz, mavjud holat)
async function loadState(userId) {
	const key = String(userId)
	const hit = cache.get(key)
	if (hit && Date.now() - hit.at < TTL) return hit.state
	const userModel = require('../models/user.model')
	const u = await userModel.findById(userId).select('role isActive monitorScope').lean()
	let state
	if (!u || u.role !== 'monitor' || u.isActive === false) {
		state = { active: false, value: null }
	} else {
		let value = null
		if (norm(u.monitorScope?.region) || norm(u.monitorScope?.district)) {
			value = { schoolIds: await schoolsOf(u.monitorScope), region: norm(u.monitorScope.region), district: norm(u.monitorScope.district) }
		}
		state = { active: true, value }
	}
	cache.set(key, { at: Date.now(), state })
	return state
}
async function loadScope(userId) {
	return (await loadState(userId)).value
}
const forget = (userId) => cache.delete(String(userId))

// Express middleware: monitor bo'lsa hudud bilan davom ettiradi
// Tuman tanlash: viloyat monitori (yoki tizim egasi) so'rovga ?district=Nomi qo'shsa, butun javob shu tuman maktablari bilan cheklanadi
// (hamma monitor hisobotlari avtomatik "tumanga kiradi"). Tuman monitori uchun e'tiborga olinmaydi (u allaqachon bitta tumanda).
async function monitorScopeMiddleware(req, res, next) {
	try {
		const role = req.user?.role
		if (role !== 'monitor' && role !== 'superadmin') return next()
		let scope = null
		if (role === 'monitor') {
			const st = await loadState(req.user.userId || req.user.id)
			// hujjat yo'q / nofaol / endi monitor emas — cheklovsiz ishlashga yo'l qo'yilmaydi
			if (!st.active) return res.status(403).json({ success: false, message: 'Monitor hisobi faol emas' })
			scope = st.value
		}
		const want = String(req.query?.district || '').trim()
		if (role === 'superadmin' && !want) return next()
		if (!scope && !want) return next()
		if (scope?.district || !want) return als.run(scope, next)
		const ids = await schoolsOf({ region: scope?.region || '', district: want })
		const allowed = scope ? ids.filter((id) => scope.schoolIds.some((x) => String(x) === String(id))) : ids
		return als.run({ ...(scope || { region: '', district: '' }), schoolIds: allowed, narrow: want }, next)
	} catch (error) {
		console.error('Monitor hududi xatosi:', error)
		return res.status(500).json({ success: false, message: 'Hudud aniqlanmadi' })
	}
}

const store = () => als.getStore() || null
// Hudud maktablari (ObjectId[]) yoki null — cheklov yo'q
const scopeIds = () => store()?.schoolIds || null
// Kesh kaliti uchun hudud belgisi: har bir tuman o'z natijasini oladi (cheklovsiz = 'all')
// Monitor tumani nomi (viloyat darajasidagi yoki cheklovsiz bo'lsa bo'sh)
const scopeDistrict = () => store()?.district || ''
const scopeRegion = () => store()?.region || ''
// 'region' — butun viloyat monitori, 'district' — tuman monitori, null — cheklovsiz
const scopeNarrow = () => store()?.narrow || ''
const scopeLevel = () => { const st = store(); if (st && st.global && !st.narrow) return null; return st ? (st.district || st.narrow ? 'district' : 'region') : null }
const scopeKey = () => { const st = store(); return st ? `${st.region}|${st.district}|${st.narrow || ''}` : 'all' }
const inScope = (schoolId) => { const ids = scopeIds(); return !ids || ids.some((x) => String(x) === String(schoolId)) }
// `_id` bo'yicha maktab filtri: { _id: { $in } } (cheklov bo'lsa)
const schoolFilter = (filter = {}) => {
	const ids = scopeIds()
	if (!ids) return filter
	if (filter._id) return { ...filter, _id: ids.some((x) => String(x) === String(filter._id)) ? filter._id : { $in: [] } }
	return { ...filter, _id: { $in: ids } }
}
// Boshqa kolleksiyalarda `schoolId` sharti. `requested` — so'rovda berilgan maktab (ixtiyoriy).
// Qaytadi: ObjectId | { $in: [...] } | undefined (cheklovsiz)
function schoolCond(requested) {
	const ids = scopeIds()
	const ok = requested && mongoose.isValidObjectId(requested)
	if (ok) return ids && !inScope(requested) ? { $in: [] } : new mongoose.Types.ObjectId(String(requested))
	return ids ? { $in: ids } : undefined
}
// Hik kamera/hodisa kabi so'rovlar (alohida router) uchun: monitor shu maktabni ko'ra oladimi
async function monitorCanSee(user, schoolId) {
	if (user?.role !== 'monitor') return true
	const st = await loadState(user.userId || user.id)
	if (!st.active) return false
	const scope = st.value
	if (!scope) return true
	return scope.schoolIds.some((x) => String(x) === String(schoolId))
}

// Qoida: nofaol (isActive:false) maktablar monitor tahlillaridan (barcha /api/monitor/* hisobotlari) chiqarib tashlanadi.
// Hudud ro'yxatidan nofaollar olib tashlanadi; cheklovsiz (superadmin/global monitor) holatda nofaol maktab bo'lsa,
// faol maktablar ro'yxati 'global' belgisi bilan beriladi (scopeLevel() null qoladi). Platforma /api/schools ro'yxatiga ta'sir qilmaydi.
let activeCache = null
async function activeSchoolIds() {
	if (activeCache && Date.now() - activeCache.at < TTL) return activeCache.value
	const schoolModel = require('../models/school.model')
	const [active, inactive] = await Promise.all([schoolModel.find({ isActive: { $ne: false } }).setOptions({ unscoped: true }).select('_id').lean(), schoolModel.exists({ isActive: false }).setOptions({ unscoped: true })])
	const value = { ids: active.map((x) => x._id), hasInactive: !!inactive }
	activeCache = { at: Date.now(), value }
	return value
}
async function excludeInactiveSchools(req, res, next) {
	try {
		const act = await activeSchoolIds()
		const cur = als.getStore() || null
		if (!act.hasInactive) return next()
		const set = new Set(act.ids.map(String))
		if (cur && cur.schoolIds) return als.run({ ...cur, schoolIds: cur.schoolIds.filter((id) => set.has(String(id))) }, next)
		return als.run({ ...(cur || { region: '', district: '' }), schoolIds: act.ids, global: true }, next)
	} catch (error) {
		console.error('Faol maktablar xatosi:', error)
		return res.status(500).json({ success: false, message: 'Hudud aniqlanmadi' })
	}
}

// sinov uchun: berilgan hudud ichida funksiyani ishga tushiradi
const runWithScope = (scope, fn) => als.run(scope, fn)
const currentStore = () => als.getStore() || null

module.exports = { excludeInactiveSchools, currentStore, scopeNarrow, scopeRegion, scopeLevel, scopeDistrict, runWithScope, monitorScopeMiddleware, scopeKey, scopeIds, inScope, schoolFilter, schoolCond, monitorCanSee, loadScope, forget, schoolsOf }

