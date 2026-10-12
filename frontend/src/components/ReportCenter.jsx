import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiCalendar, FiCheck, FiDownload, FiLoader, FiStar } from 'react-icons/fi'
import { FaFileExcel } from 'react-icons/fa'
import { toast } from 'react-toastify'
import SearchableSelect from './SearchableSelect'
import { tx } from '../i18n'

// Token har so'rovda joriy qiymatdan olinadi (mount paytida qotib qolmasin)
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

const BASE = import.meta.env.VITE_BASE_URL
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const monthStart = () => `${todayStr().slice(0, 8)}01`

const PRESETS = [
	['Bugun', () => [todayStr(), todayStr()]],
	['7 kun', () => [shift(todayStr(), -6), todayStr()]],
	['30 kun', () => [shift(todayStr(), -29), todayStr()]],
	['Shu oy', () => [monthStart(), todayStr()]],
	['90 kun', () => [shift(todayStr(), -89), todayStr()]],
]
const PARAM_LABEL = { date: 'Sana', range: 'Davr', sinf: 'Sinf (ixtiyoriy)', sinfRequired: 'Sinf', minStreak: 'Ketma-ket kunlar' }

// Hisobot markazi: maktab bo'yicha ko'plab Excel hisobotlari. Umumiy sana/davr/sinf paneli tepada, kartalar guruhlangan
const ReportCenter = () => {
	const [reports, setReports] = useState(null)
	const [sinfs, setSinfs] = useState([])
	const [from, setFrom] = useState(shift(todayStr(), -29))
	const [to, setTo] = useState(todayStr())
	const [date, setDate] = useState(todayStr())
	const [sinfId, setSinfId] = useState('')
	const [minStreak, setMinStreak] = useState(3)
	const [busy, setBusy] = useState(null)
	const [done, setDone] = useState({})
	const [q, setQ] = useState('')

	useEffect(() => {
		axios.get(`${BASE}/api/report-center/catalog`, { headers: getHeaders() }).then(r => setReports(r.data.reports || [])).catch(() => setReports([]))
		axios.get(`${BASE}/api/sinf/getAll`, { headers: getHeaders() }).then(r => setSinfs(r.data.sinfs || [])).catch(() => { })
	}, [])

	const groups = useMemo(() => {
		const nm = (x) => String(x || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
				const t = nm(q.trim())
		const map = new Map()
		;(reports || []).filter(r => !t || nm(`${r.title} ${r.desc} ${r.group}`).includes(t)).forEach(r => { if (!map.has(r.group)) map.set(r.group, []); map.get(r.group).push(r) })
		return [...map.entries()]
	}, [reports, q])
	const featured = (reports || []).find(r => r.featured)

	const download = async (r) => {
		if (r.params.includes('sinfRequired') && !sinfId) return toast.error('Avval sinfni tanlang')
		setBusy(r.key)
		try {
			const res = await axios.get(`${BASE}/api/report-center/export/${r.key}`, { headers: getHeaders(), responseType: 'blob', params: { date, from, to, sinfId: sinfId || undefined, minStreak } })
			const cd = res.headers['content-disposition'] || ''
			const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || `${r.key}.xlsx`
			const url = URL.createObjectURL(res.data)
			const a = Object.assign(document.createElement('a'), { href: url, download: name })
			document.body.appendChild(a); a.click(); a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 2000)
			const rows = res.headers['x-report-rows']
			toast.success(`${r.title}: yuklandi${rows ? ` (${rows} qator)` : ''}`)
			setDone(d => ({ ...d, [r.key]: true }))
		} catch (e) {
			let msg = 'Hisobotni yuklashda xatolik'
			try { msg = JSON.parse(await e.response.data.text()).message || msg } catch { /* standart xabar */ }
			toast.error(msg)
		} finally { setBusy(null) }
	}

	const input = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-blue-400'
	const Card = ({ r }) => {
		const blocked = r.params.includes('sinfRequired') && !sinfId
		return (
			<div className={`flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${r.featured ? 'border-blue-200 ring-1 ring-blue-100' : 'border-slate-200'}`}>
				<div className="flex items-start justify-between gap-2">
					<h3 className="font-semibold text-slate-900">{r.title}</h3>
					{r.featured && <FiStar className="shrink-0 text-amber-500" />}
				</div>
				<p className="mt-1 flex-1 text-sm text-slate-500">{r.desc}</p>
				{r.params.length > 0 && <div className="mt-3 flex flex-wrap gap-1">{r.params.map(p => <span key={p} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{PARAM_LABEL[p]}</span>)}</div>}
				<button disabled={busy === r.key || blocked} onClick={() => download(r)} title={blocked ? tx("Avval sinfni tanlang") : ''} className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
					{busy === r.key ? <><FiLoader className="animate-spin" /> {tx("Tayyorlanmoqda...")}</> : done[r.key] ? <><FiCheck /> {tx("Yana yuklab olish")}</> : <><FaFileExcel /> {tx("Excel yuklab olish")}</>}
				</button>
			</div>
		)
	}

	return (
		<div className="space-y-5">
			<div className="sticky top-0 z-10 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
				<div className="flex flex-wrap items-end gap-x-5 gap-y-3">
					<label className="text-xs text-slate-500">{tx("Sana (kunlik hisobotlar)")}<input type="date" value={date} max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} className={`${input} mt-1 block`} /></label>
					<div className="text-xs text-slate-500">{tx("Davr (davr hisobotlari)")}
						<div className="mt-1 flex items-center gap-1.5">
							<input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={input} />
							<span className="text-slate-400">—</span>
							<input type="date" value={to} min={from} max={todayStr()} onChange={e => e.target.value && setTo(e.target.value)} className={input} />
						</div>
					</div>
					<div className="text-xs text-slate-500">{tx("Sinf")}
											<SearchableSelect variant="outline" icon={false} className="mt-1 min-w-[160px] max-w-[260px]" searchPlaceholder={tx("Sinf qidirish...")} value={sinfId} onChange={setSinfId}
												options={[{ value: '', label: 'Barcha sinflar' }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} />
										</div>
										<div className="text-xs text-slate-500">{tx("Xavf guruhi: ketma-ket")}
											<SearchableSelect variant="outline" icon={false} className="mt-1 min-w-[110px] max-w-[160px]" value={String(minStreak)} onChange={v => setMinStreak(Number(v))}
												options={[2, 3, 5, 7].map(n => ({ value: String(n), label: `${n}+ kun` }))} />
										</div>
					<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Hisobot qidirish")} className={`${input} ml-auto w-48`} />
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					<FiCalendar className="text-slate-400" />
					{PRESETS.map(([l, fn]) => <button key={l} onClick={() => { const [f, t] = fn(); setFrom(f); setTo(t); setDate(t) }} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 hover:bg-slate-200">{l}</button>)}
				</div>
			</div>

			{!reports ? (
				<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />)}</div>
			) : (
				<>
					{featured && !q && (
						<div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-900 to-blue-900 p-5 text-white shadow-sm">
							<div className="min-w-0"><p className="text-xs uppercase tracking-widest text-cyan-200/80">{tx("Tavsiya etiladi")}</p><h2 className="mt-1 text-lg font-semibold">{featured.title}</h2><p className="mt-1 max-w-2xl text-sm text-slate-300">{featured.desc}</p></div>
							<button disabled={busy === featured.key} onClick={() => download(featured)} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60">{busy === featured.key ? <><FiLoader className="animate-spin" /> {tx("Tayyorlanmoqda...")}</> : <><FiDownload /> {tx("Yuklab olish")}</>}</button>
						</div>
					)}
					{groups.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 text-center text-sm text-slate-500">{tx("Hisobot topilmadi")}</p>}
					{groups.map(([g, list]) => (
						<section key={g}>
							<h2 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-slate-700">{g}<span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{list.length}</span></h2>
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{list.filter(r => !(r.featured && !q)).map(r => <Card key={r.key} r={r} />)}</div>
						</section>
					))}
				</>
			)}
		</div>
	)
}

export default ReportCenter
