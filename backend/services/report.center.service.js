// Hisobot markazi: maktab uchun ko'plab Excel hisobotlari. Har bir hisobot mavjud tahlil servislaridan (monitor/analytics)
// ma'lumot oladi, shuning uchun raqamlar panel sahifalaridagi bilan bir xil. Katalog frontendga beriladi, eksport .xlsx qaytaradi.
const ExcelJS = require('exceljs')
const { addLogo } = require('../utils/brand')
const mongoose = require('mongoose')
const schoolModel = require('../models/school.model')
const sinfModel = require('../models/sinf.model')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')
const adduserModel = require('../models/add.user.model')
const MonitorService = require('./monitor.service')
const Analytics = require('./monitor.analytics.service')
const ParentService = require('./parent.service')
const { tr, normLang } = require('../utils/i18n')

const { isDate } = require('../utils/dateStr')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']
const wd = (d, T) => { const n = WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]; return T ? T(n) : n }
const LOCALES = { uz: 'uz-UZ', 'uz-cyrl': 'uz-Cyrl-UZ', ru: 'ru-RU', en: 'en-GB' }
const fmtDT = (lang, x) => new Date(x).toLocaleString(LOCALES[lang] || 'uz-UZ', { timeZone: 'Asia/Tashkent' })
const ST = { inside: 'Maktabda', out: 'Chiqib ketgan', absent: 'Kelmagan' }
const SEV = { high: 'Jiddiy', medium: "O'rta", low: 'Past' }
const DAY_STATUS = { ishda: 'Maktabda', tashqarida: 'Chiqib ketgan', kelmagan: 'Kelmagan' }

// ---------- Hisobotlar katalogi ----------
// params: date (bitta kun), range (dan-gacha), sinf (ixtiyoriy sinf), sinfRequired, minStreak
const CATALOG = [
	{ key: 'students_day', group: 'Kunlik davomat', title: "O'quvchilar davomati", desc: "Tanlangan kundagi har bir o'quvchi: holati, kirish/chiqish vaqti, kech qolgani.", params: ['date', 'sinf'] },
	{ key: 'students_absent', group: 'Kunlik davomat', title: "Kelmagan o'quvchilar", desc: "Shu kuni maktabga kelmagan o'quvchilar sinf bo'yicha (ota-ona bilan bog'lanish uchun).", params: ['date', 'sinf'] },
	{ key: 'students_late', group: 'Kunlik davomat', title: "Kech qolgan o'quvchilar (kun)", desc: "Shu kuni dars boshlanishidan keyin kelgan o'quvchilar.", params: ['date', 'sinf'] },
	{ key: 'staff_day', group: 'Kunlik davomat', title: 'Xodimlar davomati', desc: "Har bir xodim: lavozimi, holati, kirish/chiqish, sababli kelmaganlik izohi.", params: ['date'] },
	{ key: 'class_summary', group: 'Kunlik davomat', title: 'Sinflar bo‘yicha qisqacha', desc: "Har bir sinf: o'quvchilar soni, kelgan, kelmagan, foiz va sinf rahbari.", params: ['date'] },

	{ key: 'trend', group: 'Davr statistikasi', title: 'Kunlik dinamika', desc: "Davr ichidagi har bir kun: kelgan o'quvchilar va xodimlar soni va foizi.", params: ['range'] },
	{ key: 'grades', group: 'Davr statistikasi', title: 'Sinf darajalari bo‘yicha', desc: "1-sinf, 2-sinf... darajalar: davomat foizi, kech qolish, eng yaxshi va eng past sinf.", params: ['range'] },
	{ key: 'class_ranking', group: 'Davr statistikasi', title: 'Sinflar reytingi', desc: "Barcha sinflar davomat foizi bo'yicha tartiblangan, kech qolishlar bilan.", params: ['range'] },
	{ key: 'class_period', group: 'Davr statistikasi', title: 'Bitta sinf: to‘liq hisobot', desc: "Tanlangan sinf: kunlik davomat, har bir o'quvchi va kunma-kun jadval (✓ keldi, K kech, – yo'q).", params: ['range', 'sinfRequired'] },

	{ key: 'late_students', group: 'Intizom', title: "Kech qoluvchi o'quvchilar", desc: "Davr ichida eng ko'p kech qolganlar: kunlar soni, foiz, eng kech vaqt.", params: ['range'] },
	{ key: 'late_staff', group: 'Intizom', title: 'Kech qoluvchi xodimlar', desc: "Davr ichida kechikkan xodimlar va kechikish kunlari.", params: ['range'] },
	{ key: 'at_risk', group: 'Intizom', title: 'Xavf guruhi', desc: "Ketma-ket yoki tez-tez kelmayotgan o'quvchilar: ketma-ket kunlar, oxirgi kelgan sana.", params: ['range', 'minStreak'] },
	{ key: 'excuses', group: 'Intizom', title: 'Sababli kelmaganlar', desc: "Ta'til, safar, kasallik: xodimlar va o'quvchilar ro'yxati davri bilan.", params: ['range'] },
	{ key: 'alerts', group: 'Intizom', title: 'Ogohlantirishlar', desc: "Tanlangan kundagi ogohlantirishlar: davomat pasayishi, kameralar, aqlli kuzatuv.", params: ['date'] },

	{ key: 'cameras', group: 'Kamera va tizim', title: 'Kameralar holati', desc: "Barcha kameralar: sinfi, vazifasi, online/offline va oxirgi aloqa vaqti.", params: [] },
	{ key: 'camera_sync', group: 'Kamera va tizim', title: 'Yuz rasmlarining kameradagi holati', desc: "Xodim va o'quvchilar rasmlari kameraga qabul qilinganmi, rad etilgan sabab va urinishlar.", params: [] },
	{ key: 'parents', group: 'Ota-onalar', title: 'Ota-onalar boti qamrovi', desc: "Sinflar bo'yicha: nechta o'quvchining ota-onasi botga ulangan, telefoni yo'qlar.", params: [] },
	{ key: 'parents_list', group: 'Ota-onalar', title: 'Ulangan ota-onalar ro‘yxati', desc: "Telegram botga ulangan ota-onalar, farzandlari, holati va oxirgi xabar vaqti.", params: [] },
	{ key: 'students_all', group: 'Ro‘yxatlar', title: "O'quvchilar to‘liq ro‘yxati", desc: "Barcha o'quvchilar: sinf, ota-ona, telefon, rasmi bor-yo'qligi.", params: ['sinf'] },
	{ key: 'staff_all', group: 'Ro‘yxatlar', title: 'Xodimlar to‘liq ro‘yxati', desc: "Barcha xodimlar: lavozimi, roli, rasmi bor-yo'qligi.", params: [] },

	{ key: 'school_full', group: 'Yig‘ma', title: 'Maktab to‘liq hisoboti', desc: "Bitta faylda ko'p varaq: dinamika, darajalar, sinflar reytingi, kech qolganlar, xavf guruhi, sababli kelmaganlar.", params: ['range'], featured: true },
]

