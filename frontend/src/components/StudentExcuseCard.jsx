import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiPlus, FiRotateCcw, FiTrash2 } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from './SearchableSelect'
import { tx } from '../i18n'

const call = (method, path, config = {}) => axios({ method, url: `${import.meta.env.VITE_BASE_URL}/api/student/${path}`, ...config, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const TYPE_TONE = { kasallik: 'bg-red-50 text-red-700', oilaviy: 'bg-violet-50 text-violet-700', musobaqa: 'bg-blue-50 text-blue-700', boshqa: 'bg-slate-100 text-slate-700' }

// O'quvchilarning sababli kelmagan kunlari: sinf rahbari/maktab admini sabab kiritadi. Shu o'quvchilar sinfda KUTILMAYDI,
// shuning uchun aqlli kuzatuv kutilgan sonni hisoblashda ularni chiqarib tashlaydi
const StudentExcuseCard = ({ sinfId, date, onChanged }) => {
	const [data, setData] = useState(null)
	const [form, setForm] = useState({ studentId: '', type: 'kasallik', comment: '', startDate: today(), endDate: '' })
	const [saving, setSaving] = useState(false)

	const load = useCallback(async () => {
		try {
			const res = await call('get', 'excuse', { params: { sinfId, date } })
			setData(res.data)
		} catch { setData({ success: false, students: [], excuses: [], types: {} }) }
	}, [sinfId, date])
	useEffect(() => { load() }, [load])

	const run = async (fn, okText) => {
		setSaving(true)
		try {
			await fn()
			if (okText) toast.success(okText)
			await load()
			onChanged?.()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Saqlashda xatolik')
		} finally {
			setSaving(false)
		}
	}
	const add = (e) => {
		e.preventDefault()
		if (!form.studentId) return toast.error("O'quvchini tanlang")
		run(async () => {
			await call('post', 'excuse', { data: { ...form, endDate: form.endDate || null } })
			setForm(f => ({ ...f, studentId: '', comment: '', endDate: '' }))
		}, "Sabab saqlandi: o'quvchi sinfda kutilmaydi")
	}

	const types = data?.types || {}
	const excusedIds = new Set((data?.excuses || []).map(x => String(x.student)))
	const free = (data?.students || []).filter(s => !excusedIds.has(String(s._id)))
	return (
		<div className="space-y-4">
			{!data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : data.excuses.length === 0 ? (
				<p className="text-sm text-gray-500">{tx("Bu kunda sababli kelmagan o'quvchi yo'q. Sabab kiritilsa, o'quvchi sinfda kutilmaydi va tahlil shunga moslanadi.")}</p>
			) : (
				<ul className="divide-y divide-gray-100">
					{data.excuses.map(x => (
						<li key={x._id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
							<div className="min-w-0">
								<p className="text-sm font-medium text-gray-900">{x.fullName} <span className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${TYPE_TONE[x.type] || TYPE_TONE.boshqa}`}>{x.label}</span></p>
								<p className="text-xs text-gray-500">{x.startDate} — {x.endDate || tx("qaytguncha")}{x.comment ? ` · ${x.comment}` : ''}</p>
							</div>
							<div className="flex items-center gap-1.5">
								<button disabled={saving} onClick={() => run(() => call('put', `excuse/${x._id}/close`), "O'quvchi qaytdi: endi sinfda kutiladi")} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiRotateCcw size={12} /> {tx("Qaytdi")}</button>
								<button disabled={saving} onClick={() => run(() => call('delete', `excuse/${x._id}`), "Sabab o'chirildi")} title={tx("Sababni o'chirish")} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><FiTrash2 size={13} /></button>
							</div>
						</li>
					))}
				</ul>
			)}

			<form onSubmit={add} className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-xl bg-gray-50 p-3">
				<SearchableSelect variant="outline" icon={false} className="md:col-span-2 w-full" searchPlaceholder={tx("O'quvchi qidirish...")} placeholder={tx("O'quvchini tanlang")}
					value={form.studentId} onChange={v => setForm({ ...form, studentId: v })}
					options={[{ value: '', label: "O'quvchini tanlang" }, ...free.map(s => ({ value: s._id, label: s.fullName }))]} />
				<SearchableSelect variant="outline" icon={false} className="w-full" value={form.type} onChange={v => setForm({ ...form, type: v })}
					options={Object.entries(types).map(([k, label]) => ({ value: k, label }))} />
				<input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} title={tx("Boshlanish sanasi")} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
				<input type="date" value={form.endDate} min={form.startDate} onChange={e => setForm({ ...form, endDate: e.target.value })} title={tx("Tugash sanasi (bo'sh = qaytguncha)")} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
				<button disabled={saving} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"><FiPlus size={14} /> {tx("Qo'shish")}</button>
				<input value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} maxLength={300} placeholder={tx("Izoh (ixtiyoriy): masalan, isitma, shifokor ma'lumotnomasi")} className="md:col-span-6 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
			</form>
		</div>
	)
}

export default StudentExcuseCard

