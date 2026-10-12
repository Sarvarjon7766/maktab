import { tx } from '../../i18n'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiEdit2, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import { Link, useNavigate } from 'react-router-dom'
import { cardNav } from './cardNav'
import { toast } from 'react-toastify'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })
const DEFAULT_SERVER = 'https://isgp.hikcentralconnect.com'
const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400 bg-white'

const ago = (date) => {
	if (!date) return tx('hech qachon')
	const min = Math.round((Date.now() - new Date(date).getTime()) / 60000)
	if (min < 1) return tx('hozirgina')
	if (min < 60) return tx('{{n}} daqiqa oldin', { n: min })
	if (min < 1440) return tx('{{n}} soat oldin', { n: Math.round(min / 60) })
	return tx('{{n}} kun oldin', { n: Math.round(min / 1440) })
}

// Hik-Connect akkauntlari: qo'shish, tahrirlash, sinxronlash. Kameralar maktablarga alohida sahifalarda biriktiriladi
const PlatformHikAccounts = () => {
	const [accounts, setAccounts] = useState([])
	const [loading, setLoading] = useState(true)

	const load = useCallback(async () => {
		try {
			const res = await api.get('/api/hik/accounts', auth())
			setAccounts(res.data.accounts || [])
		} catch {
			toast.error("Akkauntlarni yuklab bo'lmadi")
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => { load() }, [load])

	return (
		<div className="p-4 md:p-6 space-y-6">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex flex-wrap gap-2">
					<Link to="/platform/hik-cameras" className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">{tx("Oddiy kameralarni bog'lash →")}</Link>
					<Link to="/platform/hik-facecontrol" className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50">{tx("FaceControl kameralarni bog'lash →")}</Link>
				</div>
			</div>

			<Accounts accounts={accounts} loading={loading} onChanged={load} />
		</div>
	)
}

/* ============ Akkauntlar ============ */
const Accounts = ({ accounts, loading, onChanged }) => {
	const navigate = useNavigate()
	const [editing, setEditing] = useState(null) // null | 'new' | account
	const [form, setForm] = useState({ name: '', server: DEFAULT_SERVER, appKey: '', secretKey: '', encryptionCode: '' })
	const [busy, setBusy] = useState('')

	const open = (acc) => {
		setEditing(acc)
		setForm(acc === 'new' ? { name: '', server: DEFAULT_SERVER, appKey: '', secretKey: '', encryptionCode: '' } : { name: acc.name, server: acc.server || DEFAULT_SERVER, appKey: '', secretKey: '', encryptionCode: '' })
	}

	const run = async (key, fn, ok) => {
		setBusy(key)
		try {
			const res = await fn()
			if (res.data.success === false) { toast.error(tx(res.data.message || 'Xatolik')); return null }
			if (ok) toast.success(typeof ok === 'function' ? ok(res.data) : ok)
			return res.data
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Xatolik yuz berdi'))
			return null
		} finally {
			setBusy('')
		}
	}

	const save = async (e) => {
		e.preventDefault()
		const isNew = editing === 'new'
		if (isNew && (!form.appKey.trim() || !form.secretKey.trim())) return toast.error('API Key va API Secret majburiy')
		const data = await run('save', () => (isNew ? api.post('/api/hik/accounts', form, auth()) : api.put(`/api/hik/accounts/${editing._id}`, form, auth())),
			r => (r.sync?.success ? tx('Saqlandi: {{n}} ta kamera olindi', { n: r.sync.total }) + (r.existed ? ' ' + tx("(bu kalit oldin qo'shilgan edi)") : '') : tx('Saqlandi')))
		if (data?.sync && !data.sync.success) toast.error(tx(data.sync.message))
		if (data) { setEditing(null); onChanged() }
	}

	const sync = async (acc) => { if (await run(`sync-${acc._id}`, () => api.post(`/api/hik/accounts/${acc._id}/sync`, {}, auth()), r => tx('Yangilandi: {{total}} ta kamera, {{added}} tasi yangi', { total: r.total, added: r.added }))) onChanged(); else onChanged() }
	const test = (acc) => run(`test-${acc._id}`, () => api.post(`/api/hik/accounts/${acc._id}/test`, {}, auth()), r => tx('Ulanish muvaffaqiyatli: {{total}} ta kamera ({{online}} tasi online)', { total: r.total, online: r.online }))
	const remove = async (acc) => {
		if (!window.confirm(tx('"{{name}}" akkaunti o\'chirilsinmi? Undagi {{n}} ta kamera maktablardan ham yechiladi.', { name: acc.name, n: acc.cameraTotal }))) return
		if (await run(`del-${acc._id}`, () => api.delete(`/api/hik/accounts/${acc._id}`, auth()), "Akkaunt o'chirildi")) onChanged()
	}

	return (
		<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
			<div className="flex items-center justify-end gap-2 mb-4">
				<button onClick={() => open('new')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><FiPlus size={14} /> {tx("Akkaunt qo'shish")}</button>
			</div>

			{loading ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : accounts.length === 0 && editing !== 'new'
				? <p className="text-sm text-gray-500">{tx("Hali akkaunt qo'shilmagan. \"Akkaunt qo'shish\" ni bosing yoki maktab yaratayotganda kalitlarni kiriting")}</p>
				: <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
					{accounts.map(a => (
						<div key={a._id} {...cardNav(navigate, `/platform/school-cameras?account=${a._id}&view=cameras`, 'rounded-xl border border-gray-100 p-4 transition hover:border-blue-300 hover:shadow-md')}>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0"><p className="font-medium text-gray-900 truncate">{a.name}</p><p className="text-xs text-gray-500 font-mono mt-0.5">{a.appKeyHint}</p></div>
								<div className="flex gap-1 shrink-0">
									<button onClick={() => open(a)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title={tx("Tahrirlash")}><FiEdit2 size={14} /></button>
									<button onClick={() => remove(a)} disabled={!!busy} className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50" title={tx("O'chirish")}><FiTrash2 size={14} /></button>
								</div>
							</div>
							<div className="grid grid-cols-3 gap-2 mt-3 text-center">
								{[[tx('Jami'), a.cameraTotal, 'text-gray-900', `?account=${a._id}&view=cameras`], [tx('Online'), a.cameraOnline, 'text-green-600', `?account=${a._id}&status=online`], [tx('Biriktirilgan'), a.cameraAssigned, 'text-blue-600', `?account=${a._id}`]].map(([l, v, t, qs]) => (
									<Link key={l} to={`/platform/school-cameras${qs}`} className="rounded-lg bg-gray-50 py-2 hover:bg-blue-50"><p className={`text-lg font-bold ${t}`}>{v}</p><p className="text-[11px] text-gray-500">{l}</p></Link>
								))}
							</div>
							{a.lastSyncError ? <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{a.lastSyncError}</p> : <p className="text-xs text-gray-400 mt-3">{tx('Oxirgi sinxronlash: {{when}}', { when: ago(a.lastSyncAt) })}</p>}
							<div className="flex gap-2 mt-3">
								<button onClick={() => sync(a)} disabled={!!busy} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw size={12} className={busy === `sync-${a._id}` ? 'animate-spin' : ''} /> {tx("Yangilash")}</button>
								<button onClick={() => test(a)} disabled={!!busy} className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">{busy === `test-${a._id}` ? tx("Tekshirilmoqda...") : tx("Ulanishni tekshirish")}</button>
							</div>
						</div>
					))}
				</div>}

			{editing && (
				<form onSubmit={save} className="mt-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
					<p className="md:col-span-2 font-medium text-gray-800">{editing === 'new' ? tx("Yangi akkaunt") : tx('"{{name}}" ni tahrirlash', { name: editing.name })}</p>
					<div><label className="text-xs text-gray-500">{tx("Nomi")}</label><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder={tx("Masalan: Kattaqo'rg'on maktablari")} /></div>
					<div><label className="text-xs text-gray-500">{tx("Server")}</label><input className={inputCls} value={form.server} onChange={e => setForm({ ...form, server: e.target.value })} /></div>
					<div><label className="text-xs text-gray-500">{tx("API Key (AK)")}{editing !== 'new' && tx(" — bo'sh qoldirsangiz o'zgarmaydi")}</label><input className={inputCls} autoComplete="off" value={form.appKey} onChange={e => setForm({ ...form, appKey: e.target.value })} /></div>
					<div><label className="text-xs text-gray-500">{tx("API Secret (SK)")}{editing !== 'new' && tx(" — bo'sh qoldirsangiz o'zgarmaydi")}</label><input type="password" className={inputCls} autoComplete="new-password" value={form.secretKey} onChange={e => setForm({ ...form, secretKey: e.target.value })} /></div>
					<div className="md:col-span-2"><label className="text-xs text-gray-500">{tx("Video shifrlash kodi (ixtiyoriy)")}</label><input type="password" className={inputCls} autoComplete="new-password" value={form.encryptionCode} onChange={e => setForm({ ...form, encryptionCode: e.target.value })} /></div>
					<div className="md:col-span-2 flex justify-end gap-2">
						<button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-white">{tx("Bekor qilish")}</button>
						<button type="submit" disabled={!!busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{busy === 'save' ? tx("Saqlanmoqda...") : tx("Saqlash va kameralarni olish")}</button>
					</div>
				</form>
			)}
		</section>
	)
}

export default PlatformHikAccounts
