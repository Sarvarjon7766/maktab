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
	// Yuz tanish (ai/faceEngine.js): kadrdagi yuzlar + izlari; va bazaga olish uchun bitta yuz surati
	faces: async ({ buf, score, upscale, minSize, maxFaces, model }) => {
		const fe = require('./faceEngine')
		const found = (await fe.detectFaces(buf, { score, upscale })).filter((f) => f.size >= (minSize || 0))
		return fe.embedFaces(buf, found, { maxFaces, model })
	},
	faceEnroll: async ({ buf, score, model }) => {
		const fe = require('./faceEngine')
		const found = (await fe.detectInPhoto(buf, { score })).sort((x, y) => y.size - x.size)
		if (!found.length) return null
		const [one] = await fe.embedFaces(buf, [found[0]], { model })
		return one ? { embedding: one.embedding, size: found[0].size, score: found[0].score, faces: found.length, quality: one.quality } : null
	},
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
