import { useEffect, useState } from 'react'
import AutoSelect from '../../components/AutoSelect'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CHART_COLORS, ChartBox, DateField, LoadState, Page, PageHeader, Panel, Progress, KpiLink, Table, Td, Tr, exportXlsx, fmt, pct, todayStr, useMonitorData, matchText, SearchBox } from './monitorKit'
import { FaChalkboard, FaUserGraduate, FaUserTimes } from 'react-icons/fa'
import { tx } from '../../i18n'

// Bitta maktab: sinflar kesimida o'quvchilar davomati + kelmagan o'quvchilar ro'yxati
// Bo'sh massiv har renderda yangi bo'lib effekt/useMemo'ni qayta ishga tushirmasligi uchun
const EMPTY = []

const MonitorClasses = () => {
	const [schoolId, setSchoolId] = useState('')
	const [date, setDate] = useState(todayStr())
	const [sinfId, setSinfId] = useState('')
	const { data: overview } = useMonitorData('overview', {})
	const schools = overview?.schools || EMPTY

	useEffect(() => { if (!schoolId && schools.length) setSchoolId(schools[0]._id) }, [schools, schoolId])
	useEffect(() => { setSinfId('') }, [schoolId])

	const { data, loading, error, reload } = useMonitorData('classes', { schoolId, date }, { skip: !schoolId })
	const absent = useMonitorData('absent-students', { schoolId, date, sinfId }, { skip: !schoolId })
	const [cq, setCq] = useState('')
	const [aq, setAq] = useState('')
	const classes = data?.classes || []
	const shownClasses = classes.filter(c => matchText(cq, c.name, c.head))
	const shownAbsent = (absent.data?.students || []).filter(s => matchText(aq, s.fullName, s.sinf))
	const t = classes.reduce((a, c) => ({ total: a.total + c.total, came: a.came + c.came }), { total: 0, came: 0 })
	const chart = classes.map(c => ({ name: c.name, Kelgan: c.came, Kelmagan: c.absent }))
	const schoolName = schools.find(s => s._id === schoolId)?.name || 'maktab'

	const download = () => exportXlsx(`sinflar-${schoolName}-${date}`, [
		{ name: 'Sinflar', rows: classes.map(c => ({ Sinf: c.name, Rahbar: c.head || '', Jami: c.total, Kelgan: c.came, Kelmagan: c.absent, 'Davomat %': c.percent })) },
		{ name: 'Kelmaganlar', rows: (absent.data?.students || []).map(s => ({ "F.I.Sh": s.fullName, Sinf: s.sinf })) }
	])

	return (
		<Page>
			<PageHeader title={tx("Sinflar kesimida")} subtitle={tx("Tanlangan maktabning sinflari bo'yicha o'quvchilar davomati")} onReload={reload} loading={loading}>
				<AutoSelect value={schoolId} onChange={e => setSchoolId(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white max-w-[260px]">
					{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
				</AutoSelect>
				<DateField label={tx("Sana")} value={date} max={todayStr()} onChange={setDate} />
				<button onClick={download} disabled={!classes.length} className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{tx("Excel")}</button>
			</PageHeader>

			<LoadState loading={loading && !data} error={error} empty={data && classes.length === 0}>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
					<KpiLink to={schoolId ? `/monitor/classrooms?school=${schoolId}` : undefined} icon={<FaChalkboard />} label={tx("Sinflar")} value={classes.length} />
					<KpiLink to={`/monitor/lists?kind=student&status=came&school=${schoolId}&date=${date}`} icon={<FaUserGraduate />} color="bg-green-50 text-green-600" label={tx("Kelgan o'quvchilar")} value={t.came} detail={`${fmt(t.total)} tadan · ${pct(t.came, t.total)}%`} />
					<KpiLink to={`/monitor/lists?kind=student&status=absent&school=${schoolId}&date=${date}`} icon={<FaUserTimes />} color="bg-red-50 text-red-600" label={tx("Kelmaganlar")} value={Math.max(0, t.total - t.came)} />
				</div>

				<Panel title={tx("Sinflar bo'yicha")} className="mb-6">
					<ChartBox height={300}><ResponsiveContainer width="100%" height="100%">
						<BarChart data={chart} margin={{ left: -8, right: 12 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
							<Tooltip /><Legend />
							<Bar dataKey="Kelgan" stackId="a" fill={CHART_COLORS.ok} maxBarSize={36} />
							<Bar dataKey="Kelmagan" stackId="a" fill={CHART_COLORS.bad} radius={[5, 5, 0, 0]} maxBarSize={36} />
						</BarChart>
					</ResponsiveContainer></ChartBox>
				</Panel>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					<Panel title={tx("Sinflar jadvali")}>
						<div className="mb-3"><SearchBox value={cq} onChange={setCq} placeholder={tx("Sinf yoki rahbar qidirish...")} /></div>
						<Table head={['Sinf', 'Sinf rahbari', 'Davomat', { label: 'Kelmagan', right: true }]}>
							{shownClasses.map(c => (
								<Tr key={c._id}>
									<Td><button onClick={() => setSinfId(sinfId === c._id ? '' : c._id)} className={`font-medium hover:text-blue-600 ${sinfId === c._id ? 'text-blue-600' : 'text-gray-900'}`}>{c.name}</button></Td>
									<Td className="text-gray-600">{c.head || '—'}</Td>
									<Td><Progress present={c.came} total={c.total} percent={c.percent} /></Td>
									<Td right className="text-red-600 font-medium">{fmt(c.absent)}</Td>
								</Tr>
							))}
							{classes.length > 0 && shownClasses.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{tx("Topilmadi")}</td></tr>}
						</Table>
					</Panel>
					<Panel title={tx("Kelmagan o'quvchilar")} subtitle={sinfId ? `Tanlangan sinf bo'yicha (${absent.data?.total ?? 0} nafar) — qayta bosib bekor qiling` : `Barcha sinflar (${absent.data?.total ?? 0} nafar)`}>
						{absent.loading && !absent.data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : (
							<div className="max-h-[420px] overflow-y-auto">
								<div className="mb-3"><SearchBox value={aq} onChange={setAq} placeholder={tx("O'quvchi qidirish...")} /></div>
								<Table head={['F.I.Sh', 'Sinf']}>
									{shownAbsent.map(s => <Tr key={s._id}><Td>{s.fullName}</Td><Td className="text-gray-600">{s.sinf}</Td></Tr>)}
									{absent.data?.students?.length > 0 && shownAbsent.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">{tx("Topilmadi")}</td></tr>}
									{absent.data?.students?.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-green-600">{tx("Hamma kelgan")}</td></tr>}
								</Table>
								{absent.data?.truncated && <p className="text-xs text-gray-500 mt-2">{tx("Faqat dastlabki 1000 tasi ko'rsatildi")}</p>}
							</div>
						)}
					</Panel>
				</div>
			</LoadState>
		</Page>
	)
}

export default MonitorClasses
