import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertCircle, FiCamera, FiDownload, FiEdit2, FiPhone, FiPlus, FiSearch, FiTrash2, FiUploadCloud, FiUsers, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx-js-style'
import { ListPager, usePaged } from '../../components/ListPager'
import PersonLink from '../../components/PersonLink'
import SearchableSelect from '../../components/SearchableSelect'
import { styleWorkbookSheet } from '../../utils/exportAttendance'
import { formatUzShortDate } from '../../utils/formatDate'
import AdminStudentAdd from './AdminStudentAdd'
import AdminStudentImportExcel from './AdminStudentImportExcel'
import AdminStudentUpdate from './AdminStudentUpdate'

// O'quvchi rasmining kameradagi holati: kamerada | navbatda | rad etildi (sabab bilan) | yuborilmagan | rasm yo'q
const camState = (s) => {
	if (s.photo_camera === true) return { key: 'ok', label: 'Kamerada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', detail: 'Rasm kameraga qabul qilingan' }
	if (!s.photo) return { key: 'nophoto', label: "Rasm yo'q", cls: 'bg-slate-100 text-slate-600 ring-slate-200', detail: "Rasm yuklanmagan, kameraga yuborib bo'lmaydi" }
	const results = Array.isArray(s.cameraResults) ? s.cameraResults : []
	const failed = results.filter(r => !r.success)
	if (s.cameraError || failed.length) {
		const lines = results.length ? results.map(r => (r.success ? `✅ ${r.device}` : `❌ ${r.device}: ${r.error || 'xatolik'}`)).join('\n') : s.cameraError
		return { key: 'rejected', label: 'Rad etildi', cls: 'bg-rose-50 text-rose-700 ring-rose-200', reason: s.cameraError || failed[0]?.error || 'xatolik', detail: `${s.cameraAttempts || 1}-urinish\n${lines}` }
	}
	if (s.cameraQueued) return { key: 'pending', label: 'Navbatda', cls: 'bg-amber-50 text-amber-700 ring-amber-200', detail: 'Kameraga yuborilishi kutilmoqda' }
	return { key: 'notsent', label: 'Yuborilmagan', cls: 'bg-orange-50 text-orange-700 ring-orange-200', detail: "Rasm hali kameraga yuborish navbatiga qo'yilmagan" }
}
const CAM_FILTERS = [['all', 'Hammasi'], ['ok', 'Kamerada'], ['pending', 'Navbatda'], ['rejected', 'Rad etildi'], ['notsent', 'Yuborilmagan'], ['nophoto', "Rasm yo'q"]]
const SORTS = [['name', "Ism bo'yicha"], ['sinf', "Sinf bo'yicha"], ['new', "Yangi qo'shilganlar"]]
const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const natural = (a, b) => (a || '').localeCompare(b || '', undefined, { numeric: true })

const Avatar = ({ s }) => (
	<span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-blue-100 to-indigo-200 font-semibold text-indigo-700">
		{s.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${s.photo}`} alt="" className="h-full w-full object-cover" /> : s.fullName?.charAt(0)?.toUpperCase()}
	</span>
)

const Tile = ({ label, value, hint, tone = 'text-slate-900', onClick, active }) => (
	<button type="button" disabled={!onClick} onClick={onClick} className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${onClick ? 'hover:shadow-md' : 'cursor-default'} ${active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}`}>
		<p className="text-xs font-medium text-slate-500">{label}</p>
		<p className={`mt-1.5 text-3xl font-bold leading-none ${tone}`}>{value}</p>
		<p className="mt-2 text-xs text-slate-400">{hint}</p>
	</button>
)

