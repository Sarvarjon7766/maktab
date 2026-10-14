import { useMemo, useState } from 'react'
import { FiArrowDown, FiArrowUp, FiCheck, FiDownload } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartBox, Empty, exportXlsx, LoadState, Page, PageHeader, Panel, RangePicker, SearchBox, fmt, matchText, schoolPlace, shiftDate, todayStr, useMonitorData } from './monitorKit'
import { tx } from '../../i18n'

const COLORS = ['#2563eb', '#f59e0b', '#16a34a']
const COLS = [
	{ key: 'score', label: 'Ball', hint: "O'quvchilar 60% + xodimlar 25% + o'z vaqtida kelish 15%", higher: true, unit: '' },
	{ key: 'studentPercent', label: "O'quvchilar", hint: 'Davr bo‘yicha o‘rtacha davomat', higher: true, unit: '%' },
	{ key: 'staffPercent', label: 'Xodimlar', hint: 'Davr bo‘yicha o‘rtacha davomat', higher: true, unit: '%' },
	{ key: 'latePercent', label: 'Kech qolish', hint: 'Bugun kelganlarning qanchasi kech qolgan', higher: false, unit: '%' },
	{ key: 'trend', label: 'Dinamika', hint: 'Oxirgi 7 kun oldingi 7 kunga nisbatan', higher: true, unit: '%', signed: true },
	{ key: 'cameraPercent', label: 'Kameralar', hint: 'Hozir online kameralar ulushi', higher: true, unit: '%' }
]

const tone = (v, avg, higher) => {
	if (v === null || avg === null) return 'text-gray-300'
	const d = (v - avg) * (higher ? 1 : -1)
	return d >= 2 ? 'text-green-600' : d <= -2 ? 'text-red-600' : 'text-gray-800'
}
const show = (v, c) => (v === null || v === undefined ? '—' : `${c.signed && v > 0 ? '+' : ''}${v}${c.unit}`)

const Cell = ({ s, c, avg }) => {
	const v = s[c.key]
	const diff = v === null || avg === null || c.key === 'score' ? null : Math.round((v - avg) * 10) / 10
	return (
		<td className="px-3 py-3 text-right whitespace-nowrap">
			<b className={`text-sm ${tone(v, avg, c.higher)}`}>{show(v, c)}</b>
			{diff !== null && diff !== 0 && <p className="text-[10px] text-gray-400">{diff > 0 ? '+' : ''}{diff} {tx("o'rtachadan")}</p>}
		</td>
	)
}

