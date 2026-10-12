import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiRefreshCw, FiSearch, FiTrash2 } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { tx } from '../../i18n'
import { uploadUrl } from '../../utils/uploadUrl'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const STATUS = {
	ishda: { label: tx('Ishda'), tone: 'bg-green-50 text-green-700' },
	tashqarida: { label: tx('Tashqarida'), tone: 'bg-amber-50 text-amber-700' },
	kelmagan: { label: tx('Kelmagan'), tone: 'bg-red-50 text-red-700' }
}

// Maktabning boshqaruv xodimlari (admin roli): ro'yxat, qidiruv, bugungi holat va o'chirish
const AdminAdmins = () => {
	const [admins, setAdmins] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [query, setQuery] = useState('')
	const [busyId, setBusyId] = useState(null)
	const [confirmId, setConfirmId] = useState(null)
	const base = import.meta.env.VITE_BASE_URL
	const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

	const load = useCallback(async () => {
		setLoading(true)
		setError(false)
		try {
			const res = await axios.get(`${base}/api/user/getAlladmin`, auth())
			if (res.data.success) setAdmins(res.data.users || [])
			else setError(true)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}, [base])

	useEffect(() => { load() }, [load])

	const shown = useMemo(() => {
		const needle = norm(query.trim())
		return admins.filter(a => !needle || [a.fullName, a.username, a.position, a.hodimID].some(v => norm(v).includes(needle)))
	}, [admins, query])

	const remove = async (admin) => {
		setBusyId(admin._id)
		setConfirmId(null)
		try {
			const res = await axios.delete(`${base}/api/user/delete-admin/${admin._id}`, auth())
			if (res.data.success) { toast.success(tx("Admin o'chirildi")); setAdmins(list => list.filter(a => a._id !== admin._id)) }
			else toast.error(tx(res.data.message || 'Xatolik'))
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Server xatosi'))
		} finally {
			setBusyId(null)
		}
	}

	return (
		<main className="min-h-full bg-slate-50 p-4 md:p-6">
			<header className="mb-5 flex flex-wrap items-center justify-end gap-3">
				<div className="flex gap-2">
					<label className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx('Ism yoki login bo‘yicha qidirish')} className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
					<button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx('Yangilash')}</button>
				</div>
			</header>

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				{error ? <p className="p-10 text-center text-sm text-red-600">{tx("Ma'lumotni yuklab bo'lmadi")}</p>
					: loading && !admins.length ? <p className="p-10 text-center text-sm text-slate-400">{tx('Yuklanmoqda...')}</p>
						: !shown.length ? <p className="p-10 text-center text-sm text-slate-500">{tx('Adminlar topilmadi')}</p>
							: <div className="overflow-x-auto"><table className="w-full text-sm">
								<thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">{[tx('Xodim'), tx('Login'), tx('Lavozim'), tx('Bugun'), ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
								<tbody>{shown.map(a => {
									const st = STATUS[a.attendanceStatus] || STATUS.kelmagan
									return (
										<tr key={a._id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
											<td className="px-4 py-2.5"><div className="flex items-center gap-3">
												<span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-semibold text-slate-600">{a.photo ? <img src={`${uploadUrl(a.photo)}`} alt="" className="h-full w-full object-cover" /> : (a.fullName || '?').charAt(0).toUpperCase()}</span>
												<span className="font-medium text-slate-900">{a.fullName}</span></div></td>
											<td className="px-4 py-2.5 text-slate-600">{a.username || '—'}</td>
											<td className="px-4 py-2.5 text-slate-600">{a.position || '—'}</td>
											<td className="px-4 py-2.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.tone}`}>{st.label}</span></td>
											<td className="px-4 py-2.5 text-right">
												{confirmId === a._id
													? <span className="inline-flex items-center gap-2"><button onClick={() => remove(a)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">{tx("Ha, o'chirish")}</button><button onClick={() => setConfirmId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">{tx('Bekor')}</button></span>
													: <button onClick={() => setConfirmId(a._id)} disabled={busyId === a._id} aria-label={tx("O'chirish")} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><FiTrash2 size={15} /></button>}
											</td>
										</tr>
									)
								})}</tbody></table></div>}
			</section>
		</main>
	)
}

export default AdminAdmins