// O'quvchilar: ro'yxat, sinf bo'yicha tez filtr, ota-ona ma'lumoti holati va ommaviy amallar
const AdminStudents = () => {
	const token = localStorage.getItem('token')
	const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
	const base = import.meta.env.VITE_BASE_URL
	const [sinfs, setSinfs] = useState([])
	const [students, setStudents] = useState([])
	const [loading, setLoading] = useState(true)
	const [sinf, setSinf] = useState(() => new URLSearchParams(window.location.search).get('sinf') || 'all') // ?sinf=<id>: sinfxonalar sahifasidan o'tish
	const [q, setQ] = useState('')
	const [sort, setSort] = useState('name')
	const [noPhone, setNoPhone] = useState(false)
	const [noSinf, setNoSinf] = useState(false)
	const [cam, setCam] = useState('all')
	const [sending, setSending] = useState(false)
	const [adding, setAdding] = useState(false)
	const [importing, setImporting] = useState(false)
	const [editing, setEditing] = useState(null)
	const [deleting, setDeleting] = useState(null)
	const [busy, setBusy] = useState(false)

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const [a, b] = await Promise.all([
				axios.get(`${base}/api/sinf/getAll`, { headers }),
				axios.get(`${base}/api/student/getAll`, { headers }),
			])
			if (a.data.success) setSinfs(a.data.sinfs)
			if (b.data.success) setStudents(b.data.students)
		} catch { toast.error("O'quvchilarni yuklashda xatolik") } finally { setLoading(false) }
	}, [base, headers])
	useEffect(() => { load() }, [load])

	const perSinf = useMemo(() => {
		const m = new Map()
		students.forEach(s => { const k = s.sinf?._id; if (k) m.set(k, (m.get(k) || 0) + 1) })
		return m
	}, [students])
	const stats = useMemo(() => ({ total: students.length, noPhone: students.filter(s => !s.parentPhone).length, noSinf: students.filter(s => !s.sinf).length }), [students])

	const list = useMemo(() => {
		const term = norm(q.trim())
		const out = students.filter(s => (sinf === 'all' || s.sinf?._id === sinf) && (!noPhone || !s.parentPhone) && (!noSinf || !s.sinf) && (cam === 'all' || camState(s).key === cam)
			&& (!term || norm(`${s.fullName} ${s.parentName || ''} ${s.parentPhone || ''}`).includes(term)))
		const cmp = sort === 'sinf' ? (a, b) => natural(a.sinf?.name, b.sinf?.name) || natural(a.fullName, b.fullName)
			: sort === 'new' ? (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
				: (a, b) => natural(a.fullName, b.fullName)
		return out.sort(cmp)
	}, [students, sinf, q, sort, noPhone, noSinf, cam])
	const paged = usePaged(list, 50)
	const dirty = q || sinf !== 'all' || noPhone || noSinf || cam !== 'all'
	const clear = () => { setQ(''); setSinf('all'); setNoPhone(false); setNoSinf(false); setCam('all') }

	const camCount = useMemo(() => { const n = { all: students.length }; students.forEach(s => { const k = camState(s).key; n[k] = (n[k] || 0) + 1 }); return n }, [students])
	const resend = async (payload) => {
		setSending(true)
		try {
			const r = await axios.post(`${base}/api/student/camera-sync`, payload, { headers })
			toast.success(r.data.message || "Navbatga qo'yildi")
			await load()
		} catch (e) { toast.error(e.response?.data?.message || 'Xatolik yuz berdi') } finally { setSending(false) }
	}

	const confirmDelete = async () => {
		setBusy(true)
		try {
			const r = await axios.delete(`${base}/api/student/delete/${deleting._id}`, { headers })
			if (!r.data.success) throw new Error(r.data.message)
			setStudents(p => p.filter(s => s._id !== deleting._id))
			toast.success(`${deleting.fullName} o'chirildi`)
			setDeleting(null)
		} catch (e) { toast.error(e.response?.data?.message || "O'chirishda xatolik") } finally { setBusy(false) }
	}

	const exportExcel = () => {
		try {
			const rows = list.map((s, i) => ({ '№': i + 1, 'F.I.Sh': s.fullName, Sinf: s.sinf?.name || 'Sinfsiz', "Tug'ilgan sana": s.birthday ? formatUzShortDate(new Date(s.birthday)) : 'Kiritilmagan', 'Ota-ona ismi': s.parentName || 'Kiritilmagan', 'Ota-ona telefoni': s.parentPhone || 'Kiritilmagan', "Qo'shilgan sana": formatUzShortDate(new Date(s.createdAt)) }))
			const ws = styleWorkbookSheet(XLSX.utils.json_to_sheet(rows))
			ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 10 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 16 }]
			const wb = XLSX.utils.book_new()
			wb.Props = { Title: "O'quvchilar ro'yxati", Creator: 'School Supervision' }
			XLSX.utils.book_append_sheet(wb, ws, "O'quvchilar")
			XLSX.writeFile(wb, `oquvchilar_${new Date().toISOString().slice(0, 10)}.xlsx`)
			toast.success(`${rows.length} ta o'quvchi yuklandi`)
		} catch { toast.error('Eksport qilishda xatolik') }
	}

	const pill = (on) => `shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${on ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6">
			<div className="space-y-5">
				<div className="flex flex-wrap items-center justify-end gap-3">
					<div className="flex flex-wrap gap-2">
						<button onClick={exportExcel} disabled={!list.length} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiDownload size={15} /> Excel{dirty ? ` (${list.length})` : ''}</button>
						<button onClick={() => setImporting(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><FiUploadCloud size={15} /> Excel'dan qo'shish</button>
						<button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"><FiPlus size={16} /> Yangi o'quvchi</button>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Tile label="Jami o'quvchilar" value={stats.total} hint={`${sinfs.length} ta sinfda`} onClick={clear} active={!dirty} />
					<Tile label="Ota-ona telefoni yo'q" value={stats.noPhone} hint="Botga ulana olmaydi" tone={stats.noPhone ? 'text-red-600' : 'text-slate-900'} onClick={() => setNoPhone(v => !v)} active={noPhone} />
					<Tile label="Sinfsiz" value={stats.noSinf} hint="Sinfga biriktirilmagan" tone={stats.noSinf ? 'text-amber-600' : 'text-slate-900'} onClick={() => setNoSinf(v => !v)} active={noSinf} />
					<Tile label="Ko'rsatilmoqda" value={list.length} hint={dirty ? 'Filtr yoqilgan' : 'Hammasi'} />
				</div>

				<div className="sticky top-0 z-10 space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-sm backdrop-blur">
					<div className="flex flex-wrap items-center gap-2">
						<div className="relative min-w-[220px] flex-1">
							<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
							<input value={q} onChange={e => setQ(e.target.value)} placeholder="O'quvchi, ota-ona yoki telefon bo'yicha qidirish" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-black outline-none focus:border-blue-400 focus:bg-white" />
							{q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"><FiX size={14} /></button>}
						</div>
						<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" value={sort} onChange={setSort} options={SORTS.map(([value, label]) => ({ value, label }))} />
						{dirty && <button onClick={clear} className="text-sm text-blue-600 hover:underline">Tozalash</button>}
					</div>
					<div className="flex gap-1.5 overflow-x-auto pb-0.5">
						<button onClick={() => setSinf('all')} className={pill(sinf === 'all')}>Hammasi <span className="opacity-60">{stats.total}</span></button>
						{[...sinfs].sort((a, b) => natural(a.name, b.name)).map(x => <button key={x._id} onClick={() => setSinf(sinf === x._id ? 'all' : x._id)} className={pill(sinf === x._id)}>{x.name} <span className="opacity-60">{perSinf.get(x._id) || 0}</span></button>)}
					</div>
				</div>

				{!loading && (camCount.rejected > 0 || camCount.notsent > 0) && (
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
						<span>{camCount.rejected > 0 && <><b>{camCount.rejected} ta o'quvchining</b> rasmi kameraga qabul qilinmadi. </>}{camCount.notsent > 0 && <><b>{camCount.notsent} ta o'quvchi</b> rasmi hali kameraga yuborilmagan.</>}</span>
						<span className="flex gap-2">
							{camCount.rejected > 0 && <button onClick={() => setCam('rejected')} className="rounded-lg bg-white px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">Rad etilganlar</button>}
							<button disabled={sending} onClick={() => resend({ all: true })} className="rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700 disabled:opacity-60">{sending ? 'Yuborilmoqda...' : 'Hammasini kameraga yuborish'}</button>
						</span>
					</div>
				)}
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="mr-1 text-xs font-medium text-slate-500">Kamera holati:</span>
					{CAM_FILTERS.filter(([k]) => k === 'all' || camCount[k]).map(([k, l]) => <button key={k} onClick={() => setCam(k)} className={`rounded-full px-3 py-1.5 text-sm transition ${cam === k ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{l} <span className="opacity-60">{camCount[k] || 0}</span></button>)}
				</div>

				<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
					{loading ? (
						<div className="space-y-px">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[72px] animate-pulse bg-slate-50" />)}</div>
					) : list.length === 0 ? (
						<div className="px-6 py-14 text-center">
							<span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><FiUsers size={24} /></span>
							<p className="mt-3 font-semibold text-slate-800">{dirty ? "Bu tanlov bo'yicha o'quvchi topilmadi" : "Hali o'quvchi qo'shilmagan"}</p>
							<p className="mt-1 text-sm text-slate-500">{dirty ? "Qidiruv yoki filtrni o'zgartirib ko'ring" : "«Yangi o'quvchi» yoki Excel orqali ro'yxatni yuklang"}</p>
							<button onClick={dirty ? clear : () => setAdding(true)} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">{dirty ? 'Filtrni tozalash' : "O'quvchi qo'shish"}</button>
						</div>
					) : (
						<>
							<div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_96px] gap-4 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid"><span>O'quvchi</span><span>Sinf</span><span>Ota-ona</span><span>Kamera</span><span className="text-right">Amallar</span></div>
							<ul className="divide-y divide-slate-100">
								{paged.items.map(s => (
									<li key={s._id} className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1.3fr)_96px] md:gap-4 md:px-5">
										<PersonLink kind="student" id={s._id} className="col-span-2 flex min-w-0 items-center gap-3 md:col-span-1">
											<Avatar s={s} />
											<p className="truncate text-sm font-semibold text-slate-900">{s.fullName}</p>
										</PersonLink>
										<div className="order-last col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-14 md:order-none md:col-span-3 md:grid md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)_minmax(0,1.3fr)] md:gap-4 md:pl-0">
											<span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${s.sinf ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{s.sinf?.name || 'Sinfsiz'}</span>
											{s.parentPhone ? (
												<div className="min-w-0">
													<p className="truncate text-sm text-slate-700">{s.parentName || 'Ota-ona'}</p>
													<a href={`tel:${s.parentPhone}`} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600"><FiPhone size={11} /> {s.parentPhone}</a>
												</div>
											) : (
												<button onClick={() => setEditing(s)} className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100"><FiAlertCircle size={13} /> Telefon kiriting</button>
											)}
											{(() => {
												const c = camState(s); return (
													<div className="flex min-w-0 flex-col items-start gap-1">
														<span title={c.detail} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${c.cls}`}><FiCamera size={12} />{c.label}</span>
														{c.key === 'rejected' && <span className="max-w-full truncate text-[11px] text-rose-600" title={c.reason}>{c.reason}</span>}
														{(c.key === 'rejected' || c.key === 'notsent') && <button disabled={sending} onClick={e => { e.stopPropagation(); resend({ ids: [s._id] }) }} className="text-[11px] font-medium text-blue-600 hover:underline disabled:opacity-50">Qayta yuborish</button>}
													</div>
												)
											})()}
										</div>
										<div className="flex justify-end gap-1 md:opacity-60 md:transition md:group-hover:opacity-100">
											<button onClick={() => setEditing(s)} title="Tahrirlash" className="rounded-lg p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><FiEdit2 size={16} /></button>
											<button onClick={() => setDeleting(s)} title="O'chirish" className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600"><FiTrash2 size={16} /></button>
										</div>
									</li>
								))}
							</ul>
						</>
					)}
					{!loading && list.length > 0 && <ListPager {...paged} className="border-t border-slate-100" />}
				</div>
			</div>

			{deleting && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => !busy && setDeleting(null)}>
					<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
						<div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-600"><FiTrash2 size={20} /></span><h3 className="text-lg font-semibold text-slate-900">O'quvchini o'chirish</h3></div>
						<p className="mt-4 text-slate-700"><b>{deleting.fullName}</b> o'chirilsinmi?</p>
						<p className="mt-1 text-sm text-slate-500">Bu amalni qaytarib bo'lmaydi. Ota-onalarga xabar yuborish ham to'xtatiladi.</p>
						<div className="mt-6 flex justify-end gap-2">
							<button disabled={busy} onClick={() => setDeleting(null)} className="rounded-lg bg-slate-100 px-4 py-2 font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">Bekor qilish</button>
							<button disabled={busy} onClick={confirmDelete} className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50">{busy ? "O'chirilmoqda..." : "O'chirish"}</button>
						</div>
					</div>
				</div>
			)}

			{adding && <AdminStudentAdd onClose={() => { setAdding(false); load() }} sinfs={sinfs} />}
			{editing && <AdminStudentUpdate student={editing} onClose={() => { setEditing(null); load() }} sinfs={sinfs} />}
			{importing && <AdminStudentImportExcel onClose={() => setImporting(false)} onImported={load} />}
		</div>
	)
}

export default AdminStudents

