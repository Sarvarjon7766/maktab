import { tx } from '../../i18n'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiDownload, FiEdit2, FiMapPin, FiPlus, FiSearch, FiTrash2, FiUpload, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import MapView from '../../components/MapView'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })
const inputCls = 'w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400 bg-white'

// Tuman qo'shish / tahrirlash: nomi, viloyati va (ixtiyoriy) chegarasi — GeoJSON fayl
const FormModal = ({ district, onClose, onSaved }) => {
	const editing = !!district
	const [name, setName] = useState(district?.name || '')
	const [region, setRegion] = useState(district?.region || 'Samarqand')
	const [geometry, setGeometry] = useState(null)
	const [fileName, setFileName] = useState('')
	const [busy, setBusy] = useState(false)

	const onFile = async (e) => {
		const file = e.target.files?.[0]
		if (!file) return
		try {
			const json = JSON.parse(await file.text())
			setGeometry(json); setFileName(file.name)
		} catch { toast.error("Fayl noto'g'ri: GeoJSON (.json / .geojson) bo'lishi kerak") }
	}
	const submit = async (e) => {
		e.preventDefault()
		if (!name.trim()) return toast.error('Tuman nomini kiriting')
		setBusy(true)
		try {
			const body = { name, region, ...(geometry ? { geometry } : {}) }
			const res = editing ? await api.put(`/api/districts/${district._id}`, body, auth()) : await api.post('/api/districts', body, auth())
			if (!res.data.success) throw new Error(res.data.message)
			toast.success(editing ? 'Saqlandi' : "Tuman qo'shildi")
			onSaved()
		} catch (err) { toast.error(tx(err.response?.data?.message || err.message || 'Xatolik yuz berdi')) } finally { setBusy(false) }
	}
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
			<form onSubmit={submit} onClick={e => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-6 shadow-xl">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-bold text-gray-900">{editing ? tx("Tumanni tahrirlash") : tx("Yangi tuman qo'shish")}</h2>
					<button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700"><FiX size={20} /></button>
				</div>
				<input className={inputCls} placeholder={tx("Tuman nomi* (masalan: Bulung'ur)")} value={name} onChange={e => setName(e.target.value)} autoFocus />
				<input className={inputCls} placeholder={tx("Viloyat (masalan: Samarqand)")} value={region} onChange={e => setRegion(e.target.value)} />
				<label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:bg-gray-50">
					<FiUpload className="shrink-0 text-gray-400" />
					<span className="min-w-0 flex-1 truncate">{fileName || (editing && district.hasBoundary ? tx("Yangi chegara yuklash (ixtiyoriy)") : tx("Chegara fayli: GeoJSON (ixtiyoriy)"))}</span>
					<input type="file" accept=".json,.geojson,application/json" className="hidden" onChange={onFile} />
				</label>
				<p className="text-[11px] text-gray-400">{tx("Chegara Polygon yoki MultiPolygon (koordinatalar [uzunlik, kenglik]) bo'lishi kerak. Fayl bo'lmasa, tuman xaritada chegarasiz ko'rinadi, maktablar nuqta bo'lib chiqaveradi.")}</p>
				{editing && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{tx("Nomni o'zgartirsangiz, shu tumandagi maktablar va monitorlardagi tuman nomi ham avtomatik yangilanadi.")}</p>}
				<div className="flex justify-end gap-2 pt-1">
					<button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{tx("Bekor qilish")}</button>
					<button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{busy ? tx("Saqlanmoqda...") : tx("Saqlash")}</button>
				</div>
			</form>
		</div>
	)
}

