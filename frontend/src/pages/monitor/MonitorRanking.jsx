import { useMemo, useState } from 'react'
import { FiArrowRight, FiSearch } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, Drawer, Empty, Page, PageHeader, Panel, Progress, RangePicker, Segmented, WEEKDAYS, exportXlsx, fmt, levelText, pct, schoolPlace, shiftDate, todayStr, useMonitorData, pctFmt } from './monitorKit'
import { tx } from '../../i18n'

// Maktablar reytingi. Har qator bosilganda "tafsilot" paneli ochiladi: raqam qanday hisoblangani, kunma-kun
// ma'lumot va manba ro'yxatlariga (kelmaganlar, xodimlar) havolalar
const MonitorRanking = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [kind, setKind] = useState('student')
	const [query, setQuery] = useState('')
	const [evidence, setEvidence] = useState(null)
	const { data, loading, error, reload } = useMonitorData('schools-report', range)
	const trend = useMonitorData('trend', { ...range, schoolId: evidence?._id }, { skip: !evidence })

	const ranked = useMemo(() => (data?.schools || []).filter(s => s.schoolDays > 0)
		.map(s => ({ ...s, percent: s[`${kind}Percent`], avg: s[`${kind}AvgCame`], total: s[`${kind}Total`] }))
		.sort((a, b) => b.percent - a.percent).map((s, i) => ({ ...s, rank: i + 1 })), [data, kind])
	const shown = ranked.filter(s => !query || `${s.name} ${s.region || ''} ${s.district || ''}`.toLowerCase().includes(query.toLowerCase()))
	const noData = (data?.schools || []).filter(s => s.schoolDays === 0)
	const chartOf = (list) => list.map(s => ({ name: s.name, Foiz: s.percent }))

	const download = () => exportXlsx(`reyting-${range.from}_${range.to}`, [{
		name: 'Reyting',
		rows: ranked.map(s => ({ "O'rin": s.rank, Maktab: s.name, Hudud: schoolPlace(s), "O'quv kunlari": s.schoolDays, Jami: s.total, "Kuniga o'rtacha kelgan": s.avg, 'Davomat %': s.percent }))
	}])

	// Tafsilot paneli: tanlangan maktab uchun kunma-kun raqamlar
	const days = (trend.data?.days || []).filter(d => d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0))
	const camKey = kind === 'student' ? 'studentCame' : 'staffCame'
	const pctKey = kind === 'student' ? 'studentPercent' : 'staffPercent'
	const totalKey = kind === 'student' ? 'studentTotal' : 'staffTotal'
	const sumCame = days.reduce((a, d) => a + d[camKey], 0)
	const denom = (trend.data?.[totalKey] || 0) * days.length
	const bestDay = [...days].sort((a, b) => b[pctKey] - a[pctKey])[0]
	const worstDay = [...days].sort((a, b) => a[pctKey] - b[pctKey])[0]
	const listKind = kind === 'student' ? 'student' : 'staff'

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<Segmented value={kind} onChange={setKind} options={[{ key: 'student', label: "O'quvchilar" }, { key: 'staff', label: 'Xodimlar' }]} />
				<button onClick={download} disabled={!ranked.length} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{tx("Excel")}</button>
			</PageHeader>
			<div className="mb-6"><RangePicker {...range} onChange={setRange} /></div>
			{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
				{[['Eng yuqori davomatli 10 ta', ranked.slice(0, 10), CHART_COLORS.ok], ['Eng past davomatli 10 ta', [...ranked].reverse().slice(0, 10), CHART_COLORS.bad]].map(([title, list, color]) => (
					<Panel key={title} title={title}>
						<ChartBox><ResponsiveContainer width="100%" height="100%">
							<BarChart data={chartOf(list)} layout="vertical" margin={{ left: 10, right: 16 }} onClick={e => { const s = ranked.find(x => x.name === e?.activeLabel); if (s) setEvidence(s) }}>
								<CartesianGrid strokeDasharray="3 3" horizontal={false} />
								<XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
								<YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
								<Tooltip formatter={v => `${v}%`} />
								<Bar dataKey="Foiz" fill={color} radius={[0, 5, 5, 0]} maxBarSize={20} cursor="pointer" />
							</BarChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
				))}
			</div>

			<div className="relative w-full sm:w-80 mb-4">
				<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
				<input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx("Maktab yoki hudud")} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400" />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{["O'rin", 'Maktab', 'Davomat', { t: "O'q. kunlari", r: 1 }, { t: "Kuniga o'rtacha", r: 1 }, { t: 'Eng yaxshi', r: 1 }, { t: 'Eng yomon', r: 1 }, ''].map((h, i) => <th key={i} className={`px-4 py-3 font-semibold whitespace-nowrap ${h.r ? 'text-right' : ''}`}>{h.t || h}</th>)}
						</tr></thead>
						<tbody>
							{shown.map(s => (
								<tr key={s._id} onClick={() => setEvidence(s)} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 cursor-pointer">
									<td className="px-4 py-2.5"><span className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-xs font-bold ${s.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{s.rank}</span></td>
									<td className="px-4 py-2.5"><p className="font-medium text-gray-900">{s.name}</p><p className="text-xs text-gray-500">{schoolPlace(s)}</p></td>
									<td className="px-4 py-2.5"><Progress present={s.avg} total={s.total} percent={s.percent} /></td>
									<td className="px-4 py-2.5 text-right">{s.schoolDays}</td><td className="px-4 py-2.5 text-right">{fmt(s.avg)}</td>
									<td className="px-4 py-2.5 text-right text-green-600">{s.best ? `${pctFmt(s.best.percent)} · ${s.best.dateString.slice(5)}` : '—'}</td>
									<td className="px-4 py-2.5 text-right text-red-600">{s.worst ? `${pctFmt(s.worst.percent)} · ${s.worst.dateString.slice(5)}` : '—'}</td>
									<td className="px-4 py-2.5 text-right text-blue-600 whitespace-nowrap">{tx("Batafsil")} <FiArrowRight className="inline" size={13} /></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && ranked.length === 0 && !error && <Empty text={tx("Bu davrda davomat ma'lumoti yo'q")} />}
			</div>
			{noData.length > 0 && <p className="text-xs text-gray-500 mt-4">{tx("Ma'lumot kelmagan maktablar: {{names}}", { names: noData.map(s => s.name).join(', ') })}</p>}

			<Drawer open={!!evidence} onClose={() => setEvidence(null)} title={evidence?.name} subtitle={`${range.from} — ${range.to} · ${kind === 'student' ? "O'quvchilar" : 'Xodimlar'}`}>
				{evidence && <>
					<div className="rounded-2xl bg-slate-50 border border-slate-100 p-5 mb-5">
						<div className="flex items-end justify-between gap-3">
							<div><p className="text-xs text-gray-500">{tx("Davomat")}</p><p className={`text-4xl font-bold ${levelText(evidence.percent)}`}>{pctFmt(evidence.percent)}</p></div>
							<p className="text-right text-xs text-gray-500">{tx("O'rin:")} <b className="text-gray-800">{evidence.rank}</b> / {ranked.length}</p>
						</div>
						<p className="mt-4 text-sm text-gray-600 font-mono leading-relaxed">
							{tx("{{came}} kelgan kishi-kun ÷ ({{total}} {{unit}} × {{days}} o'quv kuni = {{denom}}) = {{pct}}%", { came: fmt(sumCame), total: fmt(trend.data?.[totalKey] || 0), unit: kind === 'student' ? tx("o'quvchi") : tx("xodim"), days: days.length, denom: fmt(denom), pct: pct(sumCame, denom) })}
						</p>
					</div>

					<div className="flex flex-wrap gap-2 mb-5">
						<Link to={`/monitor/schools/${evidence._id}?tab=${kind === 'student' ? 'students' : 'staff'}`} className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800">{tx("Maktabni ochish")}</Link>
						{worstDay && <Link to={`/monitor/lists?kind=${listKind}&status=absent&school=${evidence._id}&date=${worstDay.dateString}`} className="px-3.5 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50">{tx("Eng yomon kun kelmaganlari ({{date}})", { date: worstDay.dateString.slice(5) })}</Link>}
					</div>

					<h3 className="text-sm font-semibold text-gray-900 mb-2">{tx("Kunma-kun")}</h3>
					{trend.loading && !trend.data ? <Empty text={tx("Yuklanmoqda...")} /> : (
						<div className="border border-gray-100 rounded-xl overflow-hidden">
							<table className="w-full text-sm">
								<thead className="bg-gray-50"><tr className="text-left text-xs uppercase tracking-wide text-gray-500"><th className="px-3 py-2 font-semibold">{tx("Sana")}</th><th className="px-3 py-2 font-semibold text-right">{tx("Kelgan")}</th><th className="px-3 py-2 font-semibold text-right">%</th><th className="px-3 py-2" /></tr></thead>
								<tbody>
									{[...days].reverse().map(d => (
										<tr key={d.dateString} className="border-t border-gray-50">
											<td className="px-3 py-2 whitespace-nowrap">{d.dateString} <span className="text-xs text-gray-400">{WEEKDAYS[d.weekday].slice(0, 3)}</span>{d === bestDay && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 font-semibold">{tx("Eng yaxshi")}</span>}{d === worstDay && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">{tx("Eng yomon")}</span>}</td>
											<td className="px-3 py-2 text-right">{fmt(d[camKey])}</td>
											<td className={`px-3 py-2 text-right font-semibold ${levelText(d[pctKey])}`}>{d[pctKey]}%</td>
											<td className="px-3 py-2 text-right"><Link to={`/monitor/lists?kind=${listKind}&status=absent&school=${evidence._id}&date=${d.dateString}`} className="text-xs text-blue-600 hover:underline whitespace-nowrap">{tx("Kelmaganlar")}</Link></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>}
			</Drawer>
		</Page>
	)
}

export default MonitorRanking
