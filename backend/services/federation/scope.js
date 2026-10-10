// VILOYAT serveri: foydalanuvchi (monitor) hududi. Viloyat serverida maktablar bazasi yo'q, shuning uchun hudud faqat nomlar bilan beriladi:
// level: null (cheklovsiz: tizim egasi yoki hududsiz monitor) | 'region' | 'district'
const userModel = require('../../models/user.model')

const cache = new Map()
const TTL = 60 * 1000
const norm = (t) => String(t || '').trim()

async function userScope(user) {
	if (user?.role === 'superadmin') return { level: null, region: '', district: '', active: true }
	const id = String(user?.userId || user?.id || '')
	const hit = cache.get(id)
	if (hit && Date.now() - hit.at < TTL) return hit.value
	const u = await userModel.findById(id).select('role isActive monitorScope').lean()
	let value
	if (!u || u.role !== 'monitor' || u.isActive === false) value = { active: false, level: null, region: '', district: '' }
	else {
		const region = norm(u.monitorScope?.region), district = norm(u.monitorScope?.district)
		value = { active: true, level: district ? 'district' : region ? 'region' : null, region, district }
	}
	cache.set(id, { at: Date.now(), value })
	return value
}
const forget = (id) => cache.delete(String(id))

module.exports = { userScope, forget }
