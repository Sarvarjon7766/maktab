import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertTriangle, FiClock, FiFilm, FiHardDrive, FiImage, FiRefreshCw, FiSave, FiTrash2 } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { intlLocale, tx } from '../../i18n'
import { formatUzShortDate } from '../../utils/formatDate'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const PRESETS = [3, 5, 7, 14, 30, 60]

const size = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.round((b || 0) / 1024)} KB`)
const date = (d) => (d ? formatUzShortDate(new Date(d)) : '—')

// Qatorlar: kalit → [sarlavha, izoh, ikonka]
const ROWS = [
	['alertDays', tx('Muhim hodisalar'), tx("Bo'sh qolgan sinf, odamlar keskin oshishi, ortiqcha odam: dalil rasmlari va qisqa lavhalari bilan"), FiAlertTriangle],
	['sampleDays', tx('Avtomatik namunalar'), tx("Aqlli kuzatuv har bir sinfdan vaqti-vaqti bilan olib turadigan oddiy kadrlar"), FiImage],
	['eventDays', tx('Boshqa kamera hodisalari'), tx("Harakat, odam zichligi, kirish/chiqish kabi hodisalar va ularning kadrlari"), FiFilm],
	['metricDays', tx("Odam soni o'lchovlari"), tx("Har sinfdagi odam soni va faollik ko'rsatkichlari (grafiklar uchun)"), FiClock]
]

// Platforma sozlamalari: Aqlli kuzatuv dalillari qancha vaqt saqlanishi va avtomatik tozalash (har kuni 03:30)
const RetentionCard = () => {
	const [data, setData] = useState(null)
	const [form, setForm] = useState(null)
	const [saving, setSaving] = useState(false)
	const [preview, setPreview] = useState(null)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		try {
			const r = await api.get('/api/platform-settings/retention', auth())
			setData(r.data); setForm(r.data.policy)
		} catch { toast.error(tx("Sozlamalarni yuklashda xatolik")) }
	}, [])
	useEffect(() => { load() }, [load])

	if (!data || !form) return <div className="mt-6 max-w-3xl animate-pulse rounded-2xl bg-white p-6 shadow-sm"><div className="h-5 w-48 rounded bg-slate-100" /><div className="mt-4 h-40 rounded bg-slate-50" /></div>

	const dirty = Object.keys(form).some(k => form[k] !== data.policy[k])
	const set = (k, v) => { setForm(f => ({ ...f, [k]: Math.min(data.limits.max, Math.max(data.limits.min, Math.round(Number(v) || data.limits.min))) })); setPreview(null) }

	const save = async () => {
		setSaving(true)
		try {
			const r = await api.put('/api/platform-settings/retention', form, auth())
			if (r.data.success) { toast.success(tx("Sozlamalar saqlandi")); await load(); setPreview(null) } else toast.error(tx(r.data.message || 'Xatolik'))
		} catch { toast.error(tx('Server xatosi')) } finally { setSaving(false) }
	}
	const run = async (dryRun) => {
		setBusy(true)
		try {
			const r = await api.post('/api/platform-settings/retention/purge', { dryRun }, auth())
			if (dryRun) setPreview(r.data)
			else {
				const t = r.data.events.alerts + r.data.events.samples + r.data.events.events
				toast.success(tx("Tozalandi: {{n}} hodisa, {{f}} fayl ({{s}})", { n: t, f: r.data.files + r.data.orphanFiles, s: size(r.data.bytes) }))
				setPreview(null); await load()
			}
		} catch (e) { toast.error(tx(e.response?.data?.message || 'Server xatosi')) } finally { setBusy(false) }
	}

	const total = preview ? preview.events.alerts + preview.events.samples + preview.events.events : 0
	const stats = [
		[tx('Dalil fayllari'), data.files.count.toLocaleString(intlLocale()), size(data.files.bytes), FiHardDrive],
		[tx('Eng eski fayl'), date(data.files.oldest), '', FiClock],
		[tx('Hodisalar bazada'), (data.db.alerts.count + data.db.samples.count + data.db.events.count).toLocaleString(intlLocale()), tx("{{a}} muhim · {{b}} namuna", { a: data.db.alerts.count, b: data.db.samples.count }), FiFilm]
	]

	return (
		<div className="mt-6 max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="text-base font-semibold text-slate-900">{tx("Dalillarni saqlash muddati")}</h2>
					<p className="mt-1 max-w-xl text-sm text-slate-500">{tx("Aqlli kuzatuv rasmlari va qisqa lavhalari shu muddatdan keyin avtomatik o'chiriladi (har kuni soat 03:30). Muddat qisqa bo'lsa, server diski tejaladi.")}</p>
				</div>
				<button onClick={load} title={tx("Yangilash")} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><FiRefreshCw size={15} /></button>
			</div>

			<div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
				{stats.map(([l, v, sub, I]) => (
					<div key={l} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><I size={16} /></div>
						<div className="min-w-0"><p className="truncate text-xs text-slate-500">{l}</p><p className="text-base font-bold text-slate-900">{v}</p>{sub && <p className="truncate text-[11px] text-slate-400">{sub}</p>}</div>
					</div>
				))}
			</div>

			<div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-100">
				{ROWS.map(([k, label, hint, I]) => (
					<div key={k} className="flex flex-wrap items-center gap-3 px-4 py-3">
						<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><I size={16} /></div>
						<div className="min-w-0 flex-1 basis-56"><p className="text-sm font-medium text-slate-900">{label}</p><p className="text-xs text-slate-500">{hint}</p></div>
						<div className="flex flex-wrap items-center gap-1.5">
							{PRESETS.map(d => <button key={d} type="button" onClick={() => set(k, d)} className={`rounded-lg border px-2 py-1 text-xs font-medium transition ${form[k] === d ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>{d}</button>)}
							<label className="ml-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
								<input type="number" min={data.limits.min} max={data.limits.max} value={form[k]} onChange={e => set(k, e.target.value)} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm text-black outline-none focus:border-blue-400" />{tx("kun")}
							</label>
						</div>
					</div>
				))}
			</div>

			{preview && (
				<div className={`mt-4 rounded-xl border p-4 text-sm ${total + preview.metrics + preview.orphanFiles ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
					{total + preview.metrics + preview.orphanFiles === 0
						? tx("Hozir o'chiriladigan narsa yo'q: hamma narsa muddat ichida.")
						: <>
							<p className="font-medium">{tx("Hozir o'chiriladi: {{n}} hodisa, {{f}} fayl ({{s}}), {{m}} o'lchov", { n: total, f: preview.files + preview.orphanFiles, s: size(preview.bytes), m: preview.metrics })}</p>
							<p className="mt-1 text-xs opacity-80">{tx("Muhim: {{a}} · namuna: {{b}} · boshqa: {{c}}", { a: preview.events.alerts, b: preview.events.samples, c: preview.events.events })}</p>
							<button onClick={() => run(false)} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"><FiTrash2 size={14} /> {busy ? tx('Tozalanmoqda...') : tx("Ha, hozir o'chirish")}</button>
						</>}
				</div>
			)}
			{data.lastRun && <p className="mt-3 text-xs text-slate-400">{tx("Oxirgi tozalash: {{d}}", { d: new Date(data.lastRun.at).toLocaleString(intlLocale()) })}</p>}

			<div className="mt-4 flex flex-wrap items-center justify-end gap-2">
				<button onClick={() => run(true)} disabled={busy || dirty} title={dirty ? tx("Avval o'zgarishlarni saqlang") : ''} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">{busy && !preview ? tx('Hisoblanmoqda...') : tx("Nima o'chishini ko'rish")}</button>
				<button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FiSave size={14} /> {saving ? tx('Saqlanmoqda...') : tx('Saqlash')}</button>
			</div>
		</div>
	)
}

export default RetentionCard
