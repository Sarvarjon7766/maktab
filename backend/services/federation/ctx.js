// Viloyat serveri: so'rov konteksti — monitor hududi va ruxsat etilgan tumanlar ro'yxati (req.fed). monitor va hik proksi yo'llari uchun umumiy.
const registry = require('./registry')
const { userScope } = require('./scope')

async function regionContext(req, res, next) {
	try {
		const scope = await userScope(req.user)
		if (!scope.active) return res.status(403).json({ success: false, message: 'Monitor hisobi faol emas' })
		const all = await registry.list()
		const narrow = String(req.query?.district || '').trim()
		const entries = registry.allowed(all, scope, narrow)
		req.fed = { scope, narrow, all, entries, user: req.user }
		next()
	} catch (error) {
		console.error('Viloyat hududi xatosi:', error.message)
		res.status(500).json({ success: false, message: 'Hudud aniqlanmadi' })
	}
}

module.exports = { regionContext }

// Foydalanuvchi hududi bo'yicha tuman nomi (tuman monitori yoki ?district=) — federatsiya so'rovlariga qo'shiladi, tuman serveri shu tuman bilan cheklaydi
const narrowOf = (fed) => fed.narrow || fed.scope.district || ''
const withNarrow = (fed, query) => { const n = narrowOf(fed); return n ? { ...(query || {}), district: n } : (query || {}) }

// Maktab shu foydalanuvchi hududiga kiradimi (maktab ma'lumoti: { district, region }). Bitta serverda bir nechta tuman bo'lsa ham to'g'ri ishlaydi
const lc = (t) => String(t || '').trim().toLowerCase()
function schoolAllowed(fed, info) {
	const { scope } = fed
	if (scope.district && lc(info.district) !== lc(scope.district)) return false
	if (!scope.district && scope.region && info.region && lc(info.region) !== lc(scope.region)) return false
	if (fed.narrow && lc(info.district) !== lc(fed.narrow)) return false
	return true
}

module.exports.narrowOf = narrowOf
module.exports.withNarrow = withNarrow
module.exports.schoolAllowed = schoolAllowed
