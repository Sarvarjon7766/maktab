import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiChevronLeft, FiChevronRight, FiClock, FiGrid, FiRefreshCw, FiSearch, FiVideo, FiX } from 'react-icons/fi'
import { useSearchParams, Link } from 'react-router-dom'
import { authHeaders } from '../../components/HikCameraList'
import { EvidenceGallery } from '../../components/EvidenceViewer'
import { ALERT_KINDS } from '../../utils/vision'
import { useBlobUrl } from '../../components/useBlobUrl'
import { setVisibleInterval } from '../../utils/poll'
import { tx } from '../../i18n'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const BASE = import.meta.env.VITE_BASE_URL
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const ago = (d) => {
	if (!d) return "hali yo'q"
	const sec = Math.round((Date.now() - new Date(d).getTime()) / 1000)
	if (sec < 60) return 'hozirgina'
	const min = Math.round(sec / 60)
	return min < 60 ? `${min} daqiqa oldin` : `${Math.round(min / 60)} soat oldin`
}
const hm = (d) => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })

const Tile = ({ icon, label, value, hint, tone = 'text-gray-900', ring = 'bg-gray-100 text-gray-500', onClick }) => (
	<div {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => { if (e.key === 'Enter') onClick() } } : {})} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex items-start gap-3 ${onClick ? 'cursor-pointer hover:shadow-md transition' : ''}`}>
		<span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ring}`}>{icon}</span>
		<div className="min-w-0">
			<p className="text-xs text-gray-500">{label}</p>
			<p className={`text-xl sm:text-2xl font-bold leading-tight break-words ${tone}`}>{value}</p>
			{hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
		</div>
	</div>
)

