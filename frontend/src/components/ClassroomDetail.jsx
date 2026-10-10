import { pctFmt } from '../pages/monitor/monitorKit'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiArrowLeft, FiCameraOff, FiRefreshCw } from 'react-icons/fi'
import { Link, useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import HikLivePlayer from './HikLivePlayer'
import ClassVisionPanel from './ClassVisionPanel'
import FactorList from './ClassFactors'
import ClassBreakdown from './ClassBreakdown'
import StudentExcuseCard from './StudentExcuseCard'
import EvidenceGallery from './EvidenceViewer'

const api = (path, config = {}) => axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/${path}`, { ...config, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())

const LEVELS = {
	good: { label: 'Yaxshi', ring: '#16a34a', badge: 'bg-green-50 text-green-700 border-green-200' },
	mid: { label: "O'rtacha", ring: '#f59e0b', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
	attention: { label: 'Diqqat', ring: '#dc2626', badge: 'bg-red-50 text-red-700 border-red-200' },
	nodata: { label: "Ma'lumot yo'q", ring: '#9ca3af', badge: 'bg-gray-100 text-gray-600 border-gray-200' },
	idle: { label: "Dars yo'q", ring: '#6366f1', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' }
}
const KINDS = {
	motion: { label: 'Harakat', color: '#2563eb', chip: 'bg-blue-50 text-blue-700' },
	density: { label: 'Odam zichligi', color: '#f59e0b', chip: 'bg-amber-50 text-amber-700' },
	people: { label: "Odamlar soni g'ayritabiiy", color: '#dc2626', chip: 'bg-red-50 text-red-700' },
	enter: { label: 'Hududga kirish', color: '#16a34a', chip: 'bg-green-50 text-green-700' },
	exit: { label: 'Hududdan chiqish', color: '#ea580c', chip: 'bg-orange-50 text-orange-700' },
	multi: { label: "Ko'p turdagi obyekt", color: '#7c3aed', chip: 'bg-violet-50 text-violet-700' },
	manual: { label: "Qo'lda olingan kadr", color: '#475569', chip: 'bg-slate-100 text-slate-700' },
	// Aqlli kuzatuv o'zi aniqlab, chizma bilan saqlagan holatlar
	vision_empty: { label: "Sinf bo'sh qoldi", color: '#dc2626', chip: 'bg-red-50 text-red-700' },
	vision_surge: { label: 'Odamlar keskin oshdi', color: '#ea580c', chip: 'bg-orange-50 text-orange-700' },
	vision_overcrowd: { label: 'Ortiqcha odam', color: '#7c3aed', chip: 'bg-violet-50 text-violet-700' },
	vision_sample: { label: 'Avtomatik namuna', color: '#2563eb', chip: 'bg-blue-50 text-blue-700' }
}
const timeOf = (d) => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })
const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ')
const pctColor = (p) => (p >= 85 ? 'bg-green-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500')

// onClick berilsa butun kartochka bosiladi (grafik kartochkalari tegishli sahifaga o'tadi); id — kpi uchun scroll nishoni
const Card = ({ title, action, children, className = '', onClick, id }) => (
	<section id={id} onClick={onClick} className={`bg-white rounded-2xl border border-gray-100 shadow-sm scroll-mt-4 ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''} ${className}`}>
		{(title || action) && <div className="flex items-center justify-between gap-3 px-5 pt-5"><h2 className="font-semibold text-gray-900">{title}</h2>{action}</div>}
		<div className="p-5">{children}</div>
	</section>
)

const Ring = ({ score, level }) => {
	const r = 42, c = 2 * Math.PI * r
	return (
		<svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0">
			<circle cx="50" cy="50" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
			<circle cx="50" cy="50" r={r} fill="none" stroke={LEVELS[level].ring} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(level === 'nodata' ? 0 : score) / 100 * c} ${c}`} transform="rotate(-90 50 50)" />
			<text x="50" y="52" textAnchor="middle" fontSize="26" fontWeight="700" fill="#111827">{level === 'nodata' ? '—' : score}</text>
			<text x="50" y="66" textAnchor="middle" fontSize="9" fill="#6b7280">ball</text>
		</svg>
	)
}

