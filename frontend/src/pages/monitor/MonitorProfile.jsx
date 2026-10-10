import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiArrowRight, FiBarChart2, FiCalendar, FiClock, FiCpu, FiFileText, FiLogOut, FiMap, FiMapPin, FiPhone, FiShield, FiUser, FiVideo } from 'react-icons/fi'
import { FaChalkboardTeacher, FaSchool, FaUserGraduate } from 'react-icons/fa'
import { Link, useNavigate } from 'react-router-dom'
import { formatUzDate } from '../../utils/formatDate'
import { LoadState, Page, Panel, fmt, pct, shiftDate, todayStr, useMonitorData } from './monitorKit'

const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const dateOf = (d) => (d ? formatUzDate(new Date(d)) : '—')
const LEVELS = { region: 'Viloyat monitori', district: 'Tuman monitori', global: 'Monitor' }
const tone = (v) => (v >= 85 ? 'bg-green-500' : v >= 60 ? 'bg-amber-500' : 'bg-red-500')

const Stat = ({ to, icon, label, value, sub, color = 'bg-slate-100 text-slate-600', accent = 'border-l-slate-300' }) => (
	<Link to={to} className={`flex items-center gap-3 rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md ${accent}`}>
		<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>{icon}</div>
		<div className="min-w-0"><p className="text-xl font-bold leading-tight text-slate-900">{value}</p><p className="truncate text-xs text-slate-500">{label}</p>{sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}</div>
	</Link>
)

