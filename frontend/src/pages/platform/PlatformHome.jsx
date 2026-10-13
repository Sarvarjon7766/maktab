import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaChalkboardTeacher, FaDatabase, FaRobot, FaSchool, FaServer, FaTelegramPlane, FaUserGraduate, FaVideo } from 'react-icons/fa'
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiCloud, FiHardDrive, FiRefreshCw, FiUsers } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { tx } from '../../i18n'
import { setVisibleInterval } from '../../utils/poll'

const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ')
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 10) / 10}%`)
const bytes = (n) => {
	if (n === null || n === undefined) return '—'
	const u = ['B', 'KB', 'MB', 'GB', 'TB']
	let i = 0, v = Number(n)
	while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
	return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`
}
const ago = (d) => {
	if (!d) return tx("hech qachon")
	const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000))
	if (s < 60) return tx("hozirgina")
	if (s < 3600) return tx("{{n}} daqiqa oldin", { n: Math.round(s / 60) })
	if (s < 86400) return tx("{{n}} soat oldin", { n: Math.round(s / 3600) })
	return tx("{{n}} kun oldin", { n: Math.round(s / 86400) })
}
const uptime = (sec) => {
	const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
	return d ? `${d} ${tx('kun')} ${h} ${tx('soat')}` : h ? `${h} ${tx('soat')} ${m} ${tx('daq')}` : `${m} ${tx('daq')}`
}

// Rang va belgi (Tailwind klasslari to'liq yoziladi)
const TONE = {
	green: { dot: 'bg-emerald-500', soft: 'bg-emerald-50 text-emerald-700', icon: 'bg-emerald-50 text-emerald-600' },
	amber: { dot: 'bg-amber-500', soft: 'bg-amber-50 text-amber-700', icon: 'bg-amber-50 text-amber-600' },
	red: { dot: 'bg-red-500', soft: 'bg-red-50 text-red-700', icon: 'bg-red-50 text-red-600' },
	blue: { dot: 'bg-blue-500', soft: 'bg-blue-50 text-blue-700', icon: 'bg-blue-50 text-blue-600' },
	violet: { dot: 'bg-violet-500', soft: 'bg-violet-50 text-violet-700', icon: 'bg-violet-50 text-violet-600' },
	slate: { dot: 'bg-slate-400', soft: 'bg-slate-100 text-slate-600', icon: 'bg-slate-100 text-slate-600' }
}

const Card = ({ title, action, children, className = '' }) => (
	<section className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
		{(title || action) && <div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold text-gray-900">{title}</h2>{action}</div>}
		{children}
	</section>
)
const More = ({ to, children }) => <Link to={to} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">{children} <FiArrowRight size={13} /></Link>

const Kpi = ({ icon, tone, label, value, note, to }) => {
	const body = (
		<div className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
			<span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${TONE[tone].icon}`}>{icon}</span>
			<div className="min-w-0"><p className="truncate text-xs font-medium text-gray-500">{label}</p><p className="mt-0.5 text-2xl font-bold leading-tight text-gray-900">{value}</p>{note && <p className="truncate text-xs text-gray-400">{note}</p>}</div>
		</div>
	)
	return to ? <Link to={to} className="block">{body}</Link> : body
}

// Xizmat holati: nuqta (yashil/sariq/qizil) + sarlavha + qisqa izoh
const Service = ({ icon, name, tone, status, lines, to }) => {
	const t = TONE[tone]
	const inner = (
		<div className="flex h-full gap-3 rounded-xl border border-gray-100 p-3.5 transition hover:border-blue-200 hover:bg-blue-50/30">
			<span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${t.icon}`}>{icon}</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-gray-900">{name}</p><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${t.soft}`}><i className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />{status}</span></div>
				{lines.map((l, i) => <p key={i} className="mt-0.5 truncate text-xs text-gray-500" title={l}>{l}</p>)}
			</div>
		</div>
	)
	return to ? <Link to={to} className="block">{inner}</Link> : inner
}

