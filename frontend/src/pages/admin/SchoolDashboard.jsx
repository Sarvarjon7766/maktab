import { useMemo } from 'react'
import { FiAlertTriangle, FiArrowRight, FiBarChart2, FiFileText, FiVideo } from 'react-icons/fi'
import { FaChalkboardTeacher, FaClock, FaDoorOpen, FaUserGraduate, FaUserTimes } from 'react-icons/fa'
import { Link, useLocation } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SchoolStatsProvider } from '../../components/SchoolStatsShell'
import SetupChecklist from '../../components/SetupChecklist'
import { ChartBox, ExcuseChip, Panel, PersonLink, fmt, levelColor, levelText, pct, shiftDate, WEEKDAYS, todayStr, usePanel, useMonitorData, pctFmt } from '../monitor/monitorKit'
import { tx } from '../../i18n'
import { alertLink } from '../../utils/alertLink'

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr']
const SEV = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-400' }

const Kpi = ({ to, icon, label, value, sub, percent, tone }) => (
	<Link to={to} className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg">
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0"><p className="text-xs font-medium text-gray-500">{label}</p><p className="mt-2 text-3xl font-bold leading-none text-gray-900">{value}</p></div>
			<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
		</div>
		{percent !== undefined && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${levelColor(percent)}`} style={{ width: `${Math.min(percent, 100)}%` }} /></div>}
		<p className="mt-2 text-xs text-gray-400">{sub}</p>
	</Link>
)

const Dashboard = () => {
	const { base } = usePanel()
	const today = todayStr()
	const { data, loading, error } = useMonitorData('school', { from: shiftDate(today, -13), to: today }, { auto: true })
	const { data: alerts } = useMonitorData('alerts', { date: today }, { auto: true })
	const { data: leaves } = useMonitorData('leaves', { date: today }, { auto: true })
	const { data: late } = useMonitorData('late-people', { kind: 'student', from: shiftDate(today, -6), to: today, limit: 5 })

	const t = data?.today || {}
	const s = data?.school
	const days = useMemo(() => (data?.trend?.days || []).filter(d => d.weekday !== 0 && (d.studentCame > 0 || d.staffCame > 0)).map(d => ({ kun: d.dateString.slice(5), "O'quvchilar": d.studentPercent, Xodimlar: d.staffPercent })), [data])
	const classes = useMemo(() => [...(data?.classes || [])].sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name)), [data])
	const studentPct = pct(t.studentCame, t.studentTotal), staffPct = pct(t.staffCame, Math.max((t.staffTotal || 0) - (t.staffExcused || 0), 0))
	const lateTotal = (t.studentLate || 0) + (t.staffLate || 0)
	const list = alerts?.alerts || []
	const [y, mo, d] = today.split('-').map(Number)
	const dateLabel = `${d} ${MONTHS[mo - 1]}, ${y} · ${WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()]}`

	if (error) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")}</div></div>

	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6 xl:p-7">
			<div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700 p-6 text-white shadow-sm">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div className="min-w-0"><p className="text-xs uppercase tracking-widest text-cyan-200/80">{dateLabel}</p><h1 className="mt-1 truncate text-2xl font-semibold sm:text-3xl">{s?.name || tx("Maktab")}</h1><p className="mt-1 text-sm text-slate-300">{[s?.district, s?.region].filter(Boolean).join(', ') || tx("Boshqaruv paneli")}</p></div>
					<div className="flex flex-wrap gap-2">
						<Link to={`${base}/grades`} className="inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2.5 text-sm font-medium text-white backdrop-blur hover:bg-white/25"><FiBarChart2 /> {tx("Umumiy statistika")}</Link>
						<Link to={`${base}/reports`} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"><FiFileText /> {tx("Hisobotlar")}</Link>
					</div>
				</div>
			</div>

			<SetupChecklist base={base} />

			<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<Kpi to={`${base}/students`} icon={<FaUserGraduate />} tone="bg-amber-50 text-amber-600" label={tx("O'quvchilar davomati")} value={loading && !data ? '…' : `${pctFmt(studentPct)}`} percent={studentPct} sub={`${fmt(t.studentCame)} / ${fmt(t.studentTotal)} kelgan · kelmagan ${fmt(t.studentAbsent)}`} />
				<Kpi to={`${base}/users`} icon={<FaChalkboardTeacher />} tone="bg-violet-50 text-violet-600" label={tx("Xodimlar davomati")} value={loading && !data ? '…' : `${pctFmt(staffPct)}`} percent={staffPct} sub={`${fmt(t.staffCame)} / ${fmt(t.staffTotal)} kelgan · sababsiz kelmagan ${fmt(t.staffAbsent)}${t.staffExcused ? ` · sababli ${fmt(t.staffExcused)}` : ''}`} />
				<Kpi to={`${base}/late`} icon={<FaClock />} tone="bg-orange-50 text-orange-600" label={tx("Bugun kech qolganlar")} value={fmt(lateTotal)} sub={`${fmt(t.studentLate)} o'quvchi · ${fmt(t.staffLate)} xodim · boshlanish ${t.workStartTime || '09:00'}`} />
				<Kpi to={`${base}/attandance`} icon={<FaDoorOpen />} tone="bg-green-50 text-green-600" label={tx("Hozir maktabda")} value={fmt((t.studentInside || 0) + (t.staffInside || 0))} sub={`${fmt(t.studentInside)} o'quvchi · ${fmt(t.staffInside)} xodim`} />
				<Kpi to={`${base}/students`} icon={<FaUserTimes />} tone="bg-red-50 text-red-600" label={tx("Kelmagan o'quvchilar")} value={fmt(t.studentAbsent)} sub={`${fmt(t.studentTotal)} o'quvchidan`} />
				<Kpi to={`${base}/camera`} icon={<FiVideo />} tone="bg-cyan-50 text-cyan-600" label={tx("Kameralar online")} value={`${t.cameraOnline || 0}/${t.cameraTotal || 0}`} sub={t.cameraOffline ? `${t.cameraOffline} tasi offline` : tx("Hammasi ishlayapti")} />
			</div>

			<div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Panel title={tx("Davomat dinamikasi (%)")} action={<Link to={`${base}/trend`} className="text-sm text-blue-600 hover:underline">{tx("Batafsil →")}</Link>}>
					<ChartBox height={260}><ResponsiveContainer width="100%" height="100%">
						<AreaChart data={days} margin={{ left: -12, right: 8 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => `${v}%`} /><Legend />
							<Area type="monotone" dataKey="O'quvchilar" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} isAnimationActive={false} />
							<Area type="monotone" dataKey="Xodimlar" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.12} isAnimationActive={false} />
						</AreaChart>
					</ResponsiveContainer></ChartBox>
				</Panel>

				<div className="space-y-6">
					<Panel title={tx("Ogohlantirishlar")} action={<Link to={`${base}/alerts`} className="text-sm text-blue-600 hover:underline">{tx("Hammasi ({{n}})", { n: list.length })}</Link>}>
						{list.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-500"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-green-50 text-green-600"><FiAlertTriangle /></span>{tx("Ogohlantirish yo'q")}</div> : (
							<ul className="divide-y divide-gray-50">
								{list.slice(0, 5).map(a => (
									<li key={a.id}><Link to={alertLink(a, { base, scoped: true })} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${SEV[a.severity]}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{a.title}</span><span className="block truncate text-xs text-gray-500">{a.evidence}</span></span></Link></li>
								))}
							</ul>
						)}
					</Panel>
						<Panel title={tx("Sababli kelmaganlar (bugun)")} action={<Link to={`${base}/leaves`} className="text-sm text-blue-600 hover:underline">{tx("Hammasi ({{n}})", { n: leaves?.total ?? 0 })}</Link>}>
						{(leaves?.leaves || []).length === 0 ? <p className="py-6 text-center text-sm text-gray-500">{tx("Bugun sababli kelmagan xodim yo'q")}</p> : (
							<ul className="divide-y divide-gray-50">
								{leaves.leaves.slice(0, 5).map(r => (
									<li key={r._id} className="flex items-center justify-between gap-3 py-2.5"><PersonLink kind="staff" id={r.employee._id} name={r.employee.fullName} sub={r.comment} photo={r.employee.photo} /><ExcuseChip type={r.type} short /></li>
								))}
							</ul>
						)}
					</Panel>
					</div>
			</div>

			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Panel title={`Sinflar: bugungi davomat (${classes.length})`} action={<Link to={`${base}/grades`} className="text-sm text-blue-600 hover:underline">{tx("Sinf darajalari →")}</Link>}>
					{classes.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">{tx("Sinflar hali qo'shilmagan")}</p> : (
						<ul className="grid max-h-[420px] grid-cols-1 gap-x-8 gap-y-3 overflow-y-auto pr-1 md:grid-cols-2">
							{classes.map(c => (
								<li key={c._id}>
									<Link to={`${base}/classrooms/${c._id}`} className="group block">
										<div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="font-medium text-gray-900 group-hover:text-blue-600">{c.name}</span><span className={`text-xs font-semibold ${levelText(c.percent)}`}>{pctFmt(c.percent)} <span className="font-normal text-gray-400">· {c.came}/{c.total}</span></span></div>
										<div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${levelColor(c.percent)}`} style={{ width: `${Math.min(c.percent, 100)}%` }} /></div>
									</Link>
								</li>
							))}
						</ul>
					)}
				</Panel>

				<Panel title={tx("Kech qolganlar (7 kun)")} action={<Link to={`${base}/late`} className="text-sm text-blue-600 hover:underline">{tx("Hammasi →")}</Link>}>
					{(late?.people || []).length === 0 ? <p className="py-10 text-center text-sm text-gray-500">{tx("Kech qolgan o'quvchi yo'q")}</p> : (
						<ul className="divide-y divide-gray-50">
							{late.people.map(p => (
								<li key={p._id} className="flex items-center justify-between gap-3 py-2.5">
									<PersonLink kind="student" id={p._id} name={p.fullName} sub={p.sinf} photo={p.photo} />
									<span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{tx("{{n}} kun", { n: p.lateDays })}</span>
								</li>
							))}
						</ul>
					)}
					<Link to={`${base}/risk`} className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm text-gray-700 hover:bg-slate-100">{tx("Xavf guruhi: ketma-ket kelmayotganlar")} <FiArrowRight /></Link>
				</Panel>
			</div>
		</div>
	)
}

// Maktab paneli bosh sahifasi: bugungi holat, dinamika, ogohlantirishlar, sinflar va kech qolganlar (faqat o'z maktabi)
const SchoolDashboard = () => {
	useLocation() // base pathdan olinadi (SchoolStatsProvider)
	return <SchoolStatsProvider><Dashboard /></SchoolStatsProvider>
}

export default SchoolDashboard

