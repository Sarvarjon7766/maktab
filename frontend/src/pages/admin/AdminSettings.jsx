import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiArrowRight, FiCheck, FiClock, FiRotateCcw, FiSave } from 'react-icons/fi'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import SchoolLocationCard from '../../components/SchoolLocationCard'

// Token har so'rovda joriy qiymatdan olinadi (mount paytida qotib qolmasin)
const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

const DEFAULTS = { entryToExitCooldownSeconds: 15, exitToEntryCooldownSeconds: 5, workStartTime: '09:00' }
const TIMES = ['08:00', '08:30', '09:00', '09:30', '10:00']
const PRESETS = [
	['Tezkor', 'Navbatda turgan kamerada', 5, 3],
	['Standart', 'Ko\'pchilik maktablar uchun', 15, 5],
	['Qattiq', 'Takroriy skanlar ko\'p bo\'lsa', 30, 10],
]
const minutes = (t) => { const [h, m] = (t || '00:00').split(':').map(Number); return h * 60 + m }
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const Card = ({ title, desc, children }) => (
	<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
		<h2 className="font-semibold text-slate-900">{title}</h2>
		{desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}
		<div className="mt-4 space-y-5">{children}</div>
	</section>
)

const Seconds = ({ label, hint, name, value, onChange }) => {
	const n = Number(value)
	const bad = value === '' || !Number.isFinite(n) || n < 0 || n > 3600
	return (
		<div>
			<label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700"><FiClock className="text-slate-400" /> {label}</label>
			<div className="flex items-center gap-2">
				<input type="number" min="0" max="3600" name={name} value={value} onChange={onChange} className={`${inputCls} max-w-[160px] ${bad ? 'border-rose-400' : ''}`} />
				<span className="text-sm text-slate-500">soniya</span>
			</div>
			<p className={`mt-1.5 text-xs ${bad ? 'text-rose-600' : 'text-slate-400'}`}>{bad ? "0 dan 3600 gacha son kiriting" : hint}</p>
		</div>
	)
}

