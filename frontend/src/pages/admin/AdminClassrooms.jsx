import axios from 'axios'
import { tx } from '../../i18n'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiRefreshCw, FiSearch, FiVideo } from 'react-icons/fi'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Link, useNavigate } from 'react-router-dom'
import { authHeaders, statusOf } from '../../components/HikCameraList'
import HikLivePlayer from '../../components/HikLivePlayer'
import ClassVisionPanel from '../../components/ClassVisionPanel'
import { EvidenceGallery } from '../../components/EvidenceViewer'
import FactorList from '../../components/ClassFactors'
import ClassBreakdown from '../../components/ClassBreakdown'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())

// Dars holati darajalari
const LEVELS = {
	good: { label: tx('Yaxshi'), ring: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
	mid: { label: tx("O'rtacha"), ring: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
	attention: { label: tx('Diqqat'), ring: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' },
	nodata: { label: tx("Ma'lumot yo'q"), ring: '#9ca3af', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
	idle: { label: tx("Dars yo'q"), ring: '#6366f1', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
}

// Kamera hodisalari turlari (Hik alarm turlari)
const KINDS = {
	motion: { label: tx('Harakat'), tone: 'bg-blue-50 text-blue-700' },
	density: { label: tx('Odam zichligi'), tone: 'bg-amber-50 text-amber-700' },
	people: { label: tx("Odamlar soni g'ayritabiiy"), tone: 'bg-red-50 text-red-700' },
	enter: { label: tx('Hududga kirish'), tone: 'bg-green-50 text-green-700' },
	exit: { label: tx('Hududdan chiqish'), tone: 'bg-orange-50 text-orange-700' },
	multi: { label: tx("Ko'p turdagi obyekt"), tone: 'bg-violet-50 text-violet-700' },
	vision_empty: { label: tx("Sinf bo'sh qoldi"), tone: 'bg-red-50 text-red-700' },
	vision_surge: { label: tx('Odamlar keskin oshdi'), tone: 'bg-orange-50 text-orange-700' },
	vision_overcrowd: { label: tx('Ortiqcha odam'), tone: 'bg-violet-50 text-violet-700' },
	vision_sample: { label: tx('Avtomatik namuna'), tone: 'bg-blue-50 text-blue-700' }
}

const ago = (date) => {
	if (!date) return tx("hali yo'q")
	const min = Math.round((Date.now() - new Date(date).getTime()) / 60000)
	if (min < 1) return 'hozirgina'
	if (min < 60) return tx("{{n}} daqiqa oldin", { n: min })
	return tx("{{n}} soat oldin", { n: Math.round(min / 60) })
}

const ScoreRing = ({ score, level }) => {
	const r = 42
	const c = 2 * Math.PI * r
	const color = LEVELS[level].ring
	return (
		<svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
			<circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
			<circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(level === 'nodata' ? 0 : score) / 100 * c} ${c}`} transform="rotate(-90 50 50)" />
			<text x="50" y="49" textAnchor="middle" fontSize="24" fontWeight="700" fill="#111827">{level === 'nodata' ? '—' : score}</text>
			<text x="50" y="65" textAnchor="middle" fontSize="9" fill="#6b7280">ball</text>
		</svg>
	)
}

const Metric = ({ label, value, tone = 'text-gray-900', onClick }) => (
	<div {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => { if (e.key === 'Enter') onClick() } } : {})} className={`rounded-xl bg-gray-50 px-3 py-2 text-center ${onClick ? 'cursor-pointer hover:bg-gray-100 transition' : ''}`}><p className={`text-lg font-bold ${tone}`}>{value}</p><p className="text-[11px] text-gray-500">{label}</p></div>
)

// Sinfxonalar: FAQAT sinfga biriktirilgan kameralar. Davomat, xona faolligi, zichlik signallari va
// kamera holati bo'yicha dars jarayoni tahlili (videodan o'quvchilarni sanash Hik API'da yo'q)
const EMPTY = []

const AdminClassrooms = () => {
	const navigate = useNavigate()
	const [data, setData] = useState(null)
	const [date, setDate] = useState(today())
	const [filter, setFilter] = useState('all')
		const [q, setQ] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [vision, setVision] = useState({ items: [], intervalSec: 60 })
	const [visionDay, setVisionDay] = useState({})
	const [recent, setRecent] = useState({}) // sinf -> eng oxirgi kuzatuv lahzasi
	const [momentCounts, setMomentCounts] = useState({}) // sinf -> { total, alerts }

	const load = useCallback(async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/classrooms`, { ...authHeaders(), params: { date } })
			setData(res.data)
			setError(false)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}, [date])

	useEffect(() => {
		setLoading(true)
		load()
		if (date !== today()) return
		const timer = setInterval(load, 15000)
		return () => clearInterval(timer)
	}, [load, date])

	// Odam sanash: jonli son har 15 soniyada, soatlik tarix har daqiqada. Xato asosiy sahifani buzmaydi
	useEffect(() => {
		let alive = true
		const base = import.meta.env.VITE_BASE_URL
		const live = async () => {
			try {
				const res = await axios.get(`${base}/api/hik/vision/live`, authHeaders())
				if (alive && res.data?.success) setVision({ items: res.data.items || [], intervalSec: res.data.intervalSec || 60 })
			} catch { /* sanash ma'lumoti ixtiyoriy */ }
		}
		const day = async () => {
			try {
				const res = await axios.get(`${base}/api/hik/vision/day`, { ...authHeaders(), params: { date } })
				if (alive && res.data?.success) setVisionDay(res.data.sinfs || {})
			} catch { /* sanash ma'lumoti ixtiyoriy */ }
		}
		const moments = async () => {
			try {
				const res = await axios.get(`${base}/api/hik/vision/recent`, { ...authHeaders(), params: { date, per: 1 } })
				if (alive && res.data?.success) { setRecent(res.data.bySinf || {}); setMomentCounts(res.data.counts || {}) }
			} catch { /* kuzatuv ma'lumoti ixtiyoriy */ }
		}
		live(); day(); moments()
		if (date !== today()) return () => { alive = false }
		const t1 = setInterval(live, 15000)
		const t2 = setInterval(() => { day(); moments() }, 60000)
		return () => { alive = false; clearInterval(t1); clearInterval(t2) }
	}, [date])

	const classes = data?.classes || EMPTY
	const keyOf = (c) => (c.analysis.idle ? 'idle' : c.analysis.level)
	const counts = useMemo(() => classes.reduce((a, c) => ({ ...a, [keyOf(c)]: (a[keyOf(c)] || 0) + 1 }), {}), [classes])
	const order = { attention: 0, mid: 1, idle: 2, nodata: 3, good: 4 }
	const shown = useMemo(() => classes.filter(c => (filter === 'all' || keyOf(c) === filter) && (!q.trim() || norm(c.name).includes(norm(q.trim())))).sort((a, b) => order[keyOf(a)] - order[keyOf(b)] || a.name.localeCompare(b.name)), [classes, filter, q]) // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6 space-y-6">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex items-center gap-2">
					{data?.lessonNow && <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {tx("Hozir dars vaqti ({{from}}:00–{{to}}:00)", { from: data.lessonHours[0], to: data.lessonHours[1] })}</span>}
					<input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
					<button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> Yangilash</button>
				</div>
			</div>

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Ma'lumotni yuklab bo'lmadi</div>}

			{data && classes.length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-[200px] max-w-xs flex-1">
						<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder="Sinf nomi bo'yicha qidirish" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
					</div>
					{[['all', tx('Hammasi'), classes.length], ['attention', tx('Diqqat'), counts.attention || 0], ['mid', tx("O'rtacha"), counts.mid || 0], ['good', tx('Yaxshi'), counts.good || 0], ['idle', tx("Dars yo'q"), counts.idle || 0], ['nodata', tx("Ma'lumotsiz"), counts.nodata || 0]].map(([k, label, n]) => (
						<button key={k} onClick={() => setFilter(k)} className={`px-4 py-2 rounded-xl text-sm border transition ${filter === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{label} <span className="opacity-70">· {n}</span></button>
					))}
				</div>
			)}

			{data && classes.length === 0 && (
				<div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-500">
					Tahlil faqat sinfga biriktirilgan kameralar uchun ishlaydi. "Kameralar" sahifasida kartochkadagi "Sinfxona" ro'yxatidan sinfni tanlang
				</div>
			)}

			{shown.map(c => {
				const an = c.analysis
				const noCam = an.hasCamera === false
				const lv = an.idle ? LEVELS.idle : LEVELS[an.level]
				const chart = c.hours.map((n, h) => ({ soat: String(h).padStart(2, '0'), Bugun: c.actHours[h], Odatiy: c.baseline[h] })).filter((x, h) => h >= 6 && h <= 20)
				const trend = c.daily.map(d => ({ kun: d.date.slice(5), Faollik: d.events }))
				const noEvents = Object.keys(c.events).length === 0
				// O'quvchilar ro'yxati bo'lmasa davomat plitkalari ma'nosiz (hammasi 0): o'rniga kameradagi son ko'rsatiladi
				const vnow = vision.items.filter(v => String(v.sinfId) === String(c._id)).reduce((m, v) => (v.count !== null ? Math.max(m ?? 0, v.count) : m), null)
				const vh = visionDay[String(c._id)] || []
				const vmax = vh.reduce((m, x) => Math.max(m, x.max), 0)
				const vavgs = vh.filter(x => x.avg > 0)
				const vavg = vavgs.length ? Math.round(vavgs.reduce((a, x) => a + x.avg, 0) / vavgs.length) : 0
				return (
					<section key={c._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
						<div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
							<div><Link to={String(c._id)} className="font-semibold text-gray-900 text-lg hover:text-blue-600">{c.name} <span className="text-sm font-medium text-blue-600">Batafsil tahlil →</span></Link><p className="text-xs text-gray-500">{c.head ? tx("Sinf rahbari: {{head}}", { head: c.head }) : c.description}</p></div>
							<div className="flex flex-wrap gap-1.5">
								{noEvents ? <span className="text-xs text-gray-400">Bu kunda kamera hodisalari yo'q</span>
									: Object.entries(c.events).map(([k, n]) => <span key={k} className={`px-2.5 py-1 rounded-full text-xs font-medium ${KINDS[k]?.tone || 'bg-gray-100 text-gray-600'}`}>{KINDS[k]?.label || k}: {n}</span>)}
							</div>
						</div>

						<div className="grid grid-cols-1 xl:grid-cols-[380px_1fr]">
							{/* Baho va omillar */}
							<div className="p-5 space-y-4 border-b xl:border-b-0 xl:border-r border-gray-100">
								<div className="flex items-center gap-4">
									<ScoreRing score={an.score} level={an.level} />
									<div className="min-w-0">
										<span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${lv.badge}`}>{an.level === 'good' ? <FiCheckCircle size={12} /> : an.level === 'attention' ? <FiAlertTriangle size={12} /> : null}{lv.label}</span>
										<p className="font-semibold text-gray-900 mt-2">{an.headline}</p>
									</div>
								</div>

								<FactorList factors={an.factors} compact links={{ lesson: `../kuzatuv?sinf=${c._id}`, density: `../kuzatuv?sinf=${c._id}`, attendance: `../students?sinf=${c._id}`, activity: String(c._id), teacher: '../users', cameras: '../camera' }} />
								{an.breakdown && <ClassBreakdown breakdown={an.breakdown} cameraCount={vnow} onClick={() => navigate(`../students?sinf=${c._id}`)} />}

								{c.students === 0 ? (noCam ? null : (
									<div className="space-y-2">
										<div className="grid grid-cols-3 gap-2">
											<Metric label="Hozir kamerada" value={vnow ?? '—'} tone="text-blue-600" onClick={() => navigate(`../kuzatuv?sinf=${c._id}`)} />
											<Metric label="Bugun eng ko'pi" value={vmax || '—'} onClick={() => navigate(String(c._id))} />
											<Metric label="Bugungi o'rtacha" value={vavg || '—'} onClick={() => navigate(String(c._id))} />
										</div>
										<p className="text-[11px] text-gray-400">Sinfga o'quvchilar biriktirilmagan: davomat o'rniga kamera ma'lumoti ko'rsatilmoqda</p>
									</div>
								)) : (
									<div className="grid grid-cols-4 gap-2">
									<Metric label="O'quvchi" value={c.students} onClick={() => navigate(`../students?sinf=${c._id}`)} />
									<Metric label="Kelgan" value={c.came} tone="text-green-600" onClick={() => navigate(`../students?sinf=${c._id}`)} />
									<Metric label="Maktabda" value={c.inside} tone="text-blue-600" onClick={() => navigate(`../students?sinf=${c._id}`)} />
									<Metric label="Kelmagan" value={c.absent} tone="text-red-600" onClick={() => navigate(`../students?sinf=${c._id}`)} />
								</div>
								)}

								{noEvents && an.level !== 'nodata' && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Kamera hodisalari kelmayapti. Faollik va zichlik tahlili uchun kamerada hamda Hik-Connect'da harakat va odam zichligi signal qoidalarini yoqing.</p>}
							</div>

							{/* Grafiklar va kameralar */}
							<div className="p-5 space-y-5">
								<ClassVisionPanel items={vision.items.filter(v => String(v.sinfId) === String(c._id))} intervalSec={vision.intervalSec} students={c.students} came={c.came} hourly={visionDay[String(c._id)]} onClick={() => navigate(String(c._id))} />
								{(recent[String(c._id)] || []).length > 0 && (
									<div>
										<div className="flex flex-wrap items-center justify-between gap-2 mb-2">
											<p className="text-xs font-semibold text-gray-500">Oxirgi kuzatuv lahzasi</p>
											<Link to={`../kuzatuv?sinf=${c._id}`} className="text-xs font-medium text-blue-600 hover:underline">{tx("Batafsil ko'rish")}{momentCounts[String(c._id)] ? ` (${tx("{{n}} ta lahza", { n: momentCounts[String(c._id)].total })}${momentCounts[String(c._id)].alerts ? `, ${tx("{{n}} ta muhim", { n: momentCounts[String(c._id)].alerts })}` : ''})` : ''} →</Link>
										</div>
										<EvidenceGallery items={recent[String(c._id)].slice(0, 1)} variant="list" />
									</div>
								)}
								<div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
									<div onClick={() => navigate(String(c._id))} className="cursor-pointer rounded-xl hover:bg-gray-50 transition">
										<p className="text-xs font-semibold text-gray-500 mb-2">Xona faolligi: kameradagi harakat, % (bugun va odatiy, soatlar)</p>
										<div style={{ height: 150 }}>
											<ResponsiveContainer width="100%" height="100%">
												<ComposedChart data={chart} margin={{ left: -24, right: 4, top: 4 }}>
													<CartesianGrid strokeDasharray="3 3" vertical={false} />
													<XAxis dataKey="soat" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
													<Tooltip />
													<Bar dataKey="Bugun" fill="#2563eb" radius={[3, 3, 0, 0]} />
													<Line type="monotone" dataKey="Odatiy" stroke="#f59e0b" strokeWidth={2} dot={false} />
												</ComposedChart>
											</ResponsiveContainer>
										</div>
									</div>
									<div onClick={() => navigate(String(c._id))} className="cursor-pointer rounded-xl hover:bg-gray-50 transition">
										<p className="text-xs font-semibold text-gray-500 mb-2">Oxirgi 7 kun: o'rtacha harakat, %</p>
										<div style={{ height: 150 }}>
											<ResponsiveContainer width="100%" height="100%">
												<AreaChart data={trend} margin={{ left: -24, right: 4, top: 4 }}>
													<CartesianGrid strokeDasharray="3 3" vertical={false} />
													<XAxis dataKey="kun" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
													<Tooltip /><Area type="monotone" dataKey="Faollik" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
												</AreaChart>
											</ResponsiveContainer>
										</div>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{c.cameras.map(cam => {
										const st = statusOf(cam)
										const canPlay = cam.online === true && cam.inCloud !== false && !!cam.serial
										return (
											<div key={cam._id} className="rounded-xl border border-gray-100 overflow-hidden">
												{canPlay ? <HikLivePlayer cameraId={cam._id} lazy /> : (
													<div className="flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400 text-sm" style={{ aspectRatio: '16 / 9' }}><FiVideo size={26} /><span>{cam.online === false ? 'Kamera offline' : "Holat noma'lum"}</span></div>
												)}
												<div onClick={() => navigate('../camera')} className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition">
													<div className="min-w-0"><p className="text-sm font-medium text-gray-900 truncate">{cam.name}</p><p className="text-xs text-gray-400">{tx("Oxirgi hodisa: {{time}}", { time: ago(cam.lastEventAt) })}</p></div>
													<div className="flex items-center gap-2 shrink-0">
														<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.chip}`}>{st.text}</span>
													</div>
												</div>
											</div>
										)
									})}
								</div>
							</div>
						</div>
					</section>
				)
			})}

			{data?.withoutCameras > 0 && <p className="text-sm text-gray-500">Kamerasi bo'lmagan sinflar tahlil qilinmaydi: {data.withoutCameras} ta</p>}
		</div>
	)
}

export default AdminClassrooms