// ---------- Excel yordamchilari ----------
const HEAD = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true } }
const thin = { style: 'thin', color: { argb: 'FFE2E8F0' } }
const pctFill = (v) => (v >= 90 ? 'FFDCFCE7' : v >= 75 ? 'FFFEF9C3' : v >= 50 ? 'FFFFEDD5' : 'FFFEE2E2')
const statusFill = { Maktabda: 'FFDCFCE7', 'Chiqib ketgan': 'FFE0F2FE', Kelmagan: 'FFFEE2E2', Kamerada: 'FFDCFCE7', Online: 'FFDCFCE7', Offline: 'FFFEE2E2', 'Rad etildi': 'FFFEE2E2', 'Navbatda': 'FFFEF9C3', 'Yuborilmagan': 'FFFFEDD5' }

// sheet: { name, title?, columns: [[header, key, width, type?]], rows, totals? }; type: 'pct' | 'status' | 'num'
function addSheet(wb, meta, sh) {
	const T = meta.T
	let wsName = String(T(sh.name)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)
	for (let k = 2; wb.getWorksheet(wsName); k++) wsName = `${wsName.slice(0, 28)} ${k}`
	const ws = wb.addWorksheet(wsName)
	const cols = sh.columns
	ws.columns = cols.map(([header, key, width]) => ({ key, width: width || 16 }))
	const last = cols.length
	ws.mergeCells(1, 1, 1, Math.max(last, 2))
	ws.getCell(1, 1).value = sh.title || T(sh.name)
	ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: 'FF0F172A' } }
	const hasLogo = addLogo(wb, ws)
	ws.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left', indent: hasLogo ? 4 : 0 }
	ws.mergeCells(2, 1, 2, Math.max(last, 2))
	ws.getCell(2, 1).value = `${meta.school}${meta.period ? ' · ' + meta.period : ''} · ${T('Yaratildi')}: ${meta.generated}`
	ws.getCell(2, 1).font = { color: { argb: 'FF64748B' }, size: 10 }
	ws.getRow(1).height = hasLogo ? 40 : 24
	const header = ws.getRow(4)
	cols.forEach(([h], i) => { const c = header.getCell(i + 1); c.value = T(h); c.style = HEAD })
	header.height = 28
	sh.rows.forEach((r, ri) => {
		const row = ws.getRow(5 + ri)
		cols.forEach(([, key, , type], i) => {
			const c = row.getCell(i + 1)
			const v = r[key]
			c.value = v === undefined || v === null || v === '' ? (type === 'num' || type === 'pct' ? null : '—') : (type === 'status' && typeof v === 'string' ? T(v) : v)
			c.border = { top: thin, bottom: thin, left: thin, right: thin }
			c.alignment = { vertical: 'middle', horizontal: type ? 'center' : 'left', wrapText: true }
			if (type === 'pct' && typeof v === 'number') { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: pctFill(v) } }; c.numFmt = '0.#"%"' }
			if (type === 'status' && statusFill[v]) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFill[v] } }
		})
		if (ri % 2) row.eachCell((c) => { if (!c.fill || !c.fill.fgColor) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } } })
	})
	if (sh.totals) {
		const row = ws.getRow(5 + sh.rows.length)
		cols.forEach(([, key], i) => { const c = row.getCell(i + 1); c.value = typeof sh.totals[key] === 'string' ? T(sh.totals[key]) : (sh.totals[key] ?? null); c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; c.alignment = { horizontal: i ? 'center' : 'left' } })
	}
	ws.views = [{ state: 'frozen', ySplit: 4 }]
	if (sh.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sh.rows.length, column: last } }
	ws.pageSetup = { orientation: last > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
	return ws
}