// Sozlamalar: ish/dars boshlanish vaqti (kechikish hisobi) va takroriy skanlarni filtrlash
const AdminSettings = () => {
	const base = '/' + (useLocation().pathname.split('/')[1] || 'user')
	const [form, setForm] = useState(DEFAULTS)
	const [saved, setSaved] = useState(DEFAULTS)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/settings`, { headers: getHeaders() }).then(res => {
			if (res.data.success) {
				const s = res.data.settings
				const v = { entryToExitCooldownSeconds: s.entryToExitCooldownSeconds ?? 15, exitToEntryCooldownSeconds: s.exitToEntryCooldownSeconds ?? 5, workStartTime: s.workStartTime || '09:00' }
				setForm(v); setSaved(v)
			}
		}).catch(() => toast.error('Sozlamalarni yuklashda xatolik')).finally(() => setLoading(false))
	}, [])

	const set = (name, value) => setForm(f => ({ ...f, [name]: value }))
	const onChange = (e) => set(e.target.name, e.target.value)
	const dirty = JSON.stringify(form) !== JSON.stringify(saved)
	const okNum = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 3600
	const valid = okNum(form.entryToExitCooldownSeconds) && okNum(form.exitToEntryCooldownSeconds) && /^\d{2}:\d{2}$/.test(form.workStartTime)
	const example = hhmm(minutes(form.workStartTime) + 10)

	const save = async (e) => {
		e.preventDefault()
		setSaving(true)
		try {
			const res = await axios.put(`${import.meta.env.VITE_BASE_URL}/api/settings`, form, { headers: getHeaders() })
			if (res.data.success) { setSaved(form); toast.success('Sozlamalar saqlandi') } else toast.error(res.data.message || 'Saqlashda xatolik')
		} catch (err) { toast.error(err.response?.data?.message || 'Server xatosi') } finally { setSaving(false) }
	}

	if (loading) return <div className="p-6"><div className="h-64 max-w-3xl animate-pulse rounded-2xl bg-white" /></div>

	return (
		<form onSubmit={save} className="min-h-screen bg-slate-50 p-4 pb-28 md:p-6">
			<div className="max-w-4xl space-y-5">
				<Card title="Ish va dars boshlanish vaqti" desc="Shu vaqtdan keyin birinchi marta kirgan xodim va o'quvchi «kech qoldi» hisoblanadi. Statistika, hisobotlar va ogohlantirishlardagi kechikish shu vaqtga tayanadi.">
					<div>
						<label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700"><FiClock className="text-slate-400" /> Boshlanish vaqti</label>
						<div className="flex flex-wrap items-center gap-2">
							<input type="time" name="workStartTime" value={form.workStartTime} onChange={onChange} required className={`${inputCls} max-w-[160px]`} />
							{TIMES.map(t => <button type="button" key={t} onClick={() => set('workStartTime', t)} className={`rounded-full px-3 py-1.5 text-sm transition ${form.workStartTime === t ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{t}</button>)}
						</div>
						<p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Misol: {example} da kirgan odam <b className="text-slate-700">10 daqiqa kech</b> qolgan hisoblanadi; {form.workStartTime} yoki undan oldin kirgan — vaqtida.</p>
					</div>
				</Card>

				<Card title="Takroriy skanlarni filtrlash" desc="Kamera odamni bir necha marta ketma-ket taniganda (masalan eshik oldida to'xtab qolsa) ortiqcha kirdi-chiqdi yozuvlari paydo bo'lmasligi uchun minimal kutish vaqti. Eng ko'p maktablarda standart qiymat mos keladi.">
					<div className="flex flex-wrap gap-2">
						{PRESETS.map(([name, hint, a, b]) => {
							const on = Number(form.entryToExitCooldownSeconds) === a && Number(form.exitToEntryCooldownSeconds) === b
							return <button type="button" key={name} onClick={() => setForm(f => ({ ...f, entryToExitCooldownSeconds: a, exitToEntryCooldownSeconds: b }))} className={`rounded-xl border px-4 py-2.5 text-left transition ${on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:bg-slate-50'}`}><span className="flex items-center gap-1.5 text-sm font-medium">{on && <FiCheck size={13} />}{name}</span><span className={`text-xs ${on ? 'text-slate-300' : 'text-slate-400'}`}>{a} / {b} soniya · {hint}</span></button>
						})}
					</div>
					<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
						<Seconds label="Kirishdan keyin chiqish uchun kutish" hint="Kirgandan so'ng shu vaqt o'tmaguncha chiqish yozilmaydi" name="entryToExitCooldownSeconds" value={form.entryToExitCooldownSeconds} onChange={onChange} />
						<Seconds label="Chiqishdan keyin kirish uchun kutish" hint="Chiqqandan so'ng shu vaqt o'tmaguncha kirish yozilmaydi" name="exitToEntryCooldownSeconds" value={form.exitToEntryCooldownSeconds} onChange={onChange} />
					</div>
				</Card>

				<SchoolLocationCard />

				<Card title="Boshqa sozlamalar" desc="Quyidagilar o'z sahifalarida sozlanadi:">
					<ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
						{[
							['Ota-onalarga xabarlar', "Kirdi/chiqdi xabarlarini yoqish va o'chirish", 'parents?tab=messages'],
							['Kamera sozlamalari', 'Kamerani sinfga biriktirish, odam sanash', 'camera'],
							['Hisobotlar', 'Avtomatik va qo\'lda hisobotlar', 'reports'],
						].map(([t, d, to]) => (
							<li key={t}><Link to={`${base}/${to}`} className="flex h-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 hover:border-slate-300 hover:bg-slate-50"><span><span className="block text-sm font-medium text-slate-900">{t}</span><span className="block text-xs text-slate-400">{d}</span></span><FiArrowRight className="shrink-0 text-slate-300" /></Link></li>
						))}
					</ul>
				</Card>
			</div>

			<div className={`fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 backdrop-blur transition ${dirty ? 'translate-y-0' : 'translate-y-full'}`}>
				<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:pl-[17rem] md:pr-6">
					<p className="text-sm text-slate-600">{valid ? "Saqlanmagan o'zgarishlar bor" : "Maydonlarda xato bor: tuzating"}</p>
					<div className="flex gap-2">
						<button type="button" onClick={() => setForm(saved)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FiRotateCcw size={14} /> Bekor qilish</button>
						<button type="submit" disabled={saving || !valid} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"><FiSave size={15} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}</button>
					</div>
				</div>
			</div>
		</form>
	)
}

export default AdminSettings
