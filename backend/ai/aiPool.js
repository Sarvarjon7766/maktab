// aiWorker.js bilan so'rov-javob aloqasi. Worker o'lib qolsa keyingi so'rovda qayta ishga tushadi.
// Xatolar `AiError` nomi bilan qaytadi (Hik xatolaridan ajratish uchun).
const path = require('path')
const { Worker } = require('worker_threads')

const TIMEOUT_MS = 90 * 1000
let worker = null
let seq = 0
const pending = new Map()

class AiError extends Error {
	constructor(message) { super(message); this.name = 'AiError' }
}

function failAll(error) {
	for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(error); pending.delete(id) }
}

function spawn() {
	worker = new Worker(path.join(__dirname, 'aiWorker.js'))
	worker.unref() // server to'xtashiga xalaqit bermasin
	worker.on('message', ({ id, ok, result, error }) => {
		const p = pending.get(id)
		if (!p) return
		pending.delete(id)
		clearTimeout(p.timer)
		if (ok) p.resolve(result)
		else p.reject(new AiError(error))
	})
	worker.on('error', (e) => failAll(new AiError(`AI worker xatosi: ${e.message}`)))
	worker.on('exit', () => { worker = null; failAll(new AiError("AI worker to'xtadi")) })
}

function call(op, args) {
	if (!worker) spawn()
	return new Promise((resolve, reject) => {
		const id = ++seq
		const timer = setTimeout(() => { pending.delete(id); reject(new AiError('AI worker javob bermadi (vaqt tugadi)')) }, TIMEOUT_MS)
		pending.set(id, { resolve, reject, timer })
		worker.postMessage({ id, op, args })
	})
}

// Worker'dan Uint8Array keladi — Buffer'ga o'giramiz
const buf = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)

module.exports = {
	AiError,
	detect: (b) => call('detect', { buf: b }),
	smallFrame: async (b, result, width = 640, color = '#22c55e', quality = 62) => buf(await call('smallFrame', { buf: b, result, width, color, quality })),
	renderEvidence: async (opts) => buf(await call('renderEvidence', opts)),
	renderClip: async (frames, opts) => buf(await call('renderClip', { frames, opts }))
}
