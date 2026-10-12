// O'quvchilar / Xodimlar davomati — bitta komponent, `kind` bo'yicha farqlanadi
import AutoSelect from '../../components/AutoSelect'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, DateField, LoadState, Page, PageHeader, Panel, Progress, SearchBox, KpiLink, Table, Td, Tr, exportXlsx, fmt, pct, schoolPlace, todayStr, useMonitorData, usePanel } from './monitorKit'
import { FaCheckCircle, FaClock, FaDoorOpen, FaUserTimes } from 'react-icons/fa'

const CONFIG = {
	students: { title: "O'quvchilar davomati", noun: "o'quvchi", key: 'student', color: CHART_COLORS.student },
	staff: { title: 'Xodimlar davomati', noun: 'xodim', key: 'staff', color: CHART_COLORS.staff }
}

const MonitorAttendance = ({ kind }) => {
	const { base } = usePanel()
	const lk = (st) => `${base}/${kind === 'staff' ? 'staff' : 'students'}?status=${st}`
	const cfg = CONFIG[kind]
	const [date, setDate] = useState(todayStr())
	const [query, setQuery] = useState('')
	const [sortBy, setSortBy] = useState('percent-asc')
	const { data, loading, error, reload } = useMonitorData('overview', { date }, { auto: date === todayStr() })

	const rows = useMemo(() => (data?.schools || []).map(s => {
		const x = s.stats, k = cfg.key
		return {
			...s, total: x[`${k}Total`], came: x[`${k}Came`], inside: x[`${k}Inside`], absent: x[`${k}Absent`], late: x[`${k}Late`],
			percent: pct(x[`${k}Came`], x[`${k}Total`])
		}
	}), [data, cfg.key])

	const totals = rows.reduce((a, r) => ({ total: a.total + r.total, came: a.came + r.came, inside: a.inside + r.inside, absent: a.absent + r.absent, late: a.late + r.late }), { total: 0, came: 0, inside: 0, absent: 0, late: 0 })

	const shown = rows
		.filter(r => !query || `${r.name} ${r.region} ${r.district}`.toLowerCase().includes(query.toLowerCase()))
		.sort({
			'percent-asc': (a, b) => a.percent - b.percent, 'percent-desc': (a, b) => b.percent - a.percent,
			'absent-desc': (a, b) => b.absent - a.absent, name: (a, b) => a.name.localeCompare(b.name)
		}[sortBy])

	const chart = [...rows].sort((a, b) => a.name.localeCompare(b.name)).map(r => ({ name: r.name, Kelgan: r.came, Kelmagan: r.absent }))

	const download = () => exportXlsx(`${kind}-davomat-${data?.dateString || date}`, [{
		name: cfg.title,
		rows: shown.map(r => ({ Maktab: r.name, Hudud: schoolPlace(r), Jami: r.total, Kelgan: r.came, 'Hozir ichkarida': r.inside, Kelmagan: r.absent, 'Kech qolgan': r.late, 'Davomat %': r.percent }))
	}])

	return (
		<Page>
			<PageHeader title={cfg.title} subtitle={`Sana: ${data?.dateString || date} · har bir maktab bo'yicha`} onReload={reload} loading={loading}>
				<DateField label="Sana" value={date} max={todayStr()} onChange={setDate} />
				<button onClick={download} disabled={!rows.length} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>

			<LoadState loading={loading && !data} error={error}>
				<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
					<KpiLink to={lk('came')} icon={<FaCheckCircle />} color="bg-green-50 text-green-600" label="Kelgan" value={totals.came} detail={`${fmt(totals.total)} ${cfg.noun}dan · ${pct(totals.came, totals.total)}%`} />
					<KpiLink to={lk('absent')} icon={<FaUserTimes />} color="bg-red-50 text-red-600" label="Kelmagan" value={totals.absent} detail={`${pct(totals.absent, totals.total)}%`} />
					<KpiLink to={lk('inside')} icon={<FaDoorOpen />} color="bg-blue-50 text-blue-600" label="Hozir maktabda" value={totals.inside} detail="Ichkarida turganlar" />
					<KpiLink to={lk('late')} icon={<FaClock />} color="bg-orange-50 text-orange-600" label="Kech qolgan" value={totals.late} detail="Ish/dars boshlanishidan keyin" />
				</div>

				<Panel title="Maktablar kesimida" subtitle="Kelgan va kelmaganlar soni" className="mb-6">
					<ChartBox height={320}>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={chart} margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
								<YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
								<Tooltip /><Legend />
								<Bar dataKey="Kelgan" stackId="a" fill={cfg.color} maxBarSize={44} />
								<Bar dataKey="Kelmagan" stackId="a" fill={CHART_COLORS.gray} radius={[5, 5, 0, 0]} maxBarSize={44} />
							</BarChart>
						</ResponsiveContainer>
					</ChartBox>
				</Panel>

				<Panel title="Batafsil jadval" action={
					<div className="flex flex-wrap gap-2">
						<SearchBox value={query} onChange={setQuery} placeholder="Maktab yoki hudud" />
						<AutoSelect value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white">
							<option value="percent-asc">Davomat: past → yuqori</option>
							<option value="percent-desc">Davomat: yuqori → past</option>
							<option value="absent-desc">Kelmaganlar ko'p</option>
							<option value="name">Nomi bo'yicha</option>
						</AutoSelect>
					</div>
				}>
					<Table head={['Maktab', 'Davomat', { label: 'Jami', right: true }, { label: 'Kelgan', right: true }, { label: 'Ichkarida', right: true }, { label: 'Kelmagan', right: true }, { label: 'Kech qolgan', right: true }]}>
						{shown.map(r => (
							<Tr key={r._id}>
								<Td><Link to={`/monitor/schools/${r._id}`} className="font-medium text-gray-900 hover:text-blue-600">{r.name}</Link><p className="text-xs text-gray-500">{schoolPlace(r)}</p></Td>
								<Td><Progress present={r.came} total={r.total} percent={r.percent} /></Td>
								<Td right>{fmt(r.total)}</Td><Td right>{fmt(r.came)}</Td><Td right>{fmt(r.inside)}</Td>
								<Td right className="text-red-600 font-medium">{fmt(r.absent)}</Td><Td right>{fmt(r.late)}</Td>
							</Tr>
						))}
						{shown.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Maktablar topilmadi</td></tr>}
					</Table>
				</Panel>
			</LoadState>
		</Page>
	)
}

export const MonitorStudents = () => <MonitorAttendance kind="students" />
export const MonitorStaff = () => <MonitorAttendance kind="staff" />
export default MonitorAttendance
