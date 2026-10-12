import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiClock, FiDownload, FiFileText, FiRefreshCw } from 'react-icons/fi'
import { FaFileExcel } from 'react-icons/fa'
import { toast } from 'react-toastify'
import { tx } from '../i18n'

const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const shift = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const KIND = { kunlik: ['Kunlik', 'bg-blue-50 text-blue-700'], haftalik: ['Haftalik', 'bg-violet-50 text-violet-700'], davr: ["Qo'lda", 'bg-slate-100 text-slate-700'] }
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

// Aqlli kuzatuv hisobotlari: har kuni 18:30 va shanba 18:45 avtomatik yaratiladi (arxiv), istalgan davr uchun qo'lda ham yaratish mumkin.
// Excel: sinflar xulosasi, kunlik jadval, muhim hodisalar, o'quvchi sabablari
const AutoReports = () => {
	const [range, setRange] = useState({ from: shift(today(), -6), to: today() })
	const [list, setList] = useState(null)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		try { setList((await axios.get(`${BASE}/api/hik/reports`, { headers: auth() })).data.reports || []) } catch { setList([]) }
	}, [])
	useEffect(() => { load() }, [load])

	const download = async (name) => {
		try {
			const res = await axios.get(`${BASE}/api/hik/reports/download/${encodeURIComponent(name)}`, { headers: auth(), responseType: 'blob' })
			const url = URL.createObjectURL(res.data)
			const a = document.createElement('a')
			a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 2000)
		} catch { toast.error("Hisobotni yuklab bo'lmadi") }
	}
	const generate = async () => {
		setBusy(true)
		try {
			const res = await axios.post(`${BASE}/api/hik/reports/generate`, range, { headers: auth() })
			toast.success('Hisobot tayyor')
			await load()
			await download(res.data.name)
		} catch (e) { toast.error(e.response?.data?.message || "Hisobot yaratib bo'lmadi") } finally { setBusy(false) }
	}

	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="font-semibold text-slate-900 flex items-center gap-2"><FiFileText /> {tx("Aqlli kuzatuv hisobotlari")}</h2>
					<p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5"><FiClock size={12} /> {tx("Har kuni 18:30 da va shanba kuni 18:45 da (haftalik) avtomatik tayyorlanadi. Ichida: sinflar xulosasi, kunlik jadval, muhim hodisalar, sababli kelmagan o'quvchilar")}</p>
				</div>
				<button onClick={load} title={tx("Yangilash")} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"><FiRefreshCw size={14} /></button>
			</div>

			<div className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
				<label className="text-xs text-slate-500">{tx("Dan")}<input type="date" value={range.from} max={range.to} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} className="mt-1 block px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-black" /></label>
				<label className="text-xs text-slate-500">{tx("Gacha")}<input type="date" value={range.to} min={range.from} max={today()} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} className="mt-1 block px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-black" /></label>
				<div className="flex gap-1.5">
					{[['Bugun', 0], ['7 kun', 6], ['30 kun', 29]].map(([label, n]) => <button key={label} onClick={() => setRange({ from: shift(today(), -n), to: today() })} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-100">{label}</button>)}
				</div>
				<button onClick={generate} disabled={busy} className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"><FaFileExcel /> {busy ? tx("Tayyorlanmoqda...") : tx("Hisobot yaratish va yuklab olish")}</button>
			</div>

			<h3 className="mt-5 mb-2 text-sm font-semibold text-slate-700">{tx("Hisobotlar arxivi")}</h3>
			{!list ? <p className="text-sm text-slate-500">{tx("Yuklanmoqda...")}</p> : list.length === 0 ? (
				<p className="text-sm text-slate-500 rounded-xl bg-slate-50 px-4 py-6 text-center">{tx("Hali hisobot yo'q. Birinchi avtomatik hisobot bugun 18:30 da tayyor bo'ladi, yoki yuqoridan hozir yarating")}</p>
			) : (
				<ul className="divide-y divide-slate-100">
					{list.map(r => {
						const [label, tone] = KIND[r.kind] || KIND.davr
						return (
							<li key={r.name} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-3 min-w-0">
									<span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${tone}`}>{label}</span>
									<div className="min-w-0"><p className="text-sm font-medium text-slate-900">{r.from === r.to ? r.from : `${r.from} — ${r.to}`}</p><p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })} · {size(r.size)}</p></div>
								</div>
								<button onClick={() => download(r.name)} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"><FiDownload size={13} /> {tx("Excel")}</button>
							</li>
						)
					})}
				</ul>
			)}
		</section>
	)
}

export default AutoReports
