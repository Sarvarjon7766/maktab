import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiCamera, FiDownload, FiEdit, FiFile, FiFileText, FiFilter, FiLogOut, FiPlus, FiSearch, FiTrash, FiUploadCloud, FiUserCheck, FiUsers, FiUserX } from 'react-icons/fi'
import { useLocation } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as XLSX from "xlsx-js-style"
import AutoSelect from '../../components/AutoSelect'
import PersonLink from '../../components/PersonLink'
import { useOrg } from '../../context/OrgContext'
import { styleWorkbookSheet } from '../../utils/exportAttendance'
import { buildAndDownloadDocx, docxTable, exportElementToPdf, toDocxColor } from '../../utils/exportUtils'
import { formatUzShortDate } from '../../utils/formatDate'
import { publicId } from '../../utils/ids'
import AdminUserAdd from './AdminUserAdd'
import AdminUserImportExcel from './AdminUserImportExcel'
import AdminUserUpdate from './AdminUserUpdate'

// Xodim rasmining kameradagi holati: kamerada | navbatda (hali yuborilmagan) | rad etildi (sabab bilan) | rasm yo'q
const camState = (u) => {
	if (u.photo_camera === true) return { key: 'ok', label: 'Kamerada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200', detail: 'Rasm kameraga qabul qilingan' }
	if (!u.photo) return { key: 'nophoto', label: "Rasm yo'q", cls: 'bg-slate-100 text-slate-600 ring-slate-200', detail: "Xodimning rasmi yuklanmagan, kameraga yuborib bo'lmaydi" }
	const results = Array.isArray(u.cameraResults) ? u.cameraResults : []
	const failed = results.filter(r => !r.success)
	if (u.cameraError || failed.length) {
		const lines = results.length ? results.map(r => (r.success ? `✅ ${r.device}` : `❌ ${r.device}: ${r.error || 'xatolik'}`)).join('\n') : u.cameraError
		return { key: 'rejected', label: 'Rad etildi', cls: 'bg-rose-50 text-rose-700 ring-rose-200', reason: u.cameraError || failed[0]?.error || 'xatolik', detail: `${u.cameraAttempts || 1}-urinish\n${lines}` }
	}
	return { key: 'pending', label: 'Navbatda', cls: 'bg-amber-50 text-amber-700 ring-amber-200', detail: 'Kameraga yuborilishi kutilmoqda' }
}
const CAM_FILTERS = [['all', 'Hammasi'], ['ok', 'Kamerada'], ['pending', 'Navbatda'], ['rejected', 'Rad etildi'], ['nophoto', "Rasm yo'q"]]