// Tumanlar: tizim egasi tumanlarni qo'shadi (tayyor Samarqand viloyati chegaralari bir tugmada yuklanadi), maktab va monitorlar shularga biriktiriladi
const PlatformDistricts = () => {
	const [data, setData] = useState(null)
	const [geo, setGeo] = useState(null)
	const [form, setForm] = useState(null) // null | 'new' | district
	const [busy, setBusy] = useState(false)
	const [active, setActive] = useState('')
	const [q, setQ] = useState('')

	const load = useCallback(async () => {
		try {
			const [l, g] = await Promise.all([api.get('/api/districts', auth()), api.get('/api/districts/geo', auth())])
			setData(l.data); setGeo(g.data.geojson)
		} catch { toast.error("Tumanlarni yuklab bo'lmadi"); setData({ districts: [] }) }
	}, [])
	useEffect(() => { load() }, [load])

	const importBundled = async () => {
		setBusy(true)
		try { const r = await api.post('/api/districts/import-bundled', {}, auth()); toast.success(tx(r.data.message)); await load() } catch (e) { toast.error(tx(e.response?.data?.message || "Yuklab bo'lmadi")) } finally { setBusy(false) }
	}
	const remove = async (d) => {
		if (!window.confirm(tx("\"{{name}}\" tumani o'chirilsinmi?", { name: d.name }))) return
		try { await api.delete(`/api/districts/${d._id}`, auth()); toast.success("O'chirildi"); load() } catch (e) { toast.error(tx(e.response?.data?.message || 'Xatolik')) }
	}

	const districts = useMemo(() => (data?.districts || []).filter(d => !d.isRegion), [data])
	const shown = useMemo(() => { const t = norm(q.trim()); return t ? districts.filter(d => norm(`${d.name} ${d.region || ''}`).includes(t)) : districts }, [districts, q])
	const region = (data?.districts || []).find(d => d.isRegion)
	const geoStyle = useCallback((f) => {
		if (f.properties.isRegion) return { color: '#64748b', weight: 2, fillOpacity: 0, dashArray: '6 4' }
		const on = f.properties.name === active
		return { color: on ? '#1d4ed8' : '#334155', weight: on ? 3 : 1.2, fillColor: on ? '#3b82f6' : '#94a3b8', fillOpacity: on ? 0.45 : 0.25 }
	}, [active])
	const totalSchools = districts.reduce((a, d) => a + d.schools, 0)

	return (
		<div className="space-y-5 p-4 md:p-6">
			<div className="flex flex-wrap justify-end gap-2">
					<button onClick={importBundled} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiDownload size={15} /> {busy ? tx("Yuklanmoqda...") : tx("Samarqand viloyati tumanlarini yuklash")}</button>
					<button onClick={() => setForm('new')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"><FiPlus size={15} /> {tx("Tuman qo'shish")}</button>
			</div>

			{data && data.schoolsWithoutDistrict > 0 && <Link to="/platform/schools?district=none" className="block rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100"><b>{tx('{{n}} ta maktabning', { n: data.schoolsWithoutDistrict })}</b> {tx("tumani ro'yxatdagi tumanlarga mos kelmaydi. «Maktablar» sahifasida ularga tuman tanlang.")}</Link>}

			<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
				<section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
					<div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-sm text-gray-500"><span>{tx('{{a}} ta tuman · {{b}} ta maktab', { a: districts.length, b: totalSchools })}</span>{region && <span className="text-xs text-gray-400">{tx("Viloyat chegarasi yuklangan")}</span>}</div>
					<div className="relative border-b border-gray-100 p-3">
						<FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Tuman yoki viloyat nomi bo'yicha qidirish")} className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
					</div>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead><tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500">{[tx('Tuman'), tx('Maktablar'), tx('Xaritada'), tx('Chegara'), ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
							<tbody>
								{shown.map(d => (
									<tr key={d._id} onClick={() => setActive(d.name)} className={`cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50 ${active === d.name ? 'bg-blue-50/60' : ''}`}>
										<td className="px-4 py-3"><p className="font-medium text-gray-900">{d.name}</p><p className="text-xs text-gray-400">{d.region}</p></td>
										<td className="px-4 py-3 text-gray-700"><Link to={`/platform/schools?district=${encodeURIComponent([d.region, d.name].filter(Boolean).join(' · '))}`} onClick={e => e.stopPropagation()} className="text-blue-700 hover:underline" title={tx("Shu tumandagi maktablar")}>{d.schools}</Link></td>
										<td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-xs ${d.schools && d.located === d.schools ? 'text-emerald-600' : d.located ? 'text-amber-600' : 'text-gray-400'}`}><FiMapPin size={12} />{d.located}/{d.schools}</span></td>
										<td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.hasBoundary ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{d.hasBoundary ? tx("Bor") : tx("Yo'q")}</span></td>
										<td className="px-4 py-3"><div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
											<button onClick={() => setForm(d)} title={tx("Tahrirlash")} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"><FiEdit2 size={15} /></button>
											<button onClick={() => remove(d)} title={tx("O'chirish")} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><FiTrash2 size={15} /></button>
										</div></td>
									</tr>
								))}
								{data && districts.length > 0 && shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-500">{tx("Qidiruv bo'yicha tuman topilmadi")}</td></tr>}
																{data && districts.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500"><p>{tx("Hali tuman qo'shilmagan")}</p><button onClick={importBundled} disabled={busy} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-50">{tx("Samarqand viloyati tumanlarini yuklash")}</button></td></tr>}
								{!data && <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-500">{tx("Yuklanmoqda...")}</td></tr>}
							</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
					<MapView geojson={geo} districtStyle={geoStyle} onDistrictClick={f => setActive(f.properties.name)} height={520} />
					<p className="px-2 pt-2 text-xs text-gray-400">{active ? tx('Tanlangan: {{name}}', { name: active }) : tx("Tumanni xaritadan yoki ro'yxatdan tanlang")}</p>
				</section>
			</div>

			{form && <FormModal district={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); load() }} />}
		</div>
	)
}

export default PlatformDistricts
