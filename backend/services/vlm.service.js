// "AI ikkinchi fikri": hodisa (muhim ogohlantirish) saqlangach kadrni yengil ko'rish modeliga (Ollama, qwen2.5vl:3b) beradi va
// sahnani 5 ta tayyor variantdan biri bilan belgilaydi. Erkin matn EMAS: kichik model matnni (ayniqsa o'zbekchani) ishonchsiz yozadi,
// tayyor variantlar esa har tilga tarjima qilinadi. Natija faqat "ikkinchi fikr": asosiy qoida (odam soni, harakat) o'zgarmaydi.
// Yoqish, Ollama manzili, model va GPU — tizim egasi panelidan (AI sozlamalari). Standart: o'chiq (CPU'da bitta kadr ~1-2 daqiqa).
const sharp = require('sharp')
const AiSettings = require('./ai.settings.service')
const hikCameraEventModel = require('../models/hik.cameraevent.model')

const TIMEOUT_MS = 5 * 60 * 1000
const QUEUE_MAX = 8

const QUESTION = 'This is a school classroom camera frame. Which option best describes the scene?\n'
	+ 'A) Most students are seated at their desks, reading or writing.\n'
	+ 'B) Many students are standing up or walking around the room.\n'
	+ 'C) Students are crowded together in a tight group.\n'
	+ 'D) Students seem to be fighting or arguing physically.\n'
	+ 'E) The room is empty or almost empty.\n'
	+ 'Answer with one letter only.'
const SCENES = { A: 'seated', B: 'standing', C: 'crowd', D: 'fight', E: 'empty' }

class VlmService {
	constructor() {
		this.queue = []
		this.busy = false
		this.down = 0 // Ollama javob bermasa shu vaqtgacha urinmaymiz
	}

	async isEnabled() { return (await AiSettings.get()).vlmEnabled }

	// jpeg: asl kadr (JPEG); id — hodisa id
	async enqueue(id, jpeg) {
		if (Date.now() < this.down || !(await this.isEnabled())) return
		if (this.queue.length >= QUEUE_MAX) this.queue.shift()
		this.queue.push({ id, jpeg })
		this.drain().catch(() => {})
	}

	async drain() {
		if (this.busy) return
		this.busy = true
		try {
			while (this.queue.length) {
				const { id, jpeg } = this.queue.shift()
				try {
					const scene = await this.classify(jpeg)
					if (scene) await hikCameraEventModel.updateOne({ _id: id }, { $set: { scene } })
				} catch (e) {
					console.log('VLM xatosi:', e.message)
					this.down = Date.now() + 10 * 60 * 1000
					this.queue.length = 0
				}
			}
		} finally { this.busy = false }
	}

	async classify(jpeg) {
		const cfg = await AiSettings.get()
		const img = (await sharp(jpeg).resize({ width: 768, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()).toString('base64')
		const r = await fetch(`${String(cfg.ollamaUrl).replace(/[/]$/, '')}/api/generate`, {
			method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
			body: JSON.stringify({ model: cfg.vlmModel, prompt: QUESTION, images: [img], stream: false, options: { temperature: 0, num_predict: 4, num_gpu: cfg.vlmGpu ? 99 : 0 } })
		})
		if (!r.ok) throw new Error(`Ollama ${r.status}`)
		const letter = String((await r.json()).response || '').trim().charAt(0).toUpperCase()
		return SCENES[letter] || null
	}
}

module.exports = new VlmService()