// Sinf kartasi: faqat xulosa va eng oxirgi lahza (kichik). Hamma lahzalar "Batafsil ko'rish" oynasida
const ClassCard = ({ c, onOpen }) => {
	const url = useBlobUrl(c.last ? `events/${c.last._id}/snapshot` : null)
	return (
		<div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col">
			<div onClick={c.total ? () => onOpen(c) : undefined} className={`aspect-video bg-slate-900 flex items-center justify-center ${c.total ? 'cursor-pointer' : ''}`}>
				{url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-slate-500 flex flex-col items-center gap-1"><FiVideo size={20} />{c.total ? '...' : tx("Hali lahza yo'q")}</span>}
			</div>
			<div className="p-4 flex-1 flex flex-col gap-2">
				<div className="flex items-center justify-between gap-2">
					<Link to={`../classrooms/${c.sinfId}`} className="font-semibold text-gray-900 text-lg hover:text-blue-600" title={tx("Sinf sahifasi")}>{c.sinf} <span className="text-xs font-medium text-blue-600">{tx("sahifa →")}</span></Link>
					<span className={`inline-flex items-center gap-1.5 text-xs ${c.online ? 'text-green-600' : 'text-gray-400'}`}><span className={`w-2 h-2 rounded-full ${c.online ? 'bg-green-500' : 'bg-gray-300'}`} />{c.online ? tx("Kamera online") : c.cameras.length ? tx("Kamera offline") : tx("Kamerasiz")}</span>
				</div>
				<p className="text-xs text-gray-500">{c.cameras.join(', ') || '—'}</p>
				<div className="flex flex-wrap items-center gap-2 text-xs">
					<span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{tx("{{n}} ta lahza", { n: c.total })}</span>
					{c.alerts > 0 ? <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700">{tx("{{n}} ta muhim hodisa", { n: c.alerts })}</span> : <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700">{tx("Muhim hodisa yo'q")}</span>}
				</div>
				{c.last && <p className="text-[11px] text-gray-400">{tx("Oxirgisi: {{time}} · {{detail}}", { time: hm(c.last.time), detail: c.last.detail || c.last.title })}</p>}
				<button onClick={() => onOpen(c)} disabled={!c.total} className="mt-auto inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiGrid size={14} /> {tx("Batafsil ko'rish")}</button>
			</div>
		</div>
	)
}

// Bitta sinfning barcha lahzalari (sahifalab, guruh bo'yicha). Faqat foydalanuvchi "Batafsil ko'rish" bosganda ochiladi
const ClassMoments = ({ cls, date, onClose }) => {
	const [group, setGroup] = useState(cls.group || 'all')
	const [page, setPage] = useState(1)
	const [data, setData] = useState(null)
	useEffect(() => {
		let alive = true
		axios.get(`${BASE}/api/hik/vision/evidence`, { ...authHeaders(), params: { sinfId: cls.sinfId, date, group, page } }).then(r => { if (alive) setData(r.data) }).catch(() => { if (alive) setData({ items: [], pages: 1, total: 0 }) })
		return () => { alive = false }
	}, [cls.sinfId, date, group, page])
	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])
	const by = data?.byKind || {}
	const alerts = ALERT_KINDS.reduce((a, k) => a + (by[k] || 0), 0)
	const tabs = [['all', 'Hammasi', alerts + (by.vision_sample || 0)], ['alerts', 'Muhim hodisalar', alerts], ['samples', 'Avtomatik namunalar', by.vision_sample || 0]]
	return (
		<div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center p-3 md:p-8 overflow-y-auto" onClick={onClose}>
			<div className="w-full max-w-6xl bg-slate-50 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
				<div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200">
					<div><h2 className="text-lg font-semibold text-gray-900">{tx("{{sinf}}: kuzatuv lahzalari", { sinf: cls.sinf })}</h2><p className="text-xs text-gray-500">{tx("{{date}} · kadrni bossangiz oldin/hodisa/keyin rasmlari va lavha ochiladi", { date })}</p></div>
					<button onClick={onClose} title={tx("Yopish (Esc)")} className="p-2.5 rounded-lg hover:bg-gray-200 text-gray-600"><FiX /></button>
				</div>
				<div className="p-5 space-y-4">
					<div className="flex flex-wrap gap-2">
						{tabs.map(([k, label, n]) => <button key={k} onClick={() => { setGroup(k); setPage(1) }} className={`px-4 py-2 rounded-xl text-sm border transition ${group === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>{label} <span className="opacity-70">· {n}</span></button>)}
					</div>
					{!data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : <EvidenceGallery items={data.items} cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-4" empty={tx("Bu tanlov bo'yicha lahza yo'q")} sinfLink={(it) => `../classrooms/${it.sinfId}`} />}
					{data && data.pages > 1 && (
						<div className="flex items-center justify-center gap-3">
							<button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><FiChevronLeft /></button>
							<span className="text-sm text-gray-600">{tx("{{page}} / {{pages}} · jami {{total}}", { page, pages: data.pages, total: data.total })}</span>
							<button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><FiChevronRight /></button>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

// Aqlli kuzatuv: kameralarni sun'iy intellekt o'zi kuzatadi. Bu sahifada faqat xulosa: muhim hodisalar va sinflar kartalari.
// Hamma kadrlar emas: har sinfning to'liq lahzalari "Batafsil ko'rish" oynasida
const AdminAIEvidence = () => {
	const [params, setParams] = useSearchParams()
	const [date, setDate] = useState(today())
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [open, setOpen] = useState(null)
	const [showAllAlerts, setShowAllAlerts] = useState(false)
	const [showAllSamples, setShowAllSamples] = useState(false)
	const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	const [q, setQ] = useState('')

	const load = useCallback(async () => {
		try {
			const res = await axios.get(`${BASE}/api/hik/vision/summary`, { ...authHeaders(), params: { date } })
			setData(res.data)
			setError(false)
		} catch { setError(true) } finally { setLoading(false) }
	}, [date])
	useEffect(() => {
		setLoading(true)
		load()
		if (date !== today()) return
		const t = setVisibleInterval(load, 60000)
		return () => clearInterval(t)
	}, [load, date])

	// ?sinf=<id> bilan kelinsa, shu sinfning batafsil oynasi ochiladi (sinfxonalar sahifasidan "Batafsil ko'rish")
	const wanted = params.get('sinf')
	useEffect(() => {
		if (wanted && data?.classes) { const c = data.classes.find(x => String(x.sinfId) === wanted); if (c) setOpen(c) }
	}, [wanted, data])
	const close = () => { setOpen(null); if (params.get('sinf')) { params.delete('sinf'); setParams(params, { replace: true }) } }

	const t = data?.totals
	const alerts = data?.alerts || []
	const classes = (data?.classes || []).filter(c => !q.trim() || norm(`${c.sinf} ${(c.cameras || []).join(' ')}`).includes(norm(q.trim())))
	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6 space-y-6">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex items-center gap-2">
					<input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
					<button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx("Yangilash")}</button>
				</div>
			</div>

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")}</div>}

			<div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
				<Tile onClick={() => scrollToId('ai-alerts')} icon={<FiAlertTriangle size={18} />} label={tx("Muhim hodisalar")} value={t?.alerts ?? '—'} hint={t?.alerts ? tx("Pastda ko'ring") : tx("Bugun tinch")} tone={t?.alerts ? 'text-red-600' : 'text-green-600'} ring={t?.alerts ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'} />
				<Tile onClick={() => setShowAllSamples(true)} icon={<FiGrid size={18} />} label={tx("Avtomatik namunalar")} value={t?.samples ?? '—'} hint={tx("Har 30 daqiqada")} ring="bg-blue-50 text-blue-600" />
				<Tile onClick={() => scrollToId('ai-classes')} icon={<FiVideo size={18} />} label={tx("Kuzatilayotgan sinflar")} value={t?.classes ?? '—'} hint={tx("Kamera biriktirilgan")} ring="bg-violet-50 text-violet-600" />
				<Tile onClick={() => scrollToId('ai-classes')} icon={<FiClock size={18} />} label={tx("Oxirgi tahlil")} value={t ? ago(t.lastAt) : '—'} hint={t?.lastAt ? hm(t.lastAt) : tx("Hali o'lchov yo'q")} ring="bg-amber-50 text-amber-600" />
			</div>

			<section id="ai-alerts" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 scroll-mt-4">
				<div className="flex items-center justify-between gap-3 mb-4">
					<h2 className="font-semibold text-gray-900">{tx("Muhim hodisalar")}</h2>
					{(t?.alerts || 0) > alerts.length && <button onClick={() => setShowAllAlerts(true)} className="text-sm font-medium text-blue-600 hover:underline">{tx("Barchasini ko'rish ({{n}}) →", { n: t.alerts })}</button>}
				</div>
				{alerts.length === 0 ? (
					<div className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-4 text-sm text-green-800"><FiCheckCircle size={20} /><div><p className="font-medium">{tx("Bu kunda muhim hodisa aniqlanmadi")}</p><p className="text-green-700/80 text-xs">{tx("Bo'sh qolgan sinf, odamlar keskin oshishi yoki ortiqcha odam bo'lsa, shu yerda kadr bilan chiqadi")}</p></div></div>
				) : <EvidenceGallery items={alerts} variant="list" sinfLink={(it) => `../classrooms/${it.sinfId}`} />}
			</section>

			<section id="ai-classes" className="scroll-mt-4">
				<div className="flex flex-wrap items-center justify-between gap-3 mb-3">
									<h2 className="font-semibold text-gray-900">{tx("Sinflar bo'yicha kuzatuv")}</h2>
									{!!data?.classes?.length && (
										<div className="relative w-full max-w-xs">
											<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
											<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Sinf yoki kamera bo'yicha qidirish")} className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
										</div>
									)}
								</div>
								{loading && !data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : data?.classes?.length ? (classes.length === 0 ? <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">{tx("Qidiruv bo'yicha sinf topilmadi")}</div> :
									<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{classes.map(c => <ClassCard key={String(c.sinfId)} c={c} onOpen={setOpen} />)}</div>)
 				 : (
					<div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-sm text-gray-500">
						{tx("Hali birorta sinfda aqlli kuzatuv yoqilmagan.")} <b>{tx("Kameralar")}</b> {tx("sahifasida kamerani sinfga biriktiring: kuzatuv o'zi yoqiladi.")}
					</div>
				)}
			</section>

			{open && <ClassMoments cls={open} date={date} onClose={close} />}
			{showAllSamples && <ClassMoments cls={{ sinfId: '', sinf: 'Barcha sinflar', group: 'samples' }} date={date} onClose={() => setShowAllSamples(false)} />}
			{showAllAlerts && <ClassMoments cls={{ sinfId: '', sinf: 'Barcha sinflar', group: 'alerts' }} date={date} onClose={() => setShowAllAlerts(false)} />}
		</div>
	)
}

export default AdminAIEvidence
