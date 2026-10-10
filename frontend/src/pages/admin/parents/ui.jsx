import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiCopy, FiExternalLink, FiLink, FiSearch, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'

export const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })
export const api = (method, path, config = {}) => axios({ method, url: `${BASE}/api/parents/${path}`, headers: auth(), ...config })
export const sinfApi = () => axios.get(`${BASE}/api/sinf/getAll`, { headers: auth() })
export const errText = (e, fallback = 'Xatolik yuz berdi') => e?.response?.data?.message || fallback
export const dt = (d) => (d ? new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }) : '—')
export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()

export const VIA = { phone: ['Telefon raqami orqali', 'bg-green-50 text-green-700'], invite: ["O'quvchi havolasi orqali", 'bg-blue-50 text-blue-700'], admin: ['Admin biriktirgan', 'bg-violet-50 text-violet-700'] }
export const STATE = {
	active: ['Faol', 'bg-green-50 text-green-700'],
	paused: ["Xabarni to'xtatgan", 'bg-amber-50 text-amber-700'],
	blocked: ['Botni bloklagan', 'bg-red-50 text-red-700'],
	inactive: ['Faolsizlantirilgan', 'bg-gray-100 text-gray-600']
}

export const copyText = async (text, okMsg = 'Nusxalandi') => {
	try { await navigator.clipboard.writeText(text); toast.success(okMsg) } catch { toast.error("Nusxalab bo'lmadi: matnni qo'lda belgilab oling") }
}

export const Chip = ({ children, tone = 'bg-gray-100 text-gray-600', className = '' }) => <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${tone} ${className}`}>{children}</span>

export const Toggle = ({ checked, onChange, label, disabled, small }) => (
	<label className={`inline-flex items-center gap-2 ${small ? 'text-xs' : 'text-sm'} text-gray-700 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
		<button type="button" disabled={disabled} onClick={() => onChange(!checked)} className={`relative ${small ? 'w-8 h-[18px]' : 'w-10 h-6'} rounded-full transition shrink-0 ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
			<span className={`absolute top-0.5 ${small ? 'w-[14px] h-[14px]' : 'w-5 h-5'} rounded-full bg-white shadow transition-all ${checked ? (small ? 'left-[16px]' : 'left-[18px]') : 'left-0.5'}`} />
		</button>
		{label}
	</label>
)

export const Empty = ({ icon, title, hint, children }) => (
	<div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-6 py-10 text-center">
		{icon && <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400">{icon}</div>}
		<p className="font-medium text-gray-800">{title}</p>
		{hint && <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">{hint}</p>}
		{children && <div className="mt-4">{children}</div>}
	</div>
)

export const Pager = ({ page, pages, total, set }) => (pages > 1 ? (
	<div className="flex items-center justify-center gap-3 pt-4">
		<button disabled={page <= 1} onClick={() => set(page - 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><FiChevronLeft /></button>
		<span className="text-sm text-gray-600">{page} / {pages} · jami {total}</span>
		<button disabled={page >= pages} onClick={() => set(page + 1)} className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"><FiChevronRight /></button>
	</div>
) : null)

const useEsc = (onClose) => useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])

export const Modal = ({ title, onClose, children }) => {
	useEsc(onClose)
	return (
		<div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center p-3 md:p-8 overflow-y-auto" onClick={onClose}>
			<div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
				<div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">{title}</h3><button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"><FiX /></button></div>
				<div className="p-5">{children}</div>
			</div>
		</div>
	)
}

// O'ng tomondan chiqadigan panel (bitta farzand/ota-ona tafsiloti)
export const Drawer = ({ title, subtitle, onClose, children }) => {
	useEsc(onClose)
	return (
		<div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose}>
			<aside className="absolute right-0 top-0 h-full w-full sm:w-[460px] bg-white shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
				<div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
					<div className="min-w-0"><h3 className="font-semibold text-gray-900 truncate">{title}</h3>{subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}</div>
					<button onClick={onClose} title="Yopish (Esc)" className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"><FiX /></button>
				</div>
				<div className="flex-1 overflow-y-auto p-5 space-y-5">{children}</div>
			</aside>
		</div>
	)
}

// Havola + QR + tugmalar (nusxalash, Telegramda ochish)
export const LinkBox = ({ invite, hint, compact }) => (
	<div className={`flex ${compact ? 'flex-col' : 'flex-col sm:flex-row'} gap-4 items-start`}>
		{invite.qr && <img src={invite.qr} alt="QR kod" className={`${compact ? 'w-32 h-32' : 'w-40 h-40'} rounded-xl border border-gray-100 bg-white shrink-0`} />}
		<div className="min-w-0 flex-1 space-y-2 w-full">
			<div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2"><FiLink className="text-gray-400 shrink-0" /><span className="text-sm text-gray-800 break-all">{invite.url}</span></div>
			<div className="flex flex-wrap gap-2">
				<button onClick={() => copyText(invite.url, 'Havola nusxalandi')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"><FiCopy size={14} /> Havolani nusxalash</button>
				<a href={invite.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><FiExternalLink size={14} /> Telegramda ochish</a>
			</div>
			{hint && <p className="text-xs text-gray-500">{hint}</p>}
		</div>
	</div>
)

// O'quvchi qidirish va tanlash (bir yoki bir nechta). selected — Set<id>; onToggle(student)
export const StudentPicker = ({ selected, onToggle, exclude = [], placeholder = "O'quvchi ismini yozing (kamida 2 harf)" }) => {
	const [q, setQ] = useState('')
	const [rows, setRows] = useState([])
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		if (q.trim().length < 2) { setRows([]); return }
		setBusy(true)
		const t = setTimeout(() => api('get', 'students', { params: { q, limit: 8 } }).then(r => setRows((r.data.students || []).filter(s => !exclude.includes(String(s._id))))).catch(() => setRows([])).finally(() => setBusy(false)), 250)
		return () => clearTimeout(t)
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [q])
	return (
		<div className="space-y-2">
			<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-black" /></div>
			{rows.length > 0 && (
				<ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
					{rows.map(s => (
						<li key={s._id}>
							<button type="button" onClick={() => onToggle(s)} className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50/50 ${selected.has(String(s._id)) ? 'bg-blue-50' : ''}`}>
								<span className="text-gray-900">{s.fullName} <span className="text-gray-400">· {s.sinf}</span></span>
								<span className={`w-5 h-5 rounded border flex items-center justify-center text-[11px] ${selected.has(String(s._id)) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
							</button>
						</li>
					))}
				</ul>
			)}
			{q.trim().length >= 2 && !busy && rows.length === 0 && <p className="text-xs text-gray-500">O'quvchi topilmadi</p>}
		</div>
	)
}
