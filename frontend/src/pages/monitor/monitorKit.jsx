import { tx } from '../../i18n'
// Monitor sahifalari uchun umumiy yordamchilar: API, hook, kichik UI bo'laklari, Excel eksport
import AutoSelect from '../../components/AutoSelect'
import PhotoLightbox from '../../components/PhotoLightbox'
import SearchableSelect from '../../components/SearchableSelect'
import { PanelContext, usePanel } from './panelContext'
import { useDistrict } from './districtScope'
export { PanelContext, usePanel }
import axios from 'axios'
import { useCallback, useEffect, useState, useRef } from 'react'
import { FiChevronLeft, FiChevronRight, FiRefreshCw, FiX, FiUser } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx-js-style'
import { uploadUrl } from '../../utils/uploadUrl'

// Xodimning sababli kelmagan kuni: ta'til, safar, kasallik, boshqa sabab
export const EXCUSE = {
	tatil: { label: tx("Mehnat ta'tili"), short: tx("Ta'til"), cls: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500', fill: '#0ea5e9' },
	safar: { label: tx('Xizmat safari'), short: tx('Safar'), cls: 'bg-violet-50 text-violet-700 ring-violet-200', dot: 'bg-violet-500', fill: '#8b5cf6' },
	kasallik: { label: tx('Kasallik'), short: tx('Kasallik'), cls: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', fill: '#f43f5e' },
	boshqa: { label: tx('Boshqa sabab'), short: tx('Boshqa'), cls: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400', fill: '#94a3b8' }
}
export const ExcuseChip = ({ type, comment, short = false }) => {
	const e = EXCUSE[type] || EXCUSE.boshqa
	return <span title={comment || e.label} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${e.cls}`}><i className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />{short ? e.short : e.label}</span>
}

export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export const shiftDate = (dateStr, days) => {
	const d = new Date(`${dateStr}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() + days)
	return d.toISOString().slice(0, 10)
}

export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
export const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ')
export const levelColor = (p) => (p >= 85 ? 'bg-green-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500')
export const levelText = (p) => (p >= 85 ? 'text-green-600' : p >= 60 ? 'text-amber-600' : 'text-red-600')
export const WEEKDAYS = [tx('Yakshanba'), tx('Dushanba'), tx('Seshanba'), tx('Chorshanba'), tx('Payshanba'), tx('Juma'), tx('Shanba')]
export const CHART_COLORS = { student: '#f59e0b', staff: '#8b5cf6', ok: '#22c55e', bad: '#ef4444', blue: '#2563eb', gray: '#e5e7eb' }

// GET /api/monitor/<path>?params — params o'zgarganda qayta yuklanadi, 60s da avto-yangilanadi (auto=true bo'lsa)
export function useMonitorData(path, params = {}, { auto = false, skip = false } = {}) {
	const [res, setRes] = useState({ key: null, data: null, updatedAt: null })
	const [loadingState, setLoadingState] = useState(!skip)
	const [refreshing, setRefreshing] = useState(false)
	const [errKey, setErrKey] = useState(null)
	const { api } = usePanel()
	// Viloyat monitori tuman tanlagan bo'lsa, hamma so'rov shu tuman bilan cheklanadi (sahifa o'zi 'district' bermagan bo'lsa)
	const [dist] = useDistrict()
	const eff = api === 'monitor' && dist && params.district === undefined ? { ...params, district: dist } : params
	const key = JSON.stringify(eff)
	const fullKey = `${api}/${path}?${key}`
	const reqRef = useRef(0)
	const failRef = useRef(0)

	// background=true — avto-yangilash: skelet ko'rsatilmaydi, eski ma'lumot qoladi
	const load = useCallback(async (background = false) => {
		if (skip) return
		const id = ++reqRef.current
		if (background) setRefreshing(true)
		else setLoadingState(true)
		try {
			const r = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/${api}/${path}`, {
				params: JSON.parse(key),
				headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
			})
			if (id !== reqRef.current) return // eskirgan javob
			if (r.data.success) {
				failRef.current = 0
				setRes({ key: fullKey, data: r.data, updatedAt: new Date() })
				setErrKey(null)
			} else {
				failRef.current++
				setErrKey(fullKey)
			}
		} catch {
			if (id !== reqRef.current) return
			failRef.current++
			setErrKey(fullKey)
		} finally {
			if (id === reqRef.current) { setLoadingState(false); setRefreshing(false) }
		}
	}, [api, path, key, fullKey, skip])

	useEffect(() => {
		if (skip) return
		failRef.current = 0
		let stopped = false
		let timer = null
		let waiting = false
		const base = typeof auto === 'number' ? auto : 60000
		const schedule = () => {
			if (!auto || stopped) return
			// xatodan keyin eksponensial kutish (maks. 5 daqiqa)
			const delay = Math.min(base * 2 ** Math.min(failRef.current, 5), Math.max(base, 300000))
			timer = setTimeout(tick, delay)
		}
		const tick = async () => {
			if (stopped) return
			if (document.hidden) { waiting = true; return }
			await load(true)
			schedule()
		}
		const onVisible = () => {
			if (!document.hidden && waiting && !stopped) { waiting = false; tick() }
		}
		document.addEventListener('visibilitychange', onVisible)
		load(false).then(schedule)
		return () => {
			stopped = true
			clearTimeout(timer)
			document.removeEventListener('visibilitychange', onVisible)
			reqRef.current++ // unmount/kalit o'zgarishi: kechikkan javoblar e'tiborsiz
		}
	}, [load, auto, skip])

	const reload = useCallback(() => load(false), [load])
	const matches = res.key === fullKey
	const error = errKey === fullKey
	const loading = !skip && (loadingState || (!matches && !error))
	return { data: matches ? res.data : null, loading, refreshing, error, reload, updatedAt: matches ? res.updatedAt : null }
}

// ---- Quyidagi eksportlar r13 nusxasida kesilgan edi: qo'lda tiklangan/qayta yozilgan ----
export function exportXlsx(fileName, sheets) {
	const wb = XLSX.utils.book_new()
	sheets.forEach(({ name, rows }) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31)))
	XLSX.writeFile(wb, `${fileName}.xlsx`)
}

// Sahifa sarlavhasi (title/subtitle) endi chizilmaydi: sahifa nomi yuqoridagi navbarda (menyudagi nom) ko'rinadi.
// Faqat boshqaruv elementlari (sana, filtr, yangilash) qoladi; ular bo'lmasa hech narsa chiqmaydi.
export const PageHeader = ({ children, onReload, loading }) => (
	(children || onReload) ? (
		<div className="flex flex-wrap items-center justify-end gap-3 mb-6">
			<div className="flex flex-wrap items-center gap-2">
				{children}
				{onReload && (
					<button onClick={onReload} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
						<FiRefreshCw className={loading ? 'animate-spin' : ''} /> {tx("Yangilash")}
					</button>
				)}
			</div>
		</div>
	) : null
)

export const Page = ({ children }) => <div className="p-4 md:p-6 w-full">{children}</div>

export const StatCard = ({ icon, label, value, detail, color = 'bg-slate-100 text-slate-600' }) => (
	<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
		<div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 ${color}`}>{icon}</div>
		<div className="min-w-0">
			<p className="text-2xl font-bold text-gray-900">{typeof value === 'number' ? fmt(value) : value}</p>
			<p className="text-sm text-gray-600">{label}</p>
			{detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
		</div>
	</div>
)

export const Panel = ({ title, subtitle, children, action, className = '' }) => (
	<section className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`}>
		{(title || action) && (
			<div className="flex items-start justify-between gap-3 px-5 pt-5">
				<div><h2 className="font-semibold text-gray-900">{title}</h2>{subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}</div>
				{action}
			</div>
		)}
		<div className="p-5">{children}</div>
	</section>
)

export const ChartBox = ({ height = 280, children }) => <div style={{ height }} className="w-full">{children}</div>

export const Progress = ({ present, total, percent }) => {
	const p = percent ?? pct(present, total)
	return (
		<div className="min-w-[140px]">
			<div className="flex items-center justify-between gap-2 mb-1">
				<span className="text-gray-900 font-medium">{fmt(present)} <span className="text-gray-400 font-normal">/ {fmt(total)}</span></span>
				<span className={`text-xs font-semibold ${levelText(p)}`}>{p}%</span>
			</div>
			<div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${levelColor(p)}`} style={{ width: `${Math.min(p, 100)}%` }} /></div>
		</div>
	)
}

export const Badge = ({ ok, yes = 'Faol', no = "To'xtatilgan" }) => (
	<span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{ok ? yes : no}</span>
)

export const DateField = ({ label, value, onChange, max }) => (
	<label className="inline-flex items-center gap-2 text-sm text-gray-600">
		{label}
		<input type="date" value={value} max={max} onChange={e => e.target.value && onChange(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400" />
	</label>
)

// Tez oraliqlar: 7 / 14 / 30 / 60 kun
export const RangePicker = ({ from, to, onChange }) => (
	<div className="flex flex-wrap items-center gap-2">
		{[7, 14, 30, 60].map(n => (
			<button key={n} onClick={() => onChange({ from: shiftDate(todayStr(), -(n - 1)), to: todayStr() })}
				className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">{tx("{{n}} kun", { n })}</button>
		))}
		<DateField label={tx("Dan")} value={from} max={to} onChange={v => onChange({ from: v, to })} />
		<DateField label={tx("Gacha")} value={to} max={todayStr()} onChange={v => onChange({ from, to: v })} />
	</div>
)

export const LoadState = ({ loading, error, empty, children }) => {
	if (loading && !children) return <div className="rounded-xl bg-white border border-gray-100 p-10 text-center text-gray-500">{tx("Yuklanmoqda...")}</div>
	if (error) return <div className="rounded-xl bg-red-50 p-5 text-sm text-red-700 mb-4">{tx("Ma'lumotni yuklab bo'lmadi. Qayta urinib ko'ring.")}</div>
	if (empty) return <div className="rounded-xl bg-white border border-gray-100 p-10 text-center text-gray-500">{tx("Ma'lumot topilmadi")}</div>
	return children
}

export const SearchBox = ({ value, onChange, placeholder = 'Qidirish...' }) => (
	<input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
		className="w-full sm:w-72 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400" />
)

export const Table = ({ head, children }) => (
	<div className="overflow-x-auto">
		<table className="w-full text-sm">
			<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
				{head.map((h, i) => <th key={i} className={`px-4 py-3 font-semibold whitespace-nowrap ${h.right ? 'text-right' : ''}`}>{h.label ?? h}</th>)}
			</tr></thead>
			<tbody>{children}</tbody>
		</table>
	</div>
)

export const Tr = ({ children }) => <tr className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">{children}</tr>

export const Td = ({ children, right, className = '' }) => <td className={`px-4 py-3 ${right ? 'text-right' : ''} ${className}`}>{children}</td>

export const schoolPlace = (s) => [s.region, s.district].filter(Boolean).join(', ') || s.code

// ---- Quyidagi komponentlar sessiya tarixidan tiklanmagan — ishlatilishiga qarab qayta yozilgan ----

// Filtr tugmalari: options = [{ key|value, label, count? }]
export const Chips = ({ value, onChange, options = [] }) => (
	<div className="flex flex-wrap gap-2">
		{options.map(o => {
			const k = o.key ?? o.value
			const active = value === k
			return (
				<button key={String(k)} type="button" onClick={() => onChange(k)}
					className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
					{o.label}{o.count !== undefined && <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-gray-400'}`}>{o.count}</span>}
				</button>
			)
		})}
	</div>
)

// Ikki-uch variantli segmentli tanlov
export const Segmented = ({ value, onChange, options = [] }) => (
	<div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
		{options.map(o => (
			<button key={o.key} type="button" onClick={() => onChange(o.key)}
				className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${value === o.key ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{o.label}</button>
		))}
	</div>
)

export const Empty = ({ icon, title, text, hint }) => (
	<div className="flex flex-col items-center justify-center px-6 py-12 text-center">
		{icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">{icon}</div>}
		{(title || text) && <p className="text-sm font-semibold text-gray-700">{title || text}</p>}
		{hint && <p className="mt-1 max-w-md text-xs text-gray-500">{hint}</p>}
	</div>
)

export const Pagination = ({ page = 1, pages = 1, total, onChange }) => (
	pages > 1 ? (
		<div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 text-sm text-gray-500">
			<span>{total !== undefined ? `${fmt(total)} ta · ` : ''}{page}/{pages}</span>
			<div className="flex gap-2">
				<button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-40"><FiChevronLeft /></button>
				<button type="button" disabled={page >= pages} onClick={() => onChange(page + 1)} className="rounded-lg border border-gray-200 p-2 disabled:opacity-40"><FiChevronRight /></button>
			</div>
		</div>
	) : null
)

// Maktab sahifasiga havola (panel prefiksiga qarab): tab ixtiyoriy
export const SchoolLink = ({ id, name, tab, className = '' }) => {
	const { base, scoped } = usePanel()
	if (scoped || !id) return <span className={className}>{name}</span>
	return <Link to={`${base}/schools/${id}${tab ? `?tab=${tab}` : ''}`} className={`font-medium text-blue-600 hover:underline ${className}`}>{name}</Link>
}

// Shaxs (xodim/o'quvchi) kartochkasi: rasm + ism + izoh
export const PersonLink = ({ kind, id, name, sub, photo }) => {
	const { base } = usePanel()
	const src = photo ? `${uploadUrl(photo)}` : null
	const nameEl = <p className="truncate text-sm font-medium text-gray-900">{name}</p>
	return (
		<div className="flex min-w-0 items-center gap-3" data-kind={kind} data-id={id}>
			<div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400">
				<PhotoLightbox src={src} alt={name} className="h-full w-full object-cover" fallback={<FiUser size={16} />} />
			</div>
			<div className="min-w-0">{id && base ? <Link to={`${base}/people/${kind}/${id}`} className="block hover:text-blue-600">{nameEl}</Link> : nameEl}{sub && <p className="truncate text-xs text-gray-500">{sub}</p>}</div>
		</div>
	)
}

// Maktab tanlash (ro'yxat); bo'sh qiymat = "Maktabni tanlang"
export const SchoolSelect = ({ schools = [], value, onChange, placeholder = 'Maktabni tanlang' }) => (
	<AutoSelect value={value || ''} onChange={e => onChange(e.target.value)}
		className="h-10 min-w-[220px] rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400">
		<option value="">{placeholder}</option>
		{schools.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
	</AutoSelect>
)

// Ko'rsatkich kartasi (to berilsa havola)
export const KpiLink = ({ icon, color = 'bg-slate-100 text-slate-600', label, value, detail, to, onClick }) => {
	const body = (
		<div className={`flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ${to || onClick ? 'transition hover:shadow-md' : ''}`}>
			<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>{icon}</div>
			<div className="min-w-0"><p className="truncate text-xs font-medium text-gray-500">{label}</p><p className="text-xl font-bold text-gray-900">{typeof value === 'number' ? fmt(value) : value}</p>{detail && <p className="truncate text-xs text-gray-400">{detail}</p>}</div>
		</div>
	)
	if (to) return <Link to={to} className="block min-w-0">{body}</Link>
	if (onClick) return <button type="button" onClick={onClick} className="block w-full min-w-0 text-left">{body}</button>
	return body
}

// O'ng tomondan ochiladigan panel. `open` berilmasa — har doim ochiq (yopish onClose orqali)
export const Drawer = ({ open = true, onClose, title, subtitle, children }) => {
	if (!open) return null
	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
			<div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
				<div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
					<div className="min-w-0"><h3 className="truncate text-lg font-semibold text-gray-900">{title}</h3>{subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}</div>
					<button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><FiX size={18} /></button>
				</div>
				<div className="flex-1 overflow-y-auto p-5">{children}</div>
			</div>
		</div>
	)
}

// Qidiruv: matchText(q, ...maydonlar) — q bo'sh bo'lsa hammasi mos; apostrof va registr e'tiborga olinmaydi
const normText = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')

export const matchText = (q, ...fields) => {
	const t = normText(String(q || '').trim())
	return !t || fields.some(f => normText(f).includes(t))
}

// Qidiruvli tanlash ro'yxati (options: [{ value, label }])
export const SelectBox = (props) => <SearchableSelect {...props} />

// Foiz matni: qiymat yo'q (null/undefined) bo'lsa "null%" emas, "—"
export const pctFmt = (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : `${v}%`)
