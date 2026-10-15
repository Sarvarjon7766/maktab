import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiCheck, FiSearch, FiUser, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { tx } from '../../i18n'
import PersonPhotoPreview from '../../components/PersonPhotoPreview'

const input = 'block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

// Sinf qo'shish / tahrirlash oynasi (modul). `sinf` bo'lsa tahrirlash, bo'lmasa yangi sinf.
// Nom "5-A" ko'rinishida daraja va harfdan avtomatik yig'iladi.
const SinfFormModal = ({ sinf = null, grades, users, onClose, onSaved }) => {
	const token = localStorage.getItem('token')
	const base = import.meta.env.VITE_BASE_URL
	const [grade, setGrade] = useState(sinf?.grade ?? '')
	const [letter, setLetter] = useState(sinf?.letter || '')
	const [head, setHead] = useState(sinf?.head?._id || '')
	const [description, setDescription] = useState(sinf?.description || '')
	const [q, setQ] = useState('')
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [busy, onClose])

	const teachers = useMemo(() => {
		const t = q.trim().toLowerCase()
		return users.filter(u => !t || `${u.fullName} ${u.position || ''}`.toLowerCase().includes(t)).slice(0, 40)
	}, [users, q])
	const chosen = users.find(u => u._id === head) || (sinf?.head && sinf.head._id === head ? sinf.head : null)

	const submit = async (e) => {
		e.preventDefault()
		setBusy(true)
		try {
			const url = sinf ? `${base}/api/sinf/update/${sinf._id}` : `${base}/api/sinf/create`
			const res = await axios[sinf ? 'put' : 'post'](url, { grade: Number(grade), letter, description, head: head || null }, { headers: { Authorization: `Bearer ${token}` } })
			if (res.data.success) { toast.success(sinf ? 'Sinf yangilandi' : "Sinf qo'shildi"); onSaved(); onClose() } else toast.error(res.data.message || 'Xatolik')
		} catch (err) { toast.error(err.response?.data?.message || 'Xatolik yuz berdi') } finally { setBusy(false) }
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !busy && onClose()}>
			<form onSubmit={submit} onClick={e => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
				<div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
					<div>
						<h2 className="text-lg font-semibold text-slate-900">{sinf ? tx("Sinfni tahrirlash") : tx("Yangi sinf qo'shish")}</h2>
						<p className="mt-0.5 text-sm text-slate-500">{tx("Daraja va harfni tanlang, sinf rahbarini biriktiring")}</p>
					</div>
					<button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><FiX size={18} /></button>
				</div>

				<div className="space-y-5 overflow-y-auto px-6 py-5">
					<div>
						<label className="mb-1.5 block text-sm font-medium text-slate-700">{tx("Sinf")} <span className="text-red-500">*</span></label>
						<div className="grid grid-cols-[1fr_120px] gap-3">
							<select value={grade} onChange={e => setGrade(e.target.value)} required className={input}>
								<option value="">{grades.length ? tx("Darajani tanlang") : tx("Darajalar topilmadi: sahifani yangilang yoki tizim egasiga xabar bering")}</option>
								{grades.filter(g => g.isActive || g.number === Number(grade)).map(g => <option key={g._id} value={g.number}>{g.name}</option>)}
							</select>
							<input value={letter} onChange={e => setLetter(e.target.value.toUpperCase().slice(0, 3))} placeholder={tx("Harf")} required className={`${input} text-center font-semibold`} />
						</div>
						<div className="mt-3 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-white">
							<span className="text-xs uppercase tracking-wide text-white/70">{tx("Sinf nomi")}</span>
							<span className="text-2xl font-bold">{grade && letter ? `${grade}-${letter}` : '—'}</span>
						</div>
					</div>

					<div>
						<label className="mb-1.5 block text-sm font-medium text-slate-700">{tx("Sinf rahbari")} <span className="font-normal text-slate-400">{tx("(ixtiyoriy)")}</span></label>
						{chosen && (
							<div className="mb-2 flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
								<PersonPhotoPreview photo={chosen.photo} name={chosen.fullName} size="md" className="!h-10 !w-10 !bg-blue-100 !text-blue-700" />
								<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{chosen.fullName}</p><p className="truncate text-xs text-slate-500">{chosen.position || tx("Xodim")}</p></div>
								<button type="button" onClick={() => setHead('')} className="text-xs text-red-600 hover:underline">{tx("Olib tashlash")}</button>
							</div>
						)}
						<div className="relative">
							<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
							<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Xodim ismi yoki lavozimi bo'yicha qidiring")} className={`${input} pl-9`} />
						</div>
						<ul className="mt-2 max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
							{teachers.length === 0 ? <li className="px-4 py-3 text-sm text-slate-400">{tx("Xodim topilmadi")}</li> : teachers.map(u => (
								<li key={u._id}><button type="button" onClick={() => setHead(u._id)} className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 ${head === u._id ? 'bg-blue-50/60' : ''}`}>
									<PersonPhotoPreview photo={u.photo} name={u.fullName} size="sm" />
									<span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-800">{u.fullName}</span><span className="block truncate text-xs text-slate-400">{u.position || tx("Xodim")}</span></span>
									{head === u._id && <FiCheck className="text-blue-600" />}
								</button></li>
							))}
						</ul>
					</div>

					<div>
						<label className="mb-1.5 block text-sm font-medium text-slate-700">{tx("Izoh")} <span className="font-normal text-slate-400">{tx("(ixtiyoriy)")}</span></label>
						<textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder={tx("Sinf haqida qo'shimcha ma'lumot")} className={input} />
					</div>
				</div>

				<div className="flex gap-3 border-t border-slate-100 px-6 py-4">
					<button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none">{tx("Bekor qilish")}</button>
					<button type="submit" disabled={busy || !grade || !letter} className="flex-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? tx("Saqlanmoqda...") : sinf ? tx("Saqlash") : tx("Qo'shish")}</button>
				</div>
			</form>
		</div>
	)
}

export default SinfFormModal