// Faollikning kunlar bo'yicha issiqlik xaritasi (soatlar ustunlarda)
const Heatmap = ({ rows, lesson }) => {
	const max = Math.max(1, ...rows.flatMap(r => r.hours))
	const cols = Array.from({ length: 13 }, (_, i) => i + 6)
	return (
		<div className="overflow-x-auto">
			<table className="text-xs border-separate border-spacing-1 w-full">
				<thead><tr><th className="w-20" />{cols.map(h => <th key={h} className={`font-medium ${h >= lesson[0] && h < lesson[1] ? 'text-gray-700' : 'text-gray-400'}`}>{String(h).padStart(2, '0')}</th>)}</tr></thead>
				<tbody>
					{rows.map(r => (
						<tr key={r.date}>
							<td className="text-gray-500 whitespace-nowrap pr-2">{r.date.slice(5)}</td>
							{cols.map(h => {
								const v = r.hours[h]
								return <td key={h}><div title={`${r.date} ${String(h).padStart(2, '0')}:00 — ${v} ta hodisa`} className="h-8 rounded-md flex items-center justify-center text-[10px] font-medium" style={{ background: v ? `rgba(37,99,235,${0.18 + (v / max) * 0.82})` : '#f1f5f9', color: v ? '#fff' : '#cbd5e1' }}>{v || ''}</div></td>
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}

// Kamerasiz sinf uchun: bugungi davomat "qahramon" kartasi (katta foiz, holatlar bo'yicha bo'lingan chiziq)
const AttendanceHero = ({ at, camerasLink }) => {
	const t = Math.max(at.total, 1)
	const insidePct = (at.inside / t) * 100, outPct = ((at.came - at.inside) / t) * 100, absentPct = (at.absent / t) * 100
	return (
		<Card title="Bugungi davomat">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div><p className="text-6xl font-bold text-gray-900 leading-none">{at.percent}<span className="text-3xl text-gray-400">%</span></p><p className="text-sm text-gray-500 mt-2">{fmt(at.came)} / {fmt(at.total)} o'quvchi kelgan</p></div>
				<div className="grid grid-cols-2 gap-2 text-center">
					{[["Hozir maktabda", at.inside, 'text-blue-600'], ['Kech qolgan', at.late, 'text-orange-600'], ['Kelmagan', at.absent, 'text-red-600'], ["O'rtacha kelish", at.avgArrival || '—', 'text-gray-900']].map(([l, v, tone]) => <div key={l} className="rounded-xl bg-gray-50 px-4 py-2.5"><p className={`text-xl font-bold ${tone}`}>{v}</p><p className="text-[11px] text-gray-500">{l}</p></div>)}
				</div>
			</div>
			<div className="mt-6 h-3 rounded-full bg-gray-100 overflow-hidden flex">
				<div className="bg-blue-500 h-full" style={{ width: `${pctFmt(insidePct)}` }} title="Hozir maktabda" />
				<div className="bg-green-500 h-full" style={{ width: `${pctFmt(outPct)}` }} title="Kelib ketgan" />
				<div className="bg-red-400 h-full" style={{ width: `${pctFmt(absentPct)}` }} title="Kelmagan" />
			</div>
			<div className="flex gap-4 mt-2 text-xs text-gray-500"><span><i className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />Maktabda</span><span><i className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />Kelib ketgan</span><span><i className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1.5" />Kelmagan</span></div>
			<div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3">
				<span className="inline-flex items-center gap-2 text-sm text-gray-600"><FiCameraOff className="text-gray-400" /> Sinfga kamera biriktirilmagan</span>
				{camerasLink && <Link to={camerasLink} className="text-sm font-medium text-blue-600 hover:underline">Kameralarga o'tish →</Link>}
			</div>
		</Card>
	)
}

const NameRow = ({ to, name, right, sub }) => (
	<li className="py-2 flex items-center justify-between gap-3 text-sm">
		<span className="min-w-0">{to ? <Link to={to} className="text-gray-900 hover:text-blue-600">{name}</Link> : <span className="text-gray-900">{name}</span>}{sub && <span className="block text-xs text-gray-400 font-mono">{sub}</span>}</span>
		<span className="shrink-0 text-right">{right}</span>
	</li>
)

// Sinfxonaning bitta sahifadagi to'liq tahlili. Kamera bo'lsa: jonli video, xona faolligi, hodisalar va kadrlar galereyasi.
// Kamera bo'lmasa ham: davomat, kelish vaqti, hafta kunlari va haftalik dinamika, o'quvchilar kesimi, sinflar orasidagi o'rni.
// `personBase` berilsa, ismlar profilga olib boradi
const ClassroomDetail = ({ sinfId, schoolId, backTo, personBase, camerasLink }) => {
	const navigate = useNavigate()
	// Maktab ichidagi panelda (schoolId yo'q) sahifalar orasida o'tish; monitor rejimida faqat shu sahifa ichida scroll
	const go = (path) => (schoolId ? undefined : () => navigate(path))
	const scrollTo = (id) => () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	const [date, setDate] = useState(today())
	const [data, setData] = useState(null)
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(true)
	const [camIndex, setCamIndex] = useState(0)
	const [vision, setVision] = useState({ items: [], intervalSec: 60 })
	const [visionDay, setVisionDay] = useState({})

	const load = useCallback(async () => {
		try {
			const res = await api('classroom-detail', { params: { sinfId, schoolId, date } })
			setData(res.data)
			setError('')
		} catch (e) {
			setError(e.response?.data?.message || "Ma'lumotni yuklab bo'lmadi")
		} finally {
			setLoading(false)
		}
	}, [sinfId, schoolId, date])

	useEffect(() => {
		setLoading(true)
		load()
		if (date !== today()) return
		const t = setInterval(load, 15000)
		return () => clearInterval(t)
	}, [load, date])

	const cam = data?.cameras?.[camIndex] || data?.cameras?.[0]
	const an = data?.analysis
	const lv = an ? (an.idle ? LEVELS.idle : LEVELS[an.level]) : LEVELS.nodata

	// Aqlli kuzatuv (odam sanash): jonli son har 15 soniyada, soatlik tarix har daqiqada (xato sahifani buzmaydi)
	useEffect(() => {
		let alive = true
		const live = async () => {
			try {
				const res = await api('vision/live', { params: { schoolId } })
				if (alive && res.data?.success) setVision({ items: res.data.items || [], intervalSec: res.data.intervalSec || 60 })
			} catch { /* kuzatuv ma'lumoti ixtiyoriy */ }
		}
		const day = async () => {
			try {
				const res = await api('vision/day', { params: { schoolId, date, sinfId } })
				if (alive && res.data?.success) setVisionDay(res.data.sinfs || {})
			} catch { /* kuzatuv ma'lumoti ixtiyoriy */ }
		}
		live(); day()
		if (date !== today()) return () => { alive = false }
		const t1 = setInterval(live, 15000), t2 = setInterval(day, 60000)
		return () => { alive = false; clearInterval(t1); clearInterval(t2) }
	}, [schoolId, sinfId, date])
	const visionItems = useMemo(() => vision.items.filter(v => String(v.sinfId) === String(sinfId)), [vision, sinfId])

	const hourly = useMemo(() => (data ? data.actHours.map((n, h) => ({ soat: String(h).padStart(2, '0'), Bugun: n, Odatiy: data.baseline[h] })).filter((x, h) => h >= 6 && h <= 20) : []), [data])
	const kindBars = useMemo(() => Object.entries(data?.activity?.week || {}).map(([k, n]) => ({ key: k, name: KINDS[k]?.label || k, n, color: KINDS[k]?.color || '#64748b' })).sort((a, b) => b.n - a.n), [data])
	const personLink = (id) => (personBase ? `${personBase}/${id}` : null)

	if (loading && !data) return <div className="p-10 text-center text-gray-500">Yuklanmoqda...</div>
	if (error && !data) return <div className="p-10 text-center text-red-600">{error}</div>
	const at = data.attendance, cmp = data.comparison, act = data.activity, ins = data.insights
	const hasCamera = data.hasCamera
	const bestDay = [...ins.weekday].sort((a, b) => b.percent - a.percent)[0]
	const worstDay = [...ins.weekday].sort((a, b) => a.percent - b.percent)[0]

	const kpis = [
		["O'quvchilar", at.total, 'text-gray-900'], ['Bugun kelgan', `${at.came} (${pctFmt(at.percent)})`, 'text-green-600'], ['Hozir maktabda', at.inside, 'text-blue-600'],
		['Kech qolgan', at.late, 'text-orange-600'], ['Kelmagan', at.absent, 'text-red-600'], ["O'rtacha kelish", at.avgArrival || '—', 'text-gray-900'],
		["Sinflar orasida o'rni", cmp.rank ? `${cmp.rank}/${cmp.of}` : '—', 'text-gray-900'], ["Maktab o'rtachasidan", `${cmp.diff > 0 ? '+' : ''}${cmp.diff}%`, cmp.diff >= 0 ? 'text-green-600' : 'text-red-600'],
		['30 kunlik davomat', `${ins.avg30}%`, 'text-gray-900'], ['Eng yuqori kun', bestDay ? `${bestDay.day} (${pctFmt(bestDay.percent)})` : '—', 'text-green-600'], ['Eng past kun', worstDay ? `${worstDay.day} (${pctFmt(worstDay.percent)})` : '—', 'text-red-600'],
		...(hasCamera ? [data.heatSource === 'vision' ? ["Bugungi o'rtacha harakat", `${Math.round(data.actHours.filter(v => v > 0).reduce((a, b, _, arr) => a + b / arr.length, 0))}%`, 'text-gray-900'] : ['Xona hodisalari', act.total, 'text-gray-900'], [data.heatSource === 'vision' ? 'Eng harakatchan soat' : 'Eng gavjum soat', act.peakHour !== null ? `${String(act.peakHour).padStart(2, '0')}:00` : '—', 'text-gray-900'], ['Zichlik signallari', act.signalsTotal, act.signalsTotal ? 'text-red-600' : 'text-gray-900']] : [])
	]

	// KPI plitkalari: o'quvchilar soni bo'yicha ro'yxatga, qolganlari tegishli grafik/bo'limga olib boradi
	const kpiAction = (label) => {
		if (["Sinflar orasida o'rni", "Maktab o'rtachasidan"].includes(label)) return scrollTo('cd-classes')
		if (['30 kunlik davomat', 'Eng yuqori kun', 'Eng past kun'].includes(label)) return scrollTo('cd-weekday')
		if (label === "O'rtacha kelish") return scrollTo('cd-arrival')
		if (['O\u0027quvchilar', 'Bugun kelgan', 'Hozir maktabda', 'Kech qolgan', 'Kelmagan'].includes(label)) return schoolId ? scrollTo('cd-absent') : () => navigate(`../students?sinf=${sinfId}`)
		return schoolId ? scrollTo('cd-arrival') : () => navigate(`../kuzatuv?sinf=${sinfId}`)
	}

	return (
		<div className="p-4 md:p-6 space-y-5 bg-gradient-to-br from-gray-50 to-blue-50 min-h-full">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3 min-w-0">
					<Link to={backTo} className="p-2.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><FiArrowLeft /></Link>
					<div className="min-w-0"><h1 className="text-2xl font-semibold text-gray-900 truncate">{data.class.name}</h1><p className="text-sm text-gray-500">{data.class.head ? `Sinf rahbari: ${data.class.head}` : data.class.description}</p></div>
					<span className={`px-3 py-1 rounded-full text-xs font-semibold border ${lv.badge}`}>{an.headline}</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{!schoolId && (
						<>
							<Link to={`../kuzatuv?sinf=${sinfId}`} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">Aqlli kuzatuv</Link>
							<Link to={`../students?sinf=${sinfId}`} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">O'quvchilar</Link>
							<Link to="../reports" className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">Hisobot</Link>
						</>
					)}
					<input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
					<button onClick={load} title="Yangilash" className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={16} /></button>
				</div>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5">
				{hasCamera ? (
					<Card title="Jonli video" action={
						<span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-xs font-medium text-blue-700"><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Aqlli kuzatuv yoqilgan</span>
					}>
						{data.cameras.length > 1 && (
							<div className="flex flex-wrap gap-2 mb-3">
								{data.cameras.map((c, i) => <button key={c._id} onClick={() => setCamIndex(i)} className={`px-3 py-1.5 rounded-full text-sm border ${i === camIndex ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}><span className={`inline-block w-2 h-2 rounded-full mr-2 ${c.online ? 'bg-green-500' : 'bg-red-500'}`} />{c.name}</button>)}
							</div>
						)}
						<div className="rounded-xl overflow-hidden bg-black">
							{cam?.online === true && cam.serial ? <HikLivePlayer key={cam._id} cameraId={cam._id} /> : (
								<div className="flex items-center justify-center text-slate-400 text-sm bg-slate-900" style={{ aspectRatio: '16 / 9' }}>Kamera offline</div>
							)}
						</div>
					</Card>
				) : <AttendanceHero at={at} camerasLink={camerasLink} />}

				<Card title={hasCamera ? 'Dars jarayoni holati' : 'Sinf holati'}>
					<div className="flex items-center gap-4">
						<Ring score={an.score} level={an.level} />
						<div><p className="text-lg font-semibold text-gray-900">{an.headline}</p><p className="text-xs text-gray-500 mt-1">{an.lessonNow ? 'Hozir dars vaqti' : `Dars vaqti ${data.lessonHours[0]}:00–${data.lessonHours[1]}:00`}</p></div>
					</div>
					<div className="mt-4"><FactorList factors={an.factors} links={schoolId ? {} : { lesson: `../kuzatuv?sinf=${sinfId}`, density: `../kuzatuv?sinf=${sinfId}`, attendance: `../students?sinf=${sinfId}`, teacher: '../users', cameras: '../camera' }} /></div>
					{an.breakdown && <div className="mt-4"><ClassBreakdown breakdown={an.breakdown} cameraCount={visionItems.reduce((m, v) => (v.count !== null ? Math.max(m ?? 0, v.count) : m), null)} /></div>}
					{hasCamera && <div className="mt-5">{visionItems.length > 0
						? <ClassVisionPanel items={visionItems} intervalSec={vision.intervalSec} students={at.total} came={at.came} hourly={visionDay[String(sinfId)]} />
						: <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3">Aqlli kuzatuv bu kamerada yoqilmagan. Kameralar sahifasida kamerani sinfga biriktirib, "odamlar sonini sanash"ni belgilang.</p>}</div>}
				</Card>
			</div>

			{!schoolId && (
				<Card title="Sababli kelmagan o'quvchilar">
					<StudentExcuseCard sinfId={sinfId} date={date} onChanged={load} />
				</Card>
			)}

			<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
				{kpis.map(([l, v, tone]) => <div key={l} role="button" tabIndex={0} onClick={kpiAction(l)} onKeyDown={e => { if (e.key === 'Enter') kpiAction(l)() }} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 cursor-pointer hover:shadow-md transition"><p className={`text-lg font-bold leading-tight ${tone}`}>{typeof v === 'number' ? fmt(v) : v}</p><p className="text-xs text-gray-500 mt-1">{l}</p></div>)}
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
				{hasCamera && (
					<Card onClick={go(`../kuzatuv?sinf=${sinfId}`)} title="Xona faolligi: bugun va odatiy holat (soatlar)">
						<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
							<ComposedChart data={hourly} margin={{ left: -16, right: 8, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="soat" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip />
								<Bar dataKey="Bugun" fill="#2563eb" radius={[3, 3, 0, 0]} maxBarSize={26} /><Line type="monotone" dataKey="Odatiy" stroke="#f59e0b" strokeWidth={2} dot={false} />
							</ComposedChart>
						</ResponsiveContainer></div>
					</Card>
				)}
				<Card onClick={go(`../students?sinf=${sinfId}`)} title="Sinf davomati: oxirgi 14 kun (%)">
					<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
						<AreaChart data={data.attendanceTrend.map(d => ({ kun: d.date.slice(5), Davomat: d.percent }))} margin={{ left: -16, right: 8, top: 4 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => `${v}%`} />
							<Area type="monotone" dataKey="Davomat" stroke="#16a34a" fill="#16a34a" fillOpacity={0.15} />
						</AreaChart>
					</ResponsiveContainer></div>
				</Card>
				<Card id="cd-arrival" onClick={go(`../students?sinf=${sinfId}`)} title="Bugungi kirish dinamikasi (to'plangan o'quvchilar)">
					<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
						<AreaChart data={data.arrivalCurve.map(a => ({ soat: `${String(a.hour).padStart(2, '0')}:00`, "O'quvchilar": a.students }))} margin={{ left: -16, right: 8, top: 4 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="soat" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} domain={[0, Math.max(at.total, 1)]} tick={{ fontSize: 11 }} /><Tooltip />
							<Area type="stepAfter" dataKey="O'quvchilar" stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
						</AreaChart>
					</ResponsiveContainer></div>
				</Card>
				<Card id="cd-weekday" onClick={go(`../students?sinf=${sinfId}`)} title="Hafta kunlari bo'yicha davomat (%)">
					{ins.weekday.length === 0 ? <p className="text-sm text-gray-500 py-16 text-center">Ma'lumot yetarli emas</p> : (
						<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
							<BarChart data={ins.weekday.map(w => ({ kun: w.day.slice(0, 3), Davomat: w.percent }))} margin={{ left: -16, right: 8, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 12 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => `${v}%`} />
								<Bar dataKey="Davomat" radius={[5, 5, 0, 0]} maxBarSize={44}>{ins.weekday.map(w => <Cell key={w.day} fill={w.percent >= 85 ? '#16a34a' : w.percent >= 60 ? '#f59e0b' : '#dc2626'} />)}</Bar>
							</BarChart>
						</ResponsiveContainer></div>
					)}
				</Card>
				<Card onClick={go(`../students?sinf=${sinfId}`)} title="Haftalik dinamika: oxirgi 8 hafta (%)">
					{ins.weekly.length < 2 ? <p className="text-sm text-gray-500 py-16 text-center">Ma'lumot yetarli emas</p> : (
						<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
							<LineChart data={ins.weekly.map(w => ({ hafta: w.week.slice(5), Davomat: w.percent }))} margin={{ left: -16, right: 8, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="hafta" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} /><Tooltip formatter={v => `${v}%`} />
								<Line type="monotone" dataKey="Davomat" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3 }} />
							</LineChart>
						</ResponsiveContainer></div>
					)}
				</Card>
				{hasCamera && (
					<Card onClick={go(`../kuzatuv?sinf=${sinfId}`)} title="Kamera hodisalari turlari (oxirgi 7 kun)">
						{kindBars.length === 0 ? <p className="text-sm text-gray-500 py-16 text-center">Hodisa kelmagan</p> : (
							<div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%">
								<BarChart data={kindBars} layout="vertical" margin={{ left: 10, right: 20 }}>
									<CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip />
									<Bar dataKey="n" name="Hodisalar" radius={[0, 5, 5, 0]} maxBarSize={22}>{kindBars.map(k => <Cell key={k.key} fill={k.color} />)}</Bar>
								</BarChart>
							</ResponsiveContainer></div>
						)}
					</Card>
				)}
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5">
				{hasCamera ? <Card onClick={go(`../kuzatuv?sinf=${sinfId}`)} title={data.heatSource === 'vision' ? 'Faollik issiqlik xaritasi: kameradagi harakat (%), oxirgi 7 kun (soatlar)' : 'Faollik issiqlik xaritasi: oxirgi 7 kun (soatlar)'}><Heatmap rows={data.heatmap} lesson={data.lessonHours} /></Card> : (
					<Card title="O'quvchilar kesimi: oxirgi 30 kun">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Davomati eng past</p>
								{ins.lowest.length === 0 ? <p className="text-sm text-gray-400">Ma'lumot yetarli emas</p> : <ul className="divide-y divide-gray-50">{ins.lowest.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} sub={`${s.present}/${s.days} kun`} right={<span className="inline-flex items-center gap-2"><span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden inline-block"><span className={`block h-full ${pctColor(s.percent)}`} style={{ width: `${pctFmt(s.percent)}` }} /></span><span className="font-semibold text-gray-800 w-12 inline-block">{pctFmt(s.percent)}</span></span>} />)}</ul>}
							</div>
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Eng ko'p kech qolgan</p>
								{ins.mostLate.length === 0 ? <p className="text-sm text-green-600">Kech qolgan yo'q</p> : <ul className="divide-y divide-gray-50">{ins.mostLate.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} sub={`${s.days} kun ichida`} right={<span className="text-orange-600 font-semibold">{s.lateDays} kun</span>} />)}</ul>}
							</div>
						</div>
					</Card>
				)}
				<Card id="cd-classes" title="Sinflar davomati (maktab ichida)">
					<ul className="space-y-2.5 max-h-[300px] overflow-y-auto">
						{cmp.classes.map(c => (
							<li key={c._id} onClick={go(`../classrooms/${c._id}`)} className={schoolId ? '' : 'cursor-pointer rounded-lg hover:bg-gray-50 -mx-2 px-2 py-1'}>
								<div className="flex justify-between text-sm mb-1"><span className={String(c._id) === String(sinfId) ? 'font-semibold text-blue-700' : 'text-gray-700'}>{c.name}</span><span className="text-gray-500">{pctFmt(c.percent)}</span></div>
								<div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${String(c._id) === String(sinfId) ? 'bg-blue-600' : 'bg-slate-300'}`} style={{ width: `${Math.min(c.percent, 100)}%` }} /></div>
							</li>
						))}
					</ul>
				</Card>
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
				<Card id="cd-absent" title={`Bugun kelmagan o'quvchilar (${at.absent})`}>
					{data.absentList.length === 0 ? <p className="text-sm text-green-600">Hamma kelgan</p> : <ul className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">{data.absentList.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} right={<span className="text-gray-400 font-mono text-xs">{s.code}</span>} />)}</ul>}
				</Card>
				<Card title={`Bugun kech qolganlar (${at.late})`}>
					{data.lateList.length === 0 ? <p className="text-sm text-gray-500">Kech qolgan yo'q</p> : <ul className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">{data.lateList.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} right={<span className="text-orange-600 font-medium">{s.firstIn} · +{s.minutesLate} daqiqa</span>} />)}</ul>}
				</Card>
			</div>

			{hasCamera && (
				<>
					<Card title="O'quvchilar kesimi: oxirgi 30 kun">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-5">
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Davomati eng past</p>
								{ins.lowest.length === 0 ? <p className="text-sm text-gray-400">Ma'lumot yetarli emas</p> : <ul className="divide-y divide-gray-50">{ins.lowest.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} sub={`${s.present}/${s.days} kun`} right={<span className="font-semibold text-gray-800">{pctFmt(s.percent)}</span>} />)}</ul>}
							</div>
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Eng ko'p kech qolgan</p>
								{ins.mostLate.length === 0 ? <p className="text-sm text-green-600">Kech qolgan yo'q</p> : <ul className="divide-y divide-gray-50">{ins.mostLate.map(s => <NameRow key={s._id} to={personLink(s._id)} name={s.fullName} sub={`${s.days} kun ichida`} right={<span className="text-orange-600 font-semibold">{s.lateDays} kun</span>} />)}</ul>}
							</div>
						</div>
					</Card>

					<Card title={`Kuzatuv lahzalari (${data.gallery.length})`} action={data.gallery.length > 6 && !schoolId ? <Link to={`../kuzatuv?sinf=${sinfId}`} className="text-sm font-medium text-blue-600 hover:underline">Barchasini ko'rish →</Link> : null}>
						<EvidenceGallery items={data.gallery.slice(0, 6).map(g => ({ ...g, sinf: data.class.name }))} empty="Hozircha saqlangan lahza yo'q. Aqlli kuzatuv hodisa topganda va har 30 daqiqada namuna saqlaganda shu yerda paydo bo'ladi" />
					</Card>

					<Card onClick={go(`../kuzatuv?sinf=${sinfId}`)} title="So'nggi kamera hodisalari">
						<div className="overflow-x-auto max-h-[360px]">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100"><th className="py-2 pr-4 font-semibold">Vaqt</th><th className="py-2 pr-4 font-semibold">Hodisa</th><th className="py-2 pr-4 font-semibold">Kamera</th><th className="py-2 font-semibold">Kadr</th></tr></thead>
								<tbody>
									{data.events.map(e => (
										<tr key={e._id} className="border-b border-gray-50 last:border-0">
											<td className="py-2 pr-4 whitespace-nowrap text-gray-700">{timeOf(e.time)}</td>
											<td className="py-2 pr-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${(KINDS[e.kind] || KINDS.motion).chip}`}>{(KINDS[e.kind] || KINDS.motion).label}</span></td>
											<td className="py-2 pr-4 text-gray-600">{e.camera}</td>
											<td className="py-2 text-gray-500">{e.hasSnapshot ? 'Bor' : '—'}</td>
										</tr>
									))}
									{data.events.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-500">Bu davrda hodisa yo'q</td></tr>}
								</tbody>
							</table>
						</div>
					</Card>
				</>
			)}

		</div>
	)
}

export default ClassroomDetail
