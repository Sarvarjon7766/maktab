import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiKey, FiPlus, FiRefreshCw, FiServer, FiTrash2, FiXCircle } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useOrg } from '../../context/OrgContext'
import { intlLocale, tx } from '../../i18n'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const when = (d) => (d ? new Date(d).toLocaleString(intlLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-black outline-none focus:border-blue-400'
const errText = (e) => tx(e.response?.data?.message || 'Server xatosi')

const Card = ({ title, hint, action, children }) => (
	<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
		<div className="mb-4 flex flex-wrap items-start justify-between gap-3">
			<div><h2 className="text-base font-semibold text-slate-900">{title}</h2>{hint && <p className="mt-1 max-w-2xl text-sm text-slate-500">{hint}</p>}</div>
			{action}
		</div>
		{children}
	</section>
)

// ───────── VILOYAT serveri: ulangan tuman serverlari ─────────
const RegionDistricts = () => {
	const [rows, setRows] = useState(null)
	const [form, setForm] = useState({ name: '', region: '', baseUrl: '', apiKey: '' })
	const [busy, setBusy] = useState('')

	const load = useCallback(async () => {
		try { setRows((await api.get('/api/federation-admin/districts', auth())).data.districts || []) } catch (e) { toast.error(errText(e)); setRows([]) }
	}, [])
	useEffect(() => { load() }, [load])

	const add = async (e) => {
		e.preventDefault(); setBusy('add')
		try {
			const r = await api.post('/api/federation-admin/districts', form, auth())
			if (r.data.connected) toast.success(tx("Tuman serveri ulandi")); else toast.warn(tx("Saqlandi, lekin ulanmadi: {{err}}", { err: tx(r.data.error || '') }))
			setForm({ name: '', region: '', baseUrl: '', apiKey: '' }); load()
		} catch (err) { toast.error(errText(err)) } finally { setBusy('') }
	}
	const test = async (d) => {
		setBusy(d._id)
		try { const r = await api.post(`/api/federation-admin/districts/${d._id}/test`, {}, auth()); r.data.connected ? toast.success(tx("Ulanish yaxshi: {{n}} ta maktab", { n: r.data.schools })) : toast.error(tx(r.data.error || 'Ulanmadi')); load() } catch (err) { toast.error(errText(err)) } finally { setBusy('') }
	}
	const toggle = async (d) => { try { await api.put(`/api/federation-admin/districts/${d._id}`, { active: !d.active }, auth()); load() } catch (err) { toast.error(errText(err)) } }
	const remove = async (d) => {
		if (!window.confirm(tx("«{{name}}» tumanini ro'yxatdan olib tashlaysizmi?", { name: d.name }))) return
		try { await api.delete(`/api/federation-admin/districts/${d._id}`, auth()); load() } catch (err) { toast.error(errText(err)) }
	}

	const total = (rows || []).reduce((a, d) => a + (d.schools || 0), 0)
	return (
		<div className="space-y-5">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				{[[tx('Ulangan serverlar'), (rows || []).length], [tx('Ishlayotgan'), (rows || []).filter(d => d.active && !d.lastError && d.lastOkAt).length], [tx('Jami maktablar'), total]].map(([l, v]) => (
					<div key={l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold text-slate-900">{v}</p></div>
				))}
			</div>

			<Card title={tx("Tuman serverlari")} hint={tx("Har bir tuman o'z serverida ishlaydi. Bu yerga tuman superadmini bergan API kalit orqali ulanasiz: viloyat faqat o'qiydi.")}
				action={<div className="flex gap-2"><Link to="/monitor" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">{tx("Viloyat monitorini ochish")}</Link><button onClick={load} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title={tx('Yangilash')}><FiRefreshCw size={15} /></button></div>}>
				{rows === null ? <p className="text-sm text-slate-500">{tx('Yuklanmoqda...')}</p> : rows.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{tx("Hali birorta tuman serveri ulanmagan. Pastdagi formadan qo'shing.")}</p> : (
					<div className="overflow-x-auto"><table className="w-full text-sm">
						<thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="py-2 pr-3">{tx('Server')}</th><th className="pr-3">{tx('Manzil')}</th><th className="pr-3">{tx('Tumanlar')}</th><th className="pr-3">{tx('Maktablar')}</th><th className="pr-3">{tx('Holat')}</th><th /></tr></thead>
						<tbody>{rows.map(d => (
							<tr key={d._id} className="border-b border-slate-50 align-top">
								<td className="py-3 pr-3"><p className="font-medium text-slate-900">{d.name}</p><p className="text-xs text-slate-400">{d.region || '—'} · {tx('kalit')} …{d.apiKeyHint}</p></td>
								<td className="pr-3 text-xs text-slate-600">{d.baseUrl}</td>
								<td className="pr-3 text-xs text-slate-600">{(d.districts || []).join(', ') || '—'}</td>
								<td className="pr-3">{d.schools || 0}</td>
								<td className="pr-3">{!d.active ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{tx("O'chirilgan")}</span>
									: d.lastError ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700" title={d.lastError}><FiXCircle size={12} /> {tx("Ulanmagan")}</span>
										: d.lastOkAt ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700"><FiCheckCircle size={12} /> {tx("Ulangan")} · {when(d.lastOkAt)}</span> : <span className="text-xs text-slate-400">—</span>}
									{d.lastError && <p className="mt-1 max-w-[220px] text-[11px] text-red-600">{tx(d.lastError)}</p>}</td>
								<td className="whitespace-nowrap py-3 text-right">
									<button onClick={() => test(d)} disabled={busy === d._id} className="mr-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-50">{busy === d._id ? '...' : tx('Tekshirish')}</button>
									<button onClick={() => toggle(d)} className="mr-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50">{d.active ? tx("O'chirish") : tx('Yoqish')}</button>
									<button onClick={() => remove(d)} className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50" title={tx("Olib tashlash")}><FiTrash2 size={14} /></button>
								</td>
							</tr>))}</tbody>
					</table></div>
				)}
			</Card>

			<Card title={tx("Tuman serverini qo'shish")} hint={tx("Manzil HTTPS bo'lishi shart (masalan https://bulungur.example.uz). Kalitni tuman superadmini «Viloyat ulanishi» sahifasida yaratadi.")}>
				<form onSubmit={add} className="grid grid-cols-1 gap-3 md:grid-cols-2">
					<label className="text-xs text-slate-500">{tx('Server nomi')}<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} placeholder={tx("Masalan: Bulung'ur")} /></label>
					<label className="text-xs text-slate-500">{tx('Viloyat')}<input value={form.region} onChange={e => setForm({ ...form, region: e.target.value })} className={input} placeholder="Samarqand" /></label>
					<label className="text-xs text-slate-500">{tx('Server manzili')}<input required value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} className={input} placeholder="https://bulungur.example.uz" /></label>
					<label className="text-xs text-slate-500">{tx('API kalit')}<input required type="password" autoComplete="off" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} className={input} placeholder="fk_xxxxxxxx.…" /></label>
					<div className="md:col-span-2"><button disabled={busy === 'add'} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><FiPlus size={15} /> {busy === 'add' ? tx('Ulanmoqda...') : tx("Qo'shish va tekshirish")}</button></div>
				</form>
			</Card>
		</div>
	)
}

// ───────── TUMAN serveri: viloyatga beriladigan API kalitlar ─────────
const DistrictKeys = () => {
	const [keys, setKeys] = useState(null)
	const [audit, setAudit] = useState([])
	const [form, setForm] = useState({ name: '', allowedIps: '', expiresInDays: '' })
	const [fresh, setFresh] = useState(null) // yangi yaratilgan kalit (bir marta)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		try {
			const [k, a] = await Promise.all([api.get('/api/federation-keys', auth()), api.get('/api/federation-keys/audit?limit=30', auth())])
			setKeys(k.data.keys || []); setAudit(a.data.rows || [])
		} catch (e) { toast.error(errText(e)); setKeys([]) }
	}, [])
	useEffect(() => { load() }, [load])

	const create = async (e) => {
		e.preventDefault(); setBusy(true)
		try {
			const r = await api.post('/api/federation-keys', { name: form.name, allowedIps: form.allowedIps, expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : 0 }, auth())
			setFresh(r.data.token); setForm({ name: '', allowedIps: '', expiresInDays: '' }); load()
		} catch (err) { toast.error(errText(err)) } finally { setBusy(false) }
	}
	const toggle = async (k) => { try { await api.put(`/api/federation-keys/${k._id}`, { active: !k.active }, auth()); load() } catch (err) { toast.error(errText(err)) } }
	const revoke = async (k) => {
		if (!window.confirm(tx("«{{name}}» kalitini o'chirasizmi? Viloyat serveri shu kalit bilan endi ulana olmaydi.", { name: k.name }))) return
		try { await api.delete(`/api/federation-keys/${k._id}`, auth()); load() } catch (err) { toast.error(errText(err)) }
	}
	const copy = async () => { try { await navigator.clipboard.writeText(fresh); toast.success(tx('Nusxalandi')) } catch { toast.error(tx("Nusxalab bo'lmadi")) } }

	return (
		<div className="space-y-5">
			{fresh && (
				<div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
					<p className="flex items-center gap-2 text-sm font-semibold text-amber-900"><FiAlertTriangle /> {tx("Yangi kalit. Uni hozir nusxalab oling: keyin qayta ko'rsatilmaydi!")}</p>
					<div className="mt-3 flex flex-wrap items-center gap-2"><code className="break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-900">{fresh}</code>
						<button onClick={copy} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"><FiCopy size={13} /> {tx('Nusxalash')}</button>
						<button onClick={() => setFresh(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs">{tx('Yopish')}</button></div>
					<p className="mt-2 text-xs text-amber-800">{tx("Kalitni viloyat superadminiga xavfsiz yo'l bilan bering (masalan shaxsan yoki shifrlangan kanal orqali). Ochiq chatda yubormang.")}</p>
				</div>
			)}

			<Card title={tx("Viloyat ulanishi (API kalitlar)")} hint={tx("Viloyat serveri shu kalit bilan bu tumanning hisobotlarini FAQAT o'qiydi. Kalitni istalgan vaqtda o'chirish yoki vaqtincha to'xtatish mumkin.")}
				action={<button onClick={load} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title={tx('Yangilash')}><FiRefreshCw size={15} /></button>}>
				{keys === null ? <p className="text-sm text-slate-500">{tx('Yuklanmoqda...')}</p> : keys.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">{tx("Hali kalit yaratilmagan.")}</p> : (
					<div className="overflow-x-auto"><table className="w-full text-sm">
						<thead><tr className="border-b border-slate-100 text-left text-xs text-slate-500"><th className="py-2 pr-3">{tx('Nomi')}</th><th className="pr-3">{tx('Kalit')}</th><th className="pr-3">{tx('IP ruxsat')}</th><th className="pr-3">{tx('Muddati')}</th><th className="pr-3">{tx('Oxirgi foydalanish')}</th><th className="pr-3">{tx('Holat')}</th><th /></tr></thead>
						<tbody>{keys.map(k => (
							<tr key={k._id} className="border-b border-slate-50">
								<td className="py-3 pr-3 font-medium text-slate-900">{k.name}</td>
								<td className="pr-3 font-mono text-xs text-slate-500">fk_{k.prefix}…</td>
								<td className="pr-3 text-xs text-slate-600">{(k.allowedIps || []).join(', ') || tx('Hammasi')}</td>
								<td className="pr-3 text-xs text-slate-600">{k.expiresAt ? when(k.expiresAt) : tx('Cheksiz')}</td>
								<td className="pr-3 text-xs text-slate-600">{when(k.lastUsedAt)}{k.lastUsedIp ? ` · ${k.lastUsedIp}` : ''}</td>
								<td className="pr-3">{k.active ? <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{tx('Faol')}</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{tx("To'xtatilgan")}</span>}</td>
								<td className="whitespace-nowrap text-right"><button onClick={() => toggle(k)} className="mr-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs hover:bg-slate-50">{k.active ? tx("To'xtatish") : tx('Yoqish')}</button><button onClick={() => revoke(k)} className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50" title={tx("O'chirish")}><FiTrash2 size={14} /></button></td>
							</tr>))}</tbody>
					</table></div>
				)}
			</Card>

			<Card title={tx("Yangi kalit yaratish")}>
				<form onSubmit={create} className="grid grid-cols-1 gap-3 md:grid-cols-3">
					<label className="text-xs text-slate-500">{tx('Nomi')}<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={input} placeholder={tx('Masalan: Samarqand viloyat serveri')} /></label>
					<label className="text-xs text-slate-500">{tx("IP ruxsat (ixtiyoriy)")}<input value={form.allowedIps} onChange={e => setForm({ ...form, allowedIps: e.target.value })} className={input} placeholder="203.0.113.10, 203.0.113.11" /></label>
					<label className="text-xs text-slate-500">{tx("Amal qilish muddati, kun (ixtiyoriy)")}<input type="number" min="1" max="3650" value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: e.target.value })} className={input} placeholder="365" /></label>
					<div className="md:col-span-3"><button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><FiKey size={15} /> {busy ? tx('Yaratilmoqda...') : tx('Kalit yaratish')}</button></div>
				</form>
			</Card>

			<Card title={tx("Oxirgi so'rovlar (audit)")} hint={tx("Viloyat serveri qachon va nimani so'raganini ko'rasiz. 30 kundan keyin o'zi o'chadi.")}>
				{audit.length === 0 ? <p className="text-sm text-slate-500">{tx("Hali so'rov bo'lmagan.")}</p> : (
					<div className="max-h-72 overflow-y-auto"><table className="w-full text-xs"><tbody>{audit.map(a => (
						<tr key={a._id} className="border-b border-slate-50"><td className="py-1.5 pr-3 text-slate-500">{when(a.at)}</td><td className="pr-3 text-slate-700">{a.keyName}</td><td className="pr-3 font-mono text-slate-600">{a.path}</td><td className={`pr-3 ${a.status >= 400 ? 'text-red-600' : 'text-green-700'}`}>{a.status}</td><td className="text-slate-400">{a.ms} ms · {a.ip}</td></tr>))}</tbody></table></div>
				)}
			</Card>
		</div>
	)
}

const PlatformFederation = () => {
	const { mode } = useOrg()
	return (
		<div className="max-w-6xl space-y-5">
			<div className="flex items-center gap-3 text-slate-900"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FiServer size={20} /></span>
				<div><h1 className="text-lg font-semibold">{mode === 'region' ? tx('Tumanlar bilan ulanish') : tx('Viloyat ulanishi')}</h1>
					<p className="text-xs text-slate-500">{mode === 'region' ? tx("Viloyat rejimi: ma'lumot tuman serverlaridan o'qiladi") : tx("Tuman rejimi: viloyatga faqat o'qish uchun API beriladi")}</p></div></div>
			{mode === 'region' ? <RegionDistricts /> : <DistrictKeys />}
		</div>
	)
}

export default PlatformFederation
