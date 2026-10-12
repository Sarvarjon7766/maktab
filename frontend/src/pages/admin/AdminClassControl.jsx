import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertTriangle, FiArrowUp, FiEye, FiRefreshCw, FiUsers, FiVideo } from 'react-icons/fi'
import { FaHandPaper, FaRunning, FaUserGraduate } from 'react-icons/fa'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { authHeaders } from '../../components/HikCameraList'
import PoseChips from '../../components/PoseChips'
import useSchoolBase from '../../components/useSchoolBase'
import { tx } from '../../i18n'
import { ALERT_KINDS } from '../../utils/vision'
import { makeGuard, setVisibleInterval } from '../../utils/poll'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const hm = (t) => (t ? new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }) : '—')
const num = (n) => Number(n || 0).toLocaleString('uz-UZ')
const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null)
const show = (v, suffix = '%') => (v === null || v === undefined ? '—' : `${v}${suffix}`)

const KIND_LABEL = {
	vision_empty: "Sinf bo'sh qoldi", vision_surge: 'Odamlar keskin oshdi', vision_overcrowd: 'Ortiqcha odam / zich',
	vision_restless: 'Sinf notinch', vision_commotion: 'Zalda tartibsizlik'
}
const KIND_TONE = {
	vision_empty: 'bg-red-50 text-red-700', vision_surge: 'bg-orange-50 text-orange-700', vision_overcrowd: 'bg-violet-50 text-violet-700',
	vision_restless: 'bg-amber-50 text-amber-700', vision_commotion: 'bg-rose-50 text-rose-700'
}
const FLAG = {
	restless: ["Notinch: tez harakat", 'bg-amber-100 text-amber-800'],
	standing: ["Ko'pchilik tik turibdi", 'bg-red-100 text-red-700'],
	headDown: ['Boshi egilganlar ko\'p', 'bg-orange-100 text-orange-700'],
	hands: ["Qo'l ko'targanlar bor", 'bg-fuchsia-100 text-fuchsia-700']
}

// Darsdagi faollik darajasi: qo'l ko'targan holatlar ulushi (kun bo'yicha, skelet o'lchovlaridan). Taxminiy
const engagement = (today_) => {
	if (!today_ || today_.handsPct === null || today_.handsPct === undefined || today_.poseCoverage < 15) return { key: 'nodata', label: "Ma'lumot kam", tone: 'bg-gray-100 text-gray-600', color: '#9ca3af' }
	if (today_.handsPct >= 8) return { key: 'high', label: 'Yuqori', tone: 'bg-green-50 text-green-700', color: '#16a34a' }
	if (today_.handsPct >= 3) return { key: 'mid', label: "O'rtacha", tone: 'bg-amber-50 text-amber-700', color: '#f59e0b' }
	return { key: 'low', label: 'Past', tone: 'bg-red-50 text-red-700', color: '#dc2626' }
}

const Kpi = ({ icon, label, value, sub, tone = 'bg-slate-100 text-slate-600' }) => (
	<div className="flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
		<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
		<div className="min-w-0"><p className="truncate text-xs font-medium text-gray-500">{label}</p><p className="text-2xl font-bold leading-tight text-gray-900">{value}</p>{sub && <p className="truncate text-xs text-gray-400">{sub}</p>}</div>
	</div>
)

