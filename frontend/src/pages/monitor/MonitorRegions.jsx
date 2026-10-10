import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, DateField, LoadState, Page, PageHeader, Panel, Progress, Table, Td, Tr, exportXlsx, fmt, todayStr, useMonitorData } from './monitorKit'

const MonitorRegions = () => {
	const [date, setDate] = useState(todayStr())
	const [by, setBy] = useState('district')
	const { data, loading, error, reload } = useMonitorData('overview', { date }, { auto: date === todayStr() })

	// Hudud (tuman/viloyat) bo'yicha guruhlash — maktab kartochkasidagi region/district maydonlari asosida
	const groups = useMemo(() => {
		const map = new Map()
		;(data?.schools || []).forEach(s => {
			const name = (by === 'region' ? s.region : s.district) || "Ko'rsatilmagan"
			if (!map.has(name)) map.set(name, { name, schools: 0, studentTotal: 0, studentCame: 0, staffTotal: 0, staffCame: 0, cameraTotal: 0, cameraOnline: 0 })
			const g = map.get(name), x = s.stats
			g.schools++; g.studentTotal += x.studentTotal; g.studentCame += x.studentCame
			g.staffTotal += x.staffTotal; g.staffCame += x.staffCame; g.cameraTotal += x.cameraTotal; g.cameraOnline += x.cameraOnline
		})
		return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
	}, [data, by])

	const chart = groups.map(g => ({ name: g.name, "O'quvchilar": g.studentCame, Xodimlar: g.staffCame }))
	const download = () => exportXlsx(`hududlar-${data?.dateString || date}`, [{
		name: 'Hududlar',
		rows: groups.map(g => ({ Hudud: g.name, Maktablar: g.schools, "O'quvchi jami": g.studentTotal, "O'quvchi kelgan": g.studentCame, 'Xodim jami': g.staffTotal, 'Xodim kelgan': g.staffCame, 'Kamera online': `${g.cameraOnline}/${g.cameraTotal}` }))
	}])

	return (
		<Page>
			<PageHeader title="Hududlar kesimi" subtitle={`Sana: ${data?.dateString || date} · maktablar hudud bo'yicha guruhlangan`} onReload={reload} loading={loading}>
				<div className="inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
					{[['district', 'Tuman'], ['region', 'Viloyat']].map(([k, label]) => (
						<button key={k} onClick={() => setBy(k)} className={`px-4 py-2 ${by === k ? 'bg-slate-900 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>{label}</button>
					))}
				</div>
				<DateField label="Sana" value={date} max={todayStr()} onChange={setDate} />
				<button onClick={download} disabled={!groups.length} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>

			<LoadState loading={loading && !data} error={error} empty={data && groups.length === 0}>
				<Panel title="Hududlar bo'yicha kelganlar" className="mb-6">
					<ChartBox height={320}><ResponsiveContainer width="100%" height="100%">
						<BarChart data={chart} margin={{ left: -8, right: 12 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
							<Tooltip /><Legend />
							<Bar dataKey="O'quvchilar" fill={CHART_COLORS.student} maxBarSize={40} />
							<Bar dataKey="Xodimlar" fill={CHART_COLORS.staff} maxBarSize={40} />
						</BarChart>
					</ResponsiveContainer></ChartBox>
				</Panel>
				<Panel title="Hududlar jadvali">
					<Table head={['Hudud', { label: 'Maktablar', right: true }, "O'quvchilar", 'Xodimlar', { label: 'Kameralar', right: true }]}>
						{groups.map(g => (
							<Tr key={g.name}>
								<Td className="font-medium text-gray-900">{g.name}</Td><Td right>{fmt(g.schools)}</Td>
								<Td><Progress present={g.studentCame} total={g.studentTotal} /></Td>
								<Td><Progress present={g.staffCame} total={g.staffTotal} /></Td>
								<Td right className="whitespace-nowrap">{g.cameraOnline}/{g.cameraTotal} online</Td>
							</Tr>
						))}
					</Table>
				</Panel>
			</LoadState>
		</Page>
	)
}

export default MonitorRegions
