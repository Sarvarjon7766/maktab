// Aqlli kuzatuv hisobotlari (Excel): sinflar bo'yicha davr xulosasi, kunlik jadval, muhim hodisalar va o'quvchi sabablari.
// Avtomatik: har kuni 18:30 (kunlik) va shanba 18:45 (haftalik) har maktab uchun yaratilib arxivga saqlanadi;
// qo'lda ham istalgan davr uchun yaratish mumkin. Fayllar `private/reports/<maktab>/` da, faqat huquqi borga beriladi.
const fs = require('fs')
const path = require('path')
const cron = require('node-cron')
const mongoose = require('mongoose')
const ExcelJS = require('exceljs')
const { addLogo } = require('../utils/brand')
const sinfModel = require('../models/sinf.model')
const schoolModel = require('../models/school.model')
const hikCameraModel = require('../models/hik.camera.model')
const hikCameraEventModel = require('../models/hik.cameraevent.model')
const visionMetricModel = require('../models/hik.visionmetric.model')
const studentExcuseModel = require('../models/student.excuse.model')
const StudentExcuse = require('./student.excuse.service')
const { LESSON_START, LESSON_END } = require('../utils/lessonHours')
const { tr, normLang } = require('../utils/i18n')
const LOCALES = { uz: 'uz-UZ', 'uz-cyrl': 'uz-Cyrl-UZ', ru: 'ru-RU', en: 'en-GB' }

const DIR = path.join(__dirname, '..', 'private', 'reports')
const KEEP_DAYS = 90
const MIN_PEOPLE = Math.max(1, Number(process.env.VISION_MIN_PEOPLE) || 3)
const SAFE_NAME = /^(kunlik|haftalik|davr)-\d{4}-\d{2}-\d{2}(_\d{4}-\d{2}-\d{2})?\.xlsx$/
const KINDS = { vision_empty: "Sinf bo'sh qoldi", vision_surge: 'Odamlar keskin oshdi', vision_overcrowd: 'Ortiqcha odam', vision_restless: 'Sinf notinch', vision_commotion: 'Zalda tartibsizlik', vision_sample: 'Avtomatik namuna' }

const { isDate } = require('../utils/dateStr')
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, days) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10) }
const r1 = (n) => Math.round(n * 10) / 10
const hm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d))

const HEAD_STYLE = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }, alignment: { vertical: 'middle', wrapText: true } }
function sheet(wb, name, columns, rows, T = (x) => x) {
	const ws = wb.addWorksheet(String(T(name)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] })
	ws.columns = columns.map(([header, key, width]) => ({ header: T(header), key, width }))
	ws.getRow(1).eachCell((c) => Object.assign(c, { style: HEAD_STYLE }))
	ws.getRow(1).height = 26
	rows.forEach((r) => ws.addRow(r))
	return ws
}

