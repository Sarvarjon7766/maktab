// Isbot (rasm va qisqa lavha) hamda eski kamera hodisalarini saqlash muddatiga ko'ra avtomatik o'chiradi.
// Muddatlar tizim egasi tomonidan "Platforma sozlamalari" sahifasida o'zgartiriladi (PlatformSettings.retention).
//   alertDays  — muhim hodisalar (bo'sh sinf, odam keskin oshishi, ortiqcha odam): dalil rasmlari va lavhalari bilan
//   sampleDays — avtomatik namuna kadrlari (vision_sample)
//   eventDays  — qolgan kamera hodisalari (harakat, zichlik, kirish/chiqish ...) va ularning kadrlari
//   metricDays — odam soni o'lchovlari (HikVisionMetric)
const fs = require('fs')
const path = require('path')
const platformSettingsModel = require('../models/platform.settings.model')
const eventModel = require('../models/hik.cameraevent.model')
const metricModel = require('../models/hik.visionmetric.model')

const DIR = path.join(__dirname, '..', 'private', 'hik-events')
const ALERT_KINDS = ['vision_empty', 'vision_surge', 'vision_overcrowd']
const SAFE_FILE = /^[a-f0-9]{24}(_(pre|post)\d+)?\.(jpg|webp)$/
const DAY = 24 * 3600 * 1000
const LIMITS = { min: 1, max: 365 }
const FALLBACK = { alertDays: 14, sampleDays: 5, eventDays: 30, metricDays: 30 }

const clamp = (v, def) => {
	const n = Math.round(Number(v))
	return Number.isFinite(n) ? Math.min(LIMITS.max, Math.max(LIMITS.min, n)) : def
}

class RetentionService {
	constructor() { this.cache = null; this.running = false }

	// Amaldagi muddatlar: sozlamalar → .env (eski nomlar) → standart
	async policy() {
		const doc = await platformSettingsModel.findOne().select('retention').lean()
		const r = doc?.retention || {}
		const envAlert = Number(process.env.VISION_EVIDENCE_DAYS) || FALLBACK.alertDays
		const envSample = Number(process.env.VISION_SAMPLE_DAYS) || FALLBACK.sampleDays
		return {
			alertDays: clamp(r.alertDays, envAlert),
			sampleDays: clamp(r.sampleDays, envSample),
			eventDays: clamp(r.eventDays, FALLBACK.eventDays),
			metricDays: clamp(r.metricDays, FALLBACK.metricDays)
		}
	}

	// Faqat o'qituvchi/monitor sahifalaridagi izoh uchun ("Dalillar N kun saqlanadi")
	async info() {
		const p = await this.policy()
		return { success: true, alertDays: p.alertDays, sampleDays: p.sampleDays }
	}

	async save(input = {}) {
		const current = await this.policy()
		const next = {
			alertDays: clamp(input.alertDays, current.alertDays),
			sampleDays: clamp(input.sampleDays, current.sampleDays),
			eventDays: clamp(input.eventDays, current.eventDays),
			metricDays: clamp(input.metricDays, current.metricDays)
		}
		const doc = (await platformSettingsModel.findOne()) || new platformSettingsModel()
		doc.retention = next
		await doc.save()
		this.cache = null
		return { success: true, policy: next }
	}

	filesOf(e) {
		const names = new Set([`${e._id}.jpg`, `${e._id}.webp`, e.clip, e.snapshot, ...(e.images || []).map((i) => i.file)])
		return [...names].filter((f) => typeof f === 'string').map((f) => path.basename(f)).filter((f) => SAFE_FILE.test(f))
	}

	async removeFiles(files, dryRun) {
		let count = 0, bytes = 0
		for (const f of files) {
			const p = path.join(DIR, f)
			try {
				const st = await fs.promises.stat(p)
				if (!st.isFile()) continue
				if (!dryRun) await fs.promises.unlink(p)
				count++; bytes += st.size
			} catch { /* fayl yo'q */ }
		}
		return { count, bytes }
	}

