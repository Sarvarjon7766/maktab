import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Crumbs, Formula, Kpi, useGradeRange } from './MonitorGradeKit'
import { ChartBox, LoadState, Page, PageHeader, Panel, PersonLink, RangePicker, fmt, useMonitorData, usePanel, pctFmt } from './monitorKit'
import { tx } from '../../i18n'

// Bitta sinf: davomat qanday hisoblangani. Kunlik grafik -> kun bo'yicha ro'yxat -> har bir o'quvchi -> shaxs profili
const MonitorGradeClass = () => {
	const { base, scoped } = usePanel()
	const viewer = usePanel().api === 'viewer-stats'
	const { grade, sinfId } = useParams()
	const { range, setRange, qs } = useGradeRange()
	const { data, loading, error } = useMonitorData('grade-class', { sinfId, ...range })
	const [day, setDay] = useState(null)
	const c = data?.class

	const dayIdx = day && data ? data.days.indexOf(day) : -1
	const byMark = (fn) => (data ? data.students.filter(s => fn(s.marks[dayIdx])) : [])
	const sum = data ? data.students.reduce((a, s) => ({ present: a.present + s.present, late: a.late + s.late }), { present: 0, late: 0 }) : { present: 0, late: 0 }
	const possible = data ? data.students.length * data.schoolDays : 0

	return (
		<Page>
			<Crumbs items={[{ label: 'Umumiy statistika', to: `${base}/grades${qs}` }, { label: `${grade}-sinflar`, to: `${base}/grades/${grade}${qs}` }, { label: c ? `${c.schoolName} · ${c.name}` : 'Sinf' }]} />
			<PageHeader />
			<div className="mb-5"><RangePicker {...range} onChange={setRange} /></div>
			<LoadState loading={loading && !data} error={error}>
				{data && (
					<div className="space-y-5">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div><h1 className="text-2xl font-semibold text-gray-900">{c.name}</h1><p className="text-sm text-gray-500">{scoped ? <span>{c.schoolName}</span> : <Link to={`/monitor/schools/${c.schoolId}`} className="hover:text-blue-600">{c.schoolName}</Link>}{c.head ? ` · Sinf rahbari: ${c.head}` : ''}</p></div>
							<Link to={scoped ? `${base}/classrooms/${c._id}` : `/monitor/classrooms/${c.schoolId}/${c._id}?from=school`} className="text-sm font-medium text-blue-600 hover:underline">{tx("Sinfxona tahlili (kamera, jonli) →")}</Link>
						</div>
						<div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
							<Kpi label={tx("Davomat")} value={possible ? `${Math.round(sum.present / possible * 1000) / 10}%` : '—'} sub={`${fmt(sum.present)} ÷ ${fmt(possible)} kun`} />
							<Kpi label={tx("O'quvchilar")} value={data.students.length} />
							<Kpi label={tx("O'quv kunlari")} value={data.schoolDays} />
							<Kpi to={viewer ? undefined : `${base}/late`} label={tx("Kech qolgan")} value={`${fmt(sum.late)} marta`} cls="text-orange-600" />
							<Kpi to={viewer ? undefined : `${base}/risk`} label={tx("Kelmagan")} value={`${fmt(possible - sum.present)} kun`} cls="text-red-600" />
						</div>
						<Formula present={sum.present} possible={possible} note={`${data.students.length} o'quvchi × ${data.schoolDays} o'quv kuni`} />

						<Panel title={tx("Kunlik davomat")} action={<span className="text-xs text-gray-400">{tx("Ustunni bossangiz, shu kuni kim kelgani ko'rinadi")}</span>}>
							<ChartBox height={220}><ResponsiveContainer width="100%" height="100%">
								<ComposedChart data={data.daily.map(d => ({ kun: d.date.slice(5), date: d.date, Kelgan: d.came, 'Kech qolgan': d.late }))} margin={{ left: -20, right: 8 }} onClick={e => { const d = e?.activePayload?.[0]?.payload?.date; if (d) setDay(p => (p === d ? null : d)) }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} domain={[0, data.students.length]} tick={{ fontSize: 10 }} /><Tooltip />
									<Bar dataKey="Kelgan" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={22} cursor="pointer" isAnimationActive={false} />
									<Line type="monotone" dataKey="Kech qolgan" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
								</ComposedChart>
							</ResponsiveContainer></ChartBox>
							<p className="text-[11px] text-gray-400 mt-1">{tx("Ish boshlanishi: {{time}}. Undan keyin kelganlar \"kech qolgan\" hisoblanadi.", { time: data.workStartTime })}</p>
							{day && (
								<div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/40 p-4 text-sm space-y-1.5">
									<p className="font-semibold text-gray-800">{tx("{{day}}: {{n}} / {{total}} kelgan", { day, n: byMark(m => m > 0).length, total: data.students.length })}</p>
									{[['Kelmagan', byMark(m => m === 0), 'text-red-600'], ['Kech qolgan', byMark(m => m === 2), 'text-orange-600'], ['Vaqtida kelgan', byMark(m => m === 1), 'text-green-700']].map(([label, list, cls]) => (
										<p key={label} className="text-xs text-gray-600"><b className={cls}>{label} ({list.length}):</b> {list.length ? list.map((s, i) => <span key={s._id}>{i > 0 && ', '}<Link to={`${base}/people/student/${s._id}`} className="hover:text-blue-600 hover:underline">{s.fullName}</Link></span>) : '—'}</p>
									))}
								</div>
							)}
						</Panel>

						<Panel title={`O'quvchilar (${data.students.length})`} action={<span className="text-xs text-gray-400">{tx("Nomini bossangiz, to'liq profili ochiladi")}</span>}>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{["O'quvchi", 'Kunlar', 'Keldi', 'Kelmadi', 'Kech', 'Davomat'].map(h => <th key={h} className="py-2 pr-4 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
									<tbody>
										{data.students.map(s => (
											<tr key={s._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
												<td className="py-2 pr-4"><PersonLink kind="student" id={s._id} name={s.fullName} sub={s.code} photo={s.photo} /></td>
												<td className="py-2 pr-4"><div className="flex gap-0.5">{s.marks.map((m, i) => <i key={i} title={`${data.days[i]}: ${['kelmagan', 'keldi', 'kech qoldi'][m]}`} className={`block w-2 h-4 rounded-sm ${['bg-red-300', 'bg-green-400', 'bg-orange-400'][m]}`} />)}</div></td>
												<td className="py-2 pr-4 text-green-700">{s.present}</td><td className="py-2 pr-4 text-red-600">{s.absent}</td><td className="py-2 pr-4 text-orange-600">{s.late}</td>
												<td className="py-2 font-semibold text-gray-900">{s.percent === null ? '—' : `${pctFmt(s.percent)}`}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
							<p className="text-xs text-gray-400 mt-3">{tx("Yashil: keldi · to'q sariq: kech qoldi · qizil: kelmadi (kunlar chapdan o'ngga)")}</p>
						</Panel>
					</div>
				)}
			</LoadState>
		</Page>
	)
}

export default MonitorGradeClass
