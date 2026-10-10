import { tx } from '../../i18n'
import { useMemo, useState } from 'react'
import { FaFileExcel } from 'react-icons/fa'
import { FiAlertTriangle, FiCalendar, FiCheck, FiClock, FiDownload, FiGrid, FiHome, FiLayers, FiMap, FiSearch, FiUser, FiUsers, FiVideo, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { DateField, Page, PageHeader, RangePicker, exportXlsx, shiftDate, todayStr } from './monitorKit'
import { GROUPS, buildCatalog } from './reportCatalog'

const ICONS = { district: FiMap, school: FiHome, student: FiUsers, staff: FiUser, class: FiGrid, camera: FiVideo, watch: FiAlertTriangle }
// Tailwind sinflari statik bo'lishi kerak (dinamik yig'ib bo'lmaydi)
const TONE = {
	blue: { chip: 'bg-blue-50 text-blue-700', icon: 'bg-blue-100 text-blue-600', bar: 'border-l-blue-500', on: 'bg-blue-600 text-white' },
	sky: { chip: 'bg-sky-50 text-sky-700', icon: 'bg-sky-100 text-sky-600', bar: 'border-l-sky-500', on: 'bg-sky-600 text-white' },
	green: { chip: 'bg-green-50 text-green-700', icon: 'bg-green-100 text-green-600', bar: 'border-l-green-500', on: 'bg-green-600 text-white' },
	violet: { chip: 'bg-violet-50 text-violet-700', icon: 'bg-violet-100 text-violet-600', bar: 'border-l-violet-500', on: 'bg-violet-600 text-white' },
	amber: { chip: 'bg-amber-50 text-amber-700', icon: 'bg-amber-100 text-amber-600', bar: 'border-l-amber-500', on: 'bg-amber-600 text-white' },
	orange: { chip: 'bg-orange-50 text-orange-700', icon: 'bg-orange-100 text-orange-600', bar: 'border-l-orange-500', on: 'bg-orange-600 text-white' },
	red: { chip: 'bg-red-50 text-red-700', icon: 'bg-red-100 text-red-600', bar: 'border-l-red-500', on: 'bg-red-600 text-white' }
}
const SCOPE = { day: [tx('Kunlik'), 'bg-emerald-50 text-emerald-700'], range: [tx('Davr'), 'bg-indigo-50 text-indigo-700'], none: [tx('Hozirgi holat'), 'bg-slate-100 text-slate-600'] }

const monthStart = () => `${todayStr().slice(0, 8)}01`
const RANGES = [
	[tx('Bugun'), () => ({ from: todayStr(), to: todayStr() })],
	[tx('7 kun'), () => ({ from: shiftDate(todayStr(), -6), to: todayStr() })],
	[tx('30 kun'), () => ({ from: shiftDate(todayStr(), -29), to: todayStr() })],
	[tx('Shu oy'), () => ({ from: monthStart(), to: todayStr() })],
	[tx('90 kun'), () => ({ from: shiftDate(todayStr(), -89), to: todayStr() })]
]

const Chip = ({ active, onClick, children, count }) => (
	<button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${active ? 'border-blue-600 bg-blue-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}>
		{children}
		{count !== undefined && <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
	</button>
)

// Hisobot markazi: guruhlangan va qidiriladigan Excel hisobotlari, tayyor paketlar, bir nechtasini tanlab bitta faylga yuklash
const ReportHub = ({ region }) => {
	const { reports, bundles } = useMemo(() => buildCatalog({ region }), [region])
	const groups = GROUPS.filter(g => (g.region ? region : true) && reports.some(r => r.group === g.key))
	const [day, setDay] = useState(todayStr())
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [group, setGroup] = useState('')
	const [q, setQ] = useState('')
	const [picked, setPicked] = useState([])
	const [busy, setBusy] = useState('')
	const [progress, setProgress] = useState(null)
	const [history, setHistory] = useState([])

	const byKey = useMemo(() => new Map(reports.map(r => [r.key, r])), [reports])
	const shown = reports.filter(r => (!group || r.group === group) && (!q.trim() || `${r.title} ${r.text}`.toLowerCase().includes(q.trim().toLowerCase())))
	const dateLabel = (scope) => (scope === 'day' ? day : scope === 'range' ? `${range.from} — ${range.to}` : tx('hozir'))
	const toggle = (k) => setPicked(a => (a.includes(k) ? a.filter(x => x !== k) : [...a, k]))

	// Tanlangan hisobotlarni (kamida bittasi) ketma-ket yig'ib, bitta Excel faylga yozadi
	const generate = async (id, keys, fileBase, title, bundle) => {
		if (busy) return
		setBusy(id); setProgress({ done: 0, total: keys.length })
		try {
			const sheets = []
			const failed = []
			let done = 0
			// 3 tadan parallel; tartib saqlanadi
			const out = new Array(keys.length)
			let next = 0
			const worker = async () => {
				while (next < keys.length) {
					const i = next++
					const r = byKey.get(keys[i])
					try { out[i] = await r.run({ day, range }) } catch { failed.push(r.title); out[i] = [] }
					setProgress({ done: ++done, total: keys.length })
				}
			}
			await Promise.all(Array.from({ length: Math.min(3, keys.length) }, worker))
			out.forEach(list => sheets.push(...list))
			const used = new Set()
			sheets.forEach(s => { let n = String(s.name).slice(0, 31), k = 2; while (used.has(n.toLowerCase())) n = `${String(s.name).slice(0, 27)} ${k++}`; used.add(n.toLowerCase()); s.name = n })
			if (!sheets.length) throw new Error('empty')
			await exportXlsx(fileBase, sheets, { title, subtitle: bundle ? tx('Sana: {{day}} · Davr: {{from}} — {{to}}', { day, from: range.from, to: range.to }) : undefined, cover: sheets.length > 1 })
			setHistory(h => [{ id: Date.now(), title, file: `${fileBase}.xlsx`, sheets: sheets.length, rows: sheets.reduce((a, s) => a + s.rows.length, 0), at: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }), failed }, ...h].slice(0, 8))
			failed.length ? toast.warn(tx("Yuklandi, lekin {{n}} ta bo'lim olinmadi: {{list}}", { n: failed.length, list: failed.join(', ') })) : toast.success('Hisobot yuklab olindi')
		} catch {
			toast.error("Hisobotni yuklab bo'lmadi")
		} finally { setBusy(''); setProgress(null) }
	}
	const one = (r) => generate(r.key, [r.key], `${r.key}-${r.scope === 'range' ? `${range.from}_${range.to}` : r.scope === 'day' ? day : todayStr()}`, r.title, false)
	const pack = (b) => generate(b.key, b.keys, `${b.key.replace('b_', 'paket-')}-${b.scope === 'range' ? `${range.from}_${range.to}` : day}`, b.title, true)
	const custom = () => generate('custom', picked, `tanlangan-hisobot-${day}`, tx('Tanlangan hisobotlar'), true)
	const needs = (keys) => { const s = new Set(keys.map(k => byKey.get(k)?.scope)); return [s.has('day') && tx('sana {{day}}', { day }), s.has('range') && tx('davr {{from}} — {{to}}', { from: range.from, to: range.to })].filter(Boolean).join(' · ') }

	return (
		<Page>
			<PageHeader />

			{/* Sana va davr: bitta ixcham panel, tez tanlash tugmalari bilan */}
			<div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
				<div className="flex flex-wrap items-end gap-x-8 gap-y-4">
					<div>
						<p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><FiCalendar size={13} /> Kunlik hisobotlar uchun sana</p>
						<div className="flex flex-wrap items-center gap-2">
							<DateField value={day} max={todayStr()} onChange={setDay} />
							<button onClick={() => setDay(todayStr())} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Bugun</button>
							<button onClick={() => setDay(shiftDate(todayStr(), -1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Kecha</button>
						</div>
					</div>
					<div>
						<p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><FiClock size={13} /> Davr bo'yicha hisobotlar uchun</p>
						<div className="flex flex-wrap items-center gap-2">
							<RangePicker {...range} onChange={setRange} />
							{RANGES.map(([l, f]) => <button key={l} onClick={() => setRange(f())} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">{l}</button>)}
						</div>
					</div>
				</div>
			</div>

			{/* Tayyor paketlar: bir fayl ichida ko'p varaq */}
			<div className="mb-2 flex items-center gap-2"><FiLayers className="text-blue-600" /><h2 className="text-sm font-semibold text-slate-700">Tayyor paketlar <span className="font-normal text-slate-400">· bir faylda ko'p varaq va mundarija</span></h2></div>
			<div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
				{bundles.map(b => (
					<div key={b.key} className={`flex flex-col rounded-2xl bg-gradient-to-br ${b.tone} p-5 text-white shadow-sm`}>
						<p className="text-xs uppercase tracking-widest text-white/70">{tx("{{n}} ta varaq", { n: b.keys.length })}</p>
						<h3 className="mt-1 text-lg font-semibold">{b.title}</h3>
						<p className="mt-2 flex-1 text-sm leading-relaxed text-white/80">{b.text}</p>
						<p className="mt-3 text-xs text-white/60">{needs(b.keys) || 'Hozirgi holat'}</p>
						<button onClick={() => pack(b)} disabled={!!busy} className="mt-3 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100 disabled:opacity-60">
							<FaFileExcel className="text-green-600" /> {busy === b.key && progress ? tx('Tayyorlanmoqda {{done}}/{{total}}', { done: progress.done, total: progress.total }) : 'Paketni yuklab olish'}
						</button>
					</div>
				))}
			</div>

			{/* Alohida hisobotlar */}
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<h2 className="mr-2 text-sm font-semibold text-slate-700">Alohida hisobotlar <span className="font-normal text-slate-400">· {tx("{{n}} ta", { n: reports.length })}</span></h2>
				<div className="relative ml-auto"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Hisobot qidirish" className="w-60 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-black outline-none focus:border-blue-400" />{q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><FiX size={14} /></button>}</div>
			</div>
			<div className="mb-5 flex flex-wrap gap-2">
				<Chip active={!group} onClick={() => setGroup('')} count={reports.length}>Hammasi</Chip>
				{groups.map(g => { const I = ICONS[g.key]; return <Chip key={g.key} active={group === g.key} onClick={() => setGroup(g.key)} count={reports.filter(r => r.group === g.key).length}><I size={14} /> {g.label}</Chip> })}
			</div>

			{shown.length ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
					{shown.map(r => {
						const g = GROUPS.find(x => x.key === r.group); const t = TONE[g.color]; const I = ICONS[r.group]; const on = picked.includes(r.key)
						return (
							<div key={r.key} className={`flex flex-col rounded-2xl border border-l-4 bg-white p-4 shadow-sm transition hover:shadow-md ${t.bar} ${on ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200'}`}>
								<div className="flex items-start gap-3">
									<div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}><I size={18} /></div>
									<div className="min-w-0 flex-1">
										<h3 className="font-semibold leading-snug text-slate-900">{r.title}</h3>
										<div className="mt-1 flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.chip}`}>{g.label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SCOPE[r.scope][1]}`}>{SCOPE[r.scope][0]} · {dateLabel(r.scope)}</span></div>
									</div>
									<button onClick={() => toggle(r.key)} title={on ? 'Tanlovdan olib tashlash' : 'Bitta faylga qo\'shish'} aria-pressed={on} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-blue-400'}`}><FiCheck size={14} /></button>
								</div>
								<p className="mt-3 flex-1 text-sm leading-relaxed text-slate-500">{r.text}</p>
								<button onClick={() => one(r)} disabled={!!busy} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"><FiDownload size={15} /> {busy === r.key ? 'Tayyorlanmoqda...' : 'Excel yuklab olish'}</button>
							</div>
						)
					})}
				</div>
			) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">Hisobot topilmadi</div>}

			{/* So'nggi yuklanganlar (shu sessiyada) */}
			{history.length > 0 && (
				<div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-3 text-sm font-semibold text-slate-700">So'nggi yuklanganlar</h2>
					<ul className="divide-y divide-slate-100">
						{history.map(h => (
							<li key={h.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
								<FaFileExcel className="text-green-600" /><span className="font-medium text-slate-800">{h.title}</span><span className="text-slate-400">{h.file}</span>
								<span className="ml-auto text-xs text-slate-500">{tx("{{sheets}} varaq · {{rows}} qator · {{at}}", { sheets: h.sheets, rows: h.rows.toLocaleString('uz-UZ'), at: h.at })}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Tanlanganlar paneli */}
			{picked.length > 0 && (
				<div className="sticky bottom-4 z-20 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-white/95 p-3 pl-5 shadow-xl backdrop-blur">
					<span className="text-sm font-medium text-slate-800">{tx("{{n}} ta hisobot tanlandi", { n: picked.length })}</span>
					<span className="hidden text-xs text-slate-400 md:inline">{needs(picked)}</span>
					<div className="ml-auto flex items-center gap-2">
						<button onClick={() => setPicked([])} disabled={!!busy} className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Tozalash</button>
						<button onClick={custom} disabled={!!busy} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><FaFileExcel /> {busy === 'custom' && progress ? tx('Tayyorlanmoqda {{done}}/{{total}}', { done: progress.done, total: progress.total }) : 'Bitta faylga yuklash'}</button>
					</div>
				</div>
			)}
		</Page>
	)
}

export default ReportHub