const num = (v) => (typeof v === 'number' ? v : null)
const pageAll = async (fn) => {
	const out = []
	for (let page = 1; page <= 50; page++) {
		const r = await fn(page)
		if (!r.success) break
		out.push(...r.people)
		if (page >= r.pages) break
	}
	return out
}

// ---------- Hisobot generatorlari: { period, sheets } ----------
const gen = {
	async students_day(ctx, status) {
		const T = ctx.T
		const { schoolId, date, sinfId } = ctx
		const rows = await pageAll((page) => MonitorService.people({ kind: 'student', schoolId, sinfId, date, status, page, limit: 200 }))
		return {
			period: date,
			sheets: [{
				name: "O'quvchilar", title: `${T({ absent: "Kelmagan o'quvchilar", late: "Kech qolgan o'quvchilar" }[status] || "O'quvchilar davomati")}: ${date} (${wd(date, T)})`,
				columns: [['№', 'n', 6, 'num'], ["F.I.Sh", 'fullName', 32], ['Sinf', 'sinf', 10, 'x'], ['ID', 'code', 26], ['Holat', 'state', 15, 'status'], ['Kirish', 'firstIn', 10, 'x'], ['Chiqish', 'lastOut', 10, 'x'], ['Maktabda (soat)', 'totalTime', 14, 'x'], ['Kech qoldi', 'late', 12, 'x']],
				rows: rows.map((r, i) => ({ n: i + 1, fullName: r.fullName, sinf: r.sinf, code: r.code, state: ST[r.status], firstIn: r.firstIn, lastOut: r.lastOut, totalTime: r.totalTime, late: r.late ? T('Ha') : '' }))
			}]
		}
	},
	async staff_day(ctx) {
		const T = ctx.T
		const { schoolId, date } = ctx
		const rows = await pageAll((page) => MonitorService.people({ kind: 'staff', schoolId, date, page, limit: 200 }))
		return {
			period: date,
			sheets: [{
				name: 'Xodimlar', title: `${T('Xodimlar davomati')}: ${date} (${wd(date, T)})`,
				columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], ['Lavozim', 'position', 26], ['Holat', 'state', 15, 'status'], ['Kirish', 'firstIn', 10, 'x'], ['Chiqish', 'lastOut', 10, 'x'], ['Maktabda (soat)', 'totalTime', 14, 'x'], ['Kech qoldi', 'late', 12, 'x'], ['Sababli kelmaganlik', 'excuse', 28]],
				rows: rows.map((r, i) => ({ n: i + 1, fullName: r.fullName, position: r.position, state: ST[r.status], firstIn: r.firstIn, lastOut: r.lastOut, totalTime: r.totalTime, late: r.late ? T('Ha') : '', excuse: r.excuse ? `${r.excuse.label ? T(r.excuse.label) : (r.excuse.type || T('Sababli'))}${r.excuse.comment ? ': ' + r.excuse.comment : ''}` : '' }))
			}]
		}
	},
	async class_summary(ctx) {
		const T = ctx.T
		const r = await MonitorService.classes({ schoolId: ctx.schoolId, date: ctx.date })
		const rows = (r.classes || []).map((c, i) => ({ n: i + 1, name: c.name, head: c.head, total: c.total, came: c.came, inside: c.inside, absent: c.absent, percent: c.percent }))
		const total = rows.reduce((a, c) => a + c.total, 0), came = rows.reduce((a, c) => a + c.came, 0)
		return {
			period: ctx.date,
			sheets: [{
				name: 'Sinflar', title: `${T("Sinflar bo'yicha davomat")}: ${ctx.date} (${wd(ctx.date, T)})`,
				columns: [['№', 'n', 6, 'num'], ['Sinf', 'name', 12], ['Sinf rahbari', 'head', 28], ["O'quvchilar", 'total', 13, 'num'], ['Kelgan', 'came', 11, 'num'], ['Hozir maktabda', 'inside', 15, 'num'], ['Kelmagan', 'absent', 11, 'num'], ['Foiz', 'percent', 10, 'pct']],
				rows, totals: { name: 'JAMI', total, came, absent: total - came, percent: total ? Math.round(came / total * 1000) / 10 : 0 }
			}]
		}
	},
	async trend(ctx) {
		const T = ctx.T
		const r = await MonitorService.trend({ from: ctx.from, to: ctx.to, schoolId: ctx.schoolId })
		const days = (r.days || []).filter((d) => d.weekday !== 0)
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [{
				name: 'Dinamika', title: `${T('Kunlik dinamika')}: ${ctx.from} — ${ctx.to}`,
				columns: [['Sana', 'date', 13], ['Kun', 'day', 14], ["O'quvchilar kelgan", 'sc', 17, 'num'], ["O'quvchilar jami", 'st', 16, 'num'], ["O'quvchilar %", 'sp', 14, 'pct'], ['Xodimlar kelgan', 'fc', 15, 'num'], ['Xodimlar jami', 'ft', 14, 'num'], ['Xodimlar %', 'fp', 12, 'pct']],
				rows: days.map((d) => ({ date: d.dateString, day: wd(d.dateString, T), sc: d.studentCame, st: d.studentTotal, sp: d.studentCame || d.staffCame ? d.studentPercent : null, fc: d.staffCame, ft: d.staffTotal, fp: d.studentCame || d.staffCame ? d.staffPercent : null }))
			}]
		}
	},
	async grades(ctx) {
		const T = ctx.T
		const r = await Analytics.gradesReport({ from: ctx.from, to: ctx.to, schoolId: ctx.schoolId })
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [{
				name: 'Darajalar', title: `${T("Sinf darajalari bo'yicha")}: ${ctx.from} — ${ctx.to} · ${T('umumiy')} ${r.overall ?? '—'}%`,
				columns: [['Daraja', 'grade', 12], ['Sinflar', 'classes', 10, 'num'], ["O'quvchilar", 'students', 13, 'num'], ['Kelgan (o‘quvchi-kun)', 'present', 20, 'num'], ['Kutilgan', 'possible', 12, 'num'], ['Davomat %', 'percent', 12, 'pct'], ['Kech qolgan', 'late', 12, 'num'], ['Kech %', 'latePercent', 10, 'num'], ['Eng yaxshi sinf', 'best', 22], ['Eng past sinf', 'worst', 22]],
				rows: (r.grades || []).map((g) => ({ grade: g.grade ? T('{{n}}-sinf', { n: g.grade }) : T('Darajasiz'), classes: g.classes, students: g.students, present: g.present, possible: g.possible, percent: num(g.percent), late: g.late, latePercent: num(g.latePercent), best: g.best ? `${g.best.name} (${g.best.percent}%)` : '', worst: g.worst ? `${g.worst.name} (${g.worst.percent}%)` : '' }))
			}]
		}
	},
	async class_ranking(ctx) {
		const T = ctx.T
		const sinfs = await sinfModel.find({ schoolId: ctx.schoolId }).populate('head', 'fullName').lean()
		const rows = []
		let i = 0
		const worker = async () => {
			while (i < sinfs.length) {
				const s = sinfs[i++]
				const r = await Analytics.gradeClassDetail({ sinfId: String(s._id), from: ctx.from, to: ctx.to, schoolId: ctx.schoolId })
				if (!r.success) continue
				const present = r.students.reduce((a, x) => a + x.present, 0), late = r.students.reduce((a, x) => a + x.late, 0)
				const possible = r.students.length * r.schoolDays
				rows.push({ name: s.name, head: s.head?.fullName || '', students: r.students.length, days: r.schoolDays, present, absent: possible - present, late, percent: possible ? Math.round(present / possible * 1000) / 10 : null })
			}
		}
		await Promise.all([worker(), worker(), worker(), worker()])
		rows.sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [{
				name: 'Reyting', title: `${T('Sinflar reytingi')}: ${ctx.from} — ${ctx.to}`,
				columns: [['O‘rin', 'rank', 8, 'num'], ['Sinf', 'name', 12], ['Sinf rahbari', 'head', 28], ["O'quvchilar", 'students', 13, 'num'], ["O'quv kunlari", 'days', 13, 'num'], ['Kelgan (kun)', 'present', 13, 'num'], ['Kelmagan (kun)', 'absent', 14, 'num'], ['Kech qolgan', 'late', 12, 'num'], ['Davomat %', 'percent', 12, 'pct']],
				rows: rows.map((r, k) => ({ rank: k + 1, ...r }))
			}]
		}
	},
	async class_period(ctx) {
		const T = ctx.T
		const r = await Analytics.gradeClassDetail({ sinfId: ctx.sinfId, from: ctx.from, to: ctx.to, schoolId: ctx.schoolId })
		if (!r.success) { const e = new Error(r.message || 'Sinf topilmadi'); e.notFound = true; throw e }
		const name = r.class.name
		const mark = ['–', '✓', T('K')]
		const dayCols = r.days.map((d, k) => [d.slice(5), `d${k}`, 6, 'x'])
		return {
			period: `${name} · ${ctx.from} — ${ctx.to}`,
			sheets: [
				{
					name: "O'quvchilar", title: `${name}: ${T("o'quvchilar davomati")} (${ctx.from} — ${ctx.to}) · ${T('sinf rahbari')}: ${r.class.head || '—'}`,
					columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], ["O'quv kunlari", 'days', 13, 'num'], ['Kelgan', 'present', 10, 'num'], ['Kelmagan', 'absent', 11, 'num'], ['Kech qolgan', 'late', 12, 'num'], ['Davomat %', 'percent', 12, 'pct']],
					rows: r.students.map((s, i) => ({ n: i + 1, fullName: s.fullName, days: r.schoolDays, present: s.present, absent: s.absent, late: s.late, percent: num(s.percent) }))
				},
				{
					name: 'Kunlik', title: `${name}: ${T("kunlar bo'yicha")}`,
					columns: [['Sana', 'date', 13], ['Kun', 'day', 14], ['Kelgan', 'came', 10, 'num'], ['Kelmagan', 'absent', 11, 'num'], ['Kech qolgan', 'late', 12, 'num'], ['Foiz', 'percent', 10, 'pct']],
					rows: r.daily.map((d) => ({ date: d.date, day: wd(d.date, T), came: d.came, absent: d.absent, late: d.late, percent: d.percent }))
				},
				{
					name: 'Jadval', title: `${name}: ${T('kunma-kun jadval (✓ keldi, K kech qoldi, – kelmadi)')}`,
					columns: [['F.I.Sh', 'fullName', 30], ...dayCols],
					rows: r.students.map((s) => ({ fullName: s.fullName, ...Object.fromEntries(s.marks.map((m, k) => [`d${k}`, mark[m]])) }))
				}
			]
		}
	},
	async late_people(ctx, kind) {
		const T = ctx.T
		const r = await Analytics.latePeople({ kind, from: ctx.from, to: ctx.to, schoolId: ctx.schoolId, limit: 300 })
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [{
				name: 'Kech qolganlar', title: `${T(kind === 'staff' ? 'Kech qoluvchi xodimlar' : "Kech qoluvchi o'quvchilar")}: ${ctx.from} — ${ctx.to} (${T('boshlanish')} ${r.people?.[0]?.limit || '—'})`,
				columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], [kind === 'staff' ? 'Lavozim' : 'Sinf', 'where', 22], ['Kelgan kunlar', 'days', 14, 'num'], ['Kech qolgan kunlar', 'lateDays', 18, 'num'], ['Kech %', 'percent', 10, 'pct'], ['Eng kech vaqt', 'worst', 14, 'x']],
				rows: (r.people || []).map((p, i) => ({ n: i + 1, fullName: p.fullName, where: kind === 'staff' ? p.position : p.sinf, days: p.days, lateDays: p.lateDays, percent: p.percent, worst: p.worst }))
			}]
		}
	},
	async at_risk(ctx) {
		const T = ctx.T
		const r = await Analytics.atRisk({ from: ctx.from, to: ctx.to, schoolId: ctx.schoolId, minStreak: ctx.minStreak, limit: 500 })
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [{
				name: 'Xavf guruhi', title: `${T('Xavf guruhi')}: ${ctx.from} — ${ctx.to} (${T('ketma-ket {{n}}+ kun yoki 30%+ kelmagan', { n: r.minStreak })})`,
				columns: [['№', 'n', 6, 'num'], ["F.I.Sh", 'fullName', 32], ['Sinf', 'sinf', 10, 'x'], ["O'quv kunlari", 'schoolDays', 13, 'num'], ['Kelgan', 'present', 10, 'num'], ['Kelmagan', 'absent', 11, 'num'], ['Ketma-ket kelmagan', 'streak', 18, 'num'], ['Davomat %', 'percent', 12, 'pct'], ['Oxirgi kelgan', 'lastPresent', 14, 'x']],
				rows: (r.students || []).map((s, i) => ({ n: i + 1, fullName: s.fullName, sinf: s.sinf, schoolDays: s.schoolDays, present: s.present, absent: s.absent, streak: s.streak, percent: s.percent, lastPresent: s.lastPresent }))
			}]
		}
	},
	async excuses(ctx) {
		const T = ctx.T
		const r = await Analytics.leaves({ from: ctx.from, to: ctx.to, schoolId: ctx.schoolId })
		return {
			period: `${ctx.from} — ${ctx.to}`,
			sheets: [
				{
					name: 'Xodimlar', title: `${T('Sababli kelmagan xodimlar')}: ${ctx.from} — ${ctx.to}`,
					columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 30], ['Lavozim', 'position', 24], ['Sabab', 'label', 16], ['Izoh', 'comment', 36], ['Boshlanish', 'startDate', 13], ['Tugash', 'endDate', 13], ['Kunlar', 'days', 9, 'num'], ['Holat', 'state', 12], ['Kiritgan', 'by', 22]],
					rows: (r.leaves || []).map((l, i) => ({ n: i + 1, fullName: l.employee.fullName, position: l.employee.position, label: l.label ? T(l.label) : l.label, comment: l.comment, startDate: l.startDate, endDate: l.endDate || T('Davom etmoqda'), days: l.days, state: l.active ? T('Faol') : T('Tugagan'), by: l.createdBy }))
				},
				{
					name: "O'quvchilar", title: `${T("Sababli kelmagan o'quvchilar")}: ${ctx.from} — ${ctx.to}`,
					columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 30], ['Sinf', 'sinf', 10, 'x'], ['Sabab', 'label', 16], ['Izoh', 'comment', 36], ['Boshlanish', 'startDate', 13], ['Tugash', 'endDate', 13], ['Holat', 'state', 12], ['Kiritgan', 'by', 22]],
					rows: (r.studentLeaves || []).map((l, i) => ({ n: i + 1, fullName: l.student.fullName, sinf: l.sinf, label: l.label ? T(l.label) : l.label, comment: l.comment, startDate: l.startDate, endDate: l.endDate || T('Davom etmoqda'), state: l.active ? T('Faol') : T('Tugagan'), by: l.createdBy }))
				}
			]
		}
	},
	async alerts(ctx) {
		const T = ctx.T
		const r = await Analytics.alerts({ date: ctx.date, schoolId: ctx.schoolId })
		return {
			period: ctx.date,
			sheets: [{
				name: 'Ogohlantirishlar', title: `${T('Ogohlantirishlar')}: ${ctx.date}`,
				columns: [['№', 'n', 6, 'num'], ['Daraja', 'sev', 12], ['Ogohlantirish', 'title', 40], ['Tafsilot', 'evidence', 70]],
				rows: (r.alerts || []).map((a, i) => ({ n: i + 1, sev: SEV[a.severity] ? T(SEV[a.severity]) : a.severity, title: a.title, evidence: a.evidence }))
			}]
		}
	},
	async cameras(ctx) {
		const T = ctx.T
		const r = await MonitorService.school({ schoolId: ctx.schoolId })
		const role = { monitor: 'Oddiy', in: 'FaceControl: kirish', out: 'FaceControl: chiqish' }
		return {
			period: '',
			sheets: [{
				name: 'Kameralar', title: T('Kameralar holati'),
				columns: [['№', 'n', 6, 'num'], ['Kamera', 'name', 30], ['Joyi', 'place', 22], ['Sinf', 'sinf', 12, 'x'], ['Vazifasi', 'role', 22], ['Holat', 'state', 12, 'status'], ['Oxirgi aloqa', 'last', 20]],
				rows: (r.cameras || []).map((c, i) => ({ n: i + 1, name: c.name, place: c.place, sinf: c.sinf, role: T(role[c.role] || 'Oddiy'), state: c.online === true ? 'Online' : c.online === false ? 'Offline' : "Noma'lum", last: c.lastSeenAt ? fmtDT(ctx.lang, c.lastSeenAt) : '' }))
			}]
		}
	},
	async camera_sync(ctx) {
		const T = ctx.T
		const sid = new mongoose.Types.ObjectId(ctx.schoolId)
		const [users, students, queue] = await Promise.all([
			userModel.find({ schoolId: sid, role: { $in: ['viewer', 'leader'] }, isActive: { $ne: false } }).select('fullName position photo photo_camera hodimID').sort({ fullName: 1 }).lean(),
			studentModel.find({ schoolId: sid, isActive: { $ne: false } }).select('fullName sinf photo photo_camera studentIdNumber').populate('sinf', 'name').sort({ fullName: 1 }).lean(),
			adduserModel.find({ schoolId: sid }, 'hodimID lastError attempts lastAttemptAt').lean()
		])
		const q = new Map(queue.map((e) => [e.hodimID, e]))
		const state = (p, id) => {
			if (p.photo_camera) return 'Kamerada'
			if (!p.photo) return "Rasm yo'q"
			const e = q.get(id)
			if (e?.lastError) return 'Rad etildi'
			return e ? 'Navbatda' : 'Yuborilmagan'
		}
		const row = (p, id, where, i) => { const e = q.get(id); return { n: i + 1, fullName: p.fullName, where, photo: p.photo ? T('Bor') : T("Yo'q"), state: state(p, id), err: e?.lastError || '', attempts: e?.attempts || 0, at: e?.lastAttemptAt ? fmtDT(ctx.lang, e.lastAttemptAt) : '' } }
		const cols = (label) => [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], [label, 'where', 22], ['Rasm', 'photo', 10, 'x'], ['Kamera holati', 'state', 16, 'status'], ['Rad etish sababi', 'err', 44], ['Urinishlar', 'attempts', 11, 'num'], ['Oxirgi urinish', 'at', 20]]
		return {
			period: '',
			sheets: [
				{ name: "O'quvchilar", title: T("O'quvchilar rasmining kameradagi holati"), columns: cols('Sinf'), rows: students.map((s, i) => row(s, s.studentIdNumber, s.sinf?.name || '', i)) },
				{ name: 'Xodimlar', title: T('Xodimlar rasmining kameradagi holati'), columns: cols('Lavozim'), rows: users.map((u, i) => row(u, u.hodimID, u.position || '', i)) }
			]
		}
	},
	async parents(ctx) {
		const T = ctx.T
		const r = await ParentService.coverage(ctx.schoolId)
		const rows = (r.classes || []).map((c, i) => ({ n: i + 1, name: c.name, students: c.students, covered: c.covered, uncovered: Math.max(0, c.students - c.covered), noPhone: c.noPhone, percent: c.students ? Math.round(c.covered / c.students * 1000) / 10 : 0 }))
		const sum = (k) => rows.reduce((a, x) => a + x[k], 0)
		return {
			period: '',
			sheets: [{
				name: 'Qamrov', title: T("Ota-onalar boti qamrovi (sinflar bo'yicha)"),
				columns: [['№', 'n', 6, 'num'], ['Sinf', 'name', 12], ["O'quvchilar", 'students', 13, 'num'], ['Ota-onasi ulangan', 'covered', 17, 'num'], ['Ulanmagan', 'uncovered', 12, 'num'], ["Telefoni yo'q", 'noPhone', 14, 'num'], ['Qamrov %', 'percent', 12, 'pct']],
				rows, totals: { name: 'JAMI', students: sum('students'), covered: sum('covered'), uncovered: sum('uncovered'), noPhone: sum('noPhone'), percent: sum('students') ? Math.round(sum('covered') / sum('students') * 1000) / 10 : 0 }
			}]
		}
	},
	async parents_list(ctx) {
		const T = ctx.T
		const all = []
		for (let page = 1; page <= 100; page++) {
			const r = await ParentService.parents(ctx.schoolId, { page, limit: 100 })
			all.push(...r.parents)
			if (page >= r.pages) break
		}
		const state = { active: T('Faol'), blocked: T('Botni bloklagan'), paused: T("Xabarni to'xtatgan"), inactive: T('Faolsiz') }
		return {
			period: '',
			sheets: [{
				name: 'Ota-onalar', title: T('Telegram botga ulangan ota-onalar'),
				columns: [['№', 'n', 6, 'num'], ['Ism', 'name', 28], ['Telegram', 'username', 18], ['Telefon', 'phone', 18], ['Farzandlari', 'kids', 44], ['Holat', 'state', 18], ['Ulangan', 'via', 16], ['Oxirgi xabar', 'last', 20]],
				rows: all.map((p, i) => ({ n: i + 1, name: p.name, username: p.username ? `@${p.username}` : '', phone: p.phone, kids: p.children.map((c) => `${c.name}${c.sinf ? ` (${c.sinf})` : ''}`).join(', '), state: state[p.state] || p.state, via: p.via.map((v) => ({ phone: T('Telefon'), invite: T('Havola'), admin: 'Admin' }[v] || v)).join(', '), last: p.lastSentAt ? fmtDT(ctx.lang, p.lastSentAt) : '' }))
			}]
		}
	},
	async students_all(ctx) {
		const T = ctx.T
		const filter = { schoolId: new mongoose.Types.ObjectId(ctx.schoolId), isActive: { $ne: false } }
		if (ctx.sinfId) filter.sinf = new mongoose.Types.ObjectId(ctx.sinfId)
		const list = await studentModel.find(filter).select('fullName sinf gender birthday parentName parentPhone photo createdAt').populate('sinf', 'name').lean()
		list.sort((a, b) => (a.sinf?.name || '').localeCompare(b.sinf?.name || '', 'uz', { numeric: true }) || a.fullName.localeCompare(b.fullName))
		const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '')
		return {
			period: '',
			sheets: [{
				name: "O'quvchilar", title: T("O'quvchilar ro'yxati"),
				columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], ['Sinf', 'sinf', 10, 'x'], ['Jinsi', 'gender', 10, 'x'], ["Tug'ilgan sana", 'birthday', 15, 'x'], ['Ota-ona', 'parentName', 26], ['Ota-ona telefoni', 'parentPhone', 18], ['Rasm', 'photo', 9, 'x'], ["Qo'shilgan", 'createdAt', 13, 'x']],
				rows: list.map((s, i) => ({ n: i + 1, fullName: s.fullName, sinf: s.sinf?.name, gender: s.gender ? T(s.gender) : '', birthday: d(s.birthday), parentName: s.parentName, parentPhone: s.parentPhone, photo: s.photo ? T('Bor') : T("Yo'q"), createdAt: d(s.createdAt) }))
			}]
		}
	},
	async staff_all(ctx) {
		const T = ctx.T
		const list = await userModel.find({ schoolId: new mongoose.Types.ObjectId(ctx.schoolId), role: { $in: ['viewer', 'leader'] }, isActive: { $ne: false } }).select('fullName position role photo createdAt').sort({ fullName: 1 }).lean()
		const d = (x) => (x ? new Date(x).toISOString().slice(0, 10) : '')
		return {
			period: '',
			sheets: [{
				name: 'Xodimlar', title: T("Xodimlar ro'yxati"),
				columns: [['№', 'n', 6, 'num'], ['F.I.Sh', 'fullName', 32], ['Lavozim', 'position', 28], ['Roli', 'role', 14], ['Rasm', 'photo', 9, 'x'], ["Qo'shilgan", 'createdAt', 13, 'x']],
				rows: list.map((u, i) => ({ n: i + 1, fullName: u.fullName, position: u.position, role: u.role === 'leader' ? T('Sinf rahbari') : T('Xodim'), photo: u.photo ? T('Bor') : T("Yo'q"), createdAt: d(u.createdAt) }))
			}]
		}
	},
	async school_full(ctx) {
		const T = ctx.T
		const parts = await Promise.all([gen.trend(ctx), gen.grades(ctx), gen.class_ranking(ctx), gen.late_people(ctx, 'student'), gen.late_people(ctx, 'staff'), gen.at_risk(ctx), gen.excuses(ctx)])
		const names = ['Dinamika', 'Darajalar', 'Reyting', "Kech o'quvchilar", 'Kech xodimlar', 'Xavf guruhi', 'Sababli xodimlar', "Sababli o'quvchilar"]
		const sheets = parts.flatMap((p) => p.sheets)
		sheets.forEach((s, i) => { s.name = names[i] || s.name })
		return { period: `${ctx.from} — ${ctx.to}`, sheets }
	}
}
gen.students_absent = (ctx) => gen.students_day(ctx, 'absent')
gen.students_late = (ctx) => gen.students_day(ctx, 'late')
const RUN = { ...gen, late_students: (c) => gen.late_people(c, 'student'), late_staff: (c) => gen.late_people(c, 'staff') }
const SAFE = /[^A-Za-z0-9_-]+/g

