import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { barColor, tone, useGradeRange } from './MonitorGradeKit'
import { ChartBox, LoadState, Page, PageHeader, Panel, RangePicker, fmt, useMonitorData, usePanel, pctFmt } from './monitorKit'

const GRADES = Array.from({ length: 11 }, (_, i) => i + 1)

// Umumiy statistika: sinf darajalari. Har karta o'z sahifasiga olib boradi: daraja -> sinflar -> o'quvchilar -> profil
const MonitorGrades = () => {
	const { range, setRange, qs } = useGradeRange()
	const navigate = useNavigate()
	const { base } = usePanel()
	const { data, loading, error, reload } = useMonitorData('grades', range)

	const overall = data?.overall ?? 0
	const byGrade = useMemo(() => new Map((data?.grades || []).map(g => [g.grade, g])), [data])
	const rows = GRADES.map(g => byGrade.get(g) || { grade: g, classes: 0, students: 0, percent: null, latePercent: null })
	const scored = rows.filter(r => r.percent !== null)
	const best = [...scored].sort((a, b) => b.percent - a.percent)[0]
	const worst = [...scored].sort((a, b) => a.percent - b.percent)[0]
	const chart = rows.map(r => ({ name: `${r.grade}-sinf`, grade: r.grade, Davomat: r.percent }))

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading} />
			<div className="mb-5"><RangePicker {...range} onChange={setRange} /></div>

			<LoadState loading={loading && !data} error={error} empty={data && data.grades.length === 0}>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
					<Link to={`${base}/grades/all${qs}`} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:border-blue-200 hover:shadow-md transition"><p className="text-xs text-gray-500">Barcha sinflar o'rtacha davomati</p><p className="text-3xl font-bold text-gray-900 mt-1">{overall}%</p><p className="text-xs text-gray-400 mt-1">{fmt(data?.overallPresent)} ÷ {fmt(data?.overallPossible)} kun · {fmt(data?.classCount)} sinf · qanday hisoblangani →</p></Link>
					{[['Eng yuqori davomatli daraja', best, 'text-green-600', 'hover:border-green-200'], ['Eng past davomatli daraja', worst, 'text-red-600', 'hover:border-red-200']].map(([label, g, cls, hov]) => (
						g ? <Link key={label} to={`${base}/grades/${g.grade}${qs}`} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition ${hov}`}><p className="text-xs text-gray-500">{label}</p><p className={`text-3xl font-bold mt-1 ${cls}`}>{g.grade}-sinflar</p><p className="text-xs text-gray-400 mt-1">{pctFmt(g.percent)} · sinflarini ko'rish →</p></Link>
							: <div key={label} className="bg-white rounded-2xl border border-gray-100 p-5"><p className="text-xs text-gray-500">{label}</p><p className="text-3xl font-bold text-gray-300 mt-1">—</p></div>
					))}
				</div>

				<Panel title="Sinf darajalari bo'yicha davomat (%)" className="mb-6" action={<span className="text-xs text-gray-400">Ustunni bossangiz, shu darajaning sahifasi ochiladi</span>}>
					<ChartBox height={260}><ResponsiveContainer width="100%" height="100%">
						<BarChart data={chart} margin={{ left: -12, right: 8 }} onClick={e => { const g = e?.activePayload?.[0]?.payload?.grade; if (g && byGrade.has(g)) navigate(`${base}/grades/${g}${qs}`) }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => (v === null ? '—' : `${v}%`)} />
							<Bar dataKey="Davomat" radius={[5, 5, 0, 0]} maxBarSize={44} cursor="pointer" isAnimationActive={false}>{chart.map(c => <Cell key={c.grade} fill={barColor(c.Davomat, overall)} />)}</Bar>
						</BarChart>
					</ResponsiveContainer></ChartBox>
				</Panel>

				<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-4">
					{rows.map(r => {
						const card = (
							<>
								<div className="flex items-start justify-between gap-2"><p className="font-semibold text-gray-900">{r.grade}-sinflar</p><span className={`text-xl font-bold ${tone(r.percent, overall)}`}>{r.percent === null ? '—' : `${pctFmt(r.percent)}`}</span></div>
								<p className="text-xs text-gray-500 mt-1">{r.classes ? `${fmt(r.classes)} sinf · ${fmt(r.students)} o'quvchi` : "Sinf yo'q"}</p>
								{r.percent !== null && (
									<>
										<div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-3"><div className="h-full rounded-full" style={{ width: `${pctFmt(r.percent)}`, background: barColor(r.percent, overall) }} /></div>
										<p className="text-[11px] text-gray-400 mt-2">{fmt(r.present)} ÷ {fmt(r.possible)} kun · kech qolish {pctFmt(r.latePercent)}</p>
									</>
								)}
							</>
						)
						return r.classes
							? <Link key={r.grade} to={`${base}/grades/${r.grade}${qs}`} className="block rounded-2xl border border-gray-100 bg-white shadow-sm p-4 hover:border-blue-200 hover:shadow-md transition">{card}</Link>
							: <div key={r.grade} className="rounded-2xl border border-gray-100 bg-white p-4 opacity-50">{card}</div>
					})}
				</div>
			</LoadState>
		</Page>
	)
}

export default MonitorGrades
