import { useMemo, useState } from 'react'
import { FiArrowDown, FiArrowUp, FiSearch } from 'react-icons/fi'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Crumbs, Formula, Kpi, barColor, tone, useGradeRange } from './MonitorGradeKit'
import { ChartBox, Empty, LoadState, Page, PageHeader, Panel, RangePicker, fmt, useMonitorData, usePanel, pctFmt } from './monitorKit'

// "Barcha sinflar" davomati qanday hisoblangani: darajalar yig'indisi (har biri o'z sahifasiga olib boradi)
const AllGrades = ({ range, qs }) => {
	const { base, scoped } = usePanel()
	const { data, loading, error } = useMonitorData('grades', range)
	return (
		<LoadState loading={loading && !data} error={error}>
			{data && (
				<div className="space-y-5">
					<Formula present={data.overallPresent} possible={data.overallPossible} note={`${data.schoolDays} o'quv kuni, barcha maktablar`} />
					<Panel title="Darajalar yig'indisi">
						<table className="w-full text-sm">
							<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Daraja', 'Sinflar', "O'quvchi", 'Kelgan kunlar', 'Mumkin kunlar', 'Davomat', 'Kech qolish'].map(h => <th key={h} className="py-2 pr-4 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
							<tbody>
								{data.grades.map(g => (
									<tr key={g.grade} className="border-b border-gray-50 hover:bg-blue-50/30">
										<td className="py-2.5 pr-4"><Link to={`/monitor/grades/${g.grade}${qs}`} className="font-semibold text-blue-700 hover:underline">{g.grade}-sinflar →</Link></td>
										<td className="py-2.5 pr-4">{fmt(g.classes)}</td><td className="py-2.5 pr-4">{fmt(g.students)}</td><td className="py-2.5 pr-4">{fmt(g.present)}</td><td className="py-2.5 pr-4">{fmt(g.possible)}</td>
										<td className="py-2.5 pr-4 font-semibold">{pctFmt(g.percent)}</td><td className="py-2.5 text-gray-600">{pctFmt(g.latePercent)}</td>
									</tr>
								))}
								<tr className="bg-gray-50/70 font-semibold"><td className="py-2.5 pr-4">Jami</td><td className="py-2.5 pr-4">{fmt(data.classCount)}</td><td className="py-2.5 pr-4">{fmt(data.grades.reduce((a, g) => a + g.students, 0))}</td><td className="py-2.5 pr-4">{fmt(data.overallPresent)}</td><td className="py-2.5 pr-4">{fmt(data.overallPossible)}</td><td className="py-2.5 pr-4">{data.overall}%</td><td /></tr>
							</tbody>
						</table>
					</Panel>
				</div>
			)}
		</LoadState>
	)
}

