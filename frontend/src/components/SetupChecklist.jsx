import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiArrowRight, FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi'
import { Link } from 'react-router-dom'

// "Tizimni sozlash": maktab tahlillari (davomat, aqlli kuzatuv, kutilgan sinf tarkibi) to'g'ri ishlashi uchun kerak bo'lgan
// bosqichlar. Hammasi tayyor bo'lsa karta ko'rinmaydi. `base` — panel yo'li ('/user' yoki '/admin')
const SetupChecklist = ({ base }) => {
	const [data, setData] = useState(null)
	const [open, setOpen] = useState(true)
	useEffect(() => {
		let alive = true
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/setup`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(r => { if (alive && r.data?.success) setData(r.data) }).catch(() => { })
		return () => { alive = false }
	}, [])
	if (!data) return null
	const camAlert = data.cameraIssues > 0 && (
		<Link to={`${base}/users`} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800 hover:bg-rose-100">
			<span><b>{data.cameraIssues} ta xodim/o'quvchining</b> rasmi kameraga qabul qilinmadi. Rasmni almashtiring yoki qayta yuboring.</span>
			<span className="inline-flex items-center gap-1 font-medium">Ko'rish <FiArrowRight size={13} /></span>
		</Link>
	)
	if (data.percent >= 100) return camAlert || null
	const next = data.steps.find(s => !s.done)
	return (
		<>{camAlert}<section className="mb-6 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-5 shadow-sm">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h2 className="font-semibold text-gray-900">Tizimni sozlash: {data.done} / {data.total} bosqich tayyor</h2>
					<p className="text-xs text-gray-500 mt-0.5">Ma'lumotlar to'liq bo'lgach davomat, aqlli kuzatuv va sinf tahlillari aniq ishlaydi{next ? ` · Keyingi: ${next.title.toLowerCase()}` : ''}</p>
				</div>
				<div className="flex items-center gap-3">
					<div className="w-40 h-2 rounded-full bg-amber-100 overflow-hidden"><div className="h-full rounded-full bg-amber-500" style={{ width: `${data.percent}%` }} /></div>
					<span className="text-sm font-semibold text-amber-700">{data.percent}%</span>
					<button onClick={() => setOpen(o => !o)} className="p-2 rounded-lg hover:bg-amber-100 text-gray-600" title={open ? 'Yig‘ish' : 'Ochish'}>{open ? <FiChevronUp /> : <FiChevronDown />}</button>
				</div>
			</div>
			{open && (
				<ul className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
					{data.steps.map(s => (
						<li key={s.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${s.done ? 'border-green-100 bg-green-50/60' : 'border-amber-100 bg-white'}`}>
							<span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${s.done ? 'bg-green-500 text-white' : 'border-2 border-amber-300 text-transparent'}`}><FiCheck size={13} /></span>
							<div className="min-w-0 flex-1">
								<p className="text-sm font-medium text-gray-900">{s.title} <span className="font-normal text-gray-500">· {s.value}</span></p>
								{!s.done && <p className="text-xs text-gray-500">{s.hint}</p>}
							</div>
							{!s.done && <Link to={`${base}/${s.link}`} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline shrink-0">Boshlash <FiArrowRight size={12} /></Link>}
						</li>
					))}
				</ul>
			)}
		</section></>
	)
}

export default SetupChecklist