// Maktablar: bir-biri bilan solishtirish. Hamma ko'rsatkich bitta jadvalda, o'rtacha bilan farqi, kuchli va zaif tomonlari
const MonitorSchools = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('schools-compare', range, { auto: true })
	const [sort, setSort] = useState({ key: 'score', dir: 'desc' })
	const [params] = useSearchParams()
	const [query, setQuery] = useState(params.get('district') || '')
	const [picked, setPicked] = useState([])
	const [dist, setDist] = useState('')

	const all = useMemo(() => data?.schools || [], [data])
	const avgs = data?.averages || {}
	const rows = useMemo(() => {
		const col = COLS.find(c => c.key === sort.key)
		return all.filter(s => (!dist || s.district === dist) && matchText(query, s.name, s.region, s.district))
			.sort((a, b) => {
				const x = a[sort.key], y = b[sort.key]
				if (x === null && y === null) return 0
				if (x === null) return 1
				if (y === null) return -1
				return (sort.dir === 'desc' ? y - x : x - y) || a.name.localeCompare(b.name)
			}).map(s => ({ ...s, _col: col }))
	}, [all, query, sort, dist])
	// Viloyat monitorida maktablar tumanlar bo'yicha guruhlanadi: tuman chiplari va tuman sahifasiga havola
	const districts = useMemo(() => { const m = new Map(); all.forEach(x => { const k = x.district || ''; if (k) m.set(k, (m.get(k) || 0) + 1) }); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'uz')) }, [all])

	const leaders = useMemo(() => {
		const best = (key, higher = true) => all.filter(s => s[key] !== null).sort((a, b) => (higher ? b[key] - a[key] : a[key] - b[key]))[0]
		return [
			['Eng yuqori o‘quvchilar davomati', best('studentPercent'), 'studentPercent', '%'],
			['Eng yuqori xodimlar davomati', best('staffPercent'), 'staffPercent', '%'],
			['Eng kam kech qoladigan', best('latePercent', false), 'latePercent', '%'],
			['Eng tez o‘sayotgan', best('trend'), 'trend', '%']
		].filter(l => l[1] && !(l[2] === 'trend' && l[1].trend <= 0))
	}, [all])

	const download = () => exportXlsx(`maktablar-taqqoslash-${range.from}_${range.to}`, [{
		name: 'Maktablar', title: `Maktablar taqqoslash: ${range.from} — ${range.to}`,
		rows: rows.map((s, i) => ({
			'№': i + 1, Maktab: s.name, Hudud: schoolPlace(s), "O'quvchilar": s.students, Xodimlar: s.staff, Sinflar: s.classes, Ball: s.score ?? '',
			"O'quvchilar davomati %": s.studentPercent ?? '', 'Xodimlar davomati %': s.staffPercent ?? '', 'Kech qolish %': s.latePercent ?? '', 'Dinamika (punkt)': s.trend ?? '',
			'Kuchli tomonlari': s.strengths.filter(x => x.key !== 'cameraPercent').map(x => x.label).join(', '), 'Zaif tomonlari': s.weaknesses.filter(x => x.key !== 'cameraPercent').map(x => x.label).join(', ')
		}))
	}])
	const toggleSort = (key) => setSort(p => p.key === key ? { key, dir: p.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: COLS.find(c => c.key === key).higher ? 'desc' : 'asc' })
	const toggle = (id) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id])
	const chosen = picked.map(id => all.find(s => s._id === id)).filter(Boolean)
	const chart = ['studentPercent', 'staffPercent', 'cameraPercent'].map(k => ({ name: COLS.find(c => c.key === k).label, ...Object.fromEntries(chosen.map(s => [s.name, s[k] ?? 0])) }))

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<button onClick={download} disabled={!rows.length} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={15} /> {tx("Excel")}</button>
				<SearchBox value={query} onChange={setQuery} placeholder={tx("Maktab yoki hudud")} />
			</PageHeader>
			<div className="mb-5"><RangePicker {...range} onChange={setRange} /></div>
			{districts.length > 1 && (
				<div className="mb-5 flex flex-wrap items-center gap-1.5">
					<span className="mr-1 text-xs font-medium text-slate-500">{tx("Tuman:")}</span>
					<button onClick={() => setDist('')} className={`rounded-full px-3.5 py-1.5 text-sm transition ${dist === '' ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{tx("Hammasi")} <span className="opacity-60">{all.length}</span></button>
					{districts.map(([name, n]) => <button key={name} onClick={() => setDist(dist === name ? '' : name)} className={`rounded-full px-3.5 py-1.5 text-sm transition ${dist === name ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{name} <span className="opacity-60">{n}</span></button>)}
					{dist && <Link to={`/monitor/districts/${encodeURIComponent(dist)}`} className="ml-2 text-sm font-medium text-blue-600 hover:underline">{tx("{{district}} tuman sahifasi →", { district: dist })}</Link>}
				</div>
			)}

			<LoadState loading={loading && !data} error={error} empty={data && all.length === 0}>
				{leaders.length > 0 && (
					<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
						{leaders.map(([title, s, key, unit]) => (
							<Link key={title} to={`/monitor/schools/${s._id}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition">
								<p className="text-xs text-gray-500">{title}</p>
								<p className="font-semibold text-gray-900 mt-1.5 truncate">{s.name}</p>
								<p className="text-2xl font-bold text-blue-600 mt-1">{key === 'trend' && s[key] > 0 ? '+' : ''}{s[key]}{unit}</p>
							</Link>
						))}
					</div>
				)}

				{chosen.length >= 2 && (
					<Panel title={tx("Tanlangan maktablar taqqoslamasi")} className="mb-6" action={<button onClick={() => setPicked([])} className="text-sm text-gray-500 hover:text-gray-800">{tx("Tozalash")}</button>}>
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
							<ChartBox height={240}><ResponsiveContainer width="100%" height="100%">
								<BarChart data={chart} margin={{ left: -12, right: 8 }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => `${v}%`} /><Legend />
									{chosen.map((s, i) => <Bar key={s._id} dataKey={s.name} fill={COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
								</BarChart>
							</ResponsiveContainer></ChartBox>
							<ul className="divide-y divide-gray-50 text-sm">
								{COLS.map(c => {
									const vals = chosen.map(s => s[c.key]).filter(v => v !== null)
									const win = vals.length > 1 ? (c.higher ? Math.max(...vals) : Math.min(...vals)) : null
									return (
										<li key={c.key} className="py-2 flex items-center gap-3"><span className="w-28 text-gray-500 shrink-0">{c.label}</span>
											<div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${chosen.length}, minmax(0, 1fr))` }}>
												{chosen.map((s, i) => <span key={s._id} className={`truncate ${s[c.key] !== null && s[c.key] === win ? 'font-bold text-green-600' : 'text-gray-800'}`}><i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: COLORS[i] }} />{show(s[c.key], c)}</span>)}
											</div>
										</li>
									)
								})}
							</ul>
						</div>
					</Panel>
				)}

				<Panel className="overflow-hidden" title={`Maktablar (${fmt(rows.length)})`} action={<span className="text-xs text-gray-400">{tx("Taqqoslash uchun 2–3 maktabni belgilang")}</span>}>
					<div className="overflow-x-auto -mx-5 -mb-5">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-xs uppercase tracking-wide text-gray-500 border-y border-gray-100 bg-gray-50/60">
									<th className="w-10 px-3 py-2.5" /><th className="px-3 py-2.5 text-left font-semibold">{tx("Maktab")}</th>
									{COLS.map(c => (
										<th key={c.key} title={c.hint} className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
											<button onClick={() => toggleSort(c.key)} className={`inline-flex items-center gap-1 uppercase tracking-wide ${sort.key === c.key ? 'text-blue-700' : ''}`}>{c.label}{sort.key === c.key && (sort.dir === 'desc' ? <FiArrowDown size={12} /> : <FiArrowUp size={12} />)}</button>
										</th>
									))}
									<th className="px-3 py-2.5 text-left font-semibold">{tx("Kuchli tomoni")}</th><th className="px-3 py-2.5 text-left font-semibold">{tx("Zaif tomoni")}</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((s, i) => (
									<tr key={s._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40">
										<td className="px-3 py-3"><button onClick={() => toggle(s._id)} aria-label={tx("Taqqoslash")} className={`w-5 h-5 rounded border flex items-center justify-center ${picked.includes(s._id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}`}>{picked.includes(s._id) && <FiCheck size={12} />}</button></td>
										<td className="px-3 py-3 min-w-[200px]">
											<Link to={`/monitor/schools/${s._id}`} className="font-semibold text-gray-900 hover:text-blue-600"><span className="text-gray-400 font-normal mr-2">{i + 1}</span>{s.name}</Link>
											<p className="text-xs text-gray-400 ml-5">{schoolPlace(s)} · {tx("{{n}} o'quvchi", { n: fmt(s.students) })} · {tx("{{n}} xodim", { n: fmt(s.staff) })} · {tx("{{n}} sinf", { n: fmt(s.classes) })}</p>
										</td>
										{COLS.map(c => <Cell key={c.key} s={s} c={c} avg={avgs[c.key] ?? null} />)}
										<td className="px-3 py-3 min-w-[170px]"><div className="flex flex-wrap gap-1">{s.strengths.map(x => <span key={x.key} title={`${x.value}% · o'rtacha ${x.avg}%`} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 text-green-700">{x.label}</span>)}{!s.strengths.length && <span className="text-gray-300">—</span>}</div></td>
										<td className="px-3 py-3 min-w-[170px]"><div className="flex flex-wrap gap-1">{s.weaknesses.map(x => <span key={x.key} title={`${x.value}% · o'rtacha ${x.avg}%`} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700">{x.label}</span>)}{!s.weaknesses.length && <span className="text-gray-300">—</span>}</div></td>
									</tr>
								))}
								{rows.length === 0 && <tr><td colSpan={9}><Empty text={tx("Topilmadi")} /></td></tr>}
								<tr className="bg-gray-50/70 text-xs text-gray-500"><td /><td className="px-3 py-2.5 font-semibold">{tx("Barcha maktablar o'rtachasi")}</td>{COLS.map(c => <td key={c.key} className="px-3 py-2.5 text-right font-semibold">{show(avgs[c.key] ?? null, c)}</td>)}<td colSpan={2} /></tr>
							</tbody>
						</table>
					</div>
				</Panel>
			</LoadState>
		</Page>
	)
}

export default MonitorSchools
