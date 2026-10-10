// VILOYAT serveri: ulangan tuman serverlari reestri (RemoteDistrict). Kalitlar bazada shifrlangan, xotirada faqat qisqa vaqt keshlanadi.
const RemoteDistrict = require('../../models/remote.district.model')
const { decrypt } = require('../../utils/secretBox')
const { getJson, safeBase } = require('./client')

let cache = null
const TTL = 30 * 1000

const norm = (t) => String(t || '').trim().toLowerCase()

// Faol tumanlar [{ id, name, region, baseUrl, apiKey, districts }] — nom bo'yicha tartiblangan (natija tartibi barqaror bo'lsin)
async function list({ fresh = false } = {}) {
	if (!fresh && cache && Date.now() - cache.at < TTL) return cache.rows
	const docs = await RemoteDistrict.find({ active: true }).select('+apiKeyEnc').sort({ name: 1 }).lean()
	const rows = []
	for (const d of docs) {
		try { rows.push({ id: String(d._id), name: d.name, region: d.region || '', baseUrl: d.baseUrl, apiKey: decrypt(d.apiKeyEnc), districts: d.districts || [], schoolCount: d.schools || 0 }) } catch { /* kalit o'qilmadi — o'tkazib yuboriladi */ }
	}
	cache = { at: Date.now(), rows }
	return rows
}
const reset = () => { cache = null }

// Serverni tekshiradi (/ping) va holatini bazaga yozadi
async function check(entry) {
	const patch = {}
	try {
		const { ok, data } = await getJson(entry, '/ping', null, { timeoutMs: 10000 })
		if (!ok || !data?.success) throw new Error('Kalit qabul qilinmadi yoki server mos kelmadi')
		Object.assign(patch, { lastOkAt: new Date(), lastError: '', schools: data.schools || 0, districts: data.districts || [], version: String(data.version || '') })
	} catch (e) {
		Object.assign(patch, { lastError: String(e.message || e).slice(0, 200), lastErrorAt: new Date() })
	}
	await RemoteDistrict.updateOne({ _id: entry.id }, { $set: patch })
	reset()
	return patch
}

// Foydalanuvchi hududi bo'yicha ruxsat etilgan serverlar. scope: { region, district } (bo'sh = cheklovsiz); narrow — ?district=Nom
function allowed(entries, scope, narrow) {
	let out = entries
	if (scope?.district) out = out.filter((e) => e.districts.some((d) => norm(d) === norm(scope.district)) || norm(e.name) === norm(scope.district))
	else if (scope?.region) out = out.filter((e) => norm(e.region) === norm(scope.region))
	if (narrow) out = out.filter((e) => e.districts.some((d) => norm(d) === norm(narrow)) || norm(e.name) === norm(narrow))
	return out
}

module.exports = { list, reset, check, allowed, safeBase, norm }