class ReportService {
	// Davr hisoboti: workbook qaytaradi (buffer)
	async build(schoolId, from, to, langIn) {
		const lang = normLang(langIn)
		const T = (x, vars) => tr(lang, x, vars)
		const school = new mongoose.Types.ObjectId(String(schoolId))
		const [schoolDoc, sinfs, cams] = await Promise.all([
			schoolModel.findById(school).select('name').lean(),
			sinfModel.find({ schoolId: school }).populate('head', 'fullName').lean(),
			hikCameraModel.find({ schoolId: school, visionEnabled: true }).select('name sinfId').lean()
		])
		const sinfInfo = new Map(sinfs.map((s) => [String(s._id), { name: s.name, head: s.head?.fullName || '' }]))
		const camNames = new Map()
		cams.forEach((c) => { const k = String(c.sinfId); camNames.set(k, [...(camNames.get(k) || []), c.name]) })

		const [daily, events, excuses] = await Promise.all([
			visionMetricModel.aggregate([
				{ $match: { schoolId: school, dateString: { $gte: from, $lte: to } } },
				{ $group: { _id: { sinf: '$sinfId', date: '$dateString' }, n: { $sum: 1 }, avg: { $avg: '$count' }, max: { $max: '$count' },
					actSum: { $sum: { $cond: [{ $and: [{ $isNumber: '$activity' }, { $gte: ['$count', MIN_PEOPLE] }] }, '$activity', 0] } },
					actN: { $sum: { $cond: [{ $and: [{ $isNumber: '$activity' }, { $gte: ['$count', MIN_PEOPLE] }] }, 1, 0] } },
					lessonN: { $sum: { $cond: [{ $gte: ['$count', MIN_PEOPLE] }, 1, 0] } },
					pAn: { $sum: { $ifNull: ['$pose.analyzed', { $add: [{ $ifNull: ['$pose.seated', 0] }, { $ifNull: ['$pose.standing', 0] }] }] } }, pStand: { $sum: { $ifNull: ['$pose.standing', 0] } }, pHead: { $sum: { $ifNull: ['$pose.headDown', 0] } }, pHand: { $sum: { $ifNull: ['$pose.raised', 0] } } } }
			]),
			hikCameraEventModel.find({ schoolId: school, dateString: { $gte: from, $lte: to }, kind: { $in: Object.keys(KINDS) } }).sort({ time: 1 }).select('kind time sinfId detail count dateString').lean(),
			studentExcuseModel.find({ schoolId: school, startDate: { $lte: to }, $or: [{ endDate: null }, { endDate: { $gte: from } }] }).populate('student', 'fullName').lean()
		])

		// Sinflar xulosasi
		const perSinf = new Map()
		const get = (k) => { if (!perSinf.has(k)) perSinf.set(k, { n: 0, sum: 0, max: 0, actSum: 0, actN: 0, lessonN: 0, days: new Set(), empty: 0, surge: 0, over: 0, restless: 0, samples: 0, pAn: 0, pStand: 0, pHead: 0, pHand: 0 }); return perSinf.get(k) }
		for (const d of daily) {
			const x = get(String(d._id.sinf)); x.n += d.n; x.sum += d.avg * d.n; x.max = Math.max(x.max, d.max); x.actSum += d.actSum; x.actN += d.actN; x.lessonN += d.lessonN; x.pAn += d.pAn; x.pStand += d.pStand; x.pHead += d.pHead; x.pHand += d.pHand; x.days.add(d._id.date)
		}
		for (const e of events) {
			const x = get(String(e.sinfId)); if (e.kind === 'vision_empty') x.empty++; else if (e.kind === 'vision_surge') x.surge++; else if (e.kind === 'vision_overcrowd') x.over++; else if (e.kind === 'vision_restless' || e.kind === 'vision_commotion') x.restless++; else x.samples++
		}
		const summaryRows = [...perSinf.entries()].map(([k, x]) => ({
			sinf: sinfInfo.get(k)?.name || '—', head: sinfInfo.get(k)?.head || '', cameras: (camNames.get(k) || []).join(', '),
			days: x.days.size, n: x.n, avg: x.n ? r1(x.sum / x.n) : 0, max: x.max,
			lessonPct: x.n ? Math.round(x.lessonN / x.n * 100) : 0, act: x.actN ? r1(x.actSum / x.actN * 100) : null,
			empty: x.empty, surge: x.surge, over: x.over, restless: x.restless, samples: x.samples,
			standing: x.pAn ? r1(x.pStand / x.pAn * 100) : null, headDown: x.pAn ? r1(x.pHead / x.pAn * 100) : null, hands: x.pAn ? r1(x.pHand / x.pAn * 100) : null
		})).sort((a, b) => a.sinf.localeCompare(b.sinf, 'uz', { numeric: true }))

		const wb = new ExcelJS.Workbook()
		wb.creator = 'School Supervision — Aqlli kuzatuv'
		wb.created = new Date()
		const info = wb.addWorksheet(T("Ma'lumot"))
		info.columns = [{ width: 34 }, { width: 60 }]
		addLogo(wb, info, { col: 2.3, row: 0.3, size: 96 })
		;[[T('Maktab'), schoolDoc?.name || ''], [T('Davr'), `${from} — ${to}`], [T('Dars vaqti (Toshkent)'), `${LESSON_START}:00–${LESSON_END}:00`], [T('Dars hisoblanadi'), T('kamerada kamida {{n}} odam', { n: MIN_PEOPLE })],
			[T('Yaratildi'), new Date().toLocaleString(LOCALES[lang] || 'uz-UZ', { timeZone: 'Asia/Tashkent' })],
			[T('Izoh'), T("Kamerada sanalgan odamlar o'qituvchi va mehmonlarni ham o'z ichiga oladi (taxminiy hisob ±2). Harakat % — oldingi kadrga nisbatan joyidan siljigan yoki almashgan odamlar ulushi.")]].forEach(([a, b]) => info.addRow([a, b]))
		info.getColumn(1).font = { bold: true }
		info.getColumn(2).alignment = { wrapText: true, vertical: 'top' }

		sheet(wb, 'Sinflar xulosasi', [['Sinf', 'sinf', 10], ['Sinf rahbari', 'head', 26], ['Kameralar', 'cameras', 28], ['Kuzatilgan kunlar', 'days', 12], ['O\'lchovlar', 'n', 11], ["O'rtacha odam", 'avg', 13], ['Eng ko\'pi', 'max', 10],
			['Dars borgan o\'lchovlar %', 'lessonPct', 16], ["O'rtacha harakat %", 'act', 15], ["Bo'sh qolgan", 'empty', 12], ['Keskin oshgan', 'surge', 12], ['Ortiqcha odam', 'over', 12], ['Notinch / tartibsizlik', 'restless', 14], ['Tik turganlar %', 'standing', 13], ['Boshi egilganlar %', 'headDown', 15], ["Qo'l ko'targanlar %", 'hands', 15], ['Namunalar', 'samples', 11]], summaryRows, T)

		const dailyRows = daily.map((d) => ({ date: d._id.date, sinf: sinfInfo.get(String(d._id.sinf))?.name || '—', n: d.n, avg: r1(d.avg), max: d.max, lessonPct: d.n ? Math.round(d.lessonN / d.n * 100) : 0, act: d.actN ? r1(d.actSum / d.actN * 100) : null }))
			.sort((a, b) => a.date.localeCompare(b.date) || a.sinf.localeCompare(b.sinf, 'uz', { numeric: true }))
		sheet(wb, 'Kunlik', [['Sana', 'date', 12], ['Sinf', 'sinf', 10], ["O'lchovlar", 'n', 11], ["O'rtacha odam", 'avg', 13], ["Eng ko'pi", 'max', 10], ["Dars borgan o'lchovlar %", 'lessonPct', 16], ["O'rtacha harakat %", 'act', 15]], dailyRows, T)

		sheet(wb, 'Hodisalar', [['Sana', 'date', 12], ['Vaqt', 'time', 8], ['Sinf', 'sinf', 10], ['Hodisa', 'kind', 24], ['Odam', 'count', 8], ['Tafsilot', 'detail', 70]],
			events.map((e) => ({ date: e.dateString, time: hm(e.time), sinf: sinfInfo.get(String(e.sinfId))?.name || '—', kind: KINDS[e.kind] ? T(KINDS[e.kind]) : e.kind, count: e.count, detail: e.detail || '' })), T)

		sheet(wb, "Sababli o'quvchilar", [["O'quvchi", 'name', 30], ['Sinf', 'sinf', 10], ['Sabab', 'type', 20], ['Izoh', 'comment', 40], ['Boshlanish', 'start', 12], ['Tugash', 'end', 12]],
			excuses.filter((e) => e.student).map((e) => ({ name: e.student.fullName, sinf: sinfInfo.get(String(e.sinf))?.name || '—', type: T(StudentExcuse.LABELS[e.type] || e.type), comment: e.comment || '', start: e.startDate, end: e.endDate || T('qaytguncha') })), T)

		return Buffer.from(await wb.xlsx.writeBuffer())
	}

