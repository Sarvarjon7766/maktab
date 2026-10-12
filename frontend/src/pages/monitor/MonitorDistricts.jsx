import { tx } from '../../i18n'
import { useMemo, useState } from 'react'
import { FaChalkboardTeacher, FaLandmark, FaSchool, FaUserGraduate, FaVideo } from 'react-icons/fa'
import { FiArrowDown, FiArrowUp } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartBox, KpiLink, LoadState, Page, PageHeader, Panel, RangePicker, SearchBox, Table, Td, Tr, fmt, matchText, levelColor, levelText, shiftDate, todayStr, useMonitorData } from './monitorKit'

const COLS = [
	{ key: 'rank', label: "O'rin" },
	{ key: 'name', label: 'Tuman' },
	{ key: 'schools', label: 'Maktablar', right: true },
	{ key: 'students', label: "O'quvchilar", right: true },
	{ key: 'studentPeriod', label: 'Davomat (davr)', right: true },
	{ key: 'studentToday', label: 'Bugun', right: true },
	{ key: 'staffPeriod', label: 'Xodimlar', right: true },
	{ key: 'latePercent', label: 'Kech qolish', right: true },
	{ key: 'cameraPercent', label: 'Kameralar', right: true },
]
const bar = (p) => (p === null || p === undefined ? '#cbd5e1' : p >= 85 ? '#16a34a' : p >= 60 ? '#f59e0b' : '#dc2626')
const val = (v, unit = '%') => (v === null || v === undefined ? '—' : `${v}${unit}`)

// Viloyat paneli: tumanlar kesimida solishtirish: davr bo'yicha davomat, bugungi holat, kech qolish, kameralar
const hub = (name, tab) => `/monitor/districts/${encodeURIComponent(name)}${tab ? `?tab=${tab}` : ''}`