const Bar = ({ value, tone = 'blue' }) => <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${TONE[tone].dot}`} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} /></div>
const levelTone = (p) => (p === null || p === undefined ? 'slate' : p >= 85 ? 'green' : p >= 60 ? 'amber' : 'red')

const PlatformHome = () => {
	const [data, setData] = useState(null)
	const [health, setHealth] = useState(null)
	const [error, setError] = useState(false)
	const [loading, setLoading] = useState(false)

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const [o, h] = await Promise.all([
				axios.get(`${BASE}/api/platform-settings/overview`, auth()),
				axios.get(`${BASE}/api/health`).catch(() => null)
			])
			if (o.data.success) { setData(o.data); setError(false) } else setError(true)
			setHealth(h?.data || null)
		} catch { setError(true) } finally { setLoading(false) }
	}, [])
	useEffect(() => { load(); const t = setVisibleInterval(load, 30000); return () => clearInterval(t) }, [load])

	// "Diqqat talab qiladi": har bir band — jiddiylik, matn va tegishli sahifaga havola
	const issues = useMemo(() => {
		if (!data) return []
		const out = []
		const { hik, persons, attendance, schools, ai, bot, storage } = data
		if (hik) {
			hik.accounts.filter(a => a.lastSyncError).forEach(a => out.push({ sev: 'high', text: tx("Hik-Connect akkaunti «{{name}}» sinxronlanmayapti", { name: a.name }), sub: a.lastSyncError, to: '/platform/hik-accounts' }))
			if (hik.accounts.length === 0) out.push({ sev: 'high', text: tx("Hik-Connect akkaunti ulanmagan"), to: '/platform/hik-accounts' })
			if (hik.cameras.offline > 0) out.push({ sev: 'medium', text: tx("{{n}} ta kamera offline", { n: hik.cameras.offline }), sub: hik.offlineSchools.map(s => `${s.name} (${s.offline})`).join(', '), to: '/platform/school-control?filter=cam_offline' })
			if (hik.cameras.unassigned > 0) out.push({ sev: 'low', text: tx("{{n}} ta kamera hech qaysi maktabga biriktirilmagan", { n: hik.cameras.unassigned }), to: '/platform/hik-cameras' })
		}
		if (persons?.failed > 0) out.push({ sev: 'high', text: tx("{{n}} ta xodim/o'quvchi Hik-Connect'ga yuborilmadi", { n: persons.failed }), sub: tx("Maktab admini «Kamera sozlamalari» sahifasida xatoni ko'radi"), to: '/platform/school-control?filter=sync_failed' })
		else if (persons?.pendingAdd + persons?.pendingDelete > 0) out.push({ sev: 'low', text: tx("{{n}} ta o'zgarish Hik-Connect'ga yuborilishini kutmoqda", { n: persons.pendingAdd + persons.pendingDelete }) })
		if (attendance && attendance.noDataCount > 0 && attendance.noDataCount >= (schools?.active || 0)) out.push({ sev: 'medium', text: tx("Bugun hech bir maktabda davomat qayd etilmagan"), sub: tx("Kirish/chiqish kameralari yoki Hik-Connect sozlamalarini tekshiring"), to: '/platform/school-control?filter=no_attendance' })
		else if (attendance?.noDataCount > 0) out.push({ sev: 'low', text: tx("{{n}} ta maktabda bugun davomat qayd etilmagan", { n: attendance.noDataCount }), to: '/platform/school-control?filter=no_attendance' })
		if (ai?.enabled && ai.lastAnalysisAt && Date.now() - new Date(ai.lastAnalysisAt).getTime() > 20 * 60000) out.push({ sev: 'medium', text: tx("AI tahlil {{t}} to'xtagan", { t: ago(ai.lastAnalysisAt) }), to: '/platform/school-cameras' })
		if (bot && !bot.ready) out.push({ sev: 'low', text: tx("Ota-onalar Telegram boti ulanmagan"), to: '/platform/telegram' })
		if (bot?.failedToday > 0) out.push({ sev: 'medium', text: tx("Bugun {{n}} ta Telegram xabar yuborilmadi", { n: bot.failedToday }), to: '/platform/telegram' })
		if (storage?.disk && storage.disk.freeBytes / storage.disk.totalBytes < 0.1) out.push({ sev: 'high', text: tx("Serverda disk joyi tugayapti: {{n}} qoldi", { n: bytes(storage.disk.freeBytes) }) })
		if (schools?.inactive > 0) out.push({ sev: 'low', text: tx("{{n}} ta maktab to'xtatilgan", { n: schools.inactive }), to: '/platform/school-control?filter=inactive' })
		if (schools && schools.withLocation < schools.total) out.push({ sev: 'low', text: tx("{{n}} ta maktabning joylashuvi belgilanmagan", { n: schools.total - schools.withLocation }), to: '/platform/school-control?filter=no_location' })
		data.errors?.forEach(e => out.push({ sev: 'medium', text: tx("«{{name}}» bo'limi ma'lumotini olib bo'lmadi", { name: e }) }))
		if (health && health.ok === false) out.push({ sev: 'high', text: tx("Ma'lumotlar bazasiga ulanish yo'q") })
		if (health?.eventLoopMs?.loopP99 > 500) out.push({ sev: 'medium', text: tx("Server sekinlashgan (kechikish {{n}} ms)", { n: Math.round(health.eventLoopMs.loopP99) }) })
		return out.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.sev] - { high: 0, medium: 1, low: 2 }[b.sev]))
	}, [data, health])

	if (error && !data) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")} <button onClick={load} className="ml-2 underline">{tx("Qayta urinish")}</button></div></div>
	if (!data) return <div className="p-6"><div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />)}</div></div>

	const { schools, people, attendance, hik, persons, ai, bot, storage, audit } = data
	const SEV = { high: ['red', tx('Jiddiy')], medium: ['amber', tx("O'rta")], low: ['slate', tx('Past')] }
	const cam = hik?.cameras
	const camTone = !cam ? 'slate' : cam.assigned === 0 ? 'slate' : cam.offline === 0 ? 'green' : cam.offline / cam.assigned > 0.3 ? 'red' : 'amber'
	const hikErr = hik?.accounts.some(a => a.lastSyncError)
	const lastSync = hik?.accounts.map(a => a.lastSyncAt).filter(Boolean).sort().pop()
	const diskUsed = storage?.disk ? Math.round((1 - storage.disk.freeBytes / storage.disk.totalBytes) * 100) : null
	const aiStale = ai?.enabled && ai.lastAnalysisAt && Date.now() - new Date(ai.lastAnalysisAt).getTime() > 20 * 60000

	return (
		<div className="space-y-5 p-4 md:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold text-gray-900">{tx("Tizim nazorati")}</h1>
					<p className="text-sm text-gray-500">{tx("Butun tizim holati: {{a}} · yangilandi {{b}}", { a: data.date, b: ago(data.at) })}</p>
				</div>
				<button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx("Yangilash")}</button>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<Kpi icon={<FaSchool />} tone="blue" label={tx("Maktablar")} value={schools ? fmt(schools.active) : '—'} note={schools ? tx("{{a}} ta jami · {{b}} ta tuman", { a: schools.total, b: schools.districts }) : ''} to="/platform/schools" />
				<Kpi icon={<FiUsers />} tone="violet" label={tx("O'quvchi va xodimlar")} value={people ? fmt(people.students + people.staff) : '—'} note={people ? tx("{{a}} o'quvchi · {{b}} xodim", { a: fmt(people.students), b: fmt(people.staff) }) : ''} />
				<Kpi icon={<FaUserGraduate />} tone={levelTone(attendance?.students.percent)} label={tx("Bugungi davomat")} value={pct(attendance?.students.percent)} note={attendance ? tx("{{a}} / {{b}} o'quvchi", { a: fmt(attendance.students.came), b: fmt(attendance.students.total) }) : ''} to="/platform/school-control" />
				<Kpi icon={<FaVideo />} tone={camTone} label={tx("Kameralar online")} value={cam ? `${cam.online}/${cam.assigned}` : '—'} note={cam ? tx("{{n}} ta biriktirilmagan", { n: cam.unassigned }) : ''} to="/platform/school-cameras" />
			</div>

			<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
				<Card title={<span className="flex items-center gap-2"><FiAlertTriangle className="text-amber-500" /> {tx("Diqqat talab qiladi")}</span>} action={issues.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">{issues.length}</span>}>
					{issues.length === 0 ? (
						<div className="flex flex-col items-center gap-2 py-10 text-center text-emerald-700"><FiCheckCircle size={30} /><p className="text-sm font-medium">{tx("Hammasi joyida: muammo topilmadi")}</p></div>
					) : (
						<ul className="space-y-2">
							{issues.map((it, i) => {
								const [tone, label] = SEV[it.sev]
								const body = (
									<div className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-blue-200 hover:bg-blue-50/30">
										<span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE[tone].soft}`}>{label}</span>
										<div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900">{it.text}</p>{it.sub && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{it.sub}</p>}</div>
										{it.to && <FiArrowRight className="mt-1 shrink-0 text-gray-300" size={14} />}
									</div>
								)
								return <li key={i}>{it.to ? <Link to={it.to}>{body}</Link> : body}</li>
							})}
						</ul>
					)}
				</Card>

				<Card title={tx("Tizim salomatligi")} action={health && <span className="text-xs text-gray-400">{tx("ishlash vaqti")}: {uptime(health.uptimeSec)}</span>}>
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						<Service icon={<FaServer />} name={tx("Server")} tone={!health ? 'red' : health.eventLoopMs?.loopP99 > 500 ? 'amber' : 'green'} status={!health ? tx("Javob yo'q") : health.eventLoopMs?.loopP99 > 500 ? tx("Sekin") : tx("Ishlayapti")}
							lines={health ? [tx("Xotira {{a}} MB · kechikish {{b}} ms", { a: health.rssMB, b: Math.round(health.eventLoopMs?.loopP99 || 0) }), tx("Sekin so'rovlar: {{n}}", { n: health.requests?.slow ?? 0 })] : [tx("Server /api/health ga javob bermayapti")]} />
						<Service icon={<FaDatabase />} name={tx("Ma'lumotlar bazasi")} tone={health && health.ok === false ? 'red' : 'green'} status={health && health.ok === false ? tx("Uzilgan") : tx("Ulangan")}
							lines={storage?.db ? [tx("{{a}} · {{b}} yozuv", { a: bytes(storage.db.dataBytes), b: fmt(storage.db.objects) }), tx("{{n}} ta jadval", { n: storage.db.collections })] : [tx("Ma'lumot yo'q")]} />
						<Service icon={<FiCloud />} name="Hik-Connect" to="/platform/hik-accounts" tone={!hik || hik.accounts.length === 0 || hikErr ? 'red' : 'green'} status={!hik || hik.accounts.length === 0 ? tx("Ulanmagan") : hikErr ? tx("Xato") : tx("Ulangan")}
							lines={[tx("Akkauntlar: {{n}}", { n: hik?.accounts.length ?? 0 }), tx("Oxirgi sinxron: {{t}}", { t: ago(lastSync) })]} />
						<Service icon={<FiUsers />} name={tx("Shaxslar sinxroni")} to="/platform/school-control" tone={!persons ? 'slate' : persons.failed ? 'red' : persons.pendingAdd + persons.pendingDelete ? 'amber' : 'green'} status={!persons ? '—' : persons.failed ? tx("Xato: {{n}}", { n: persons.failed }) : persons.pendingAdd + persons.pendingDelete ? tx("Navbatda") : tx("Yangilangan")}
							lines={persons ? [tx("Bulutda: {{a}} · navbatda: {{b}}", { a: fmt(persons.synced), b: persons.pendingAdd + persons.pendingDelete })] : []} />
						<Service icon={<FaRobot />} name={tx("AI tahlil")} to="/platform/school-cameras" tone={!ai ? 'slate' : !ai.enabled ? 'slate' : aiStale ? 'amber' : 'green'} status={!ai ? '—' : !ai.enabled ? tx("O'chirilgan") : aiStale ? tx("To'xtagan") : tx("Ishlayapti")}
							lines={ai ? [tx("Oxirgi tahlil: {{t}}", { t: ago(ai.lastAnalysisAt) }), tx("Bugun: {{a}} tahlil · {{b}} ogohlantirish", { a: fmt(ai.analysesToday), b: ai.alertsToday })] : []} />
						<Service icon={<FaTelegramPlane />} name={tx("Telegram bot")} to="/platform/telegram" tone={!bot ? 'slate' : bot.ready ? (bot.failedToday ? 'amber' : 'green') : 'slate'} status={!bot ? '—' : bot.ready ? tx("Ulangan") : tx("Ulanmagan")}
							lines={bot ? [tx("Ota-onalar: {{n}}", { n: fmt(bot.guardians) }), tx("Bugun yuborildi: {{a}} · xato: {{b}}", { a: bot.sentToday, b: bot.failedToday })] : []} />
					</div>
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
				<Card title={tx("Bugungi davomat")} action={<More to="/platform/school-control">{tx("Maktablar nazorati")}</More>}>
					{attendance && (
						<div className="space-y-4">
							{[[tx("O'quvchilar"), attendance.students, <FaUserGraduate key="s" />], [tx("Xodimlar"), attendance.staff, <FaChalkboardTeacher key="t" />]].map(([label, v, icon]) => (
								<div key={label}>
									<div className="mb-1.5 flex items-center justify-between text-sm"><span className="flex items-center gap-2 font-medium text-gray-800"><span className="text-gray-400">{icon}</span>{label}</span><span className="text-gray-500">{fmt(v.came)} / {fmt(v.total)} · <b className="text-gray-900">{pct(v.percent)}</b>{v.late > 0 && <span className="ml-1 text-amber-600">{tx("kech: {{n}}", { n: v.late })}</span>}</span></div>
									<Bar value={v.percent} tone={levelTone(v.percent)} />
								</div>
							))}
							<div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">{tx("Davomat qayd etilgan maktablar: {{a}} / {{b}}", { a: attendance.schoolsWithData, b: schools?.active ?? 0 })}</div>
							{attendance.lowest.length > 0 && (
								<div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{tx("Eng past davomat")}</p>
									<ul className="space-y-1.5">{attendance.lowest.map(s => <li key={s._id}><Link to={`/platform/schools/${s._id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"><span className="truncate text-gray-800">{s.name} <span className="text-xs text-gray-400">{s.district}</span></span><b className={s.percent < 60 ? 'text-red-600' : 'text-amber-600'}>{pct(s.percent)}</b></Link></li>)}</ul>
								</div>
							)}
						</div>
					)}
				</Card>

				<Card title="Hik-Connect" action={<More to="/platform/hik-accounts">{tx("Akkauntlar")}</More>}>
					{hik && (
						<div className="space-y-4">
							<div className="grid grid-cols-3 gap-2 text-center">
								{[[tx("Online"), cam.online, 'green'], [tx("Offline"), cam.offline, cam.offline ? 'red' : 'slate'], [tx("Biriktirilmagan"), cam.unassigned, 'slate']].map(([l, v, t]) => <div key={l} className={`rounded-xl px-2 py-3 ${TONE[t].soft}`}><p className="text-xl font-bold">{v}</p><p className="text-[11px]">{l}</p></div>)}
							</div>
							<ul className="space-y-2">
								{hik.accounts.map(a => (
									<li key={a._id} className="rounded-xl border border-gray-100 p-3 text-sm">
										<div className="flex items-center justify-between gap-2"><span className="truncate font-medium text-gray-900">{a.name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${a.lastSyncError ? TONE.red.soft : TONE.green.soft}`}>{a.lastSyncError ? tx("Xato") : tx("Ulangan")}</span></div>
										<p className="mt-0.5 text-xs text-gray-500">{tx("{{a}} kamera ({{b}} online) · sinxron: {{t}}", { a: a.cameraTotal, b: a.cameraOnline, t: ago(a.lastSyncAt) })}</p>
										{a.lastSyncError && <p className="mt-1 line-clamp-2 text-xs text-red-600">{a.lastSyncError}</p>}
									</li>
								))}
							</ul>
							{hik.offlineSchools.length > 0 && <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{tx("Offline kameralar bor maktablar")}</p><ul className="space-y-1">{hik.offlineSchools.map(s => <li key={s._id}><Link to={`/platform/schools/${s._id}/camera`} className="flex justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50"><span className="text-gray-800">{s.name}</span><b className="text-red-600">{s.offline}</b></Link></li>)}</ul></div>}
						</div>
					)}
				</Card>

				<Card title={tx("Xotira va resurslar")} action={<More to="/platform/branding">{tx("Sozlamalar")}</More>}>
					{storage && (
						<div className="space-y-4 text-sm">
							{storage.disk && (
								<div>
									<div className="mb-1.5 flex items-center justify-between"><span className="flex items-center gap-2 font-medium text-gray-800"><FiHardDrive className="text-gray-400" />{tx("Server diski")}</span><span className="text-gray-500">{tx("{{a}} bo'sh / {{b}}", { a: bytes(storage.disk.freeBytes), b: bytes(storage.disk.totalBytes) })}</span></div>
									<Bar value={diskUsed} tone={diskUsed >= 90 ? 'red' : diskUsed >= 75 ? 'amber' : 'blue'} />
								</div>
							)}
							{[[tx("Ma'lumotlar bazasi"), storage.db && bytes(storage.db.dataBytes), storage.db && tx("{{n}} yozuv", { n: fmt(storage.db.objects) })], [tx("Yuklangan rasmlar"), bytes(storage.uploads.bytes), tx("{{n}} fayl", { n: fmt(storage.uploads.files) })], [tx("AI dalil kadrlari"), bytes(storage.evidence.bytes), tx("{{n}} fayl", { n: fmt(storage.evidence.files) })]].map(([l, v, n]) => (
								<div key={l} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5"><span className="text-gray-700">{l}</span><span className="text-right"><b className="text-gray-900">{v}</b><span className="ml-2 text-xs text-gray-400">{n}</span></span></div>
							))}
							<div className="grid grid-cols-3 gap-2 text-center">
								{[[tx("Maktab adminlari"), people?.schoolAdmins], [tx("Monitorlar"), people?.monitors], [tx("Tumanlar"), schools?.districts]].map(([l, v]) => <div key={l} className="rounded-xl border border-gray-100 py-2.5"><p className="text-lg font-bold text-gray-900">{v ?? '—'}</p><p className="text-[11px] text-gray-500">{l}</p></div>)}
							</div>
						</div>
					)}
				</Card>
			</div>

			<div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
				<Card title={tx("Tezkor havolalar")}>
					<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
						{[['/platform/schools', tx("Maktablar"), <FaSchool key="1" />, 'blue'], ['/platform/map', tx("Xarita"), <FiCloud key="2" />, 'green'], ['/platform/monitors', tx("Monitorlar"), <FiUsers key="3" />, 'violet'], ['/platform/hik-accounts', 'Hik-Connect', <FiCloud key="4" />, 'amber'], ['/platform/telegram', tx("Telegram bot"), <FaTelegramPlane key="5" />, 'blue'], ['/platform/audit-log', tx("Audit jurnali"), <FiCheckCircle key="6" />, 'slate']].map(([to, label, icon, tone]) => (
							<Link key={to} to={to} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3 text-sm font-medium text-gray-800 transition hover:border-blue-200 hover:bg-blue-50/30"><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${TONE[tone].icon}`}>{icon}</span>{label}</Link>
						))}
					</div>
				</Card>
				<Card title={tx("Oxirgi kirishlar (maktab ichiga)")} action={<More to="/platform/audit-log">{tx("Hammasi")}</More>}>
					{audit?.length ? (
						<ul className="divide-y divide-gray-50">{audit.map(a => <li key={a._id} className="flex items-center justify-between gap-3 py-2.5 text-sm"><span className="min-w-0"><b className="text-gray-900">{a.who}</b> <span className="text-gray-500">→</span> {a.schoolId ? <Link to={`/platform/schools/${a.schoolId}`} className="text-blue-600 hover:underline">{a.school}</Link> : a.school}</span><span className="shrink-0 text-xs text-gray-400">{ago(a.at)}</span></li>)}</ul>
					) : <p className="py-8 text-center text-sm text-gray-500">{tx("Hali yozuv yo'q")}</p>}
				</Card>
			</div>
		</div>
	)
}

export default PlatformHome