// Yuqoridagi umumiy ko'rsatkich kartasi (DIQQAT: asl nusxasi tiklanmagan, qayta yozilgan)
const SUMMARY_TONES = {
	blue: 'bg-blue-50 text-blue-600',
	green: 'bg-emerald-50 text-emerald-600',
	amber: 'bg-amber-50 text-amber-600',
	rose: 'bg-rose-50 text-rose-600'
}
const PeopleSummary = ({ icon, label, value, tone = 'blue' }) => (
	<div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
		<span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${SUMMARY_TONES[tone] || SUMMARY_TONES.blue}`}>{icon}</span>
		<div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500">{label}</p><p className="text-2xl font-bold text-slate-900">{value}</p></div>
	</div>
)

const AdminUsers = () => {
	const token = localStorage.getItem('token')
	const location = useLocation()
	const roleBase = location.pathname.split('/')[1] || 'admin'
	const [sinfs, setDepartments] = useState([])
	const [selectedDepartment, setSelectedDepartment] = useState('all')
	const [camFilter, setCamFilter] = useState('all')
	const [users, setUsers] = useState([])
	const [filteredUsers, setFilteredUsers] = useState([])
	const [searchTerm, setSearchTerm] = useState('')
	const [commentModalOpen, setCommentModalOpen] = useState(false)
	const [selectedUser, setSelectedUser] = useState(null)
	const [addUser, setAddUser] = useState(false)
	const [importExcelOpen, setImportExcelOpen] = useState(false)
	const [updateUser, setUpdateUser] = useState(false)
	const [commentText, setCommentText] = useState('')
	const [exportLoading, setExportLoading] = useState(false)
	const [deletingId, setDeletingId] = useState(null)
	const [deleteModalOpen, setDeleteModalOpen] = useState(false)
	const [userToDelete, setUserToDelete] = useState(null)
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
	const [isLoading, setIsLoading] = useState(true)
	const org = useOrg()
	const reportRef = useRef(null)
	const [exportingPdf, setExportingPdf] = useState(false)
	const [exportingWord, setExportingWord] = useState(false)

	// API Calls
	const fetchDepartments = async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data.success) {
				setDepartments(res.data.sinfs)
			}
		} catch (error) {
			toast.error('Sinflarni yuklashda xatolik')
		}
	}

	const fetchUsers = async () => {
		setIsLoading(true)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data.success) {
				const sortedUsers = [...res.data.users].sort((a, b) => a.lavel - b.lavel)
				setUsers(sortedUsers)
				setFilteredUsers(sortedUsers)
			}
		} catch (error) {
			toast.error('Foydalanuvchilarni yuklashda xatolik')
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		fetchDepartments()
		fetchUsers()
	}, [])

	useEffect(() => {
		const handleResize = () => setIsMobile(window.innerWidth < 768)
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	useEffect(() => {
		filterUsers()
	}, [selectedDepartment, searchTerm, users, camFilter])

	// Statistikani hisoblash
	const calculateStats = () => {
		const totalUsers = users.length
		const ishdaCount = users.filter(u => u.attendanceStatus === 'ishda').length
		const tashqaridaCount = users.filter(u => u.attendanceStatus === 'tashqarida').length
		const kelmaganCount = users.filter(u => u.attendanceStatus === 'kelmagan').length

		return {
			total: totalUsers,
			ishda: {
				count: ishdaCount,
				percentage: totalUsers > 0 ? Math.round((ishdaCount / totalUsers) * 100) : 0
			},
			tashqarida: {
				count: tashqaridaCount,
				percentage: totalUsers > 0 ? Math.round((tashqaridaCount / totalUsers) * 100) : 0
			},
			kelmagan: {
				count: kelmaganCount,
				percentage: totalUsers > 0 ? Math.round((kelmaganCount / totalUsers) * 100) : 0
			}
		}
	}
	const stats = calculateStats()

	// Helper Functions
	const filterUsers = () => {
		let result = [...users]
		if (selectedDepartment !== 'all') {
			result = result.filter(user =>
				user.sinf && user.sinf._id === selectedDepartment
			)
		}
		if (camFilter !== 'all') result = result.filter(user => camState(user).key === camFilter)
		if (searchTerm) {
			const term = searchTerm.toLowerCase()
			result = result.filter(user =>
				user.fullName.toLowerCase().includes(term) ||
				user.position.toLowerCase().includes(term) ||
				user.username?.toLowerCase().includes(term))
		}
		setFilteredUsers(result)
	}

	const openEditModal = (user) => {
		setSelectedUser(user)
		setUpdateUser(true)
	}

	// Delete funksiyasi - tuzatilgan versiya
	const openDeleteModal = (user) => {
		setUserToDelete(user)
		setDeleteModalOpen(true)
	}

	const confirmDelete = async () => {
		if (!userToDelete) return

		setDeletingId(userToDelete._id)

		// Optimistic update - darhol UI dan o'chirish
		const userToDeleteFullName = userToDelete.fullName
		const userToDeleteId = userToDelete._id

		// Oldingi holatni saqlab qo'yish (xatolik yuz bersa qaytarish uchun)
		const previousUsers = [...users]
		const previousFilteredUsers = [...filteredUsers]

		// Darhol UI yangilash
		setUsers(prev => prev.filter(u => u._id !== userToDeleteId))
		setFilteredUsers(prev => prev.filter(u => u._id !== userToDeleteId))

		try {
			const res = await axios.delete(
				`${import.meta.env.VITE_BASE_URL}/api/user/delete/${userToDeleteId}`,
				{
					headers: { Authorization: `Bearer ${token}` },
				}
			)

			if (res.data.success) {
				toast.success(`${userToDeleteFullName} muvaffaqiyatli o'chirildi`)
			} else {
				// Agar server muvaffaqiyatli deb qaytmasa
				throw new Error(res.data.message || "O'chirish muvaffaqiyatsiz")
			}
		} catch (error) {
			// Xatolik yuz bersa, oldingi holatga qaytarish
			setUsers(previousUsers)
			setFilteredUsers(previousFilteredUsers)

			console.error("Delete error:", error)

			if (error.response) {
				const message = error.response.data?.message ||
					error.response.data?.error ||
					"Server xatosi"
				toast.error(`${userToDeleteFullName} o'chirilmadi: ${message}`)
			} else if (error.request) {
				toast.error(`${userToDeleteFullName} o'chirilmadi: Internet aloqasi yo'q`)
			} else {
				toast.error(`${userToDeleteFullName} o'chirilmadi: ${error.message}`)
			}
		} finally {
			setDeletingId(null)
			setDeleteModalOpen(false)
			setUserToDelete(null)
		}
	}

	const cancelDelete = () => {
		setDeleteModalOpen(false)
		setUserToDelete(null)
		setDeletingId(null)
	}

	const handleClose = () => {
		setAddUser(false)
		setUpdateUser(false)
		fetchUsers()
	}

	const getStatusClass = (status) => {
		switch (status) {
			case 'kelmagan': return 'bg-red-100 text-red-800'
			case 'tashqarida': return 'bg-yellow-100 text-yellow-800'
			case 'ishda': return 'bg-green-100 text-green-800'
			default: return 'bg-gray-100 text-gray-800'
		}
	}

	const getStatusText = (status) => {
		switch (status) {
			case 'kelmagan': return 'Kelmagan'
			case 'tashqarida': return 'Tashqarida'
			case 'ishda': return 'Ishda'
			default: return 'Nomaʼlum'
		}
	}

	const exportUsersToExcel = async () => {
		setExportLoading(true)
		try {
			const exportData = users.map((user, index) => ({
				'№': index + 1,
				'F.I.Sh': user.fullName,
				'Lavozim': user.position,
				'Sinf': user.sinf ? user.sinf.name : "Sinfsiz",
				'JSHR': user.jshr || 'Kiritilmagan',
				'Foydalanuvchi nomi': user.username,
				'Shaxsiy telefon': user.phone_personal || 'Mavjud emas',
				'Ish telefon': user.phone_work || 'Mavjud emas',
				'Holati': getStatusText(user.attendanceStatus || 'Nomaʼlum'),
				'Kamera': user.photo_camera ? 'Bor' : 'Yoʻq', // Yangi qator
				'Tartib raqam': user.lavel || '',
				'Yaratilgan sana': formatUzShortDate(new Date(user.createdAt)),
				'Oxirgi tahrir': user.updatedAt ? formatUzShortDate(new Date(user.updatedAt)) : 'Mavjud emas',
				'Komentariya': user.comment || ''
			}))

			const ws = styleWorkbookSheet(XLSX.utils.json_to_sheet(exportData))

			// ustun kengliklari
			ws['!cols'] = [
				{ wch: 5 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 16 },
				{ wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
				{ wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 30 }
				// ↑ kamera ustuni 10px
			]

			// workbook yaratish
			const wb = XLSX.utils.book_new()
			wb.Props = { Title: 'Xodimlar ro‘yxati', Subject: 'Xodimlar', Creator: 'School Supervision' }
			XLSX.utils.book_append_sheet(wb, ws, "Xodimlar")

			// fayl nomi
			const fileName = `xodimlar_${new Date().toISOString().slice(0, 10)}.xlsx`
			XLSX.writeFile(wb, fileName)

			toast.success("Excel fayliga chiroyli dizayn bilan yuklandi!")
		} catch (error) {
			toast.error("Export qilishda xatolik")
			console.error("Excel export error:", error)
		} finally {
			setExportLoading(false)
		}
	}

	// results — har bir kameraning alohida natijasi ([{device, success, error}]), chunki xodim bir nechta kameraga bir vaqtda yuboriladi
	const getCameraIcon = (hasCamera, error, attempts, results) => {
		if (hasCamera === true) {
			return <FiCamera className="text-green-600" size={16} title="Kamera bor" />
		} else if (hasCamera === false) {
			let title = "Kamera yo'q"
			if (Array.isArray(results) && results.length) {
				const lines = results.map(r =>
					r.success ? `✅ ${r.device}` : `❌ ${r.device}: ${r.error || "xatolik"}`
				)
				title = `Kameralar holati (${attempts}-urinish):\n${lines.join('\n')}`
			} else if (error) {
				title = `Kameraga yuklanmadi (${attempts}-urinish): ${error}`
			}
			return <FiCamera className="text-red-500" size={16} title={title} />
		}
		return null
	}

	// PDF/Word uchun — Excel'dagi 14 ustunning barchasi portret sahifaga sig'maydi, shuning uchun qisqaroq jadval
	const buildReportRows = () => users.map((u, i) => ({
		index: i + 1,
		fullName: u.fullName,
		position: u.position,
		department: u.sinf ? u.sinf.name : "Sinfsiz",
		status: getStatusText(u.attendanceStatus),
		camera: u.photo_camera ? 'Bor' : "Yo'q"
	}))

	const handleDownloadPdf = async () => {
		setExportingPdf(true)
		try {
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			await exportElementToPdf(reportRef.current, `xodimlar_${new Date().toISOString().slice(0, 10)}.pdf`)
		} catch {
			toast.error("PDF yaratishda xatolik")
		} finally {
			setExportingPdf(false)
		}
	}

	const handleDownloadWord = async () => {
		setExportingWord(true)
		try {
			const rows = buildReportRows()
			await buildAndDownloadDocx({
				title: org.orgName || 'School Supervision',
				subtitle: 'Xodimlar ro\'yxati',
				dateText: formatUzShortDate(new Date()),
				sections: [{
					heading: 'Xodimlar',
					table: docxTable(
						['№', 'F.I.Sh', 'Lavozim', "Sinf", 'Holati', 'Kamera'],
						rows.map(r => [r.index, r.fullName, r.position, r.department, r.status, r.camera]),
						toDocxColor(org.primaryColor)
					)
				}],
				filename: `xodimlar_${new Date().toISOString().slice(0, 10)}.docx`
			})
		} catch {
			toast.error("Word hisobot yaratishda xatolik")
		} finally {
			setExportingWord(false)
		}
	}

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6">
			{/* O'chirish tasdiq modali */}
			{deleteModalOpen && (
				<div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4">

					<div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
						<div className="flex items-center mb-4">
							<div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center mr-3">
								<FiTrash className="text-red-600" size={20} />
							</div>
							<h3 className="text-lg font-semibold text-gray-900">Foydalanuvchini o'chirish</h3>
						</div>

						<div className="mb-6">
							<p className="text-gray-700 mb-2">
								<strong>{userToDelete?.fullName}</strong> foydalanuvchisini o'chirishni tasdiqlaysizmi?
							</p>
							<p className="text-sm text-gray-500">
								Bu amalni qaytarib bo'lmaydi. Foydalanuvchi butunlay o'chiriladi.
							</p>

							{userToDelete && (
								<div className="mt-4 p-3 bg-gray-50 rounded-lg">
									<p className="text-sm text-gray-600">
										<span className="font-medium">Lavozim:</span> {userToDelete.position}
									</p>
									{userToDelete.sinf && (
										<p className="text-sm text-gray-600">
											<span className="font-medium">Sinf:</span> {userToDelete.sinf.name}
										</p>
									)}
									<p className="text-sm text-gray-600">
										<span className="font-medium">Username:</span> {userToDelete.username}
									</p>
									{userToDelete.photo_camera !== undefined && (
										<p className="text-sm text-gray-600">
											<span className="font-medium">Kamera:</span> {userToDelete.photo_camera ? 'Bor' : 'Yoʻq'}
										</p>
									)}
								</div>
							)}
						</div>

						<div className="flex justify-end gap-3">
							<button
								onClick={cancelDelete}
								disabled={deletingId}
								className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium disabled:opacity-50"
							>
								Bekor qilish
							</button>
							<button
								onClick={confirmDelete}
								disabled={deletingId}
								className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{deletingId ? (
									<>
										<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
										O'chirilmoqda...
									</>
								) : (
									<>
										<FiTrash size={16} />
										O'chirish
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			<div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
				<PeopleSummary icon={<FiUsers />} label="Jami xodimlar" value={stats.total} tone="blue" />
				<PeopleSummary icon={<FiUserCheck />} label="Ishda" value={stats.ishda.count} tone="green" />
				<PeopleSummary icon={<FiLogOut />} label="Tashqarida" value={stats.tashqarida.count} tone="amber" />
				<PeopleSummary icon={<FiUserX />} label="Kelmadi" value={stats.kelmagan.count} tone="rose" />
			</div>
			<div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 mb-5">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					{/* Qidiruv input */}
					<div className="relative w-full sm:max-w-sm">
						<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
							<FiSearch />
						</div>
						<input
							type="text"
							placeholder="Xodimlarni qidirish..."
							className="pl-10 pr-4 py-2.5 text-black w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>

					{/* Filtr va tugmalar */}
					<div className="flex flex-wrap gap-2 w-full sm:w-auto">
						{/* Sinf select */}
						<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg flex-1 sm:flex-none min-w-0">
							<FiFilter className="text-gray-500 shrink-0" />
							<AutoSelect
								className="bg-transparent text-gray-800 border-none focus:outline-none focus:ring-0 text-sm truncate max-w-[200px] sm:max-w-[250px] md:max-w-[300px]"
								value={selectedDepartment}
								onChange={(e) => setSelectedDepartment(e.target.value)}
							>
								<option value="all">Barcha sinflar</option>
								{sinfs.map(dept => (
									<option key={dept._id} value={dept._id} className="max-w-[350px] whitespace-normal break-words">
										{dept.name}
									</option>
								))}
							</AutoSelect>
						</div>

						{/* Excel export */}
						<button
							onClick={exportUsersToExcel}
							disabled={exportLoading}
							className={`px-3 py-2 rounded-lg flex items-center gap-2 flex-1 sm:flex-none justify-center ${exportLoading
								? 'bg-gray-400 cursor-not-allowed'
								: 'bg-green-600 hover:bg-green-700 text-white'
								}`}
							title="Excelga yuklash"
						>
							{exportLoading ? (
								<svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
									<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
									<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							) : (
								<FiDownload size={18} />
							)}
							<span className="hidden xs:inline">Excel</span>
						</button>

						{/* PDF export */}
						<button
							onClick={handleDownloadPdf}
							disabled={exportingPdf}
							className={`px-3 py-2 rounded-lg flex items-center gap-2 flex-1 sm:flex-none justify-center border ${exportingPdf
								? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
								: 'bg-white text-red-600 border-red-200 hover:bg-red-50'
								}`}
							title="PDF'ga yuklash"
						>
							<FiFileText size={18} />
							<span className="hidden xs:inline">PDF</span>
						</button>

						{/* Word export */}
						<button
							onClick={handleDownloadWord}
							disabled={exportingWord}
							className={`px-3 py-2 rounded-lg flex items-center gap-2 flex-1 sm:flex-none justify-center border ${exportingWord
								? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
								: 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
								}`}
							title="Word'ga yuklash"
						>
							<FiFile size={18} />
							<span className="hidden xs:inline">Word</span>
						</button>

						{/* Excel'dan ommaviy qo'shish */}
						<button
							onClick={() => setImportExcelOpen(true)}
							className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 flex-1 sm:flex-none justify-center"
							title="Excel'dan ommaviy qo'shish"
						>
							<FiUploadCloud size={18} />
							<span className="hidden xs:inline">Excel'dan qo'shish</span>
						</button>

						{/* Yangi xodim */}
						<button
							onClick={() => setAddUser(true)}
							className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 flex-1 sm:flex-none justify-center"
							title="Yangi xodim"
						>
							<FiPlus size={18} />
							<span className="hidden xs:inline">Yangi</span>
						</button>
					</div>
				</div>
			</div>

			{/* Mobile Card View */}
			{isMobile && (
				<div className="space-y-3">
					{isLoading ? (
						<div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">
							Yuklanmoqda...
						</div>
					) : filteredUsers.length > 0 ? (
						filteredUsers.map((user) => (
							<div key={user._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
								<div className="flex items-center justify-between mb-3">
									<PersonLink kind="staff" id={user._id} className="flex min-w-0 items-center gap-3">
										{user.photo ? (
											<img
												className="h-10 w-10 rounded-full object-cover"
												src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`}
												alt={user.fullName}
											/>
										) : (
											<div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
												{user.fullName.charAt(0)}
											</div>
										)}
										<div>
											<p className="font-medium text-gray-900 text-sm">{user.fullName}</p>
											<p className="text-xs text-gray-500">@{user.username}</p>
										</div>
									</PersonLink>
									<span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusClass(user.attendanceStatus)}`}>
										{getStatusText(user.attendanceStatus)}
									</span>
								</div>
								<div className="text-xs text-gray-600 mb-3">
									<p>{user.position}</p>
									{publicId(user.hodimID) && <p className="text-gray-400">ID: {publicId(user.hodimID)}</p>}
								</div>
								<div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
									<button onClick={() => openEditModal(user)} className="text-blue-600 hover:text-blue-900 p-1.5 rounded-full hover:bg-blue-50"><FiEdit size={16} /></button>
									<button onClick={() => openDeleteModal(user)} className="text-red-600 hover:text-red-900 p-1.5 rounded-full hover:bg-red-50"><FiTrash size={16} /></button>
								</div>
							</div>
						))
					) : (
						<div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
							Hech qanday xodim topilmadi
						</div>
					)}
				</div>
			)}

			{/* Desktop Table View */}
			{!isMobile && (
				<div className="bg-white rounded-xl shadow overflow-hidden">
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200">
							<thead className="bg-gray-50">
								<tr>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xodim</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lavozim</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Holati</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amallar</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y divide-gray-200">
								{isLoading ? (
									<tr>
										<td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-400">
											Yuklanmoqda...
										</td>
									</tr>
								) : filteredUsers.length > 0 ? (
									filteredUsers.map((user, index) => (
										<tr key={user._id} className="hover:bg-gray-50">
											<td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
												{index + 1}
											</td>
											<td className="px-4 py-3">
												<PersonLink kind="staff" id={user._id} className="flex min-w-0 items-center">
													<div className="flex-shrink-0 h-10 w-10">
														{user.photo ? (
															<img
																className="h-10 w-10 rounded-full object-cover"
																src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`}
																alt={user.fullName}
															/>
														) : (
															<div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
																{user.fullName.charAt(0)}
															</div>
														)}
													</div>
													<div className="ml-3">
														<div className="text-sm font-medium text-gray-900 line-clamp-1">{user.fullName}</div>
														<div className="text-xs text-gray-500">{user.username}</div>
													</div>
												</PersonLink>
											</td>
											<td className="px-4 py-3">
												<div className="text-sm text-gray-900 line-clamp-1">{user.position}</div>
												<div className="text-xs text-gray-500">{publicId(user.hodimID)}</div>
											</td>
											<td className="px-4 py-3">
												<div className="flex items-center gap-2">
													<span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(user.attendanceStatus)}`}>
														{getStatusText(user.attendanceStatus)}
													</span>
													{getCameraIcon(user.photo_camera, user.cameraError, user.cameraAttempts, user.cameraResults)}
												</div>
											</td>
											<td className="px-4 py-3 text-right text-sm font-medium">
												<div className="flex items-center justify-end gap-1">
													<button
														onClick={() => openEditModal(user)}
														className="text-blue-600 hover:text-blue-900 p-1.5 rounded-full hover:bg-blue-50 transition-colors"
														title="Tahrirlash"
													>
														<FiEdit size={18} />
													</button>
													<button
														onClick={() => openDeleteModal(user)}
														disabled={deletingId === user._id}
														className={`text-red-600 hover:text-red-900 p-1.5 rounded-full hover:bg-red-50 transition-colors ${deletingId === user._id ? 'opacity-50 cursor-not-allowed' : ''
															}`}
														title="O'chirish"
													>
														{deletingId === user._id ? (
															<div className="animate-spin h-4 w-4 border-2 border-red-600 border-t-transparent rounded-full"></div>
														) : (
															<FiTrash size={18} />
														)}
													</button>
												</div>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
											Hech qanday xodim topilmadi
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{addUser && <AdminUserAdd onClose={handleClose} sinfs={sinfs} />}
			{updateUser && <AdminUserUpdate user={selectedUser} onClose={handleClose} sinfs={sinfs} />}
			{importExcelOpen && (
				<AdminUserImportExcel
					onClose={() => setImportExcelOpen(false)}
					onImported={fetchUsers}
				/>
			)}

			{/* PDF eksporti uchun ekrandan tashqarida chizilgan hisobot shabloni */}
			<div style={{ position: 'fixed', top: 0, left: '-10000px', width: '780px', zIndex: -1 }}>
				<div ref={reportRef} style={{ background: '#ffffff', padding: '32px', fontFamily: 'Arial, sans-serif', color: '#111111' }}>
					<div style={{ textAlign: 'center', marginBottom: '6px' }}><img src="/logo-256.png" alt="" style={{ height: '64px', width: '64px', objectFit: 'contain' }} /></div>
					<h1 style={{ textAlign: 'center', fontSize: '22px', margin: '0 0 4px' }}>{org.orgName || 'School Supervision'}</h1>
					<p style={{ textAlign: 'center', fontSize: '14px', color: '#666666', margin: '0 0 4px' }}>Xodimlar ro'yxati</p>
					<p style={{ textAlign: 'center', fontSize: '12px', color: '#999999', margin: '0 0 24px' }}>{formatUzShortDate(new Date())}</p>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr>
								{['№', 'F.I.Sh', 'Lavozim', "Sinf", 'Holati', 'Kamera'].map(h => (
									<th key={h} style={{ background: org.primaryColor, color: '#fff', padding: '8px', fontSize: '12px', border: '1px solid #e1e0d9' }}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{buildReportRows().map(r => (
								<tr key={r.index}>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.index}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.fullName}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.position}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.department}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.status}</td>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.camera}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	)
}

export default AdminUsers
