// AI hisob-kitoblari alohida oqimda (worker thread): modelni ishlatish va rasm chizish asosiy server
// (API, jonli ko'rish so'rovlari) event loop'ini band qilmasligi uchun.
const { parentPort } = require('worker_threads')

let detector = null
let evidence = null
const det = () => (detector = detector || require('./personDetector'))
const evd = () => (evidence = evidence || require('./evidence'))

const OPS = {
	detect: ({ buf }) => det().detectPeople(buf),
	smallFrame: ({ buf, result, width, color, quality }) => evd().smallFrame(buf, result, width, color, quality),
	renderEvidence: (opts) => evd().renderEvidence(opts),
	renderClip: ({ frames, opts }) => evd().renderClip(frames, opts)
}

parentPort.on('message', async ({ id, op, args }) => {
	try {
		if (!OPS[op]) throw new Error(`Noma'lum amal: ${op}`)
		parentPort.postMessage({ id, ok: true, result: await OPS[op](args) })
	} catch (e) {
		parentPort.postMessage({ id, ok: false, error: e.message })
	}
})
