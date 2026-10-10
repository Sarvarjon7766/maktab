import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, LoadState, Page, PageHeader, Panel, RangePicker, Table, Td, Tr, fmt, shiftDate, todayStr, useMonitorData, pctFmt } from './monitorKit'

const MAX = 6

// Tanlangan (2–6 ta) maktabni davr bo'yicha yonma-yon solishtirish
const MonitorCompare = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [selected, setSelected] = useState([])
	const { data, loading, error, reload } = useMonitorData('schools-report', range)
	const all = data?.schools || []

	// Birinchi yuklanishda ma'lumoti bor dastlabki 3 ta maktabni tanlab qo'yamiz
	useEffect(() => {
		if (data && selected.length === 0) setSelected(all.filter(s => s.schoolDays > 0).slice(0, 3).map(s => s._id))
	}, [data])

	const toggle = (id) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : p.length >= MAX ? p : [...p, id])
	const picked = all.filter(s => selected.includes(s._id))
	const chart = [
		{ name: "O'quvchi davomati %", ...Object.fromEntries(picked.map(s => [s.name, s.studentPercent])) },
		{ name: 'Xodim davomati %', ...Object.fromEntries(picked.map(s => [s.name, s.staffPercent])) }
	]
	const palette = [CHART_COLORS.blue, CHART_COLORS.student, CHART_COLORS.staff, CHART_COLORS.ok, CHART_COLORS.bad, '#0891b2']

	const rows = [
		["O'quvchilar jami", s => fmt(s.studentTotal)], ["Kuniga o'rtacha kelgan o'quvchi", s => fmt(s.studentAvgCame)], ["O'quvchi davomati", s => `${pctFmt(s.studentPercent)}`],
		['Xodimlar jami', s => fmt(s.staffTotal)], ["Kuniga o'rtacha kelgan xodim", s => fmt(s.staffAvgCame)], ['Xodim davomati', s => `${pctFmt(s.staffPercent)}`],
		["O'quv kunlari", s => s.schoolDays], ["Kelmagan o'quvchi-kunlar", s => fmt(s.studentAbsentDays)],
		['Eng yaxshi kun', s => (s.best ? `${pctFmt(s.best.percent)} (${s.best.dateString})` : '—')], ['Eng yomon kun', s => (s.worst ? `${pctFmt(s.worst.percent)} (${s.worst.dateString})` : '—')]
	]

	return (
		<Page>
			<PageHeader title="Maktablarni solishtirish" subtitle={`Davr: ${range.from} — ${range.to} · ${MAX} tagacha maktab tanlang`} onReload={reload} loading={loading} />
			<div className="mb-6"><RangePicker {...range} onChange={setRange} /></div>

			<LoadState loading={loading && !data} error={error}>
				<Panel title="Maktablarni tanlang" subtitle={`Tanlandi: ${selected.length}/${MAX}`} className="mb-6">
					<div className="flex flex-wrap gap-2">
						{all.map(s => (
							<button key={s._id} onClick={() => toggle(s._id)}
								className={`px-3 py-1.5 rounded-full text-sm border ${selected.includes(s._id) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{s.name}</button>
						))}
					</div>
				</Panel>

				{picked.length === 0 ? <div className="rounded-xl bg-white border border-gray-100 p-10 text-center text-gray-500">Solishtirish uchun kamida bitta maktab tanlang</div> : <>
					<Panel title="Davomat foizi" className="mb-6">
						<ChartBox height={300}><ResponsiveContainer width="100%" height="100%">
							<BarChart data={chart} margin={{ left: -8, right: 12 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
								<Tooltip formatter={v => `${v}%`} /><Legend />
								{picked.map((s, i) => <Bar key={s._id} dataKey={s.name} fill={palette[i % palette.length]} maxBarSize={40} />)}
							</BarChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
					<Panel title="Yonma-yon jadval">
						<Table head={['Ko\'rsatkich', ...picked.map(s => ({ label: s.name, right: true }))]}>
							{rows.map(([label, fn]) => (
								<Tr key={label}><Td className="font-medium text-gray-900">{label}</Td>{picked.map(s => <Td key={s._id} right>{fn(s)}</Td>)}</Tr>
							))}
						</Table>
					</Panel>
				</>}
			</LoadState>
		</Page>
	)
}

export default MonitorCompare
