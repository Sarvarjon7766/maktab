import { useState } from 'react'
import { FaChalkboardTeacher, FaClock, FaUserGraduate, FaVideo } from 'react-icons/fa'
import { FiArrowLeft, FiDownload } from 'react-icons/fi'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Donut } from './MonitorDashboard'
import MonitorPeopleTab from './MonitorPeopleTab'
import { Badge, CHART_COLORS, ChartBox, LoadState, Page, Panel, Progress, RangePicker, KpiLink, Table, Td, Tr, WEEKDAYS, exportXlsx, fmt, pct, schoolPlace, shiftDate, todayStr, useMonitorData } from './monitorKit'
import { tx } from '../../i18n'

const TABS = [
	{ key: 'overview', label: 'Umumiy' },
	{ key: 'students', label: "O'quvchilar" },
	{ key: 'staff', label: 'Xodimlar' },
	{ key: 'classes', label: 'Sinflar' },
	{ key: 'cameras', label: 'Kameralar' }
]

// Bitta maktab: umumiy holat, o'quvchilar va xodimlar (har biriga kirish mumkin), sinflar, kameralar
const MonitorSchoolDetail = () => {
	const { id } = useParams()
	const [params, setParams] = useSearchParams()
	const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab') : 'overview'
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error } = useMonitorData(`school/${id}`, range, { auto: true })
	const s = data?.school, t = data?.today || {}
	const days = (data?.trend?.days || []).map(d => ({ ...d, label: d.dateString.slice(5) }))
	const setTab = (key) => setParams(key === 'overview' ? {} : { tab: key })

	const download = () => exportXlsx(`${s.name}-${range.from}_${range.to}`, [
		{ name: 'Dinamika', rows: days.map(d => ({ Sana: d.dateString, Hafta_kuni: WEEKDAYS[d.weekday], "O'quvchi kelgan": d.studentCame, "O'quvchi %": d.studentPercent, 'Xodim kelgan': d.staffCame, 'Xodim %': d.staffPercent })) },
		{ name: 'Sinflar', rows: (data.classes || []).map(c => ({ Sinf: c.name, Rahbar: c.head || '', Jami: c.total, Kelgan: c.came, Kelmagan: c.absent, '%': c.percent })) }
	])

	return (
		<Page>
			<Link to="/monitor/schools" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4"><FiArrowLeft /> {tx("Maktablar")}</Link>

			<LoadState loading={loading && !data} error={error}>
				{s && <>
					<div className="flex flex-wrap items-center justify-between gap-3 mb-5">
						<div className="min-w-0">
							<h1 className="text-2xl font-semibold text-gray-900 truncate">{s.name}</h1>
							<p className="text-sm text-gray-500 mt-1">{schoolPlace(s)}{s.phone ? ` · ${s.phone}` : ''}</p>
						</div>
						<div className="flex items-center gap-2"><Badge ok={s.isActive} />{tab === 'overview' && <button onClick={download} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"><FiDownload size={14} /> {tx("Excel")}</button>}</div>
					</div>

					<div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
						{TABS.map(x => (
							<button key={x.key} onClick={() => setTab(x.key)} className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === x.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
								{x.label}{x.key === 'students' ? ` · ${fmt(t.studentTotal)}` : x.key === 'staff' ? ` · ${fmt(t.staffTotal)}` : x.key === 'classes' ? ` · ${data.classes.length}` : x.key === 'cameras' ? ` · ${data.cameras.length}` : ''}
							</button>
						))}
					</div>

					{tab === 'overview' && <>
						<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
							<KpiLink to={`/monitor/schools/${id}?tab=students&status=came`} icon={<FaUserGraduate />} color="bg-amber-50 text-amber-600" label={tx("Bugun kelgan o'quvchilar")} value={t.studentCame || 0} detail={`${fmt(t.studentTotal)} tadan · ${pct(t.studentCame, t.studentTotal)}%`} />
							<KpiLink to={`/monitor/schools/${id}?tab=staff&status=came`} icon={<FaChalkboardTeacher />} color="bg-violet-50 text-violet-600" label={tx("Bugun kelgan xodimlar")} value={t.staffCame || 0} detail={`${fmt(t.staffTotal)} tadan · ${pct(t.staffCame, t.staffTotal)}%`} />
							<KpiLink to={`/monitor/lists?kind=student&status=late&school=${id}`} icon={<FaClock />} color="bg-orange-50 text-orange-600" label={tx("Kech qolganlar")} value={(t.studentLate || 0) + (t.staffLate || 0)} detail={`Boshlanish vaqti: ${t.workStartTime || '09:00'}`} />
							<KpiLink to={`/monitor/schools/${id}?tab=cameras`} icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("Kameralar online")} value={t.cameraOnline || 0} detail={`${fmt(t.cameraTotal)} tadan`} />
						</div>

						<div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
							<Panel title={tx("Bugun: o'quvchilar")} action={<Link to={`/monitor/schools/${id}?tab=students&status=absent`} className="text-sm text-blue-600 hover:underline">{tx("Kelmaganlar →")}</Link>}><Donut data={[{ name: 'Kelgan', value: t.studentCame || 0 }, { name: 'Kelmagan', value: t.studentAbsent || 0 }]} total={t.studentCame || 0} label={tx("kelgan")} /></Panel>
							<Panel title={tx("Bugun: xodimlar")} action={<Link to={`/monitor/schools/${id}?tab=staff&status=unexcused`} className="text-sm text-blue-600 hover:underline">{tx("Kelmaganlar →")}</Link>}><Donut data={[{ name: 'Kelgan', value: t.staffCame || 0 }, { name: 'Kelmagan', value: t.staffAbsent || 0 }]} total={t.staffCame || 0} label={tx("kelgan")} /></Panel>
							<Panel title={tx("Maktab")}>
								<dl className="text-sm space-y-2">
									{[['Sinflar', fmt(t.classTotal)], ['Adminlar', fmt(t.adminTotal)], ['IT markaz', s.itCenter || '—'], ["Qo'shilgan", new Date(s.createdAt).toLocaleDateString('uz-UZ')], ['Hozir maktabda', `${fmt(t.studentInside)} o'q. · ${fmt(t.staffInside)} xod.`]].map(([k, v]) => (
										<div key={k} className="flex justify-between gap-3"><dt className="text-gray-500">{k}</dt><dd className="text-gray-900 font-medium text-right">{v}</dd></div>
									))}
								</dl>
							</Panel>
						</div>

						<div className="mb-4"><RangePicker {...range} onChange={setRange} /></div>
						<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
							<Panel title={tx("Davomat dinamikasi (%)")}>
								<ChartBox><ResponsiveContainer width="100%" height="100%">
									<AreaChart data={days} margin={{ left: -12, right: 8 }}>
										<CartesianGrid strokeDasharray="3 3" vertical={false} />
										<XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
										<Tooltip formatter={v => `${v}%`} /><Legend />
										<Area type="monotone" dataKey="studentPercent" name="O'quvchilar" stroke={CHART_COLORS.student} fill={CHART_COLORS.student} fillOpacity={0.15} />
										<Area type="monotone" dataKey="staffPercent" name="Xodimlar" stroke={CHART_COLORS.staff} fill={CHART_COLORS.staff} fillOpacity={0.15} />
									</AreaChart>
								</ResponsiveContainer></ChartBox>
							</Panel>
							<Panel title={tx("Sinflar bo'yicha bugun")} action={<Link to={`/monitor/schools/${id}?tab=classes`} className="text-sm text-blue-600 hover:underline">{tx("Sinflar tahlili →")}</Link>}>
								<ChartBox><ResponsiveContainer width="100%" height="100%">
									<BarChart data={data.classes.map(c => ({ name: c.name, Kelgan: c.came, Kelmagan: c.absent }))} margin={{ left: -12, right: 8 }}>
										<CartesianGrid strokeDasharray="3 3" vertical={false} />
										<XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
										<Tooltip /><Legend />
										<Bar dataKey="Kelgan" stackId="a" fill={CHART_COLORS.ok} maxBarSize={30} />
										<Bar dataKey="Kelmagan" stackId="a" fill={CHART_COLORS.bad} radius={[5, 5, 0, 0]} maxBarSize={30} />
									</BarChart>
								</ResponsiveContainer></ChartBox>
							</Panel>
						</div>
					</>}

					{tab === 'students' && <MonitorPeopleTab schoolId={id} kind="student" initialStatus={params.get('status') || ''} />}
					{tab === 'staff' && <MonitorPeopleTab schoolId={id} kind="staff" initialStatus={params.get('status') || ''} />}

					{tab === 'classes' && (
						<Panel>
							<Table head={['Sinf', 'Rahbar', 'Davomat', { label: "O'quvchilar", right: true }]}>
								{data.classes.map(c => <Tr key={c._id}><Td className="font-medium text-gray-900">{c.name}</Td><Td className="text-gray-600">{c.head || '—'}</Td><Td><Progress present={c.came} total={c.total} percent={c.percent} /></Td><Td right>{fmt(c.total)}</Td></Tr>)}
								{data.classes.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">{tx("Sinflar yo'q")}</td></tr>}
							</Table>
						</Panel>
					)}

					{tab === 'cameras' && (
						<Panel>
							<Table head={['Kamera', 'Joyi', 'Turi', 'Holat']}>
								{data.cameras.map(c => (
									<Tr key={c._id}><Td className="font-medium text-gray-900">{c.name}</Td><Td className="text-gray-600">{c.place || '—'}</Td>
										<Td className="text-gray-600">{c.source === 'hikconnect' ? tx("Hik-Connect") : tx("Lokal")}</Td>
										<Td><Badge ok={c.online === true} yes="Online" no={c.online === false ? 'Offline' : "Noma'lum"} /></Td></Tr>
								))}
								{data.cameras.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-500">{tx("Kamera yo'q")}</td></tr>}
							</Table>
						</Panel>
					)}
				</>}
			</LoadState>
		</Page>
	)
}

export default MonitorSchoolDetail
