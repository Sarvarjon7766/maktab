import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiImage, FiTrash2, FiUploadCloud } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { tx } from '../i18n'
import { uploadUrl } from '../utils/uploadUrl'

const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Rad etilgan rasm sabablari (backend: services/face.service.js, reason)
const REASONS = {
	no_face: "Rasmda yuz topilmadi",
	small_face: "Yuz juda kichik: kamida 60 px bo'lsin (yuzga yaqinroq oling)",
	blurry: "Rasm xira: tiniq rasm yuklang",
	turned: "Yuz juda burilgan: deyarli to'g'ri qaragan rasm kerak",
	low_score: "Yuz aniq ko'rinmayapti (soya, to'silgan yoki yarim yuz)",
	duplicate: "Bunday rasm allaqachon qo'shilgan",
	limit: "Qo'shimcha rasm limiti to'ldi",
	bad_image: "Rasm fayli o'qilmadi"
}

// O'quvchining yuz suratlari: asosiy suratdan tashqari 3–5 ta qo'shimcha (turli burchak va yorug'likda). Kameradan tanish aniqligini oshiradi.
// Suratlar yuklanganda sifati tekshiriladi; yaroqsizi sababi bilan rad etiladi.
const FacePhotosCard = ({ studentId, kind = 'student' }) => {
	const seg = kind === 'staff' ? 'staff' : 'students'
	const [data, setData] = useState(null)
	const [busy, setBusy] = useState(false)
	const [results, setResults] = useState([])
	const input = useRef(null)

	const load = useCallback(async () => {
		try {
			const r = await axios.get(`${BASE}/api/hik/faces/${seg}/${studentId}/photos`, auth())
			if (r.data.success) setData(r.data)
		} catch { /* karta ixtiyoriy */ }
	}, [studentId, seg])
	useEffect(() => { load() }, [load])

	const upload = async (files) => {
		const list = [...files].slice(0, 5)
		if (!list.length) return
		const fd = new FormData()
		list.forEach(f => fd.append('images', f))
		setBusy(true); setResults([])
		try {
			const r = await axios.post(`${BASE}/api/hik/faces/${seg}/${studentId}/photos`, fd, auth())
			setData(r.data); setResults(r.data.results || [])
			const ok = (r.data.results || []).filter(x => x.ok).length
			if (ok) toast.success(tx("{{n}} ta rasm qo'shildi", { n: ok }))
			else toast.warn(tx("Hech bir rasm qabul qilinmadi"))
		} catch (e) { toast.error(tx(e.response?.data?.message || 'Xatolik')) } finally { setBusy(false); if (input.current) input.current.value = '' }
	}

	const remove = async (id) => {
		if (!window.confirm(tx("Bu yuz suratini o'chirasizmi?"))) return
		try { await axios.delete(`${BASE}/api/hik/faces/templates/${id}`, auth()); await load() } catch { toast.error(tx('Xatolik')) }
	}

	if (!data) return null
	const extra = data.items.filter(i => i.source === 'extra')
	const total = data.counts.photo + data.counts.extra
	const enough = total >= 3
	return (
		<div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="flex items-center gap-2 font-semibold text-gray-800"><FiImage /> {tx("Yuz suratlari (kamera orqali tanish uchun)")}</p>
					<p className="mt-0.5 text-xs text-gray-500">{tx("3–5 ta rasm tavsiya etiladi: to'g'ridan, biroz chapga va o'ngga burilgan, turli yorug'likda. Yuz kamida 60 px, tiniq bo'lsin.")}</p>
				</div>
				<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${enough ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
					{enough ? <FiCheckCircle /> : <FiAlertCircle />} {tx("{{n}} ta rasm", { n: total })}{data.counts.auto > 0 && ` · ${tx('kameradan: {{n}}', { n: data.counts.auto })}`}
				</span>
			</div>

			<div className="mt-3 flex flex-wrap gap-3">
				{data.items.map(it => (
					<div key={it._id} className="group relative h-24 w-24 overflow-hidden rounded-lg border border-gray-200 bg-white">
						<img src={uploadUrl(it.file)} alt="" className="h-full w-full object-cover" loading="lazy" />
						<span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{it.source === 'photo' ? tx('asosiy') : `${it.size}px`}</span>
						{it.source === 'extra' && <button type="button" onClick={() => remove(it._id)} title={tx("O'chirish")} className="absolute right-1 top-1 hidden rounded bg-red-600 p-1 text-white group-hover:block"><FiTrash2 size={12} /></button>}
					</div>
				))}
				{extra.length < data.limits.extra && (
					<button type="button" onClick={() => input.current?.click()} disabled={busy} className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-white text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50">
						<FiUploadCloud size={20} />{busy ? tx('Yuklanmoqda...') : tx("Rasm qo'shish")}
					</button>
				)}
			</div>
			<input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={e => upload(e.target.files)} />

			{results.length > 0 && (
				<ul className="mt-3 space-y-1 text-xs">
					{results.map((r, i) => (
						<li key={i} className={`flex items-start gap-2 ${r.ok ? 'text-green-700' : 'text-red-600'}`}>
							{r.ok ? <FiCheckCircle className="mt-0.5 shrink-0" /> : <FiAlertCircle className="mt-0.5 shrink-0" />}
							<span><b>{r.name}</b>: {r.ok ? tx("qabul qilindi") : tx(REASONS[r.reason] || 'Qabul qilinmadi')}</span>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

export default FacePhotosCard
