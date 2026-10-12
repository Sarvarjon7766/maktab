// AI hisob-kitoblari alohida oqimda (worker thread): modelni ishlatish va rasm chizish asosiy server
// (API, jonli ko'rish so'rovlari) event loop'ini band qilmasligi uchun.
const { parentPort } = require('worker_threads')

let detector = null
let evidence = null
const det = () => (detector = detector || require('./personDetector'))
const evd = () => (evidence = evidence || require('./evidence'))
let poser = null
const pse = () => (poser = poser || require('./pose'))

const OPS = {
	detect: ({ buf, tiled, score }) => det().detectPeople(buf, { tiled, score }),
	// Holatlar: faqat sanoq qaytadi (skelet nuqtalari katta, asosiy oqimga kerak emas)
	pose: async ({ buf, boxes, model, conf }) => (await pse().analyzePeople(buf, boxes, { model, conf })).counts,
	smallFrame: ({ buf, result, width, color, quality }) => evd().smallFrame(buf, result, width, color, quality),
	phones: ({ buf, boxes, score }) => require('./phone').find(buf, { boxes }, score),
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