const MonitorDistricts = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('districts', range, { auto: true })
	const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })
	const [query, setQuery] = useState('')

	const rows = useMemo(() => {
		const list = (data?.rows || []).filter(r => matchText(query, r.name))
		const { key, dir } = sort
		return [...list].sort((a, b) => {
			const x = a[key] ?? (dir === 'asc' ? Infinity : -Infinity), y = b[key] ?? (dir === 'asc' ? Infinity : -Infinity)
			const c = typeof x === 'string' ? x.localeCompare(y, 'uz') : x - y
			return (dir === 'asc' ? c : -c) || a.name.localeCompare(b.name, 'uz')
		})
	}, [data, query, sort])
	const toggle = (key) => setSort(s => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'rank' || key === 'latePercent' ? 'asc' : 'desc' }))

	const t = data?.totals
	const ranked = (data?.rows || []).filter(r => r.studentPeriod !== null)
	const best = ranked[0], worst = ranked.length > 1 ? ranked[ranked.length - 1] : null
	const chart = ranked.map(r => ({ name: r.name, Foiz: r.studentPeriod }))

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<RangePicker from={range.from} to={range.to} onChange={setRange} />
			</PageHeader>

			<LoadState loading={loading && !data} error={error ? "Bu bo'lim faqat viloyat monitori uchun" : null}>
				{t && (
					<>
						<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
							<KpiLink icon={<FaLandmark />} label={tx("Tumanlar")} value={t.districts} detail={tx("{{n}} ta maktab", { n: fmt(t.schools) })} color="bg-blue-50 text-blue-600" />
							<KpiLink to="/monitor/schools" icon={<FaSchool />} label={tx("Maktablar")} value={t.schools} detail={tx("viloyat bo'yicha")} />
							<KpiLink to="/monitor/students" icon={<FaUserGraduate />} color="bg-amber-50 text-amber-600" label={tx("O'quvchi davomati")} value={val(t.studentPeriod)} detail={tx("bugun {{a}} · {{b}}/{{c}}", { a: val(t.studentToday), b: fmt(t.studentCame), c: fmt(t.students) })} />
							<KpiLink to="/monitor/staff" icon={<FaChalkboardTeacher />} color="bg-violet-50 text-violet-600" label={tx("Xodimlar bugun")} value={val(t.staff ? Math.round((t.staffCame / t.staff) * 1000) / 10 : null)} detail={`${fmt(t.staffCame)}/${fmt(t.staff)}`} />
							<KpiLink to="/monitor/cameras" icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("Kameralar online")} value={`${fmt(t.cameraOnline)}/${fmt(t.cameraTotal)}`} detail={tx("kech qolganlar: {{n}}", { n: fmt(t.studentLate) })} />
						</div>

						<div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
							<Panel title={tx("O'quvchilar davomati: tumanlar")} subtitle={tx("Tanlangan davr bo'yicha o'rtacha foiz")}>
								{chart.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">{tx("Tanlangan davrda davomat ma'lumoti yo'q")}</p> : (
									<ChartBox height={Math.max(260, chart.length * 30)}>
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={chart} layout="vertical" margin={{ left: 8, right: 28 }}>
												<CartesianGrid strokeDasharray="3 3" horizontal={false} />
												<XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
												<YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
												<Tooltip formatter={v => `${v}%`} />
												<Bar dataKey="Foiz" name={tx("Foiz")} radius={[0, 6, 6, 0]} maxBarSize={20} label={{ position: 'right', fontSize: 11, formatter: v => `${v}%` }}>
													{chart.map(c => <Cell key={c.name} fill={bar(c.Foiz)} />)}
												</Bar>
											</BarChart>
										</ResponsiveContainer>
									</ChartBox>
								)}
							</Panel>

							<div className="space-y-4">
								{best && <Link to={hub(best.name)} className="block rounded-2xl border border-green-200 bg-green-50/60 p-5 transition hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wide text-green-700">{tx("Eng yaxshi tuman")}</p><p className="mt-1 text-xl font-bold text-slate-900">{best.name}</p><p className="mt-1 text-sm text-slate-600">{tx("Davomat {{p}} · {{s}} ta maktab · {{n}} o'quvchi", { p: `${best.studentPeriod}%`, s: best.schools, n: fmt(best.students) })}</p></Link>}
								{worst && <Link to={hub(worst.name)} className="block rounded-2xl border border-red-200 bg-red-50/60 p-5 transition hover:shadow-md"><p className="text-xs font-semibold uppercase tracking-wide text-red-700">{tx("Eng past tuman")}</p><p className="mt-1 text-xl font-bold text-slate-900">{worst.name}</p><p className="mt-1 text-sm text-slate-600">{tx("Davomat {{p}} · {{s}} ta maktab · {{n}} o'quvchi", { p: `${worst.studentPeriod}%`, s: worst.schools, n: fmt(worst.students) })}</p></Link>}
								<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-semibold text-slate-800">{tx("Ma'lumot to'liqligi")}</p><p className="mt-1 text-sm text-slate-500">{tx("Xaritada belgilangan maktablar: {{a}} / {{b}}. Maktab adminlari joylashuvni «Sozlamalar»da belgilaydi.", { a: fmt((data.rows || []).reduce((a, r) => a + r.located, 0)), b: fmt(t.schools) })}</p><Link to="/monitor/map" className="mt-3 inline-block text-sm font-medium text-blue-600 hover:underline">{tx("Xaritada ko'rish →")}</Link></div>
							</div>
						</div>

						<Panel title={tx("Tumanlar jadvali")} action={<SearchBox value={query} onChange={setQuery} placeholder={tx("Tuman qidirish")} />}>
							<Table head={COLS.map(c => ({ label: <button onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 font-bold uppercase tracking-wider hover:text-slate-800">{c.label}{sort.key === c.key && (sort.dir === 'asc' ? <FiArrowUp size={11} /> : <FiArrowDown size={11} />)}</button>, right: c.right }))}>
								{rows.map(r => (
									<Tr key={r.name}>
										<Td><span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${r.rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{r.rank ?? '—'}</span></Td>
										<Td><Link to={`/monitor/schools?district=${encodeURIComponent(r.name)}`} className="font-semibold text-slate-900 hover:text-blue-600">{r.name}</Link></Td>
										<Td right>{r.schools}{r.located < r.schools && <span className="ml-1 text-[10px] text-amber-600" title={tx("Xaritada belgilanmagan maktablar bor")}>·{r.schools - r.located}</span>}</Td>
										<Td right>{fmt(r.students)}</Td>
										<Td right>{r.studentPeriod === null ? <span className="text-slate-300">—</span> : <div className="ml-auto w-32"><div className="mb-1 text-right text-xs font-semibold"><span className={levelText(r.studentPeriod)}>{r.studentPeriod}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${levelColor(r.studentPeriod)}`} style={{ width: `${Math.min(r.studentPeriod, 100)}%` }} /></div></div>}</Td>
										<Td right><b className={r.students ? levelText(r.studentToday) : 'text-slate-300'}>{r.students ? `${r.studentToday}%` : '—'}</b></Td>
										<Td right>{val(r.staffPeriod)}</Td>
										<Td right><span className={r.latePercent > 15 ? 'font-semibold text-red-600' : 'text-slate-700'}>{val(r.latePercent)}</span></Td>
										<Td right>{r.cameraTotal ? <span className={r.cameraPercent < 80 ? 'font-semibold text-red-600' : 'text-slate-700'}>{r.cameraOnline}/{r.cameraTotal}</span> : <span className="text-slate-300">{tx("yo'q")}</span>}</Td>
									</Tr>
								))}
								{rows.length === 0 && <tr><td colSpan={COLS.length} className="px-4 py-10 text-center text-slate-500">{tx("Topilmadi")}</td></tr>}
							</Table>
						</Panel>
					</>
				)}
			</LoadState>
		</Page>
	)
}

export default MonitorDistricts