// Bitta daraja: barcha maktablarning shu darajadagi sinflari; har sinf o'z sahifasiga olib boradi
const GradeClasses = ({ grade, range, qs }) => {
	const { base, scoped } = usePanel()
	const navigate = useNavigate()
	const { data, loading, error } = useMonitorData('grades', { ...range, grade })
	const [query, setQuery] = useState('')
	const [dir, setDir] = useState('asc')
	const g = data?.grades?.[0]
	const avg = g?.percent ?? 0
	const classes = useMemo(() => {
		const text = query.trim().toLowerCase()
		return (data?.classes || []).filter(c => !text || `${c.schoolName} ${c.name}`.toLowerCase().includes(text))
			.sort((a, b) => ((a.percent ?? -1) - (b.percent ?? -1)) * (dir === 'asc' ? 1 : -1) || a.schoolName.localeCompare(b.schoolName))
	}, [data, query, dir])
	const classUrl = (c) => `/monitor/grades/${grade}/${c._id}${qs}`

	return (
		<LoadState loading={loading && !data} error={error} empty={data && !g}>
			{g && (
				<div className="space-y-5">
					<div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
						<Kpi to={`${base}/grades/all${qs}`} label="Davomat" value={`${pctFmt(g.percent)}`} sub={`${fmt(g.present)} ÷ ${fmt(g.possible)} kun`} />
						<Kpi label="Sinflar" value={fmt(g.classes)} sub={`${g.schools} ta maktabda`} />
						<Kpi label="O'quvchilar" value={fmt(g.students)} />
						<Kpi to={`${base}/late`} label="Kech qolish" value={`${pctFmt(g.latePercent)}`} sub={`${fmt(g.late)} marta`} cls="text-orange-600" />
						<Kpi label="O'quv kunlari" value={data.schoolDays} />
					</div>
					<Formula present={g.present} possible={g.possible} note={`${fmt(g.students)} o'quvchi, har biri o'z maktabining o'quv kunlari bo'yicha`} />
					<Panel title={`Kunlik davomat: ${grade}-sinflar (%)`}>
						<ChartBox height={200}><ResponsiveContainer width="100%" height="100%">
							<AreaChart data={g.daily.map(d => ({ kun: d.date.slice(5), Davomat: d.percent, kelgan: d.came, jami: d.possible }))} margin={{ left: -20, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
								<Tooltip formatter={(v, n, p) => [`${v}% (${fmt(p.payload.kelgan)} / ${fmt(p.payload.jami)})`, n]} />
								<Area type="monotone" dataKey="Davomat" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} isAnimationActive={false} />
							</AreaChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{[['Eng yaxshi sinf', g.best, 'text-green-600'], ['Eng past sinf', g.worst, 'text-red-600']].map(([label, c, cls]) => c && (
							<Link key={label} to={`/monitor/grades/${grade}/${c._id}${qs}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:border-blue-200 hover:shadow-md transition"><span className="text-xs text-gray-500">{label}</span><p className="font-semibold text-gray-900 truncate">{c.schoolName} · {c.name}</p><b className={`text-xl ${cls}`}>{pctFmt(c.percent)}</b></Link>
						))}
					</div>
					<Panel title={`${grade}-sinflar: barcha maktablar (${fmt(classes.length)})`} action={
						<div className="flex flex-wrap items-center gap-2">
							<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Maktab qidirish" className="pl-9 pr-3 h-10 rounded-lg border border-gray-200 text-sm text-black w-48" /></div>
							<button onClick={() => setDir(d => (d === 'asc' ? 'desc' : 'asc'))} className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{dir === 'asc' ? <FiArrowUp size={14} /> : <FiArrowDown size={14} />} Davomat</button>
						</div>}>
						<div className="overflow-x-auto">
							<table className="w-full text-sm">
								<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Maktab', 'Sinf', "O'quvchi", 'Davomat', 'Kelgan / mumkin', 'Kech qolish'].map(h => <th key={h} className="py-2 pr-4 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
								<tbody>
									{classes.map(c => (
										<tr key={c._id} onClick={() => navigate(classUrl(c))} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-blue-50/40">
											<td className="py-2.5 pr-4"><Link to={`/monitor/schools/${c.schoolId}`} onClick={e => e.stopPropagation()} className="text-gray-900 hover:text-blue-600">{c.schoolName}</Link></td>
											<td className="py-2.5 pr-4"><Link to={classUrl(c)} className="font-semibold text-blue-700 hover:underline">{c.name} →</Link></td>
											<td className="py-2.5 pr-4 text-gray-600">{c.students}</td>
											<td className="py-2.5 pr-4 min-w-[170px]"><div className="flex items-center gap-3"><div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${c.percent ?? 0}%`, background: barColor(c.percent, avg) }} /></div><b className={`w-14 text-right ${tone(c.percent, avg)}`}>{c.percent === null ? '—' : `${pctFmt(c.percent)}`}</b></div></td>
											<td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{fmt(c.present)} / {fmt(c.possible)}</td>
											<td className="py-2.5 text-gray-600">{c.latePercent === null ? '—' : `${pctFmt(c.latePercent)}`}</td>
										</tr>
									))}
									{classes.length === 0 && <tr><td colSpan={6}><Empty text="Sinf topilmadi" /></td></tr>}
								</tbody>
							</table>
						</div>
					</Panel>
				</div>
			)}
		</LoadState>
	)
}

const MonitorGradeDetail = () => {
	const { base, scoped } = usePanel()
	const { grade } = useParams()
	const { range, setRange, qs } = useGradeRange()
	const all = grade === 'all'
	return (
		<Page>
			<Crumbs items={[{ label: 'Umumiy statistika', to: `/monitor/grades${qs}` }, { label: all ? 'Barcha sinflar' : `${grade}-sinflar` }]} />
			<PageHeader />
			<div className="mb-5"><RangePicker {...range} onChange={setRange} /></div>
			{all ? <AllGrades range={range} qs={qs} /> : <GradeClasses grade={grade} range={range} qs={qs} />}
		</Page>
	)
}

export default MonitorGradeDetail