// Monitor profili: shaxsiy ma'lumot, nazorat doirasi (daraja va hudud bilan), bugungi holat va tezkor o'tish
const MonitorProfile = () => {
	const navigate = useNavigate()
	const token = localStorage.getItem('token')
	const [user, setUser] = useState(null)
	const [userError, setUserError] = useState('')
	const date = todayStr()
	const { data: me } = useMonitorData('me', {})
	const level = me?.level || 'global'
	const region = level === 'region'
	const { data: overview, loading } = useMonitorData('overview', { date })
	const { data: alerts } = useMonitorData('alerts', { date })
	const { data: dist } = useMonitorData('districts', { from: shiftDate(date, -29), to: date }, { skip: !region })

	useEffect(() => {
		if (!token) { navigate('/'); return }
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, { headers: { Authorization: `Bearer ${token}` } })
			.then(res => (res.data.success ? setUser(res.data.user) : setUserError("Ma'lumot olinmadi")))
			.catch(e => { setUserError(e.response?.data?.message || 'Server xatosi'); if (e.response?.status === 401) navigate('/') })
	}, [token, navigate])

	const t = useMemo(() => (overview?.schools || []).reduce((a, s) => {
		const x = s.stats
		return {
			schools: a.schools + 1, active: a.active + (s.isActive ? 1 : 0), classes: a.classes + x.classTotal,
			students: a.students + x.studentTotal, studentCame: a.studentCame + x.studentCame, studentLate: a.studentLate + x.studentLate,
			staff: a.staff + x.staffTotal, staffCame: a.staffCame + x.staffCame, cams: a.cams + x.cameraTotal, camsOn: a.camsOn + x.cameraOnline
		}
	}, { schools: 0, active: 0, classes: 0, students: 0, studentCame: 0, studentLate: 0, staff: 0, staffCame: 0, cams: 0, camsOn: 0 }), [overview])
	const c = alerts?.counts || { high: 0, medium: 0, low: 0 }
	const totalAlerts = c.high + c.medium + c.low
	const districts = dist?.rows || []
	// Bugungi davomati eng past tumanlar (ma'lumot kelgan tumanlar orasidan)
	const weakest = [...districts].filter(r => r.studentToday !== null && r.studentToday !== undefined).sort((a, b) => a.studentToday - b.studentToday).slice(0, 4)
	const placeName = [me?.region, me?.district].filter(Boolean).join(' · ')

	const cards = [
		region && ['/monitor/districts', <FiMap key="d" />, 'Tumanlar', fmt(districts.length), tx('solishtirish'), 'bg-indigo-50 text-indigo-600', 'border-l-indigo-500'],
		['/monitor/schools', <FaSchool key="s" />, 'Maktablar', fmt(t.schools), tx('{{n}} tasi faol', { n: t.active }), 'bg-blue-50 text-blue-600', 'border-l-blue-500'],
		['/monitor/classrooms', <FiBarChart2 key="c" />, 'Sinflar', fmt(t.classes), null, 'bg-cyan-50 text-cyan-600', 'border-l-sky-500'],
		['/monitor/students', <FaUserGraduate key="u" />, "O'quvchilar", fmt(t.students), null, 'bg-amber-50 text-amber-600', 'border-l-amber-500'],
		['/monitor/staff', <FaChalkboardTeacher key="f" />, 'Xodimlar', fmt(t.staff), null, 'bg-violet-50 text-violet-600', 'border-l-violet-500'],
		['/monitor/cameras', <FiVideo key="v" />, 'Kameralar online', `${t.camsOn}/${t.cams}`, t.cams ? tx('{{n}}% ishlayapti', { n: pct(t.camsOn, t.cams) }) : null, 'bg-green-50 text-green-600', 'border-l-green-500']
	].filter(Boolean)

	const quick = [
		region ? ['/monitor/districts', 'Tumanlar solishtiruvi', "Reyting va farqlar", <FiMap key="1" />] : ['/monitor/schools', 'Maktablarni solishtirish', 'Ball, kuchli va zaif tomonlar', <FaSchool key="1" />],
		['/monitor/ai', 'Aqlli kuzatuv (AI)', 'Hodisalar va dalillar', <FiCpu key="2" />],
		['/monitor/alerts', 'Ogohlantirishlar', tx('{{n}} ta bugun', { n: totalAlerts }), <FiAlertTriangle key="3" />],
		['/monitor/reports', 'Hisobotlar (Excel)', "Ko'plab tayyor hisobotlar", <FiFileText key="4" />]
	]

	return (
		<Page>
			<LoadState loading={!user && !userError} error={userError}>
				{user && (
					<div className="space-y-6">
						<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
							<div className="h-24 bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400" />
							<div className="flex flex-wrap items-end gap-5 px-6 pb-6">
								<div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-blue-100 text-2xl font-bold text-blue-700 shadow-md">
									{user.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`} alt={user.fullName} className="h-full w-full object-cover" /> : initials(user.fullName)}
								</div>
								<div className="min-w-0 flex-1 pt-2">
									<h1 className="truncate text-2xl font-semibold text-slate-900">{user.fullName}</h1>
									<div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
										<span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700"><FiShield size={13} /> {LEVELS[level]}</span>
										{placeName && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700"><FiMapPin size={13} /> {placeName}</span>}
										{!placeName && user.position && <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">{user.position}</span>}
										<span className="rounded-full bg-green-50 px-3 py-1 font-medium text-green-700">Faol</span>
									</div>
								</div>
								<button onClick={() => navigate('/logout')} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-600"><FiLogOut size={15} /> Chiqish</button>
							</div>
						</section>

						<div>
							<h2 className="mb-3 font-semibold text-slate-900">Nazorat doirasi</h2>
							<div className={`grid grid-cols-2 gap-4 lg:grid-cols-3 ${cards.length > 5 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
								{cards.map(([to, icon, label, value, sub, color, accent]) => <Stat key={to} to={to} icon={icon} label={label} value={value} sub={sub} color={color} accent={accent} />)}
							</div>
						</div>

						<div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
							<div className="space-y-6">
								<Panel title={tx("Bugungi holat · {{d}}", { d: formatUzDate(new Date(`${date}T12:00:00+05:00`)) })} action={<Link to="/monitor" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">Bosh sahifa <FiArrowRight size={13} /></Link>}>
									{loading && !overview ? <p className="py-6 text-center text-sm text-slate-500">Yuklanmoqda...</p> : (
										<div className="grid grid-cols-2 gap-4">
											{[
												["O'quvchilar davomati", pct(t.studentCame, t.students), tx('{{a}} / {{b}} kelgan', { a: fmt(t.studentCame), b: fmt(t.students) }), '/monitor/students'],
												['Xodimlar davomati', pct(t.staffCame, t.staff), tx('{{a}} / {{b}} kelgan', { a: fmt(t.staffCame), b: fmt(t.staff) }), '/monitor/staff']
											].map(([l, p, sub, to]) => (
												<Link key={l} to={to} className="block rounded-xl border border-slate-100 bg-slate-50 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
													<p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold text-slate-900">{p}%</p>
													<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${tone(p)}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
													<p className="mt-2 text-[11px] text-slate-400">{sub}</p>
												</Link>
											))}
											<Link to="/monitor/late" className="rounded-xl border border-orange-100 bg-orange-50 p-4 transition hover:shadow-sm"><p className="flex items-center gap-1.5 text-xs text-orange-700"><FiClock size={12} /> Kech qolgan o'quvchilar</p><p className="mt-1 text-2xl font-bold text-orange-700">{fmt(t.studentLate)}</p></Link>
											<Link to="/monitor/alerts" className="rounded-xl border border-red-100 bg-red-50 p-4 transition hover:shadow-sm"><p className="flex items-center gap-1.5 text-xs text-red-700"><FiAlertTriangle size={12} /> Ogohlantirishlar</p><p className="mt-1 text-2xl font-bold text-red-700">{totalAlerts}</p><p className="text-[11px] text-red-500">{tx("{{a}} jiddiy · {{b}} o'rtacha · {{c}} past", { a: c.high, b: c.medium, c: c.low })}</p></Link>
										</div>
									)}
								</Panel>

								{region && weakest.length > 0 && (
									<Panel title="E'tibor talab qiladigan tumanlar" action={<Link to="/monitor/districts" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">Hammasi <FiArrowRight size={13} /></Link>}>
										<ul className="space-y-3">
											{weakest.map(r => (
												<li key={r.name}>
													<Link to={`/monitor/districts/${encodeURIComponent(r.name)}`} className="block rounded-lg px-1 py-1 hover:bg-slate-50">
														<div className="mb-1 flex items-center justify-between text-sm"><span className="font-medium text-slate-800">{r.name}</span><span className="font-semibold text-slate-700">{r.studentToday}%</span></div>
														<div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone(r.studentToday)}`} style={{ width: `${Math.min(r.studentToday, 100)}%` }} /></div>
													</Link>
												</li>
											))}
										</ul>
									</Panel>
								)}
							</div>

							<Panel title="Hisob ma'lumotlari">
								<dl className="space-y-3 text-sm">
									{[
										[<FiUser key="u" size={14} />, 'Login', `@${user.username}`],
										[<FiShield key="r" size={14} />, 'Daraja', LEVELS[level]],
										[<FiMapPin key="m" size={14} />, 'Hudud', placeName || 'Barcha hududlar'],
										[<FaSchool key="s" size={14} />, 'Maktablar', me?.schools !== undefined ? tx('{{n}} ta', { n: fmt(me.schools) }) : '—'],
										[<FiPhone key="p" size={14} />, 'Telefon', user.phone_personal || user.phone_work || '—'],
										[<FiCalendar key="c" size={14} />, "Qo'shilgan", dateOf(user.createdAt)],
										[<FiCalendar key="a" size={14} />, 'Oxirgi yangilanish', dateOf(user.updatedAt)]
									].map(([icon, label, value]) => (
										<div key={label} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0"><dt className="inline-flex items-center gap-2 text-slate-500">{icon}{label}</dt><dd className="truncate text-right font-medium text-slate-900">{value}</dd></div>
									))}
								</dl>
								<p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Monitor hisobi faqat ko'rish uchun: ma'lumotlarni o'zgartirib bo'lmaydi. Hisobni tizim egasi boshqaradi.</p>
							</Panel>
						</div>

						<div>
							<h2 className="mb-3 font-semibold text-slate-900">Tezkor o'tish</h2>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
								{quick.map(([to, title, sub, icon]) => (
									<Link key={to} to={to} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:shadow-md">
										<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">{icon}</div>
										<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{title}</p><p className="truncate text-xs text-slate-400">{sub}</p></div>
										<FiArrowRight className="shrink-0 text-slate-300" size={16} />
									</Link>
								))}
							</div>
						</div>
					</div>
				)}
			</LoadState>
		</Page>
	)
}

export default MonitorProfile
