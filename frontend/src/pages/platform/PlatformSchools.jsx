import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiCheck, FiCopy, FiEye, FiKey, FiLock, FiPlus, FiPower, FiSearch, FiTrash2, FiUserPlus, FiUserCheck, FiUsers, FiVideo, FiX } from 'react-icons/fi'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Bir martalik sir (token yoki parol) ko'rsatiladigan umumiy modal —
// nusxalash tugmasi bilan, chunki bu qiymat yopilgandan keyin QAYTA
// hech qachon ko'rsatilmaydi (backendda faqat xesh saqlanadi)
const SecretRevealModal = ({ title, fields, onClose }) => {
	const [copied, setCopied] = useState(null)
	const copy = (key, value) => {
		navigator.clipboard.writeText(value)
		setCopied(key)
		setTimeout(() => setCopied(null), 1500)
	}
	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
				<h2 className="text-xl font-bold text-gray-800 mb-1">{title}</h2>
				<p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 mb-4">
					{tx("Bu qiymat FAQAT HOZIR ko'rsatiladi — darhol xavfsiz joyga yozib qo'ying, keyin qayta ko'rsatilmaydi.")}
				</p>
				<div className="space-y-3">
					{fields.map(f => (
						<div key={f.key}>
							<p className="text-xs text-gray-500 mb-1">{f.label}</p>
							<div className="flex items-center gap-2">
								<code className="flex-1 bg-gray-100 text-gray-900 rounded-lg px-3 py-2 text-sm font-mono break-all">{f.value}</code>
								<button
									onClick={() => copy(f.key, f.value)}
									className="shrink-0 p-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
									title={tx("Nusxalash")}
								>
									{copied === f.key ? <FiCheck className="text-green-600" /> : <FiCopy />}
								</button>
							</div>
						</div>
					))}
				</div>
				<button
					onClick={onClose}
					className="mt-6 w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
				>
					{tx("Yopish")}
				</button>
			</div>
		</div>
	)
}

