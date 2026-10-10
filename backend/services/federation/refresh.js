// VILOYAT serveri: tuman serverlari holatini davriy tekshiradi (/ping): maktablar soni, tumanlar nomlari, versiya va xato holati yangilanadi.
const registry = require('./registry')

let timer = null
async function tick() {
	try {
		const entries = await registry.list({ fresh: true })
		for (const e of entries) await registry.check(e)
	} catch (error) {
		console.error('Tumanlarni tekshirish xatosi:', error.message)
	}
}
function start() {
	if (timer) return
	setTimeout(tick, 5000)
	timer = setInterval(tick, 5 * 60 * 1000)
	timer.unref()
}
module.exports = { start, tick }
