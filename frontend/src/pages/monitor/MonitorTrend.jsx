import { useMemo, useState } from 'react'
import AutoSelect from '../../components/AutoSelect'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, LoadState, Page, PageHeader, Panel, RangePicker, KpiLink, Table, Td, Tr, WEEKDAYS, exportXlsx, fmt, shiftDate, todayStr, useMonitorData, usePanel, pctFmt } from './monitorKit'
import { FaCalendarCheck, FaChartLine, FaTrophy } from 'react-icons/fa'

const MonitorTrend = () => {
	const { scoped } = usePanel()
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [schoolId, setSchoolId] = useState('')
	const { data: overview } = useMonitorData('overview', {}, { skip: scoped })
	const { data, loading, error, reload } = useMonitorData('trend', { ...range, schoolId })

	// Yakshanba va hech kim kelmagan kunlar o'quv kuni emas
	const days = useMemo(() => (data?.days || []).map(d => ({ ...d, label: d.dateString.slice(5), school: d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0) })), [data])
	const schoolDays = days.filter(d => d.school)
	const avg = (k) => schoolDays.length ? Math.round(schoolDays.reduce((a, d) => a + d[k], 0) / schoolDays.length * 10) / 10 : 0
	const best = [...schoolDays].sort((a, b) => b.studentPercent - a.studentPercent)[0]
	const worst = [...schoolDays].sort((a, b) => a.studentPercent - b.studentPercent)[0]

	const byWeekday = useMemo(() => {
		const acc = WEEKDAYS.map((name) => ({ name, n: 0, student: 0, staff: 0 }))
		schoolDays.forEach(d => { const w = acc[d.weekday]; w.n++; w.student += d.studentPercent; w.staff += d.staffPercent })
		return acc.filter(w => w.n).map(w => ({ name: w.name, "O'quvchilar": Math.round(w.student / w.n * 10) / 10, Xodimlar: Math.round(w.staff / w.n * 10) / 10 }))
	}, [schoolDays])

	const download = () => exportXlsx(`dinamika-${range.from}_${range.to}`, [{
		name: 'Kunlik dinamika',
		rows: days.map(d => ({ Sana: d.dateString, Hafta_kuni: WEEKDAYS[d.weekday], "O'quvchi kelgan": d.studentCame, "O'quvchi %": d.studentPercent, 'Xodim kelgan': d.staffCame, 'Xodim %': d.staffPercent }))
	}])

	return (
		<Page>
			<PageHeader title="Kunlik dinamika" subtitle="Tanlangan davr bo'yicha kunma-kun davomat" onReload={reload} loading={loading}>
				{!scoped && <AutoSelect value={schoolId} onChange={e => setSchoolId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white max-w-[240px]">
					<option value="">Barcha maktablar</option>
					{(overview?.schools || []).map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
				</AutoSelect>}
				<button onClick={download} disabled={!days.length} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>
			<div className="mb-6"><RangePicker {...range} onChange={setRange} /></div>

			<LoadState loading={loading && !data} error={error}>
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
					<KpiLink icon={<FaCalendarCheck />} label="O'quv kunlari" value={schoolDays.length} detail={`${days.length} kunlik davrda`} />
					<KpiLink to={scoped ? undefined : '/monitor/students'} icon={<FaChartLine />} color="bg-amber-50 text-amber-600" label="O'rtacha o'quvchi davomati" value={`${avg('studentPercent')}%`} detail={`Jami ${fmt(data?.studentTotal)} o'quvchi`} />
					<KpiLink to={scoped ? undefined : '/monitor/staff'} icon={<FaChartLine />} color="bg-violet-50 text-violet-600" label="O'rtacha xodim davomati" value={`${avg('staffPercent')}%`} detail={`Jami ${fmt(data?.staffTotal)} xodim`} />
					<KpiLink to={!scoped && best ? `/monitor/lists?kind=student&date=${best.dateString}${schoolId ? `&school=${schoolId}` : ''}` : undefined} icon={<FaTrophy />} color="bg-green-50 text-green-600" label="Eng yaxshi kun" value={best ? `${pctFmt(best.studentPercent)}` : '—'} detail={best ? `${best.dateString} · eng past: ${pctFmt(worst.studentPercent)} (${worst.dateString})` : ''} />
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
					<Panel title="O'quvchilar davomati (%)" subtitle="Kunlar bo'yicha">
						<ChartBox><ResponsiveContainer width="100%" height="100%">
							<AreaChart data={days} margin={{ left: -12, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
								<Tooltip formatter={v => `${v}%`} />
								<Area type="monotone" dataKey="studentPercent" name="O'quvchilar" stroke={CHART_COLORS.student} fill={CHART_COLORS.student} fillOpacity={0.2} />
							</AreaChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
					<Panel title="Xodimlar davomati (%)" subtitle="Kunlar bo'yicha">
						<ChartBox><ResponsiveContainer width="100%" height="100%">
							<AreaChart data={days} margin={{ left: -12, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
								<Tooltip formatter={v => `${v}%`} />
								<Area type="monotone" dataKey="staffPercent" name="Xodimlar" stroke={CHART_COLORS.staff} fill={CHART_COLORS.staff} fillOpacity={0.2} />
							</AreaChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
					<Panel title="Kelganlar soni" subtitle="O'quvchi va xodimlar">
						<ChartBox><ResponsiveContainer width="100%" height="100%">
							<BarChart data={days} margin={{ left: -12, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
								<Tooltip /><Legend />
								<Bar dataKey="studentCame" name="O'quvchilar" fill={CHART_COLORS.student} maxBarSize={22} />
								<Bar dataKey="staffCame" name="Xodimlar" fill={CHART_COLORS.staff} maxBarSize={22} />
							</BarChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
					<Panel title="Hafta kunlari bo'yicha o'rtacha davomat" subtitle="Qaysi kunlari davomat pastroq">
						<ChartBox><ResponsiveContainer width="100%" height="100%">
							<BarChart data={byWeekday} margin={{ left: -12, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
								<Tooltip formatter={v => `${v}%`} /><Legend />
								<Bar dataKey="O'quvchilar" fill={CHART_COLORS.student} maxBarSize={28} />
								<Bar dataKey="Xodimlar" fill={CHART_COLORS.staff} maxBarSize={28} />
							</BarChart>
						</ResponsiveContainer></ChartBox>
					</Panel>
				</div>

				<Panel title="Kunlik jadval">
					<Table head={['Sana', 'Hafta kuni', { label: "O'quvchi kelgan", right: true }, { label: "O'quvchi %", right: true }, { label: 'Xodim kelgan', right: true }, { label: 'Xodim %', right: true }]}>
						{[...days].reverse().map(d => (
							<Tr key={d.dateString}>
								<Td className="whitespace-nowrap">{d.dateString}</Td><Td>{WEEKDAYS[d.weekday]}{!d.school && <span className="ml-2 text-xs text-gray-400">dam olish / ma'lumot yo'q</span>}</Td>
								<Td right>{fmt(d.studentCame)}</Td><Td right>{pctFmt(d.studentPercent)}</Td><Td right>{fmt(d.staffCame)}</Td><Td right>{pctFmt(d.staffPercent)}</Td>
							</Tr>
						))}
					</Table>
				</Panel>
			</LoadState>
		</Page>
	)
}

export default MonitorTrend
