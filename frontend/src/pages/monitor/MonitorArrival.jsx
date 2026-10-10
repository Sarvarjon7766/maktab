import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, Empty, Page, PageHeader, Panel, RangePicker, SchoolLink, SchoolSelect, SearchBox, matchText, exportXlsx, fmt, shiftDate, todayStr, useMonitorData } from './monitorKit'

const KINDS = [
	{ key: 'student', label: "O'quvchilar", color: CHART_COLORS.student },
	{ key: 'staff', label: 'Xodimlar', color: CHART_COLORS.staff }
]

// Kelish vaqti taqsimoti: 15 daqiqalik oraliqlarda birinchi kirishlar soni va maktablar bo'yicha o'rtacha kelish vaqti
const MonitorArrival = () => {
	const [schoolId, setSchoolId] = useState('')
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('arrival', { schoolId, ...range })
	const [q, setQ] = useState('')
	const { data: overview } = useMonitorData('overview', {})

	const download = () => exportXlsx(`kelish-vaqti-${range.from}_${range.to}`, KINDS.map(k => ({
		name: k.label, rows: (data?.[k.key]?.schools || []).map(s => ({ Maktab: s.schoolName, "O'rtacha kelish": s.avg, Kuzatuvlar: s.n }))
	})))

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<SearchBox value={q} onChange={setQ} placeholder="Maktab qidirish..." />
				<SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />
				<button onClick={download} disabled={!data} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>
			<div className="mb-6"><RangePicker {...range} onChange={setRange} /></div>
			{error && <Empty text="Ma'lumotni yuklab bo'lmadi" />}

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
				{KINDS.map(k => {
					const d = data?.[k.key]
					const peak = d?.buckets?.reduce((a, b) => (b.n > (a?.n || 0) ? b : a), null)
					return (
						<Panel key={k.key} title={`${k.label}: kelish vaqti`} action={peak ? <span className="text-xs text-gray-500">Eng gavjum: <b className="text-gray-800">{peak.time}</b> ({fmt(peak.n)})</span> : null}>
							{d?.buckets?.length ? (
								<ChartBox height={260}><ResponsiveContainer width="100%" height="100%">
									<BarChart data={d.buckets} margin={{ left: -12, right: 8 }}>
										<CartesianGrid strokeDasharray="3 3" vertical={false} />
										<XAxis dataKey="time" tick={{ fontSize: 10 }} interval={1} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
										<Tooltip formatter={v => [fmt(v), 'Kirishlar']} />
										<Bar dataKey="n" radius={[3, 3, 0, 0]} maxBarSize={22}>{d.buckets.map(b => <Cell key={b.time} fill={b === peak ? '#dc2626' : k.color} />)}</Bar>
									</BarChart>
								</ResponsiveContainer></ChartBox>
							) : <Empty text={loading ? 'Yuklanmoqda...' : "Bu davrda kirish qaydlari yo'q"} />}
						</Panel>
					)
				})}
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
				{KINDS.map(k => {
					const full = data?.[k.key]?.schools || []
					const list = full.filter(s => matchText(q, s.schoolName))
					return (
						<Panel key={k.key} title={`${k.label}: maktablar bo'yicha o'rtacha kelish`}>
							<div className="overflow-x-auto max-h-[420px]">
								<table className="w-full text-sm">
									<thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="py-2 pr-3 font-semibold">Maktab</th><th className="py-2 px-3 font-semibold text-right">O'rtacha</th><th className="py-2 pl-3 font-semibold text-right">Kuzatuv</th></tr></thead>
									<tbody>
										{list.map((s, i) => (
											<tr key={s.schoolId} className="border-b border-gray-50 last:border-0">
												<td className="py-2 pr-3"><SchoolLink id={s.schoolId} name={s.schoolName} tab={k.key === 'student' ? 'students' : 'staff'} className="text-sm" />{i === 0 && list.length > 1 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">Eng erta</span>}{i === list.length - 1 && list.length > 1 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 font-semibold">Eng kech</span>}</td>
												<td className="py-2 px-3 text-right font-semibold text-gray-900">{s.avg}</td>
												<td className="py-2 pl-3 text-right text-gray-500">{fmt(s.n)}</td>
											</tr>
										))}
										{!list.length && <tr><td colSpan={3}><Empty text={loading ? 'Yuklanmoqda...' : full.length ? 'Topilmadi' : "Ma'lumot yo'q"} /></td></tr>}
									</tbody>
								</table>
							</div>
						</Panel>
					)
				})}
			</div>
		</Page>
	)
}

export default MonitorArrival
