import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertCircle, FiChevronRight, FiDownload, FiEdit2, FiPlus, FiSearch, FiUsers, FiX } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx-js-style'
import { formatUzShortDate } from '../../utils/formatDate'
import SinfFormModal from './SinfFormModal'
import PersonPhotoPreview from '../../components/PersonPhotoPreview'
import { tx } from '../../i18n'

const Tile = ({ label, value, hint, tone = 'text-slate-900', onClick, active }) => (
	<button type="button" disabled={!onClick} onClick={onClick} className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${onClick ? 'hover:shadow-md' : 'cursor-default'} ${active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}`}>
		<p className="text-xs font-medium text-slate-500">{label}</p>
		<p className={`mt-1.5 text-3xl font-bold leading-none ${tone}`}>{value}</p>
		<p className="mt-2 text-xs text-slate-400">{hint}</p>
	</button>
)

// Sinflar: jadval ko'rinishida (daraja va nom bo'yicha tartiblangan). Qo'shish/tahrirlash alohida modul oynada
const Sinf = () => {
	const navigate = useNavigate()
	const token = localStorage.getItem('token')
	const base = import.meta.env.VITE_BASE_URL
	const [sinfs, setSinfs] = useState([])
	const [users, setUsers] = useState([])
	const [students, setStudents] = useState([])
	const [grades, setGrades] = useState([])
	const [loading, setLoading] = useState(true)
	const [q, setQ] = useState('')
	const [noHead, setNoHead] = useState(false)
	const [emptyOnly, setEmptyOnly] = useState(false)
	const [modal, setModal] = useState(null) // null | 'new' | sinf obyekti

	const load = useCallback(async () => {
		const headers = { Authorization: `Bearer ${token}` }
		try {
			const [a, b, c, d] = await Promise.all([
				axios.get(`${base}/api/sinf/getAll`, { headers }),
				axios.get(`${base}/api/user/getAll`, { headers }).catch(() => ({ data: {} })),
				axios.get(`${base}/api/student/getAll`, { headers }).catch(() => ({ data: {} })),
				axios.get(`${base}/api/grades`, { headers }).catch(() => ({ data: {} })),
			])
			if (a.data.success) setSinfs(a.data.sinfs)
			setUsers(b.data.users || [])
			setStudents(c.data.students || [])
			setGrades(d.data.grades || [])
		} catch { toast.error('Sinflarni yuklashda xatolik') } finally { setLoading(false) }
	}, [base, token])
	useEffect(() => { load() }, [load])

	const count = useMemo(() => {
		const m = new Map()
		students.forEach(s => { const k = s.sinf?._id; if (k) m.set(k, (m.get(k) || 0) + 1) })
		return m
	}, [students])

	const shown = useMemo(() => {
		const t = q.trim().toLowerCase()
		return sinfs.filter(s => (!noHead || !s.head) && (!emptyOnly || !count.get(s._id)) && (!t || `${s.name} ${s.description || ''} ${s.head?.fullName || ''}`.toLowerCase().includes(t)))
			.sort((a, b) => (a.grade ?? 99) - (b.grade ?? 99) || (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }))
	}, [sinfs, q, noHead, emptyOnly, count])
	const stats = { total: sinfs.length, students: students.filter(s => s.sinf).length, noHead: sinfs.filter(s => !s.head).length, empty: sinfs.filter(s => !count.get(s._id)).length }
	const dirty = q || noHead || emptyOnly

	const exportExcel = () => {
		try {
			const rows = sinfs.map((s, i) => ({ '№': i + 1, Nomi: s.name, "O'quvchilar": count.get(s._id) || 0, 'Sinf rahbari': s.head?.fullName || 'Tayinlanmagan', Lavozimi: s.head?.position || '', Izoh: s.description || '', 'Yaratilgan sana': formatUzShortDate(new Date(s.createdAt)) }))
			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Sinflar')
			XLSX.writeFile(wb, `sinflar_${new Date().toISOString().slice(0, 10)}.xlsx`)
		} catch { toast.error('Eksport qilishda xatolik') }
	}

	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6">
			<div className="space-y-5">
				<div className="flex flex-wrap items-end justify-end gap-3">
					<div className="flex gap-2">
						<button onClick={exportExcel} disabled={!sinfs.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiDownload size={15} /> {tx("Excel")}</button>
						<button onClick={() => setModal('new')} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"><FiPlus size={16} /> {tx("Yangi sinf")}</button>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Tile label={tx("Jami sinflar")} value={stats.total} hint={tx("Maktabdagi barcha sinflar")} onClick={() => { setQ(''); setNoHead(false); setEmptyOnly(false) }} active={!dirty} />
					<Tile label={tx("Sinfga biriktirilgan o'quvchilar")} value={stats.students} hint={`jami ${students.length} ta o'quvchidan`} onClick={() => navigate('../students')} />
					<Tile label={tx("Sinf rahbari yo'q")} value={stats.noHead} hint={tx("Bosib faqat shularni ko'ring")} tone={stats.noHead ? 'text-amber-600' : 'text-slate-900'} onClick={() => setNoHead(v => !v)} active={noHead} />
					<Tile label={tx("O'quvchisiz sinflar")} value={stats.empty} hint={tx("Hali o'quvchi qo'shilmagan")} tone="text-slate-900" onClick={() => setEmptyOnly(v => !v)} active={emptyOnly} />
				</div>

				<div className="relative max-w-md">
					<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
					<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Sinf, rahbar yoki izoh bo'yicha qidirish")} className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-sm text-black outline-none focus:border-blue-400" />
					{q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"><FiX size={14} /></button>}
				</div>

				{loading ? (
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />)}</div>
				) : shown.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
						<span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><FiUsers size={24} /></span>
						<p className="mt-3 font-semibold text-slate-800">{dirty ? tx("Sinf topilmadi") : tx("Hali sinf qo'shilmagan")}</p>
						<p className="mt-1 text-sm text-slate-500">{dirty ? tx("Qidiruv yoki filtrni o'zgartirib ko'ring") : tx("Birinchi sinfni qo'shing, so'ng o'quvchilarni biriktirasiz")}</p>
						<button onClick={() => (dirty ? (setQ(''), setNoHead(false), setEmptyOnly(false)) : setModal('new'))} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">{dirty ? tx("Filtrni tozalash") : tx("Sinf qo'shish")}</button>
					</div>
				) : (
					<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-slate-100">
								<thead className="bg-slate-50">
									<tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
										<th className="w-14 px-5 py-3">№</th>
										<th className="px-4 py-3">{tx("Sinf")}</th>
										<th className="px-4 py-3">{tx("Sinf rahbari")}</th>
										<th className="px-4 py-3">{tx("O'quvchilar")}</th>
										<th className="w-24 px-4 py-3 text-right">{tx("Amallar")}</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-slate-100">
									{shown.map((s, i) => (
										<tr key={s._id} onClick={() => navigate(s._id)} className="group cursor-pointer hover:bg-slate-50">
											<td className="px-5 py-3 text-sm text-slate-400">{i + 1}</td>
											<td className="px-4 py-3">
												<p className="text-sm font-semibold text-slate-900 group-hover:text-blue-600">{s.name}</p>
												{s.description && <p className="max-w-xs truncate text-xs text-slate-400">{s.description}</p>}
											</td>
											<td className="px-4 py-3">
												{s.head ? (
													<div className="flex items-center gap-2.5">
														<PersonPhotoPreview photo={s.head.photo} name={s.head.fullName} size="md" className="!h-10 !w-10" />
														<div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{s.head.fullName}</p><p className="truncate text-xs text-slate-400">{s.head.position || tx("Sinf rahbari")}</p></div>
													</div>
												) : (
													<button onClick={e => { e.stopPropagation(); setModal(s) }} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"><FiAlertCircle size={13} /> {tx("Tayinlang")}</button>
												)}
											</td>
											<td className="px-4 py-3 text-sm text-slate-700"><span className="inline-flex items-center gap-1.5"><FiUsers size={14} className="text-slate-400" /> {count.get(s._id) || 0}</span></td>
											<td className="px-4 py-3">
												<div className="flex items-center justify-end gap-1">
													<button onClick={e => { e.stopPropagation(); setModal(s) }} title={tx("Tahrirlash")} className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><FiEdit2 size={16} /></button>
													<FiChevronRight className="text-slate-300" />
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			{modal && <SinfFormModal sinf={modal === 'new' ? null : modal} grades={grades} users={users} onClose={() => setModal(null)} onSaved={load} />}
		</div>
	)
}

export default Sinf
