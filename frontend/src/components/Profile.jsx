import axios from 'axios'
import { useOrg } from '../context/OrgContext'
import { useEffect, useState } from 'react'
import { FiArrowRight, FiCamera, FiCheck, FiEye, FiEyeOff, FiLock, FiMessageSquare, FiPhone, FiPlus, FiTrash2, FiUser, FiHome } from 'react-icons/fi'
import { FaChalkboardTeacher } from 'react-icons/fa'
import { LuPencilLine } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import GlobalCommentModal, { typeColor, typeLabel } from './GlobalCommentModal'
import { clearSession } from '../api/sessionCleanup'
import { formatUzDateTime, MONTHS_LONG } from '../utils/formatDate'

const ROLE = { viewer: 'Xodim', leader: 'Sinf rahbari', user: 'Maktab admini', admin: 'Admin', superadmin: 'Tizim egasi', monitor: 'Monitor' }
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const daysAgo = (n) => { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
const dateOf = (d) => { if (!d) return '—'; const x = new Date(d); return `${x.getDate()} ${MONTHS_LONG[x.getMonth()]}, ${x.getFullYear()}` }
const initials = (name) => (name || '?').split(/\s+/).map(p => (p.match(/\p{L}/u) || [''])[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
const levelText = (p) => (p >= 85 ? 'text-emerald-600' : p >= 60 ? 'text-amber-600' : 'text-rose-600')
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-black outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100'

const Row = ({ label, children }) => (
	<div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-start sm:gap-4">
		<dt className="w-40 shrink-0 text-sm text-slate-500">{label}</dt>
		<dd className="min-w-0 flex-1 break-words text-sm font-medium text-slate-900">{children}</dd>
	</div>
)

// Maktab admini profilida: maktab haqida qisqa ma'lumot (xodimlar uchun "ta'til/safar" izohlari o'rniga)
const SchoolInfoCard = ({ org, role }) => (
	<section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
		<div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
			<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FiHome size={16} /></span>
			<div><h2 className="font-semibold text-slate-900">Maktab ma'lumotlari</h2><p className="text-xs text-slate-500">Maktab sozlamalarida o'zgartiriladi</p></div>
		</div>
		<dl className="divide-y divide-slate-100 px-5 py-2">
			<Row label="Maktab">{org.orgName || '—'}</Row>
			<Row label="Hudud">{[org.region, org.district].filter(Boolean).join(', ') || '—'}</Row>
			<Row label="Telefon">{org.phone ? <a href={`tel:${org.phone}`} className="hover:text-blue-600">{org.phone}</a> : '—'}</Row>
			<Row label="IT markaz">{org.itCenter || '—'}</Row>
		</dl>
		{role === 'user' && <div className="border-t border-slate-100 px-5 py-4"><Link to="/user/settings" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Sozlamalarga o'tish</Link></div>}
	</section>
)

// Kameradagi yuz rasmi holati (xodim rasmi kameraga yuklanganmi)
const faceState = (u) => (u.photo_camera
	? { label: 'Kameraga yuklangan', hint: "Kirish-chiqishda kamera sizni taniydi", cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', icon: 'text-emerald-600 bg-emerald-100' }
	: !u.photo
		? { label: "Rasm yo'q", hint: "Rasmingiz yuklanmagan: kamera sizni taniy olmaydi. Maktab adminiga murojaat qiling", cls: 'bg-slate-100 text-slate-600 ring-slate-200', icon: 'text-slate-500 bg-slate-200' }
		: { label: 'Kutilmoqda', hint: "Rasm kameraga yuborilishi kutilmoqda. Uzoq davom etsa, maktab adminiga ayting", cls: 'bg-amber-50 text-amber-700 ring-amber-200', icon: 'text-amber-600 bg-amber-100' })

// Parolni o'zgartirish: joriy parol kerak
const PasswordCard = () => {
	const [form, setForm] = useState({ current: '', next: '', again: '' })
	const [show, setShow] = useState(false)
	const [busy, setBusy] = useState(false)
	const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
	const mismatch = form.again && form.next !== form.again
	const weak = form.next && form.next.length < 6
	const submit = async (e) => {
		e.preventDefault()
		if (form.next !== form.again) return toast.error('Yangi parollar bir xil emas')
		setBusy(true)
		try {
			const r = await axios.put(`${import.meta.env.VITE_BASE_URL}/api/user/change-password`, { currentPassword: form.current, newPassword: form.next }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			toast.success(r.data.message || "Parol o'zgartirildi")
			setForm({ current: '', next: '', again: '' })
		} catch (err) { toast.error(err.response?.data?.message || 'Parolni o\'zgartirib bo\'lmadi') } finally { setBusy(false) }
	}
	return (
		<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="mb-4 flex items-center justify-between gap-2">
				<div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FiLock size={16} /></span><div><h2 className="font-semibold text-slate-900">Parolni o'zgartirish</h2><p className="text-xs text-slate-400">Kamida 6 ta belgi</p></div></div>
				<button type="button" onClick={() => setShow(s => !s)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title={show ? 'Yashirish' : "Ko'rsatish"}>{show ? <FiEyeOff size={16} /> : <FiEye size={16} />}</button>
			</div>
			<form onSubmit={submit} className="space-y-3">
				<input type={show ? 'text' : 'password'} autoComplete="current-password" value={form.current} onChange={set('current')} placeholder="Joriy parol" required className={input} />
				<input type={show ? 'text' : 'password'} autoComplete="new-password" value={form.next} onChange={set('next')} placeholder="Yangi parol" required className={input} />
				{weak && <p className="text-xs text-rose-600">Kamida 6 ta belgi kiriting</p>}
				<input type={show ? 'text' : 'password'} autoComplete="new-password" value={form.again} onChange={set('again')} placeholder="Yangi parolni takrorlang" required className={input} />
				{mismatch && <p className="text-xs text-rose-600">Parollar bir xil emas</p>}
				<button disabled={busy || !form.current || form.next.length < 6 || form.next !== form.again} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">{busy ? 'Saqlanmoqda...' : "Parolni o'zgartirish"}</button>
			</form>
		</section>
	)
}

// Profil (barcha rollar uchun): shaxsiy ma'lumot, kameradagi yuz holati, parol, sababli kelmaslik izohlari va — xodim uchun — davomat xulosasi
const Profile = () => {
	const token = localStorage.getItem('token')
	const role = localStorage.getItem('content-type')
	const org = useOrg()
	const isSchoolAdmin = role === 'user' || role === 'admin'
	const navigate = useNavigate()
	const [user, setUser] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(null)
	const [comments, setComments] = useState([])
	const [commentModal, setCommentModal] = useState(null)
	const [deletingId, setDeletingId] = useState(null)
	const [deleteConfirmId, setDeleteConfirmId] = useState(null)
	const [mine, setMine] = useState(null)

	useEffect(() => {
		const fetchUser = async () => {
			try {
				setLoading(true)
				setError(null)
				const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, { headers: { Authorization: `Bearer ${token}` } })
				if (res.data.success) setUser(res.data.user)
				else setError("Foydalanuvchi ma'lumotlari olinmadi")
			} catch (err) {
				setError(err.response?.data?.message || 'Server xatosi')
				if (err.response?.status === 401) clearSession().then(() => navigate('/'))
			} finally {
				setLoading(false)
			}
		}
		if (token) fetchUser()
		else navigate('/')
	}, [token, navigate])

	// Xodim: 30 kunlik davomat va sinf rahbarligi
	useEffect(() => {
		if (role !== 'viewer') return
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/viewer-stats/dashboard`, { params: { date: today(), from: daysAgo(29), to: today() }, headers: { Authorization: `Bearer ${token}` } })
			.then(res => setMine(res.data)).catch(() => { })
	}, [role, token])

	const fetchComments = async (userId) => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/comment/employee/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
			if (res.data.success) setComments(res.data.data)
		} catch { /* silent */ }
	}
	useEffect(() => { if (user?._id) fetchComments(user._id) }, [user])

	const handleDeleteComment = async (id) => {
		setDeletingId(id)
		try {
			await axios.delete(`${import.meta.env.VITE_BASE_URL}/api/comment/${id}`, { headers: { Authorization: `Bearer ${token}` } })
			setComments(c => c.filter(x => x._id !== id))
		} catch (err) {
			toast.error(err.response?.data?.message || "Izohni o'chirishda xatolik")
		} finally {
			setDeletingId(null)
			setDeleteConfirmId(null)
		}
	}

	if (loading) return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="text-center"><div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" /><p className="mt-4 animate-pulse text-sm font-medium text-indigo-600">Yuklanmoqda...</p></div>
		</div>
	)

	if (error || !user) return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100"><FiUser size={24} className="text-rose-500" /></div>
				<h2 className="mb-2 text-lg font-bold text-gray-800">{error || 'Foydalanuvchi topilmadi'}</h2>
				<div className="mt-5 flex justify-center gap-3">
					<button onClick={() => window.location.reload()} className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700">Qayta</button>
					<button onClick={() => navigate('/')} className="rounded-xl bg-gray-100 px-5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200">Chiqish</button>
				</div>
			</div>
		</div>
	)

	const st = mine?.stats
	const classes = mine?.classes || []
	const face = faceState(user)
	const showFace = user.role === 'viewer' || user.role === 'leader'
	const todayStr = today()
	const isActive = (c) => c.startDate <= todayStr && (!c.endDate || c.endDate >= todayStr) && !c.closed
	const activeComments = comments.filter(isActive)

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6">
			<div className="space-y-5">
				{/* Yuqori karta */}
				<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="h-24 bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-700" />
					<div className="flex flex-wrap items-end gap-5 px-6 pb-5">
						<div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-indigo-100 text-2xl font-bold text-indigo-700 shadow-md">
							{user.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`} alt={user.fullName} className="h-full w-full object-cover" /> : initials(user.fullName)}
						</div>
						<div className="min-w-0 flex-1 pt-3">
							<h1 className="text-2xl font-semibold text-slate-900">{user.fullName}</h1>
							<div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
								<span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">{ROLE[user.role] || 'Foydalanuvchi'}</span>
								{classes.map(c => (
									<Link key={c._id} to={`/viewer/grades/${c.grade}/${c._id}`} className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 hover:bg-amber-100"><FaChalkboardTeacher size={12} /> Sinf rahbari: {c.name}</Link>
								))}
								{activeComments.map(c => <span key={c._id} className={`rounded-full px-3 py-1 text-xs font-semibold ${typeColor(c.type)}`}>Hozir: {typeLabel(c.type)}</span>)}
							</div>
							{user.position && <p className="mt-2 text-sm text-slate-500">{user.position}</p>}
						</div>
						{role === 'viewer' && <Link to={'/viewer/people/staff/me'} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">Mening davomatim <FiArrowRight size={14} /></Link>}
					</div>
				</section>

				{/* Xodim: davomat xulosasi */}
				{role === 'viewer' && (
					<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
						{[
							['Davomat (30 kun)', st ? (st.schoolDays ? `${st.percent}%` : '—') : '—', st?.schoolDays ? levelText(st.percent) : 'text-slate-400', st ? (st.schoolDays ? `${st.present} / ${st.schoolDays} o'quv kuni` : "Hali o'quv kunlari yo'q") : ''],
							['Kech qolgan kunlar', st ? st.late : '—', st?.late ? 'text-orange-600' : 'text-slate-900', st ? `kelmagan ${st.absent} kun` : ''],
							["O'rtacha kelish", st?.avgArrival || '—', 'text-slate-900', 'ish boshlanishiga nisbatan'],
							['Jami ishlagan vaqt', st ? `${st.totalHours} soat` : '—', 'text-slate-900', ''],
						].map(([l, v, tone, sub]) => (
							<div key={l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-medium text-slate-500">{l}</p><p className={`mt-1.5 text-2xl font-bold leading-none ${tone}`}>{v}</p>{sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}</div>
						))}
					</div>
				)}

				<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
					<div className="space-y-5">
						{/* Shaxsiy ma'lumotlar */}
						<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
							<h2 className="mb-1 font-semibold text-slate-900">Ma'lumotlarim</h2>
							<dl className="divide-y divide-slate-100">
								<Row label="Lavozim">{user.position || '—'}</Row>
								{!isSchoolAdmin && <Row label={classes.length ? 'Sinf rahbarligi' : 'Sinf'}>{classes.length ? classes.map(c => c.name).join(', ') : (user.sinf?.name || 'Biriktirilmagan')}</Row>}
								<Row label="Telefon">
									{user.phone_personal || user.phone_work ? (
										<span className="flex flex-col gap-1">
											{user.phone_personal && <a href={`tel:${user.phone_personal}`} className="inline-flex items-center gap-1.5 hover:text-blue-600"><FiPhone size={13} className="text-slate-400" /> {user.phone_personal} <span className="text-xs font-normal text-slate-400">shaxsiy</span></a>}
											{user.phone_work && <a href={`tel:${user.phone_work}`} className="inline-flex items-center gap-1.5 hover:text-blue-600"><FiPhone size={13} className="text-slate-400" /> {user.phone_work} <span className="text-xs font-normal text-slate-400">ish</span></a>}
										</span>
									) : '—'}
								</Row>
								<Row label="Login">@{user.username}</Row>
								<Row label="Tizimga qo'shilgan">{dateOf(user.createdAt)}</Row>
								<Row label="Oxirgi yangilanish">{user.updatedAt ? formatUzDateTime(new Date(user.updatedAt)) : '—'}</Row>
							</dl>
						</section>

						{/* Kameradagi yuz holati */}
						{showFace && (
							<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
								<div className="flex items-center gap-3">
									<span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${face.icon}`}><FiCamera size={18} /></span>
									<div className="min-w-0 flex-1"><h2 className="font-semibold text-slate-900">Yuz tanish (kamera)</h2><p className="mt-0.5 text-sm text-slate-500">{face.hint}</p></div>
									<span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${face.cls}`}>{user.photo_camera && <FiCheck size={12} />}{face.label}</span>
								</div>
							</section>
						)}

						<PasswordCard />
					</div>

					{/* Sababli kelmaslik izohlari (xodimlar) / maktab ma'lumotlari (maktab admini) */}
					{isSchoolAdmin ? <SchoolInfoCard org={org} role={role} /> : (
					<section className="self-start overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
						<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
							<div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><FiMessageSquare size={16} /></span><div><h2 className="font-semibold text-slate-900">Ta'til, safar va kasallik</h2><p className="text-xs text-slate-400">Kelolmaydigan kunlar uchun izoh qoldiring: shu kunlar «sababli» hisoblanadi</p></div></div>
							<button onClick={() => setCommentModal({ existing: null })} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"><FiPlus size={14} /> Izoh qo'shish</button>
						</div>
						<div className="p-4">
							{comments.length === 0 ? (
								<div className="flex flex-col items-center gap-2 py-12 text-center text-slate-400"><FiMessageSquare size={30} /><p className="text-sm font-medium text-slate-500">Hali izoh qo'shilmagan</p><p className="max-w-xs text-xs">Ta'tilga chiqsangiz, xizmat safariga ketsangiz yoki kasal bo'lsangiz, shu yerdan oldindan yozib qo'ying</p></div>
							) : (
								<ul className="space-y-2.5">
									{comments.map(c => (
										<li key={c._id} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5">
											<span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${typeColor(c.type)}`}>{typeLabel(c.type)}</span>
											<div className="min-w-0 flex-1">
												<p className="break-words text-sm text-slate-700">{c.comment}</p>
												<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">{c.startDate} → {c.endDate || 'muddatsiz'}<span className={`rounded-full px-2 py-0.5 font-medium ${isActive(c) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>{isActive(c) ? 'Faol' : 'Tugagan'}</span></p>
											</div>
											<div className="flex shrink-0 items-center gap-1">
												<button onClick={() => setCommentModal({ existing: c })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600" aria-label="Tahrirlash"><LuPencilLine size={15} /></button>
												<button onClick={() => setDeleteConfirmId(c._id)} disabled={deletingId === c._id} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40" aria-label="O'chirish"><FiTrash2 size={15} /></button>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</section>)}
				</div>
			</div>

			{commentModal && user && (
				<GlobalCommentModal employeeId={user._id} employeeName={user.fullName} existingComment={commentModal.existing} onClose={() => setCommentModal(null)} onSaved={() => fetchComments(user._id)} />
			)}

			{deleteConfirmId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
					<div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
						<h3 className="mb-2 text-lg font-bold text-slate-800">Izohni o'chirish</h3>
						<p className="mb-6 text-sm text-slate-500">Bu amalni ortga qaytarib bo'lmaydi.</p>
						<div className="flex justify-end gap-3">
							<button onClick={() => setDeleteConfirmId(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Bekor qilish</button>
							<button onClick={() => handleDeleteComment(deleteConfirmId)} disabled={deletingId === deleteConfirmId} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60">{deletingId === deleteConfirmId ? "O'chirilmoqda..." : "O'chirish"}</button>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default Profile
