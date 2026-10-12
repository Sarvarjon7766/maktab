import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiCrosshair, FiExternalLink, FiLink, FiMapPin, FiSave, FiTrash2 } from 'react-icons/fi'
import { toast } from 'react-toastify'
import MapView from './MapView'
import { tx } from '../i18n'

// Token har so'rovda joriy qiymatdan olinadi (mount paytida qotib qolmasin)
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

const BASE = import.meta.env.VITE_BASE_URL
const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const fix = (v) => (v == null ? '' : String(Math.round(v * 1e6) / 1e6))
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

// Maktab joylashuvi: maktab admini xaritadan nuqtani bosib belgilaydi. Shu asosida maktab monitor xaritasida statistika bilan chiqadi
const SchoolLocationCard = () => {
	const [info, setInfo] = useState(null)
	const [lat, setLat] = useState('')
	const [lng, setLng] = useState('')
	const [address, setAddress] = useState('')
	const [saved, setSaved] = useState(null)
	const [busy, setBusy] = useState(false)
	const [warn, setWarn] = useState(false)
	const [focus, setFocus] = useState(null)
	const [link, setLink] = useState('')
	const [parsing, setParsing] = useState(false)

	useEffect(() => {
		axios.get(`${BASE}/api/school/me/location`, { headers: getHeaders() }).then(r => {
			setInfo(r.data)
			const l = r.data.location
			if (l) { setLat(fix(l.lat)); setLng(fix(l.lng)); setAddress(l.address || ''); setSaved(l) }
			else if (r.data.center) setFocus({ lat: r.data.center.lat, lng: r.data.center.lng, zoom: 11 })
		}).catch(() => setInfo({ error: true }))
	}, [])

	const geo = useMemo(() => (info?.districtBoundary ? { type: 'FeatureCollection', features: [{ ...info.districtBoundary, properties: { ...info.districtBoundary.properties, id: 'd', isRegion: false } }] } : null), [info])
	const pick = lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null
	const dirty = !saved || num(lat) !== saved.lat || num(lng) !== saved.lng || address !== (saved.address || '')

	const onPick = (la, lo) => { setLat(fix(la)); setLng(fix(lo)); setWarn(false) }
	// Google Maps havolasi yoki koordinata matnidan lat/lng ni avtomatik aniqlaydi
	const fromLink = async (text) => {
		const value = String(text ?? link).trim()
		if (!value) return toast.error('Google Maps havolasini kiriting')
		setParsing(true)
		try {
			const r = await axios.post(`${BASE}/api/school/me/location/parse`, { input: value }, { headers: getHeaders() })
			onPick(r.data.lat, r.data.lng)
			setFocus({ lat: r.data.lat, lng: r.data.lng, zoom: 17, t: Date.now() })
			toast.success('Joylashuv aniqlandi: xaritada tekshirib «Saqlash»ni bosing')
		} catch (e) { toast.error(e.response?.data?.message || "Joylashuvni aniqlab bo'lmadi") } finally { setParsing(false) }
	}
	const here = () => {
		if (!navigator.geolocation) return toast.error('Brauzer joylashuvni aniqlay olmaydi')
		navigator.geolocation.getCurrentPosition(
			(p) => { onPick(p.coords.latitude, p.coords.longitude); setFocus({ lat: p.coords.latitude, lng: p.coords.longitude, zoom: 16, t: Date.now() }) },
			() => toast.error("Joylashuvga ruxsat berilmadi. Xaritadan qo'lda belgilang")
		)
	}
	const save = async () => {
		if (!pick) return toast.error('Avval xaritadan maktab joylashgan nuqtani belgilang')
		setBusy(true)
		try {
			const r = await axios.put(`${BASE}/api/school/me/location`, { lat: pick.lat, lng: pick.lng, address }, { headers: getHeaders() })
			setSaved(r.data.location); setWarn(r.data.outsideDistrict === true)
			toast.success('Joylashuv saqlandi')
		} catch (e) { toast.error(e.response?.data?.message || 'Saqlab bo\'lmadi') } finally { setBusy(false) }
	}
	const clear = async () => {
		if (!window.confirm("Maktab joylashuvi o'chirilsinmi? Maktab monitor xaritasidan yo'qoladi.")) return
		try { await axios.delete(`${BASE}/api/school/me/location`, { headers: getHeaders() }); setSaved(null); setLat(''); setLng(''); setAddress(''); toast.success("Joylashuv o'chirildi") } catch { toast.error('Xatolik yuz berdi') }
	}

	if (!info) return <div className="h-80 animate-pulse rounded-2xl bg-white" />
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 className="flex items-center gap-2 font-semibold text-slate-900"><FiMapPin className="text-slate-400" /> {tx("Maktab joylashuvi")}</h2>
					<p className="mt-1 text-sm text-slate-500">{info.district ? tx("Google Maps havolasini qo'ying yoki xaritada maktab turgan joyni bosing. Shu asosida maktabingiz {{district}} tumani xaritasida davomat statistikasi bilan ko'rinadi.", { district: info.district }) : tx("Google Maps havolasini qo'ying yoki xaritada maktab turgan joyni bosing. Shu asosida maktabingiz xaritasida davomat statistikasi bilan ko'rinadi.")}</p>
				</div>
				<span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${saved ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200'}`}>{saved ? tx("Belgilangan") : tx("Belgilanmagan")}</span>
			</div>

			<div className="mt-4 rounded-xl bg-slate-50 p-3">
				<label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600"><FiLink size={13} /> {tx("Google Maps havolasi")}</label>
				<div className="flex gap-2">
					<input value={link} onChange={e => setLink(e.target.value)} onPaste={e => { const t = e.clipboardData.getData('text'); if (t) { setLink(t); setTimeout(() => fromLink(t), 0) } }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); fromLink() } }} placeholder="https://www.google.com/maps/... yoki 39.7259, 67.2918" className={input} />
					<button type="button" onClick={() => fromLink()} disabled={parsing || !link.trim()} className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{parsing ? tx("Aniqlanmoqda...") : tx("Aniqlash")}</button>
				</div>
				<p className="mt-1.5 text-[11px] text-slate-400">{tx("Google Maps'da maktabni oching → «Ulashish» yoki manzil satridagi havolani nusxalab shu yerga qo'ying. Koordinata (kenglik va uzunlik) o'zi aniqlanadi.")}</p>
			</div>

			<div className="mt-4">
				<MapView geojson={geo} pick={pick} onPick={onPick} focus={focus} height={360} />
				{!info.districtBoundary && <p className="mt-2 text-xs text-slate-400">{tx("Tuman chegarasi yuklanmagan: xaritadan baribir nuqta belgilashingiz mumkin.")}</p>}
			</div>

			{warn && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{tx("Belgilangan nuqta {{district}} tumani chegarasidan tashqarida ko'rinyapti. Saqlandi, lekin to'g'riligini tekshiring.", { district: info.district })}</p>}

			<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr]">
				<label className="text-xs text-slate-500">{tx("Kenglik (lat)")}<input value={lat} onChange={e => setLat(e.target.value)} inputMode="decimal" placeholder="39.7600" className={`${input} mt-1`} /></label>
				<label className="text-xs text-slate-500">{tx("Uzunlik (lng)")}<input value={lng} onChange={e => setLng(e.target.value)} inputMode="decimal" placeholder="67.2700" className={`${input} mt-1`} /></label>
				<label className="text-xs text-slate-500">{tx("Manzil (ixtiyoriy)")}<input value={address} onChange={e => setAddress(e.target.value)} maxLength={200} placeholder={tx("Ko'cha, mahalla")} className={`${input} mt-1`} /></label>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<button type="button" onClick={here} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FiCrosshair size={15} /> {tx("Mening joylashuvim")}</button>
				<button type="button" onClick={save} disabled={busy || !pick || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><FiSave size={15} /> {busy ? tx("Saqlanmoqda...") : tx("Joylashuvni saqlash")}</button>
				{pick && <a href={`https://www.google.com/maps?q=${pick.lat},${pick.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"><FiExternalLink size={14} /> {tx("Google Maps'da ochish")}</a>}
				{saved && <button type="button" onClick={clear} className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"><FiTrash2 size={14} /> {tx("O'chirish")}</button>}
			</div>
		</section>
	)
}

export default SchoolLocationCard
