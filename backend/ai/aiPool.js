// aiWorker.js bilan so'rov-javob aloqasi. Worker o'lib qolsa keyingi so'rovda qayta ishga tushadi.
// Xatolar `AiError` nomi bilan qaytadi (Hik xatolaridan ajratish uchun).
const path = require('path')
const { Worker } = require('worker_threads')

const timeoutMs = () => Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 90 * 1000)
// Himoya: worker qotib qolsa (model/GPU yoki native kutubxona osilishi) har so'rov 90 soniya kutib o'tadi va butun AI navbati to'xtaydi.
// Ketma-ket shuncha so'rov vaqt tugasa worker majburan o'chirilib, keyingi so'rovda yangisi ishga tushadi
const MAX_CONSECUTIVE_TIMEOUTS = 2
// Uzoq ishlaganda native xotira (rasm va model kutubxonalari) o'sib ketmasligi uchun worker shuncha so'rovdan keyin (bo'sh payti) yangilanadi
const RECYCLE_AFTER_CALLS = 5000
let seq = 0
const pending = new Map()

class AiError extends Error {
	constructor(message) { super(message); this.name = 'AiError' }
}

// Yo'lak (lane): har birida bir yoki bir nechta worker. 'main' — fon tahlili (odam sanash, skelet, yuz tanish; AI_WORKERS ta, standart 1),
// 'live' — jonli sinov (AI_LIVE_WORKERS, standart 1). Bir nechta worker rasm dekod/qirqish kabi CPU qismini parallel bajaradi:
// GPU bo'lsa ham bitta worker shu qismda tiqilib qoladi (modelning o'zi GPU'da tez). Tavsiya: GPU serverda AI_WORKERS = yadrolar soniga yaqin
const sizes = {
	main: () => Math.max(1, Math.min(16, Number(process.env.AI_WORKERS) || 1)),
	live: () => Math.max(1, Math.min(8, Number(process.env.AI_LIVE_WORKERS) || 1))
}
const lanes = { main: { workers: [] }, live: { workers: [] } }

function remove(w) {
	const L = lanes[w.name]
	const i = L.workers.indexOf(w)
	if (i >= 0) L.workers.splice(i, 1)
}

function failWorker(error, w) {
	for (const [id, p] of pending) { if (p.worker !== w) continue; clearTimeout(p.timer); p.reject(error); pending.delete(id) }
}

function spawn(name) {
	const th = new Worker(path.join(__dirname, 'aiWorker.js'))
	const w = { th, name, timeouts: 0, calls: 0, busy: 0 }
	lanes[name].workers.push(w)
	th.unref() // server to'xtashiga xalaqit bermasin
	th.on('message', ({ id, ok, result, error }) => {
		const p = pending.get(id)
		if (!p) return
		pending.delete(id)
		w.timeouts = 0
		w.busy = Math.max(0, w.busy - 1)
		clearTimeout(p.timer)
		if (ok) p.resolve(result)
		else p.reject(new AiError(error))
	})
	th.on('error', (e) => { remove(w); failWorker(new AiError(`AI worker xatosi: ${e.message}`), w) })
	th.on('exit', () => { remove(w); failWorker(new AiError("AI worker to'xtadi"), w) })
	return w
}

// Eng kam band worker; hammasi band bo'lsa va hali ruxsat etilgan sondan kam bo'lsa — yangisi ishga tushadi
function pick(name) {
	const L = lanes[name]
	let best = L.workers.reduce((m, w) => (!m || w.busy < m.busy ? w : m), null)
	if ((!best || best.busy > 0) && L.workers.length < sizes[name]()) best = spawn(name)
	return best
}

function call(op, args, name = 'main') {
	let w = pick(name)
	if (w.calls >= RECYCLE_AFTER_CALLS && w.busy === 0) { remove(w); w.th.terminate().catch(() => {}); w = spawn(name) }
	w.calls++
	w.busy++
	return new Promise((resolve, reject) => {
		const id = ++seq
		const timer = setTimeout(() => {
			pending.delete(id)
			w.busy = Math.max(0, w.busy - 1)
			reject(new AiError('AI worker javob bermadi (vaqt tugadi)'))
			if (++w.timeouts >= MAX_CONSECUTIVE_TIMEOUTS) {
				console.log(`AI worker (${name}) ${w.timeouts} marta ketma-ket javob bermadi: qayta ishga tushiriladi`)
				remove(w)
				w.th.terminate().catch(() => {})
				failWorker(new AiError("AI worker qayta ishga tushirildi"), w)
			}
		}, timeoutMs())
		pending.set(id, { resolve, reject, timer, lane: name, worker: w })
		w.th.postMessage({ id, op, args })
	})
}

// Worker'dan Uint8Array keladi — Buffer'ga o'giramiz
const buf = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)

// Jonli yo'lak worker'ini oldindan ishga tushirish va modellarni yuklash (birinchi kadr 2+ soniya kutmasligi uchun)
function warmLive() {
	const sharp = require('sharp')
	return sharp({ create: { width: 640, height: 480, channels: 3, background: '#808080' } }).jpeg().toBuffer()
		.then((b) => Promise.all([call('faces', { buf: b, score: 0.6, upscale: 1, minSize: 16, maxFaces: 2 }, 'live'), call('detect', { buf: b, tiled: false }, 'live')]))
		.catch(() => {})
}

// Yo'lakdagi kutayotgan so'rovlar soni (yuklama chegarasi uchun)
function queueSize(name = 'main') {
	let n = 0
	for (const p of pending.values()) if (p.lane === name) n++
	return n
}

// Holat (monitoring): yo'laklardagi worker'lar va band so'rovlar
function stats() {
	return Object.fromEntries(Object.entries(lanes).map(([n, L]) => [n, { workers: L.workers.length, max: sizes[n](), busy: L.workers.reduce((a, w) => a + w.busy, 0) }]))
}

module.exports = {
	stats,
	queueSize,
	warmLive,
	AiError,
	detect: (b, opts = {}) => call('detect', { buf: b, tiled: opts.tiled, score: opts.score }, opts.lane),
	phones: (b, boxes, opts = {}) => call('phones', { buf: b, boxes, score: opts.score }),
	faces: (b, opts = {}) => call('faces', { buf: b, score: opts.score, upscale: opts.upscale, minSize: opts.minSize, maxFaces: opts.maxFaces, model: opts.model }, opts.lane),
	faceEnroll: (b, opts = {}) => call('faceEnroll', { buf: b, score: opts.score, model: opts.model }),
	pose: (b, boxes, opts = {}) => call('pose', { buf: b, boxes, model: opts.model, conf: opts.conf }),
	smallFrame: async (b, result, width = 640, color = '#22c55e', quality = 62) => buf(await call('smallFrame', { buf: b, result, width, color, quality })),
	renderEvidence: async (opts) => buf(await call('renderEvidence', opts)),
	renderClip: async (frames, opts) => buf(await call('renderClip', { frames, opts }))
}
