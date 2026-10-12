import { tx } from '../../i18n'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiCheck, FiCopy, FiEdit2, FiKey, FiMapPin, FiPlus, FiPower, FiSearch, FiTrash2, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })
const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400 bg-white'
const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

// Parol bir marta ko'rsatiladi (bazada faqat xesh saqlanadi) — nusxalash tugmasi bilan
const SecretModal = ({ title, username, password, onClose }) => {
	const [copied, setCopied] = useState('')
	const copy = (key, value) => { navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(''), 1500) }
	return (
		<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
				<h2 className="text-lg font-bold text-gray-900">{title}</h2>
				<p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 mb-4">{tx("Parol faqat hozir ko'rsatiladi, keyin qayta ko'rib bo'lmaydi.")}</p>
				{[[tx('Login'), username, 'u'], [tx('Parol'), password, 'p']].map(([label, value, key]) => (
					<div key={key} className="mb-3">
						<p className="text-xs text-gray-500 mb-1">{label}</p>
						<div className="flex items-center gap-2">
							<code className="flex-1 bg-gray-100 rounded-lg px-3 py-2 text-sm font-mono break-all text-gray-900">{value}</code>
							<button onClick={() => copy(key, value)} className="p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600">{copied === key ? <FiCheck className="text-green-600" /> : <FiCopy />}</button>
						</div>
					</div>
				))}
				<button onClick={onClose} className="mt-3 w-full px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">{tx("Yopish")}</button>
			</div>
		</div>
	)
}