	// Muddati o'tgan hodisalar, ularning fayllari va eski o'lchovlarni o'chiradi. dryRun=true bo'lsa faqat hisoblaydi
	async run({ dryRun = false, batch = 500, maxBatches = 60 } = {}) {
		if (this.running) return { success: false, message: "Tozalash allaqachon ishlayapti" }
		this.running = true
		try {
			const p = await this.policy()
			const now = Date.now()
			const cut = (d) => new Date(now - d * DAY)
			const groups = [
				['alerts', { kind: { $in: ALERT_KINDS }, time: { $lt: cut(p.alertDays) } }],
				['samples', { kind: 'vision_sample', time: { $lt: cut(p.sampleDays) } }],
				['events', { kind: { $nin: [...ALERT_KINDS, 'vision_sample'] }, time: { $lt: cut(p.eventDays) } }]
			]
			const out = { success: true, dryRun, policy: p, events: { alerts: 0, samples: 0, events: 0 }, files: 0, bytes: 0, metrics: 0, orphanFiles: 0, more: false }
			for (const [label, query] of groups) {
				if (dryRun) {
					out.events[label] = await eventModel.countDocuments(query)
					// fayl hajmini taxminiy baholash: 300 tagacha hodisa namunasi bo'yicha, butun songa ko'paytirish
					const sample = await eventModel.find(query).select('_id images clip snapshot').limit(300).lean()
					let b = 0, c = 0
					for (const e of sample) { const r = await this.removeFiles(this.filesOf(e), true); b += r.bytes; c += r.count }
					const k = sample.length ? out.events[label] / sample.length : 0
					out.files += Math.round(c * k); out.bytes += Math.round(b * k)
					continue
				}
				for (let i = 0; i < maxBatches; i++) {
					const docs = await eventModel.find(query).select('_id images clip snapshot').limit(batch).lean()
					if (!docs.length) break
					for (const e of docs) { const r = await this.removeFiles(this.filesOf(e), false); out.files += r.count; out.bytes += r.bytes }
					const del = await eventModel.deleteMany({ _id: { $in: docs.map((e) => e._id) } })
					out.events[label] += del.deletedCount || 0
					if (i === maxBatches - 1 && docs.length === batch) out.more = true
				}
			}
			const metricQuery = { time: { $lt: cut(p.metricDays) } }
			out.metrics = dryRun ? await metricModel.countDocuments(metricQuery) : (await metricModel.deleteMany(metricQuery)).deletedCount || 0

			// Hodisasi yo'q yetim fayllar: eng uzun muddatdan eski bo'lsa o'chiriladi
			const longest = Math.max(p.alertDays, p.sampleDays, p.eventDays)
			const orphanBefore = now - (longest + 1) * DAY
			try {
				for (const f of await fs.promises.readdir(DIR)) {
					if (!SAFE_FILE.test(f)) continue
					const fp = path.join(DIR, f)
					const st = await fs.promises.stat(fp).catch(() => null)
					if (!st || !st.isFile() || st.mtimeMs >= orphanBefore) continue
					if (!dryRun) await fs.promises.unlink(fp).catch(() => {})
					out.orphanFiles++; out.bytes += st.size
				}
			} catch { /* papka hali yo'q */ }
			this.cache = null
			this.lastRun = { at: new Date(), dryRun, events: out.events, files: out.files, bytes: out.bytes, metrics: out.metrics }
			return out
		} finally {
			this.running = false
		}
	}

	// Saqlanayotgan hajm: hodisalar soni, fayllar soni va hajmi, eng eskisi (60 soniya keshlanadi)
	async stats() {
		if (this.cache && Date.now() - this.cache.at < 60000) return this.cache.value
		const p = await this.policy()
		const oldest = async (query) => (await eventModel.findOne(query).sort({ time: 1 }).select('time').lean())?.time || null
		const kinds = {
			alerts: { kind: { $in: ALERT_KINDS } },
			samples: { kind: 'vision_sample' },
			events: { kind: { $nin: [...ALERT_KINDS, 'vision_sample'] } }
		}
		const db = {}
		for (const [k, q] of Object.entries(kinds)) db[k] = { count: await eventModel.countDocuments(q), oldest: await oldest(q) }
		db.metrics = { count: await metricModel.estimatedDocumentCount(), oldest: (await metricModel.findOne().sort({ time: 1 }).select('time').lean())?.time || null }
		const files = { count: 0, bytes: 0, oldest: null }
		try {
			for (const f of await fs.promises.readdir(DIR)) {
				if (!SAFE_FILE.test(f)) continue
				const st = await fs.promises.stat(path.join(DIR, f)).catch(() => null)
				if (!st || !st.isFile()) continue
				files.count++; files.bytes += st.size
				if (!files.oldest || st.mtimeMs < files.oldest) files.oldest = st.mtimeMs
			}
		} catch { /* papka hali yo'q */ }
		if (files.oldest) files.oldest = new Date(files.oldest)
		const value = { success: true, policy: p, limits: LIMITS, db, files, lastRun: this.lastRun || null }
		this.cache = { at: Date.now(), value }
		return value
	}
}

module.exports = new RetentionService()