class ReportCenterService {
	catalog() { return CATALOG }

	// Parametrlarni tekshirib, .xlsx buffer va fayl nomini qaytaradi
	async build(schoolId, key, q = {}, langIn) {
		const lang = normLang(langIn || q.lang)
		const T = (x, vars) => tr(lang, x, vars)
		const def = CATALOG.find((r) => r.key === key)
		if (!def || !RUN[key]) return { success: false, message: 'Hisobot turi noto‘g‘ri' }
		for (const k of ['date', 'from', 'to']) if (q[k] !== undefined && q[k] !== '' && !isDate(q[k])) return { success: false, message: 'Sana noto‘g‘ri (YYYY-MM-DD)' }
		const date = isDate(q.date) ? q.date : today()
		const to = isDate(q.to) ? q.to : today()
		let from = isDate(q.from) ? q.from : shift(to, -29)
		if (from > to) return { success: false, message: 'Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas' }
		if (shift(from, 366) < to) from = shift(to, -366) // eng ko'pi bilan 1 yil
		const ctx = { schoolId: String(schoolId), date, from, to, minStreak: q.minStreak, lang, T }
		if (mongoose.isValidObjectId(q.sinfId)) ctx.sinfId = String(q.sinfId)
		if (def.params.includes('sinfRequired') && !ctx.sinfId) return { success: false, message: 'Sinfni tanlang' }
		if (ctx.sinfId) {
			const found = await require('../models/sinf.model').exists({ _id: ctx.sinfId, schoolId }).catch(() => null)
			if (!found && def.params.includes('sinfRequired')) return { success: false, status: 404, message: 'Sinf topilmadi' }
		}
		const [school] = await Promise.all([schoolModel.findById(schoolId).select('name').lean()])
		let result
		try { result = await RUN[key](ctx) } catch (e) { if (e && e.notFound) return { success: false, status: 404, message: e.message }; throw e }
		const wb = new ExcelJS.Workbook()
		wb.creator = 'School Supervision'
		wb.created = new Date()
		const meta = { T, school: school?.name || T('Maktab'), period: result.period, generated: fmtDT(lang, new Date()) }
		for (const sh of result.sheets) addSheet(wb, meta, sh)
		const rowsTotal = result.sheets.reduce((a, s) => a + s.rows.length, 0)
		const stamp = def.params.includes('range') ? `${from}_${to}` : def.params.includes('date') ? date : today()
		const buffer = await wb.xlsx.writeBuffer()
		return { success: true, buffer, rows: rowsTotal, filename: `${`${key}-${stamp}`.replace(SAFE, '_')}.xlsx` }
	}
}

module.exports = new ReportCenterService()