const FormModal = ({ user, onClose, onSaved, level = 'district' }) => {
	const isRegion = level === 'region'
	const editing = !!user
	const [form, setForm] = useState({ fullName: user?.fullName || '', username: user?.username || '', position: user?.position || '', phone: user?.phone_personal || '', password: '' })
	const [area, setArea] = useState(isRegion ? (user?.monitorScope?.region || '') : (user?.monitorScope?.district ? `${user.monitorScope.region}|${user.monitorScope.district}` : ''))
	const [areas, setAreas] = useState(null)
	const [regions, setRegions] = useState(null)
	const [saving, setSaving] = useState(false)
	useEffect(() => { api.get('/api/monitor-users/areas', auth()).then(r => { setAreas(r.data.areas || []); setRegions(r.data.regions || []) }).catch(() => { setAreas([]); setRegions([]) }) }, [])
	const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

	const submit = async (e) => {
		e.preventDefault()
		if (!form.fullName.trim() || !form.username.trim()) return toast.error(tx('Ism va login majburiy'))
		if (!area) return toast.error(isRegion ? 'Monitor qaysi viloyat uchun ekanini tanlang' : 'Monitor qaysi tuman uchun ekanini tanlang')
		const [region, district] = isRegion ? [area, ''] : area.split('|')
		setSaving(true)
		try {
			const res = editing ? await api.put(`/api/monitor-users/${user._id}`, { ...form, region, district, level }, auth()) : await api.post('/api/monitor-users', { ...form, region, district, level }, auth())
			toast.success(editing ? 'Saqlandi' : "Monitor qo'shildi")
			onSaved(res.data, form.username.trim())
		} catch (error) {
			toast.error(tx(error.response?.data?.message || 'Xatolik yuz berdi'))
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
			<form onSubmit={submit} className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-3">
				<div className="flex items-center justify-between mb-1">
					<h2 className="text-lg font-bold text-gray-900">{editing ? tx("Monitorni tahrirlash") : (isRegion ? tx("Yangi viloyat monitori") : tx("Yangi tuman monitori"))}</h2>
					<button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><FiX size={20} /></button>
				</div>
				{isRegion ? (
					<div>
						<label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600"><FiMapPin size={12} /> {tx("Qaysi viloyat monitori*")}</label>
						<SearchableSelect variant="outline" icon={false} className="w-full" searchPlaceholder={tx("Viloyat qidirish...")} value={area} onChange={setArea}
							options={[{ value: '', label: regions === null ? tx('Yuklanmoqda...') : tx('Viloyatni tanlang') }, ...(regions || []).map(r => ({ value: r.region, label: tx('{{region}} viloyati ({{d}} ta tuman, {{s}} ta maktab)', { region: r.region, d: r.districts, s: r.schools }) }))]} />
						<p className="mt-1 text-[11px] text-gray-400">{tx("Viloyat monitori shu viloyatdagi barcha tumanlar va maktablarni ko'radi. Ro'yxatda viloyat yo'q bo'lsa, avval «Tumanlar» bo'limida tumanlarni yuklang.")}</p>
					</div>
				) : (
					<div>
						<label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-600"><FiMapPin size={12} /> {tx("Qaysi tuman monitori*")}</label>
						<SearchableSelect variant="outline" icon={false} className="w-full" searchPlaceholder={tx("Tuman qidirish...")} value={area} onChange={setArea}
							options={[{ value: '', label: areas === null ? tx('Yuklanmoqda...') : tx('Tumanni tanlang') }, ...(areas || []).map(a => ({ value: `${a.region}|${a.district}`, label: tx('{{name}} ({{n}} ta maktab)', { name: [a.region, a.district].filter(Boolean).join(', '), n: a.schools }) + (a.registered ? '' : tx(" · ro'yxatda yo'q")) }))]} />
						<p className="mt-1 text-[11px] text-gray-400">{tx("Monitor faqat shu tumandagi maktablarni ko'radi. Ro'yxatda tuman yo'q bo'lsa, avval «Tumanlar» bo'limida qo'shing.")}</p>
					</div>
				)}
				<input className={inputCls} placeholder={tx("To'liq ism*")} value={form.fullName} onChange={set('fullName')} autoFocus />
				<input className={inputCls} placeholder={tx("Login*")} value={form.username} onChange={set('username')} autoComplete="off" />
				<div className="grid grid-cols-2 gap-3">
					<input className={inputCls} placeholder={tx("Lavozim")} value={form.position} onChange={set('position')} />
					<input className={inputCls} placeholder={tx("Telefon")} value={form.phone} onChange={set('phone')} />
				</div>
				<input type="password" className={inputCls} placeholder={editing ? tx("Yangi parol (ixtiyoriy)") : tx("Parol (bo'sh qoldirsangiz o'zi yaratiladi)")} value={form.password} onChange={set('password')} autoComplete="new-password" />
				<div className="flex justify-end gap-2 pt-2">
					<button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{tx("Bekor qilish")}</button>
					<button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{saving ? tx("Saqlanmoqda...") : tx("Saqlash")}</button>
				</div>
			</form>
		</div>
	)
}

// Monitor roli akkauntlari: qo'shish, tahrirlash, parolni yangilash, bloklash, o'chirish
const PlatformMonitors = ({ level = 'district' }) => {
	const isRegion = level === 'region'
	const [users, setUsers] = useState([])
	const [loading, setLoading] = useState(true)
	const [query, setQuery] = useState('')
	const [form, setForm] = useState(null) // null | 'new' | user
	const [secret, setSecret] = useState(null)
	const [busyId, setBusyId] = useState('')

	const load = useCallback(async () => {
		try {
			const res = await api.get('/api/monitor-users', auth())
			setUsers(res.data.users || [])
		} catch {
			toast.error("Ro'yxatni yuklab bo'lmadi")
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => { load() }, [load])

	const shown = useMemo(() => users.filter(u => (isRegion ? u.level === 'region' : u.level !== 'region') && (!query || norm(`${u.fullName} ${u.username} ${u.position || ''}`).includes(norm(query.trim())))), [users, query, isRegion])

	const act = async (user, fn, okMessage) => {
		setBusyId(user._id)
		try {
			const res = await fn()
			if (okMessage) toast.success(okMessage)
			await load()
			return res.data
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Xatolik yuz berdi'))
			return null
		} finally {
			setBusyId('')
		}
	}

	const toggle = (u) => act(u, () => api.put(`/api/monitor-users/${u._id}`, { isActive: !u.isActive }, auth()), u.isActive ? tx('Bloklandi') : tx('Faollashtirildi'))
	const resetPassword = async (u) => {
		if (!window.confirm(tx('"{{name}}" uchun yangi parol yaratilsinmi? Eski parol ishlamay qoladi.', { name: u.fullName }))) return
		const data = await act(u, () => api.put(`/api/monitor-users/${u._id}`, { resetPassword: true }, auth()))
		if (data?.password) setSecret({ title: tx('Yangi parol'), username: u.username, password: data.password })
	}
	const remove = async (u) => {
		if (!window.confirm(tx("\"{{name}}\" o'chirilsinmi? Bu qaytarib bo'lmaydi.", { name: u.fullName }))) return
		await act(u, () => api.delete(`/api/monitor-users/${u._id}`, auth()), "O'chirildi")
	}

	return (
		<div className="p-4 md:p-6 space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3"><div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 text-sm shadow-sm">{[['/platform/region-monitors', tx('Viloyat monitorlari'), users.filter(u => u.level === 'region').length, true], ['/platform/monitors', tx('Tuman monitorlari'), users.filter(u => u.level !== 'region').length, false]].map(([to, label, n, reg]) => <Link key={to} to={to} className={`rounded-lg px-4 py-2 font-medium transition ${reg === isRegion ? (reg ? 'bg-violet-600 text-white shadow' : 'bg-blue-600 text-white shadow') : 'text-gray-600 hover:bg-gray-50'}`}>{label} <span className={`ml-1 text-xs ${reg === isRegion ? 'opacity-80' : 'text-gray-400'}`}>{n}</span></Link>)}</div></div>
			<div className={`rounded-2xl border-l-4 bg-white px-5 py-3 shadow-sm ${isRegion ? 'border-violet-500' : 'border-blue-500'}`}><p className="text-sm text-gray-600">{isRegion ? tx("Viloyat monitori butun viloyatdagi tumanlar va maktablarni solishtirib, to'liq nazorat qiladi.") : tx("Tuman monitori faqat o'z tumanidagi maktablarni nazorat qiladi.")}</p></div>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="relative w-full max-w-sm">
					<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx("Ism yoki login")} className={`${inputCls} pl-9`} />
				</div>
				<button onClick={() => setForm('new')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><FiPlus size={15} /> {isRegion ? tx("Viloyat monitori qo'shish") : tx("Tuman monitori qo'shish")}</button>
			</div>

			{!isRegion && users.some(u => u.level == null) && <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><FiAlertTriangle className="mt-0.5 shrink-0" /><span>{tx("Ba'zi monitorlarga hudud berilmagan: ular")} <b>{tx("hamma maktablarni")}</b> {tx("ko'radi. Tuman belgilash uchun «Hudud belgilanmagan» yozuvini bosing.")}</span></div>}

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{[tx('Monitor'), tx('Hudud'), tx('Login'), tx('Telefon'), tx('Holati'), tx("Qo'shilgan"), ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{shown.map(u => (
								<tr key={u._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
									<td className="px-4 py-3"><div className="flex items-center gap-3"><span className="w-9 h-9 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">{initials(u.fullName)}</span><span><span className="block font-medium text-gray-900">{u.fullName}</span>{u.position && <span className="block text-xs text-gray-400">{u.position}</span>}</span></div></td>
									<td className="px-4 py-3">{u.level === 'region' ? <Link to={`/platform/schools?q=${encodeURIComponent(u.monitorScope.region)}`} className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"><FiMapPin size={11} />{tx('{{region}} viloyati', { region: u.monitorScope.region })}{u.schoolCount !== null && <span className="font-normal text-violet-500">· {tx('{{n}} maktab', { n: u.schoolCount })}</span>}</Link> : u.monitorScope?.district ? <Link to={`/platform/schools?district=${encodeURIComponent([u.monitorScope.region, u.monitorScope.district].filter(Boolean).join(' · '))}`} className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"><FiMapPin size={11} />{u.monitorScope.district}{u.schoolCount !== null && <span className="font-normal text-blue-500">· {tx('{{n}} maktab', { n: u.schoolCount })}</span>}</Link> : <button onClick={() => setForm(u)} title={tx("Hudud berilmagan: bu monitor hamma maktabni ko'radi")} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"><FiAlertTriangle size={11} /> {tx("Hudud belgilanmagan")}</button>}</td>
									<td className="px-4 py-3 font-mono text-xs text-gray-600">{u.username}</td>
									<td className="px-4 py-3 text-gray-600 whitespace-nowrap">{u.phone_personal || '—'}</td>
									<td className="px-4 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${u.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{u.isActive ? tx("Faol") : tx("Bloklangan")}</span></td>
									<td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(u.createdAt).toLocaleDateString('uz-UZ')}</td>
									<td className="px-4 py-3">
										<div className="flex items-center justify-end gap-1">
											<button onClick={() => setForm(u)} title={tx("Tahrirlash")} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"><FiEdit2 size={15} /></button>
											<button onClick={() => resetPassword(u)} disabled={busyId === u._id} title={tx("Parolni yangilash")} className="p-2 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"><FiKey size={15} /></button>
											<button onClick={() => toggle(u)} disabled={busyId === u._id} title={u.isActive ? tx("Bloklash") : tx("Faollashtirish")} className={`p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${u.isActive ? 'text-red-500' : 'text-green-600'}`}><FiPower size={15} /></button>
											<button onClick={() => remove(u)} disabled={busyId === u._id} title={tx("O'chirish")} className="p-2 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"><FiTrash2 size={15} /></button>
										</div>
									</td>
								</tr>
							))}
							{!loading && shown.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">{shown.length === 0 && !query ? (isRegion ? tx("Hali viloyat monitori qo'shilmagan") : tx("Hali tuman monitori qo'shilmagan")) : tx("Topilmadi")}</td></tr>}
							{loading && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">{tx("Yuklanmoqda...")}</td></tr>}
						</tbody>
					</table>
				</div>
			</div>

			{form && <FormModal level={isRegion ? 'region' : 'district'} user={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={(data, username) => {
				setForm(null); load()
				if (data.password) setSecret({ title: tx('Monitor yaratildi'), username, password: data.password })
			}} />}
			{secret && <SecretModal {...secret} onClose={() => setSecret(null)} />}
		</div>
	)
}

export default PlatformMonitors