	// Yaratib arxivga saqlaydi. kind: kunlik | haftalik | davr. Fayl nomi sanalardan hosil bo'ladi (xavfsiz)
	async generate(schoolId, from, to, kind = 'davr', lang = 'uz') {
		if (!isDate(from) || !isDate(to) || from > to) return { success: false, message: "Sana oralig'i noto'g'ri" }
		if (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`) > 93 * 86400000) return { success: false, message: "Davr 93 kundan oshmasligi kerak" }
		const buf = await this.build(schoolId, from, to, lang)
		const name = `${kind}-${from}${from === to ? '' : `_${to}`}.xlsx`
		const dir = path.join(DIR, String(schoolId))
		await fs.promises.mkdir(dir, { recursive: true })
		await fs.promises.writeFile(path.join(dir, name), buf)
		return { success: true, name, size: buf.length }
	}

	async list(schoolId) {
		const dir = path.join(DIR, String(schoolId))
		let files = []
		try { files = await fs.promises.readdir(dir) } catch { return { success: true, reports: [] } }
		const rows = []
		for (const f of files.filter((x) => SAFE_NAME.test(x))) {
			const st = await fs.promises.stat(path.join(dir, f))
			const m = /^(kunlik|haftalik|davr)-(\d{4}-\d{2}-\d{2})(?:_(\d{4}-\d{2}-\d{2}))?\.xlsx$/.exec(f)
			rows.push({ name: f, kind: m[1], from: m[2], to: m[3] || m[2], size: st.size, createdAt: st.mtime })
		}
		rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
		return { success: true, reports: rows }
	}

	async fileFor(schoolId, name) {
		if (!SAFE_NAME.test(name || '')) return null
		const file = path.join(DIR, String(schoolId), name)
		return fs.existsSync(file) ? file : null
	}

	// Avtomatik yaratish: aqlli kuzatuvi bor har maktab uchun
	async runScheduled(kind) {
		const today = todayStr()
		const [from, to] = kind === 'haftalik' ? [shift(today, -5), today] : [today, today] // dushanba-shanba
		const schools = await hikCameraModel.distinct('schoolId', { visionEnabled: true, schoolId: { $ne: null } })
		for (const id of schools) {
			try { await this.generate(String(id), from, to, kind, 'uz') } catch (e) { console.log(`Hisobot xatosi (${kind}, ${id}):`, e.message) }
		}
		await this.purge().catch(() => {})
	}

	async purge() {
		const cutoff = Date.now() - KEEP_DAYS * 86400000
		let dirs = []
		try { dirs = await fs.promises.readdir(DIR) } catch { return }
		for (const d of dirs) {
			const full = path.join(DIR, d)
			for (const f of await fs.promises.readdir(full).catch(() => [])) {
				const st = await fs.promises.stat(path.join(full, f)).catch(() => null)
				if (st && st.mtimeMs < cutoff) await fs.promises.unlink(path.join(full, f)).catch(() => {})
			}
		}
	}

	start() {
		if (this.started || process.env.REPORTS_ENABLED === '0') return
		this.started = true
		cron.schedule('30 18 * * 1-6', () => this.runScheduled('kunlik').catch((e) => console.log('Kunlik hisobot:', e.message)), { timezone: 'Asia/Tashkent' })
		cron.schedule('45 18 * * 6', () => this.runScheduled('haftalik').catch((e) => console.log('Haftalik hisobot:', e.message)), { timezone: 'Asia/Tashkent' })
		console.log('Hisobotlar: kunlik (18:30) va haftalik (shanba 18:45) avtomatik yaratish yoqildi')
	}
}

module.exports = new ReportService()
