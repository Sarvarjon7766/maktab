import { tx } from '../../i18n'
import { useMemo, useState } from 'react'
import { FaChalkboardTeacher, FaClock, FaSchool, FaUserGraduate, FaUserTimes, FaVideo } from 'react-icons/fa'
import { Link, useNavigate } from 'react-router-dom'
import DistrictSchematic from '../../components/DistrictSchematic'
import { FiArrowRight } from 'react-icons/fi'
import { setDistrict } from './districtScope'
import useSchoolMap from '../../hooks/useSchoolMap'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
	Badge, CHART_COLORS, ChartBox, DateField, KpiLink, LoadState, Page, PageHeader, Panel, Progress, SearchBox, Table, Td, Tr,
	fmt, levelColor, levelText, pct, schoolPlace, shiftDate, todayStr, useMonitorData
} from './monitorKit'

// Viloyat monitori uchun: tumanlar reytingi (davomat bo'yicha). Tuman monitorida ko'rinmaydi
const RegionDistricts = () => {
	const navigate = useNavigate()
	const enter = (name) => { setDistrict(name); navigate('/monitor/schools') }
	const range = useMemo(() => ({ from: shiftDate(todayStr(), -29), to: todayStr() }), [])
	const { data } = useMonitorData('districts', range, { auto: true })
	const rows = (data?.rows || []).filter(r => r.studentPeriod !== null).slice(0, 8)
	return (
		<Panel title={tx("Tumanlar reytingi (tumanni bossangiz, shu tumanga kirasiz)")} className="mb-6" action={<Link to="/monitor/districts" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">{tx("Hammasi")} <FiArrowRight size={13} /></Link>}>
			{rows.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{tx("Tumanlar bo'yicha davomat ma'lumoti hali yo'q")}</p> : (
				<ul className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
					{rows.map(r => (
						<li key={r.name}>
							<button type="button" onClick={() => enter(r.name)} className="group block w-full text-left">
								<div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2 font-medium text-gray-900 group-hover:text-blue-600"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-600">{r.rank}</span>{r.name}</span><span className={`text-xs font-semibold ${levelText(r.studentPeriod)}`}>{r.studentPeriod}% <span className="font-normal text-gray-400">· {tx("{{n}} maktab", { n: r.schools })}</span></span></div>
								<div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${levelColor(r.studentPeriod)}`} style={{ width: `${Math.min(r.studentPeriod, 100)}%` }} /></div>
							</button>
						</li>
					))}
				</ul>
			)}
		</Panel>
	)
}

// Aqlli kuzatuv (AI) qisqacha: bugungi muhim hodisalar, lahzalar, AI kameralar va eng ko'p hodisa bo'lgan tuman/maktablar
const AiGlance = ({ region }) => {
	const { data } = useMonitorData('ai', {}, { auto: true })
	if (!data) return null
	const t = data.totals
	const top = (region ? data.districts : data.schools).filter(x => x.alerts > 0).slice(0, 4)
	return (
		<Panel title={tx("Aqlli kuzatuv (AI) · bugun")} className="mb-6" action={<Link to="/monitor/ai" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">{tx("Kadrlar va lavhalar")} <FiArrowRight size={13} /></Link>}>
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				{[['Muhim hodisalar', t.alerts, t.alerts ? 'text-red-600' : 'text-slate-900', '/monitor/ai'], ['Jami lahzalar', t.total, 'text-slate-900', '/monitor/ai'], ['Qisqa lavhalar', t.clips, 'text-slate-900', '/monitor/ai'], ['AI kameralar online', `${t.online}/${t.cameras}`, t.cameras && t.online < t.cameras ? 'text-amber-600' : 'text-slate-900', '/monitor/camera-health']].map(([l, v, tone, to]) => (
					<Link key={l} to={to} className="block rounded-xl bg-slate-50 px-4 py-3 transition hover:bg-blue-50 hover:shadow-sm"><p className="text-xs text-slate-500">{l}</p><p className={`mt-1 text-2xl font-bold leading-none ${tone}`}>{v}</p></Link>
				))}
			</div>
			{top.length > 0 ? (
				<div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-slate-500">{region ? tx("Eng ko'p muhim hodisa:") : tx("Muhim hodisa bo'lgan maktablar:")}</span>{top.map(x => <Link key={x.name} to={region ? `/monitor/ai?district=${encodeURIComponent(x.name)}` : '/monitor/ai'} className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 font-medium text-red-700 hover:bg-red-100">{x.name} <b>{x.alerts}</b></Link>)}</div>
			) : <p className="mt-4 text-sm text-emerald-700">{tx("Bugun muhim hodisa aniqlanmagan.")}</p>}
		</Panel>
	)
}

// Bo'sh massiv har renderda yangi bo'lib effekt/useMemo'ni qayta ishga tushirmasligi uchun
const EMPTY = []

const MonitorDashboard = () => {
	const [date, setDate] = useState(todayStr())
	const [query, setQuery] = useState('')
	const { data, loading, error, reload, updatedAt } = useMonitorData('overview', { date }, { auto: date === todayStr() })
	const alertsData = useMonitorData('alerts', { date }, { auto: date === todayStr() })
	const schools = data?.schools || EMPTY
	const navigate = useNavigate()
	const mapData = useSchoolMap()
	const [mapMetric, setMapMetric] = useState('student')

	const t = useMemo(() => schools.reduce((a, s) => {
		const x = s.stats
		return {
			active: a.active + (s.isActive ? 1 : 0),
			students: a.students + x.studentTotal, studentCame: a.studentCame + x.studentCame, studentLate: a.studentLate + x.studentLate,
			staff: a.staff + x.staffTotal, staffCame: a.staffCame + x.staffCame, staffLate: a.staffLate + x.staffLate,
			cams: a.cams + x.cameraTotal, camsOnline: a.camsOnline + x.cameraOnline, camsOffline: a.camsOffline + x.cameraOffline
		}
	}, { active: 0, students: 0, studentCame: 0, studentLate: 0, staff: 0, staffCame: 0, staffLate: 0, cams: 0, camsOnline: 0, camsOffline: 0 }), [schools])

	// Viloyat monitorida eng past ko'rsatkichli TUMANLAR, tuman monitorida maktablar
	const isRegion = mapData.data?.scope?.level === 'region'
	const distRows = useMonitorData('districts', { from: shiftDate(todayStr(), -29), to: todayStr(), district: '' }, { skip: !isRegion })
	const lowest = useMemo(() => (isRegion
		? (distRows.data?.rows || []).filter(r => r.studentPeriod !== null).map(r => ({ name: r.name, Foiz: r.studentPeriod })).sort((a, b) => a.Foiz - b.Foiz).slice(0, 10)
		: schools.filter(s => s.stats.studentTotal > 0).map(s => ({ name: s.name, Foiz: pct(s.stats.studentCame, s.stats.studentTotal) })).sort((a, b) => a.Foiz - b.Foiz).slice(0, 10)), [schools, isRegion, distRows.data])

	const rows = schools.filter(s => !query || `${s.name} ${s.region} ${s.district} ${s.code}`.toLowerCase().includes(query.toLowerCase()))
	const pieStudents = [{ name: 'Kelgan', value: t.studentCame }, { name: 'Kelmagan', value: Math.max(0, t.students - t.studentCame) }]
	const pieStaff = [{ name: 'Kelgan', value: t.staffCame }, { name: 'Kelmagan', value: Math.max(0, t.staff - t.staffCame) }]

	return (
		<Page>
			<PageHeader title={tx("Maktablar bo'yicha umumiy holat")} onReload={reload} loading={loading}
				subtitle={`Sana: ${data?.dateString || date}${updatedAt ? ` · yangilandi: ${updatedAt.toLocaleTimeString('uz-UZ')}` : ''}${date === todayStr() ? ' (har daqiqada avtomatik)' : ''}`}>
				<DateField value={date} max={todayStr()} onChange={setDate} />
			</PageHeader>

			<LoadState loading={loading && !data} error={error}>

				{/* Chap yarmi: tuman chizmasi, o'ng yarmi: statistika kartalari */}
				<div className="mb-6 grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
					<Panel title={mapData.data?.scope?.district ? tx("{{d}}: maktablar xaritasi", { d: mapData.data.scope.district }) : tx("Maktablar xaritasi")} subtitle={tx("Tuman chegarasi va maktablar joylashuvi: belgi ichida foiz, rangi holatini bildiradi")} className="" action={<Link to="/monitor/map" className="text-sm text-blue-600 hover:underline">{tx("Batafsil xarita →")}</Link>}>
						<DistrictSchematic maxHeight={400} data={mapData.data} metric={mapMetric} onMetric={setMapMetric} onOpenSchool={(sc) => navigate(`/monitor/schools/${sc._id}`)} />
					</Panel>
					<div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
						<KpiLink to={mapData.data?.scope?.level === 'region' ? '/monitor/districts' : '/monitor/schools'} icon={<FaSchool />} label={tx("Maktablar")} value={schools.length} detail={tx("{{n}} tasi faol", { n: t.active })} />
						<KpiLink to={`/monitor/lists?kind=student&status=came&date=${date}`} icon={<FaUserGraduate />} color="bg-amber-50 text-amber-600" label={tx("Kelgan o'quvchilar")} value={t.studentCame} detail={tx("{{a}} tadan · {{p}}%", { a: fmt(t.students), p: pct(t.studentCame, t.students) })} />
						<KpiLink to={`/monitor/lists?kind=staff&status=came&date=${date}`} icon={<FaChalkboardTeacher />} color="bg-violet-50 text-violet-600" label={tx("Kelgan xodimlar")} value={t.staffCame} detail={`${fmt(t.staff)} tadan · ${pct(t.staffCame, t.staff)}%`} />
						<KpiLink to={`/monitor/lists?kind=student&status=absent&date=${date}`} icon={<FaUserTimes />} color="bg-red-50 text-red-600" label={tx("Kelmagan o'quvchilar")} value={Math.max(0, t.students - t.studentCame)} detail={`Xodimlar: ${fmt(Math.max(0, t.staff - t.staffCame))} nafar`} />
						<KpiLink to={`/monitor/lists?kind=student&status=late&date=${date}`} icon={<FaClock />} color="bg-orange-50 text-orange-600" label={tx("Kech qolganlar")} value={t.studentLate + t.staffLate} detail={tx("{{a}} o'quvchi · {{b}} xodim", { a: fmt(t.studentLate), b: fmt(t.staffLate) })} />
						<KpiLink to="/monitor/camera-health" icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("Kameralar online")} value={t.camsOnline} detail={tx("{{a}} tadan · {{b}} tasi offline", { a: fmt(t.cams), b: fmt(t.camsOffline) })} />
					</div>
				</div>

				{mapData.data?.scope?.level === 'region' && <RegionDistricts />}

				<AiGlance region={mapData.data?.scope?.level === 'region'} />

				{(alertsData.data?.alerts || []).length > 0 && (
					<Panel title={tx("Ogohlantirishlar")} className="mb-6" action={<Link to="/monitor/alerts" className="text-sm text-blue-600 hover:underline">{tx("Hammasi ({{n}})", { n: alertsData.data.alerts.length })}</Link>}>
						<ul className="divide-y divide-gray-50">
							{alertsData.data.alerts.slice(0, 5).map((a, ai) => (
								<li key={`${a.id}-${a.type}-${ai}`}>
									<Link to={a.link} className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg">
										<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.severity === 'high' ? 'bg-red-500' : a.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-400'}`} />
										<span className="min-w-0 flex-1"><span className="block text-sm font-medium text-gray-900 truncate">{a.schoolName} · {a.title}</span><span className="block text-xs text-gray-500 font-mono truncate">{a.evidence}</span></span>
									</Link>
								</li>
							))}
						</ul>
					</Panel>
				)}

				<div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
					<Panel title={tx("O'quvchilar davomati")} subtitle={tx("Hududingizdagi maktablar bo'yicha")} action={<Link to="/monitor/students" className="text-sm text-blue-600 hover:underline">{tx("Batafsil →")}</Link>}>
						<Donut data={pieStudents} total={t.studentCame} label={tx("kelgan")} />
					</Panel>
					<Panel title={tx("Xodimlar davomati")} subtitle={tx("Hududingizdagi maktablar bo'yicha")} action={<Link to="/monitor/staff" className="text-sm text-blue-600 hover:underline">{tx("Batafsil →")}</Link>}>
						<Donut data={pieStaff} total={t.staffCame} label={tx("kelgan")} />
					</Panel>
					<Panel title={isRegion ? tx("Eng past davomatli tumanlar") : tx("Eng past davomatli maktablar")} subtitle={tx("O'quvchilar bo'yicha, foiz")} action={<Link to={isRegion ? '/monitor/districts' : '/monitor/ranking'} className="text-sm text-blue-600 hover:underline">{tx("Reyting →")}</Link>}>
						<ChartBox>
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={lowest} layout="vertical" margin={{ left: 10, right: 16 }}>
									<CartesianGrid strokeDasharray="3 3" horizontal={false} />
									<XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
									<YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
									<Tooltip formatter={v => `${v}%`} />
									<Bar dataKey="Foiz" name={tx("Foiz")} fill={CHART_COLORS.student} radius={[0, 5, 5, 0]} maxBarSize={20} />
								</BarChart>
							</ResponsiveContainer>
						</ChartBox>
					</Panel>
				</div>


				{mapData.data?.scope?.level === 'region' ? (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center"><p className="font-semibold text-slate-800">{tx("Maktablar va shaxslar ro'yxati tuman ichida")}</p><p className="mx-auto mt-1 max-w-xl text-sm text-slate-500">{tx("Yuqoridagi «Tumanlar reytingi»dan tumanni tanlang yoki chap menyudagi «Tuman» ro'yxatidan tanlang: shundan keyin shu tuman maktablari, xodim va o'quvchilariga o'tasiz.")}</p><Link to="/monitor/districts" className="mt-4 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800">{tx("Tumanlar solishtiruvi")}</Link></div>
				) : (
					<Panel title={tx("Maktablar jadvali")} action={<div className="flex items-center gap-3"><Link to="/monitor/schools" className="text-sm text-blue-600 hover:underline whitespace-nowrap">{tx("Solishtirish →")}</Link><SearchBox value={query} onChange={setQuery} placeholder={tx("Maktab yoki hudud")} /></div>}>
						<Table head={['Maktab', "O'quvchilar", 'Xodimlar', 'Kech qolgan', 'Kameralar', 'Holat']}>
							{rows.map(s => (
								<Tr key={s._id}>
									<Td><Link to={`/monitor/schools/${s._id}`} className="font-medium text-gray-900 hover:text-blue-600">{s.name}</Link><p className="text-xs text-gray-500">{schoolPlace(s)}</p></Td>
									<Td><Progress present={s.stats.studentCame} total={s.stats.studentTotal} /></Td>
									<Td><Progress present={s.stats.staffCame} total={s.stats.staffTotal} /></Td>
									<Td className="whitespace-nowrap text-gray-700">{tx("{{a}} o'q. · {{b}} xod.", { a: fmt(s.stats.studentLate), b: fmt(s.stats.staffLate) })}</Td>
									<Td className="whitespace-nowrap">{s.stats.cameraTotal ? <span className={s.stats.cameraOffline ? 'text-red-600 font-medium' : 'text-gray-700'}>{tx("{{a}}/{{b}} online", { a: s.stats.cameraOnline, b: s.stats.cameraTotal })}</span> : <span className="text-gray-400">{tx("yo'q")}</span>}</Td>
									<Td><Badge ok={s.isActive} /></Td>
								</Tr>
							))}
							{rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">{tx("Maktablar topilmadi")}</td></tr>}
						</Table>
					</Panel>
				)}
			</LoadState>
		</Page>
	)
}

export const Donut = ({ data, total, label }) => (
	<div className="relative w-full h-[240px]">
		<ResponsiveContainer width="100%" height="100%">
			<PieChart>
				<Pie data={data} dataKey="value" nameKey="name" innerRadius={65} outerRadius={95} paddingAngle={3}>
					{data.map((d, i) => <Cell key={d.name} fill={i === 0 ? CHART_COLORS.ok : CHART_COLORS.gray} />)}
				</Pie>
				<Tooltip />
				<Legend />
			</PieChart>
		</ResponsiveContainer>
		<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
			<strong className="text-2xl text-gray-900">{fmt(total)}</strong><span className="text-xs text-gray-500">{label}</span>
		</div>
	</div>
)

export default MonitorDashboard