const CreateSchoolModal = ({ onClose, onCreated }) => {
	const [form, setForm] = useState({ name: '', code: '', region: '', district: '', districtId: '', phone: '', itCenter: '' })
	const [districts, setDistricts] = useState(null)
	useEffect(() => { api.get('/api/districts', authHeaders()).then(r => setDistricts((r.data.districts || []).filter(d => !d.isRegion))).catch(() => setDistricts([])) }, [])
	const [hik, setHik] = useState({ server: 'https://isgp.hikcentralconnect.com', appKey: '', secretKey: '', encryptionCode: '' })
	const [hikOpen, setHikOpen] = useState(false)
	const [adminForm, setAdminForm] = useState({ adminUsername: '', adminPassword: '' })
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e) => {
		e.preventDefault()
		if (!form.name || !form.code) return toast.error("Nomi va kod majburiy")
		const hikFilled = hik.appKey.trim() || hik.secretKey.trim()
		if (hikFilled && !(hik.appKey.trim() && hik.secretKey.trim())) return toast.error("Hik-Connect uchun API Key va API Secret ikkalasini kiriting")
		setLoading(true)
		try {
			const res = await api.post('/api/schools/create', { ...form, ...adminForm, ...(hikFilled ? { hik } : {}) }, authHeaders())
			if (res.data.success) {
				toast.success("Maktab yaratildi!")
				onCreated(res.data.school, res.data.apiToken, res.data.hik, res.data.admin)
			} else {
				toast.error(tx(res.data.message || "Xatolik"))
			}
		} catch (error) {
			toast.error(tx(error.response?.data?.message || "Server xatosi"))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-gray-800">{tx("Yangi maktab qo'shish")}</h2>
					<button onClick={onClose} className="text-gray-500 hover:text-gray-700"><FiX size={22} /></button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-3">
					<input
						type="text" placeholder={tx("Maktab nomi*")} value={form.name}
						onChange={e => setForm({ ...form, name: e.target.value })}
						className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						required
					/>
					<input
						type="text" placeholder={tx("Kod* (masalan: maktab-12)")} value={form.code}
						onChange={e => setForm({ ...form, code: e.target.value })}
						className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						required
					/>
					{districts && districts.length > 0 ? (
						<div>
							<SearchableSelect
								variant="outline"
								icon={false}
								className="w-full"
								searchPlaceholder={tx("Tuman qidirish...")}
								placeholder={tx("Tumanni tanlang")}
								value={form.districtId}
								onChange={v => setForm({ ...form, districtId: v })}
								options={[{ value: '', label: tx('Tumanni tanlang') }, ...districts.map(d => ({ value: d._id, label: [d.region, d.name].filter(Boolean).join(' · ') }))]}
							/>
							<p className="mt-1 text-[11px] text-gray-400">{tx("Tuman ro'yxatda yo'q bo'lsa, avval «Tumanlar» bo'limida qo'shing.")}</p>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-3">
							<input
								type="text" placeholder={tx("Viloyat")} value={form.region}
								onChange={e => setForm({ ...form, region: e.target.value })}
								className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
							<input
								type="text" placeholder={tx("Tuman")} value={form.district}
								onChange={e => setForm({ ...form, district: e.target.value })}
								className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
							/>
						</div>
					)}
					<input
						type="text" placeholder={tx("Telefon")} value={form.phone}
						onChange={e => setForm({ ...form, phone: e.target.value })}
						className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>

					{/* Maktab admini — bo'sh qoldirilsa login kod asosida, parol avtomatik yaratiladi */}
					<div className="grid grid-cols-2 gap-3">
						<input
							type="text" placeholder={tx("Admin logini (ixtiyoriy)")} autoComplete="off" value={adminForm.adminUsername}
							onChange={e => setAdminForm({ ...adminForm, adminUsername: e.target.value })}
							className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
						<input
							type="text" placeholder={tx("Admin paroli (ixtiyoriy)")} autoComplete="off" value={adminForm.adminPassword}
							onChange={e => setAdminForm({ ...adminForm, adminPassword: e.target.value })}
							className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>

					{/* Hik-Connect for Teams: maktabning o'z akkaunti kalitlari (ixtiyoriy) */}
					<div className="rounded-xl border border-gray-200 overflow-hidden">
						<button type="button" onClick={() => setHikOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left">
							<span className="flex items-center gap-2 text-sm font-semibold text-gray-800"><FiVideo /> {tx("Hik-Connect kalitlari")} <span className="font-normal text-gray-500">{tx("(ixtiyoriy)")}</span></span>
							<span className="text-xs text-gray-500">{hikOpen ? tx("Yopish") : tx("Kiritish")}</span>
						</button>
						{hikOpen && (
							<div className="p-4 space-y-3">
								<p className="text-xs text-gray-500">{tx("Maktabning Hik-Connect for Teams akkaunti. Saqlangach kameralar avtomatik olinadi, keyin kerakli kameralarni tanlab biriktirasiz.")}</p>
								<input type="text" placeholder={tx("Server")} value={hik.server} onChange={e => setHik({ ...hik, server: e.target.value })}
									className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
								<input type="text" placeholder={tx("API Key (AK)")} autoComplete="off" value={hik.appKey} onChange={e => setHik({ ...hik, appKey: e.target.value })}
									className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
								<input type="password" placeholder={tx("API Secret (SK)")} autoComplete="new-password" value={hik.secretKey} onChange={e => setHik({ ...hik, secretKey: e.target.value })}
									className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
								<input type="password" placeholder={tx("Video shifrlash kodi (ixtiyoriy)")} autoComplete="new-password" value={hik.encryptionCode} onChange={e => setHik({ ...hik, encryptionCode: e.target.value })}
									className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
							</div>
						)}
					</div>
					<div className="flex justify-end gap-3 pt-3">
						<button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
							{tx("Bekor qilish")}
						</button>
						<button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
							{loading ? tx("Yaratilmoqda...") : tx("Yaratish")}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}

const BootstrapAdminModal = ({ school, onClose, onDone }) => {
	const [username, setUsername] = useState('')
	const [fullName, setFullName] = useState('')
	// Standart: avtomatik generatsiya. Yoqilsa — superadmin o'zi xohlagan
	// login/parolni to'g'ridan-to'g'ri kiritadi
	const [customPassword, setCustomPassword] = useState(false)
	const [password, setPassword] = useState('')
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e) => {
		e.preventDefault()
		if (!username) return toast.error("Login kiriting")
		if (customPassword && password.length < 6) return toast.error("Parol kamida 6 ta belgidan iborat bo'lishi kerak")
		setLoading(true)
		try {
			const payload = { username, fullName }
			if (customPassword && password) payload.password = password
			const res = await api.post(`/api/schools/${school._id}/bootstrap-admin`, payload, authHeaders())
			if (res.data.success) {
				onDone(res.data.username, res.data.password)
			} else {
				toast.error(tx(res.data.message || "Xatolik"))
			}
		} catch (error) {
			toast.error(tx(error.response?.data?.message || "Server xatosi"))
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold text-gray-800">{tx('"{{name}}" uchun admin yaratish', { name: school.name })}</h2>
					<button onClick={onClose} className="text-gray-500 hover:text-gray-700"><FiX size={22} /></button>
				</div>
				<form onSubmit={handleSubmit} className="space-y-3">
					<input
						type="text" placeholder={tx("F.I.Sh")} value={fullName}
						onChange={e => setFullName(e.target.value)}
						className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
					/>
					<input
						type="text" placeholder={tx("Login*")} value={username}
						onChange={e => setUsername(e.target.value)}
						className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						required
					/>

					<label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
						<input
							type="checkbox"
							checked={customPassword}
							onChange={e => { setCustomPassword(e.target.checked); setPassword('') }}
							className="rounded border-gray-300"
						/>
						{tx("Parolni o'zim kiritaman")}
					</label>

					{customPassword ? (
						<input
							type="text" placeholder={tx("Yangi parol (kamida 6 belgi)")} value={password}
							onChange={e => setPassword(e.target.value)}
							className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					) : (
						<p className="text-xs text-gray-500">{tx("Parol avtomatik yaratiladi va bir marta ko'rsatiladi.")}</p>
					)}

					<div className="flex justify-end gap-3 pt-2">
						<button type="button" onClick={onClose} className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
							{tx("Bekor qilish")}
						</button>
						<button type="submit" disabled={loading} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
							{loading ? tx("Yaratilmoqda...") : tx("Admin yaratish")}
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}

// Maktabning barcha 'user'-rol (eng yuqori darajadagi) admin hisoblarini
// ro'yxat qilib, har biri ustida amal bajarish (parolni tiklash, faol/
// nofaol qilish, o'chirish) — bootstrapAdmin faqat YANGI admin yaratadi,
// bu esa MAVJUD adminlarni to'liq boshqarish uchun
const SchoolAdminsModal = ({ school, onClose, onPasswordReset, onCreateNew }) => {
	const [admins, setAdmins] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [busyId, setBusyId] = useState(null)
	// {adminId, action:'reset'|'delete'} — ro'yxat qatorida inline tasdiqlash
	const [confirming, setConfirming] = useState(null)
	// action==='reset' bo'lganda ixtiyoriy — bo'sh qoldirilsa avtomatik
	// generatsiya qilinadi, to'ldirilsa xuddi shu qiymat o'rnatiladi
	const [customPassword, setCustomPassword] = useState('')

	const fetchAdmins = async () => {
		setIsLoading(true)
		try {
			const res = await api.get(`/api/schools/${school._id}/admins`, authHeaders())
			if (res.data.success) setAdmins(res.data.admins)
		} catch {
			toast.error("Adminlarni yuklashda xatolik")
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => { fetchAdmins() }, [])

	const handleResetPassword = async (admin) => {
		if (customPassword && customPassword.length < 6) {
			toast.error("Parol kamida 6 ta belgidan iborat bo'lishi kerak")
			return
		}
		setBusyId(admin._id)
		setConfirming(null)
		try {
			const body = customPassword ? { password: customPassword } : {}
			setCustomPassword('')
			const res = await api.post(`/api/schools/${school._id}/admins/${admin._id}/reset-password`, body, authHeaders())
			if (res.data.success) {
				onPasswordReset(res.data.username, res.data.password)
			} else {
				toast.error(tx(res.data.message || "Xatolik"))
			}
		} catch (error) {
			toast.error(tx(error.response?.data?.message || "Server xatosi"))
		} finally {
			setBusyId(null)
		}
	}

	const handleToggleActive = async (admin) => {
		setBusyId(admin._id)
		try {
			const res = await api.patch(`/api/schools/${school._id}/admins/${admin._id}/toggle-active`, {}, authHeaders())
			if (res.data.success) {
				toast.success(res.data.admin.isActive ? "Admin faollashtirildi" : "Admin to'xtatildi")
				fetchAdmins()
			}
		} catch {
			toast.error("Xatolik yuz berdi")
		} finally {
			setBusyId(null)
		}
	}

	const handleDelete = async (admin) => {
		setBusyId(admin._id)
		setConfirming(null)
		try {
			const res = await api.delete(`/api/schools/${school._id}/admins/${admin._id}`, authHeaders())
			if (res.data.success) {
				toast.success("Admin o'chirildi")
				fetchAdmins()
			} else {
				toast.error(tx(res.data.message || "Xatolik"))
			}
		} catch (error) {
			toast.error(tx(error.response?.data?.message || "Server xatosi"))
		} finally {
			setBusyId(null)
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
			<div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6">
				<div className="flex justify-between items-center mb-1">
					<h2 className="text-xl font-bold text-gray-800">{tx('"{{name}}" adminlari', { name: school.name })}</h2>
					<button onClick={onClose} className="text-gray-500 hover:text-gray-700"><FiX size={22} /></button>
				</div>
				<p className="text-sm text-gray-500 mb-4">{tx("Maktabning eng yuqori darajadagi admin hisoblari")}</p>

				<div className="border border-gray-200 rounded-xl overflow-hidden">
					{isLoading ? (
						<div className="px-6 py-8 text-center text-sm text-gray-400">{tx("Yuklanmoqda...")}</div>
					) : admins.length === 0 ? (
						<div className="px-6 py-8 text-center text-sm text-gray-500">{tx("Bu maktabda admin hisobi yo'q")}</div>
					) : (
						<div className="divide-y divide-gray-200">
							{admins.map(admin => (
								<div key={admin._id} className="p-4">
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0">
											<p className="text-sm font-medium text-gray-900 truncate">{admin.fullName}</p>
											<p className="text-xs text-gray-500 truncate">@{admin.username}</p>
										</div>
										<div className="flex items-center gap-2 flex-shrink-0">
											<span className={`px-2 py-0.5 rounded-full text-xs font-medium ${admin.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
												{admin.isActive ? tx("Faol") : tx("To'xtatilgan")}
											</span>
											<button
												onClick={() => { setConfirming({ adminId: admin._id, action: 'reset' }); setCustomPassword('') }}
												disabled={busyId === admin._id}
												className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 disabled:opacity-50"
												title={tx("Parolni tiklash")}
											>
												<FiLock size={15} />
											</button>
											<button
												onClick={() => handleToggleActive(admin)}
												disabled={busyId === admin._id}
												className={`p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${admin.isActive ? 'text-red-600' : 'text-green-600'}`}
												title={admin.isActive ? tx("To'xtatish") : tx("Faollashtirish")}
											>
												<FiPower size={15} />
											</button>
											<button
												onClick={() => setConfirming({ adminId: admin._id, action: 'delete' })}
												disabled={busyId === admin._id}
												className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
												title={tx("O'chirish")}
											>
												<FiTrash2 size={15} />
											</button>
										</div>
									</div>

									{confirming?.adminId === admin._id && (
										<div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 space-y-2">
											<p className="text-xs text-amber-800">
												{confirming.action === 'reset'
													? tx("Eski parol shu zahoti ishlamay qoladi. Bo'sh qoldirsangiz avtomatik parol generatsiya qilinadi, yoki o'zingiz kiriting:")
													: tx("Bu admin hisobi bazadan BUTUNLAY o'chiriladi va qayta tiklab bo'lmaydi (login bo'shaydi). Davom etasizmi?")}
											</p>
											{confirming.action === 'reset' && (
												<input
													type="text"
													placeholder={tx("Yangi parol (ixtiyoriy, kamida 6 belgi)")}
													value={customPassword}
													onChange={e => setCustomPassword(e.target.value)}
													className="w-full px-3 py-1.5 text-sm border border-amber-300 rounded-lg text-black font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
												/>
											)}
											<div className="flex items-center justify-end gap-2">
												<button
													onClick={() => { setConfirming(null); setCustomPassword('') }}
													className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
												>
													{tx("Yo'q")}
												</button>
												<button
													onClick={() => confirming.action === 'reset' ? handleResetPassword(admin) : handleDelete(admin)}
													className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700"
												>
													{tx("Ha")}
												</button>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					)}
				</div>

				<button
					onClick={() => onCreateNew(school)}
					className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 hover:border-gray-400 font-medium text-sm"
				>
					<FiUserPlus size={15} /> {tx("Yangi admin qo'shish")}
				</button>
			</div>
		</div>
	)
}

const PlatformSchools = () => {
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const [schools, setSchools] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [createOpen, setCreateOpen] = useState(false)
	const [bootstrapFor, setBootstrapFor] = useState(null)
	const [adminsFor, setAdminsFor] = useState(null)
	const [secretModal, setSecretModal] = useState(null)
	const [busyId, setBusyId] = useState(null)

	const fetchSchools = async () => {
		setIsLoading(true)
		try {
			const res = await api.get('/api/schools/getAll', authHeaders())
			if (res.data.success) setSchools(res.data.schools)
		} catch {
			toast.error("Maktablarni yuklashda xatolik")
		} finally {
			setIsLoading(false)
		}
	}

	const [hikSummary, setHikSummary] = useState({})
	const fetchHikSummary = async () => {
		try {
			const res = await api.get('/api/hik/schools-summary', authHeaders())
			setHikSummary(res.data.summary || {})
		} catch { /* kamera xulosasi bo'lmasa ham maktablar ro'yxati ishlayveradi */ }
	}
	useEffect(() => { fetchSchools(); fetchHikSummary() }, [])
	const [districtList, setDistrictList] = useState([])
	useEffect(() => { api.get('/api/districts', authHeaders()).then(r => setDistrictList((r.data.districts || []).filter(d => !d.isRegion))).catch(() => { }) }, [])
	const changeDistrict = async (school, districtId) => {
		if (!districtId) return
		try {
			const res = await api.put(`/api/schools/update/${school._id}`, { districtId }, authHeaders())
			if (res.data.success) { toast.success("Tuman o'zgartirildi"); fetchSchools() } else toast.error(tx(res.data.message || 'Xatolik'))
		} catch (error) { toast.error(tx(error.response?.data?.message || 'Server xatosi')) }
	}

	// Maktabga kirishda admin yo'qligi aniqlansa (PlatformSchoolShell yo'naltiradi)
	// — admin yaratish oynasi avtomatik ochiladi
	useEffect(() => {
		const id = searchParams.get('bootstrap')
		if (!id || !schools.length) return
		const school = schools.find(item => item._id === id)
		if (school) setBootstrapFor(school)
		setSearchParams({}, { replace: true })
	}, [schools, searchParams, setSearchParams])

	const [q, setQ] = useState(searchParams.get('q') || '')
	const [districtFilter, setDistrictFilter] = useState(searchParams.get('district') || 'all')
	const [statusFilter, setStatusFilter] = useState(['active', 'inactive'].includes(searchParams.get('status')) ? searchParams.get('status') : 'all')
	const districtOptions = useMemo(() => {
		const names = [...new Set(schools.map(s => [s.region, s.district].filter(Boolean).join(' · ')).filter(Boolean))].sort((a, b) => a.localeCompare(b))
		return [{ value: 'all', label: tx('Barcha hududlar') }, ...names.map(n => ({ value: n, label: n })), { value: 'none', label: tx('Hudud belgilanmagan') }]
	}, [schools])
	const visibleSchools = useMemo(() => {
		const t = norm(q.trim())
		return schools.filter(s => {
			const area = [s.region, s.district].filter(Boolean).join(' · ')
			if (districtFilter === 'none' ? area : districtFilter !== 'all' && area !== districtFilter) return false
			if (statusFilter !== 'all' && (statusFilter === 'active') !== !!s.isActive) return false
			return !t || norm(`${s.name} ${s.code} ${s.region || ''} ${s.district || ''}`).includes(t)
		})
	}, [schools, q, districtFilter, statusFilter])

	const handleToggleActive = async (school) => {
		setBusyId(school._id)
		try {
			const res = await api.patch(`/api/schools/${school._id}/toggle-active`, {}, authHeaders())
			if (res.data.success) {
				toast.success(res.data.school.isActive ? "Maktab faollashtirildi" : "Maktab to'xtatildi")
				fetchSchools()
			}
		} catch {
			toast.error("Xatolik yuz berdi")
		} finally {
			setBusyId(null)
		}
	}

	// Maktab ichiga "kirish" — endi /platform ICHIDA qoladi (redirect emas):
	// PlatformSchoolShell shu URL'ga o'tilganda taqlid (impersonation)
	// tokenini o'zi fon rejimida oladi, shuning uchun bu yerda faqat
	// navigatsiya qilinadi
	const enterSchool = (school) => {
		if (!school.isActive) return
		navigate(`/platform/schools/${school._id}`)
	}

	return (
		<div className="md:p-6 bg-gray-50 min-h-full">
			<div className="flex justify-end gap-2 mb-6 px-4 md:px-0">
				<button
					onClick={() => setCreateOpen(true)}
					className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 justify-center font-medium"
				>
					<FiPlus size={18} /> {tx("Yangi maktab")}
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-2 mb-4 mx-4 md:mx-0">
				<div className="relative min-w-[220px] flex-1 max-w-md">
					<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
					<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Maktab nomi, kodi yoki hudud bo'yicha qidirish")} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
				</div>
				<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" searchPlaceholder={tx("Hudud qidirish...")} value={districtFilter} onChange={setDistrictFilter} options={districtOptions} />
				<SearchableSelect variant="outline" icon={false} className="min-w-[140px] max-w-[200px]" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: tx('Barcha holatlar') }, { value: 'active', label: tx('Faol') }, { value: 'inactive', label: tx("To'xtatilgan") }]} />
				<span className="text-xs text-gray-500">{tx('{{a}} / {{b}} ta maktab', { a: visibleSchools.length, b: schools.length })}</span>
			</div>
			
			<div className="bg-white rounded-xl shadow overflow-hidden mx-4 md:mx-0">
				<div className="overflow-x-auto min-h-[320px]">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Maktab")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Hudud")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Hik kameralar")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Holati")}</th>
								<th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Amallar")}</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{isLoading ? (
								<tr><td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-400">{tx("Yuklanmoqda...")}</td></tr>
							) : visibleSchools.length > 0 ? (
								visibleSchools.map(school => (
									<tr
										key={school._id}
										onClick={() => enterSchool(school)}
										className={`hover:bg-gray-50 ${school.isActive ? 'cursor-pointer' : ''}`}
										title={school.isActive ? tx("Maktab ichiga kirish") : undefined}
									>
										<td className="px-4 py-3.5">
											<div className="text-sm font-medium text-gray-900">{school.name}</div>
											<div className="text-xs text-gray-500">{school.code}</div>
										</td>
										<td className="px-4 py-3.5 text-sm text-gray-600">
											{districtList.length > 0 ? (
												<div onClick={e => e.stopPropagation()} title={tx("Maktab tumanini o'zgartirish")}>
													<SearchableSelect
														variant="outline"
														icon={false}
														className="min-w-[160px] max-w-[260px]"
														searchPlaceholder={tx("Tuman qidirish...")}
														value={districtList.find(d => d.name.toLowerCase() === (school.district || '').trim().toLowerCase() && (d.region || '').toLowerCase() === (school.region || '').trim().toLowerCase())?._id || ''}
														onChange={v => changeDistrict(school, v)}
														options={[{ value: '', label: school.district ? tx("{{name}} (ro'yxatda yo'q)", { name: school.district }) : tx('Tuman belgilanmagan') }, ...districtList.map(d => ({ value: d._id, label: [d.region, d.name].filter(Boolean).join(' · ') }))]}
													/>
												</div>
											) : ([school.region, school.district].filter(Boolean).join(', ') || '—')}
										</td>
										<td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
											{(() => {
												const h = hikSummary[school._id] || { monitor: { total: 0, online: 0 }, in: { total: 0, online: 0 }, out: { total: 0, online: 0 } }
												const fc = h.in.total + h.out.total
												return (
													<div className="flex flex-col items-start gap-1.5">
														<button onClick={() => navigate(`/platform/hik-cameras?school=${school._id}`)} title={tx("Oddiy kameralarni bog'lash")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${h.monitor.total ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
															<FiVideo size={12} /> {tx('Oddiy:')} {h.monitor.total}{h.monitor.total > 0 && <span className="opacity-70"> {tx('({{n}} online)', { n: h.monitor.online })}</span>}
														</button>
														<button onClick={() => navigate(`/platform/hik-facecontrol?school=${school._id}`)} title={tx("FaceControl kameralarni bog'lash")} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${fc ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
															<FiUserCheck size={12} /> {tx("FaceControl:")} {fc}{fc > 0 && <span className="opacity-70"> {tx('(kirish {{a}} · chiqish {{b}})', { a: h.in.total, b: h.out.total })}</span>}
														</button>
													</div>
												)
											})()}
										</td>
										<td className="px-4 py-3.5">
											<span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${school.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
												{school.isActive ? tx("Faol") : tx("To'xtatilgan")}
											</span>
										</td>
										<td className="px-4 py-3.5 text-right" onClick={e => e.stopPropagation()}>
											<div className="flex items-center justify-end gap-1">
												<button
													onClick={() => enterSchool(school)}
													disabled={!school.isActive}
													className="p-2 rounded-lg text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
													title={school.isActive ? tx("Maktab ichiga kirish") : tx("To'xtatilgan maktabga kirib bo'lmaydi")}
												>
													<FiEye size={16} />
												</button>
												<button
													onClick={() => navigate(`/platform/hik-cameras?school=${school._id}`)}
													className="p-2 rounded-lg text-blue-600 hover:bg-blue-50" title={tx("Oddiy kameralarni bog'lash")}
												>
													<FiVideo size={16} />
												</button>
												<button
													onClick={() => navigate(`/platform/hik-facecontrol?school=${school._id}`)}
													className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50" title={tx("FaceControl kameralarni bog'lash")}
												>
													<FiUserCheck size={16} />
												</button>
												<button
													onClick={() => setBootstrapFor(school)}
													className="p-2 rounded-lg text-blue-600 hover:bg-blue-50" title={tx("Admin yaratish")}
												>
													<FiUserPlus size={16} />
												</button>
												<button
													onClick={() => setAdminsFor(school)}
													className="p-2 rounded-lg text-purple-600 hover:bg-purple-50" title={tx("Adminlar")}
												>
													<FiUsers size={16} />
												</button>
												<button
													onClick={() => handleToggleActive(school)}
													disabled={busyId === school._id}
													className={`p-2 rounded-lg hover:bg-gray-100 disabled:opacity-50 ${school.isActive ? 'text-red-600' : 'text-green-600'}`}
													title={school.isActive ? tx("To'xtatish") : tx("Faollashtirish")}
												>
													<FiPower size={16} />
												</button>
											</div>
										</td>
									</tr>
								))
							) : (
								<tr><td colSpan="6" className="px-6 py-8 text-center text-sm text-gray-500">{schools.length ? tx("Qidiruv bo‘yicha maktab topilmadi") : tx("Hali birorta maktab qo'shilmagan")}</td></tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{createOpen && (
				<CreateSchoolModal
					onClose={() => setCreateOpen(false)}
					onCreated={(school, apiToken, hikResult, admin) => {
						setCreateOpen(false)
						fetchSchools()
						if (hikResult) {
							if (hikResult.success) navigate(`/platform/hik-cameras?school=${school._id}`)
							if (hikResult.success) toast.success(`Hik-Connect: ${hikResult.total} ta kamera topildi${hikResult.existed ? ' (bu akkaunt oldin qo\'shilgan edi)' : ''}. Kerakli kameralarni Hik-Connect bo'limida biriktiring`)
							else toast.error(tx(hikResult.message || "Hik-Connect kalitlari bilan ulanib bo'lmadi — keyin qayta urinib ko'ring"))
						}
						if (admin?.username) setSecretModal({
							title: tx('"{{name}}" yaratildi', { name: school.name }),
							fields: [
								{ key: 'username', label: tx('Maktab admini logini'), value: admin.username },
								{ key: 'password', label: tx('Maktab admini paroli'), value: admin.password },
							]
						})
					}}
				/>
			)}

			{bootstrapFor && (
				<BootstrapAdminModal
					school={bootstrapFor}
					onClose={() => setBootstrapFor(null)}
					onDone={(username, password) => {
						setBootstrapFor(null)
						setAdminsFor(null)
						setSecretModal({
							title: tx("Maktab admini yaratildi"),
							fields: [
								{ key: 'username', label: tx('Login'), value: username },
								{ key: 'password', label: tx('Parol'), value: password },
							]
						})
					}}
				/>
			)}

			{adminsFor && (
				<SchoolAdminsModal
					school={adminsFor}
					onClose={() => setAdminsFor(null)}
					onCreateNew={(school) => setBootstrapFor(school)}
					onPasswordReset={(username, password) => {
						setSecretModal({
							title: tx("Admin paroli tiklandi"),
							fields: [
								{ key: 'username', label: tx('Login'), value: username },
								{ key: 'password', label: tx('Yangi parol'), value: password },
							]
						})
					}}
				/>
			)}

			{secretModal && (
				<SecretRevealModal
					title={secretModal.title}
					fields={secretModal.fields}
					onClose={() => setSecretModal(null)}
				/>
			)}
		</div>
	)
}

export default PlatformSchools

