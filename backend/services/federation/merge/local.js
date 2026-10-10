// Viloyat serverining o'zida hisoblanadigan yo'llar (tumanlarga so'rov yubormasdan)
const { byName } = require('./util')

module.exports = {
	// Monitorning o'z hududi (panel sarlavhasi): maktablar soni tumanlar /ping javoblaridan olinadi
	'/me': {
		local: async (ctx) => {
			const { scope, entries } = ctx
			const schools = entries.reduce((a, e) => a + (e.schoolCount || 0), 0)
			if (!scope.level) return { success: true, scoped: false, region: '', district: '', schools }
			return { success: true, scoped: true, level: scope.level, region: scope.region, district: scope.district, schools }
		}
	},
	'/district-names': {
		local: async (ctx) => ({ success: true, districts: [...new Set(ctx.entries.flatMap((e) => e.districts))].sort(byName) })
	}
}