const Bar1 = ({ label, value, color }) => (
	<div>
		<div className="flex justify-between text-[11px] text-gray-500"><span>{label}</span><span className="font-semibold text-gray-800">{show(value)}</span></div>
		<div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value || 0)}%` }} /></div>
	</div>
)

const ClassCard = ({ c, base }) => {
	const lv = c.live
	const td = c.today
	const eng = engagement(td)
	const navigate = useNavigate()
	const open = () => navigate(`${base}/kuzatuv?sinf=${c.sinfId}`)
	const activity = lv && typeof lv.activity === 'number' ? Math.round(lv.activity * 100) : null
	return (
		<div role="link" tabIndex={0} onClick={open} onKeyDown={e => { if (e.key === 'Enter') open() }} title={tx("Hodisalarni ko'rish")}
			className="cursor-pointer rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0">
					<p className="text-lg font-bold text-gray-900">{c.sinf || '—'}</p>
					<p className="truncate text-xs text-gray-400">{c.cameras.length ? c.cameras.join(', ') : tx("Kamera biriktirilmagan")}</p>
				</div>
				<div className="text-right">
					{lv ? <p className="text-2xl font-bold leading-none text-blue-600">{lv.count}<span className="ml-1 text-xs font-medium text-gray-500">{tx('odam')}</span></p> : <p className="text-sm text-gray-400">{c.online ? tx("Ma'lumot kutilmoqda") : tx('Kamera offline')}</p>}
					{lv && <p className="text-[10px] text-gray-400">{hm(lv.at)}</p>}
				</div>
			</div>

			{c.flags.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{c.flags.map(f => <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FLAG[f][1]}`}>{tx(FLAG[f][0])}</span>)}</div>}

			{lv && (
				<div className="mt-3 space-y-2">
					<Bar1 label={tx('Harakat (hozir)')} value={activity} color={activity >= 60 ? 'bg-amber-500' : 'bg-blue-500'} />
					<Bar1 label={tx('Tik turganlar')} value={lv.standingPct} color="bg-red-400" />
					<Bar1 label={tx('Boshi egilganlar')} value={lv.headDownPct} color="bg-orange-400" />
					<PoseChips pose={lv.pose} only={['raised', 'standing', 'headDown']} className="pt-1" />
				</div>
			)}

			<div className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-center">
				<div><p className="text-sm font-bold text-gray-900">{td ? td.avgCount : '—'}</p><p className="text-[10px] text-gray-500">{tx("O'rtacha odam")}</p></div>
				<div><p className="text-sm font-bold text-gray-900">{td ? show(td.handsPct) : '—'}</p><p className="text-[10px] text-gray-500">{tx("Qo'l ko'targan")}</p></div>
				<div><p className={`text-sm font-bold ${c.alerts.total ? 'text-red-600' : 'text-gray-900'}`}>{c.alerts.total}</p><p className="text-[10px] text-gray-500">{tx('Hodisa')}</p></div>
			</div>
			<div className="mt-2">
				<span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${eng.tone}`}>{tx('Faollik')}: {tx(eng.label)}</span>
			</div>
		</div>
	)
}

// Maktab admini uchun sinfxonalar bo'yicha to'liq nazorat: odam soni, tik turgan / boshi egilgan / qo'l ko'targanlar,
// notinchlik (to'polon) belgilari, darsdagi faollik va soatlik dinamika. Hammasi kamera kadri va skelet bo'yicha TAXMINIY hisob
const AdminClassControl = () => {
	const base = useSchoolBase()
	const [date, setDate] = useState(today())
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [filter, setFilter] = useState('all')
	const isToday = date === today()

	const guard = useRef(makeGuard()).current
	const load = useCallback(async () => {
		const id = guard.next()
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/vision/overview`, { ...authHeaders(), params: { date } })
			if (!guard.ok(id)) return // sana almashgan: eskirgan javob
			if (res.data.success) { setData(res.data); setError(false) } else setError(true)
		} catch {
			if (guard.ok(id)) setError(true)
		} finally {
			if (guard.ok(id)) setLoading(false)
		}
	}, [date, guard])

	useEffect(() => {
		setLoading(true)
		load()
		if (!isToday) return
		const t = setVisibleInterval(load, 20000)
		return () => clearInterval(t)
	}, [load, isToday])

	const t = data?.totals
	const classes = useMemo(() => data?.classes || [], [data])
	const shown = useMemo(() => classes.filter(c => filter === 'all' || (filter === 'attention' ? c.flags.some(f => f !== 'hands') || c.alerts.total > 0 : filter === 'hands' ? c.flags.includes('hands') : !!c.live)), [classes, filter])
	const ranking = useMemo(() => classes.filter(c => c.today && c.today.handsPct !== null).map(c => ({ name: c.sinf, value: c.today.handsPct, color: engagement(c.today).color })).sort((a, b) => b.value - a.value).slice(0, 15), [classes])
	const hourly = useMemo(() => (data?.hourly || []).map(h => ({ soat: String(h.hour).padStart(2, '0'), Harakat: h.activityPct, 'Tik turgan': h.standingPct, 'Boshi egilgan': h.headDownPct, "Qo'l ko'targan": h.handsPct })), [data])
	const hasHourly = hourly.some(h => h.Harakat !== null || h['Tik turgan'] !== null)

	return (
		<div className="min-h-full space-y-6 bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex items-center gap-2">
					{isToday && <span className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700"><span className="h-2 w-2 animate-pulse rounded-full bg-green-500" /> {tx('Jonli (20 soniyada yangilanadi)')}</span>}
					<input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-black" />
					<button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx('Yangilash')}</button>
				</div>
			</div>

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")}</div>}
			{data && data.poseEnabled === false && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{tx("Holatlarni aniqlash o'chirilgan: tik turgan, boshi egilgan va qo'l ko'targanlar hisoblanmaydi. Tizim egasi AI sozlamalarida yoqishi mumkin.")}</div>}

			{t && (
				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Kpi icon={<FiVideo />} tone="bg-blue-50 text-blue-600" label={tx('Kuzatuvdagi sinflar')} value={`${t.classesLive}/${t.classes}`} sub={tx('Kameralar online: {{a}}/{{b}}', { a: t.camerasOnline, b: t.cameras })} />
					<Kpi icon={<FiUsers />} tone="bg-indigo-50 text-indigo-600" label={tx('Hozir kamerada odam')} value={num(t.peopleNow)} sub={tx("O'qituvchi va mehmonlar bilan")} />
					<Kpi icon={<FaUserGraduate />} tone="bg-red-50 text-red-600" label={tx('Tik turganlar')} value={num(t.standingNow)} sub={`${show(pctOf(t.standingNow, t.analyzedNow))} · ${tx('kun bo\'yicha')} ${show(t.standingPctDay)}`} />
					<Kpi icon={<FiArrowUp style={{ transform: 'rotate(180deg)' }} />} tone="bg-orange-50 text-orange-600" label={tx('Boshi egilganlar')} value={num(t.headDownNow)} sub={`${show(pctOf(t.headDownNow, t.analyzedNow))} · ${tx("kun bo'yicha")} ${show(t.headDownPctDay)}`} />
					<Kpi icon={<FaHandPaper />} tone="bg-fuchsia-50 text-fuchsia-600" label={tx("Qo'l ko'targanlar")} value={num(t.handsNow)} sub={`${tx("kun bo'yicha")} ${show(t.handsPctDay)}`} />
					<Kpi icon={<FaRunning />} tone="bg-amber-50 text-amber-600" label={tx('Notinch sinflar')} value={num(t.restlessNow)} sub={tx("tez harakat yoki ko'pchilik tik turgan")} />
					<Kpi icon={<FiAlertTriangle />} tone="bg-rose-50 text-rose-600" label={tx('Muhim hodisalar')} value={num(t.alerts)} sub={tx('{{d}} kuni', { d: data.date })} />
					<Kpi icon={<FiEye />} tone="bg-slate-100 text-slate-600" label={tx('Holati aniqlangan')} value={num(t.analyzedNow)} sub={tx('hozirgi kadrlarda odam (skelet)')} />
				</div>
			)}

			{t && t.alerts > 0 && (
				<div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
					<p className="mr-2 text-sm font-semibold text-gray-800">{tx('Bugungi hodisalar')}:</p>
					{ALERT_KINDS.filter(k => t.alertsByKind[k]).map(k => <span key={k} className={`rounded-full px-3 py-1 text-xs font-medium ${KIND_TONE[k]}`}>{tx(KIND_LABEL[k])}: {t.alertsByKind[k]}</span>)}
					<Link to={`${base}/kuzatuv`} className="ml-auto text-sm font-medium text-blue-600 hover:underline">{tx("Aqlli kuzatuvda ko'rish")} →</Link>
				</div>
			)}

			<div>
				<div className="mb-3 flex flex-wrap items-center gap-2">
					<h2 className="mr-2 text-base font-semibold text-gray-900">{tx('Sinflar holati')}</h2>
					{[['all', tx('Hammasi'), classes.length], ['live', tx('Jonli'), classes.filter(c => c.live).length], ['attention', tx("E'tibor talab"), classes.filter(c => c.flags.some(f => f !== 'hands') || c.alerts.total > 0).length], ['hands', tx("Qo'l ko'targanlar"), classes.filter(c => c.flags.includes('hands')).length]].map(([k, label, n]) => (
						<button key={k} onClick={() => setFilter(k)} className={`rounded-xl border px-3 py-1.5 text-sm transition ${filter === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>{label} <span className="opacity-70">· {n}</span></button>
					))}
				</div>
				{loading && !data ? <p className="py-10 text-center text-sm text-gray-400">{tx('Yuklanmoqda...')}</p>
					: !classes.length ? <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">{tx("Kuzatuv faqat sinfga biriktirilgan va odam sanash yoqilgan kameralar uchun ishlaydi. «Kamera sozlamalari» sahifasida kamerani sinfga biriktirib, odamlar sonini sanashni yoqing.")}</div>
						: <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{shown.map(c => <ClassCard key={c.sinfId} c={c} base={base} />)}</div>}
			</div>

			{data?.halls?.length > 0 && (
				<section>
					<h2 className="mb-3 text-base font-semibold text-gray-900">{tx('Zal va koridor kameralari')}</h2>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
						{data.halls.map(h => (
							<div key={h.cameraId} className={`rounded-2xl border p-4 shadow-sm ${h.crowded ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-white'}`}>
								<div className="flex items-start justify-between gap-2">
									<p className="min-w-0 truncate font-semibold text-gray-900">{h.name}</p>
									{h.crowded && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{tx('Zich')}</span>}
								</div>
								<p className="mt-2 text-2xl font-bold text-blue-600">{h.count === null ? '—' : h.count}<span className="ml-1 text-xs font-medium text-gray-500">/ {h.limit} {tx('odam')}</span></p>
								<p className="text-[11px] text-gray-400">{h.online === false ? tx('Kamera offline') : h.at ? hm(h.at) : tx("Ma'lumot kutilmoqda")}{typeof h.activity === 'number' && h.count > 0 ? ` · ${tx('Harakat')} ${Math.round(h.activity * 100)}%` : ''}</p>
							</div>
						))}
					</div>
				</section>
			)}

			{ranking.length > 0 && (
				<section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
					<h2 className="text-base font-semibold text-gray-900">{tx("Darsdagi faollik: qo'l ko'targanlar ulushi (sinflar kesimida)")}</h2>
					<p className="mb-3 text-xs text-gray-500">{tx("Kun davomidagi o'lchovlarda holati aniqlangan o'quvchilarning qanchasi qo'l ko'targan. 8% dan yuqori — yuqori faollik, 3–8% — o'rtacha, 3% dan past — past")}</p>
					<div style={{ height: Math.max(180, ranking.length * 28 + 30) }}>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={ranking} layout="vertical" margin={{ left: 10, right: 24, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" horizontal={false} />
								<XAxis type="number" tick={{ fontSize: 10 }} unit="%" /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
								<Tooltip formatter={(v) => `${v}%`} />
								<Bar isAnimationActive={false} dataKey="value" name={tx("Qo'l ko'targan %")} radius={[0, 4, 4, 0]}>{ranking.map((r, i) => <Cell key={i} fill={r.color} />)}</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</section>
			)}

			{hasHourly && (
				<section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
					<h2 className="mb-3 text-base font-semibold text-gray-900">{tx('Kun dinamikasi (soatlar bo\'yicha, butun maktab)')}</h2>
					<div style={{ height: 260 }}>
						<ResponsiveContainer width="100%" height="100%">
							<LineChart data={hourly} margin={{ left: -12, right: 8, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="soat" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} unit="%" />
								<Tooltip formatter={(v) => (v === null || v === undefined ? '—' : `${v}%`)} /><Legend />
								<Line isAnimationActive={false} type="monotone" dataKey="Harakat" name={tx('Harakat')} stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
								<Line isAnimationActive={false} type="monotone" dataKey="Tik turgan" name={tx('Tik turgan')} stroke="#dc2626" strokeWidth={2} dot={false} connectNulls />
								<Line isAnimationActive={false} type="monotone" dataKey="Boshi egilgan" name={tx('Boshi egilgan')} stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
								<Line isAnimationActive={false} type="monotone" dataKey="Qo'l ko'targan" name={tx("Qo'l ko'targan")} stroke="#c026d3" strokeWidth={2} dot={false} connectNulls />
							</LineChart>
						</ResponsiveContainer>
					</div>
				</section>
			)}

			<p className="text-xs text-gray-400">{tx("Eslatma: natijalar taxminiy (kamera burchagi, partalar va qatorlar to'sib qo'yishi aniqlikka ta'sir qiladi). Sanoq o'qituvchi va mehmonlarni ham o'z ichiga oladi. Shaxs aniqlanmaydi.")}</p>
		</div>
	)
}

export default AdminClassControl
