import { publicId } from '../../utils/ids'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import {
	FaClock,
	FaEdit,
	FaFilter,
	FaMobileAlt,
	FaRegCommentDots,
	FaUserCheck,
	FaUserGraduate,
	FaUsers,
	FaUserSlash,
	FaUserTimes
} from 'react-icons/fa'
import {
	FiAlertTriangle,
	FiCalendar,
	FiClock,
	FiPause,
	FiPlay,
	FiRefreshCw,
	FiSearch,
	FiX
} from 'react-icons/fi'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import KpiCard from '../../components/KpiCard'
import { typeColor, typeLabel } from '../../components/GlobalCommentModal'
import { getTashkentDateString, getTashkentHourMinute, formatUzTime } from '../../utils/formatDate'
import { MANUAL_ENTRY_CHECKPOINT_ID } from '../../utils/constants'
import StudentEntryExit from './StudentEntryExit'
import UserAttendanceModal from './UserAttendanceModal'
import SearchableSelect from '../../components/SearchableSelect'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'
import { useSearchParams } from 'react-router-dom'

const BASE_URL = import.meta.env.VITE_BASE_URL
// AdminAnalytics.jsx'ning jonli oqimidan (4s) sekinroq — bu sahifa har
// safar TO'LIQ xodimlar ro'yxatini qayta yuklaydi; PostUsers.jsx'ning
// kiosk-poll'idan (30s) tezroq — bu asosiy "hozir kim bor" sahifasi
const AUTO_REFRESH_MS = 15000
// "Ishda" holatida shuncha soatdan ortiq qolib ketgan xodim — chiqishni
// unutgan bo'lishi mumkin, ogohlantirish belgisi shu chegara bo'yicha chiqadi
const STALE_SESSION_HOURS = 12

const AdminEntryExit = () => {
	// Ogohlantirishlardan keladigan havola: ?view=student&status=kelmagan
	const [urlParams] = useSearchParams()
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }
	const workStartTimeRef = useRef('09:00')
	const [, setCurrentUserId] = useState(null)
	// Qo'lda "Yangilash" ustma-ust bosilsa (yoki avtomatik va qo'lda
	// yangilash bir vaqtga to'g'ri kelsa), oldingi (sekinroq) so'rov javobi
	// keyingi (tezroq tugagan) so'rovdan KEYIN kelib, yangi ma'lumotni
	// eskisi bilan almashtirib qo'yishi mumkin edi. Har so'rovga tartib
	// raqami berib, faqat ENG OXIRGI so'rov javobini qabul qilamiz
	// (AdminAnalytics.jsx'dagi bilan bir xil naqsh)
	const requestSeqRef = useRef(0)
	const [users, setUsers] = useState([])
	const [sinfs, setDepartments] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedDepartment, setSelectedDepartment] = useState('all')
	const [selectedStatus, setSelectedStatus] = useState(['ishda', 'kelmagan', 'tashqarida'].includes(urlParams.get('status')) ? urlParams.get('status') : 'all')
	const [selectedStat, setSelectedStat] = useState(null)
	const [commentModalOpen, setCommentModalOpen] = useState(false)
	const [timeModalOpen, setTimeModalOpen] = useState(false)
	const [evidenceModalOpen, setEvidenceModalOpen] = useState(false)
	const [evidenceData, setEvidenceData] = useState(null)
	const [submitting, setSubmitting] = useState(false)
	const [modalType, setModalType] = useState('')
	const [selectedUser, setSelectedUser] = useState(null)
	const [commentText, setCommentText] = useState('')
	const [commentMap, setCommentMap] = useState({})
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
	const [viewMode, setViewMode] = useState(urlParams.get('view') === 'student' ? 'student' : 'staff')
	// Xodim bo'yicha to'liq tarix — mavjud UserAttendanceModal'ni ulash
	// (AdminAttandance.jsx'dagi bilan bir xil naqsh)
	const [historyUserId, setHistoryUserId] = useState(null)

	// Sana tanlash — standart bugungi kun, lekin istalgan o'tgan kunni
	// tanlab, o'sha kunning kirish-chiqish holatini ko'rish mumkin
	const [selectedDate, setSelectedDate] = useState(getTashkentDateString())
	const isViewingToday = selectedDate === getTashkentDateString()

	// Avto-yangilanish (real-vaqt monitoring) — faqat bugungi kunni
	// ko'rayotganda ma'noga ega, o'tgan kun uchun butunlay o'chiriladi
	const [lastUpdated, setLastUpdated] = useState(null)
	const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true)
	const [recentChangeIds, setRecentChangeIds] = useState(new Set())
	const prevUsersRef = useRef([])
	// Modal ochiq bo'lganda avto-yangilanish o'tkazib yuboriladi —
	// aks holda foydalanuvchi modal ichida ishlayotganda orqa fondagi
	// ro'yxat almashib, modal noto'g'ri ma'lumot bilan qolib ketishi mumkin
	const modalOpenRef = useRef(false)
	useEffect(() => {
		modalOpenRef.current = commentModalOpen || timeModalOpen || evidenceModalOpen || !!historyUserId
	}, [commentModalOpen, timeModalOpen, evidenceModalOpen, historyUserId])

	// Ekran o'lchamini kuzatish
	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768)
		}

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Kechikkanlikni tekshirish — Sozlamalardagi "Ish boshlanish vaqti"ga
	// nisbatan (avval bu yerda 09:00 kodga qattiq yozilgan edi)
	const isLate = (checkInTime) => {
		if (!checkInTime) return false

		const { hour, minute } = getTashkentHourMinute(new Date(checkInTime))

		const [workStartHour, workStartMinutes] = workStartTimeRef.current.split(':').map(Number)

		const totalLocalMinutes = hour * 60 + minute
		const totalWorkStartMinutes = workStartHour * 60 + workStartMinutes

		const lateMinutes = totalLocalMinutes - totalWorkStartMinutes
		return lateMinutes > 5 ? lateMinutes : false
	}

	const formatTime = (isoString) => {
		if (!isoString) return '-'
		return formatUzTime(new Date(isoString))
	}

	// isLate() bilan bir xil (yagona) hisoblash usulidan foydalanadi —
	// avval bu yerda alohida, qo'lda UTC+5 qo'shadigan (va isLate'dan
	// farqli) usul ishlatilgan edi
	const calculateLateMinutes = (checkInTime) => {
		const result = isLate(checkInTime)
		return result || 0
	}

	const fetchWorkStartTime = async () => {
		try {
			const res = await axios.get(`${BASE_URL}/api/settings`, { headers })
			if (res.data?.success && res.data.settings?.workStartTime) {
				workStartTimeRef.current = res.data.settings.workStartTime
			}
		} catch {
			// jim — standart 09:00 bilan davom etadi
		}
	}

	const fetchCommentMap = async () => {
		try {
			const today = getTashkentDateString()
			const res = await axios.get(
				`${import.meta.env.VITE_BASE_URL}/api/comment/map?date=${today}`,
				{ headers: { Authorization: `Bearer ${token}` } }
			)
			if (res.data.success) setCommentMap(res.data.data)
		} catch { /* silent */ }
	}

	const fetchData = async (silent = false) => {
		const seq = ++requestSeqRef.current
		try {
			if (!silent) setLoading(true)
			const [usersRes, deptRes] = await Promise.all([
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, {
					headers: { Authorization: `Bearer ${token}` },
					params: { date: selectedDate },
				}),
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, {
					headers: { Authorization: `Bearer ${token}` },
				})
			])

			if (seq !== requestSeqRef.current) return // eskirgan javob — e'tiborsiz qoldiramiz

			if (usersRes.data.success && deptRes.data.success) {
				const processedUsers = usersRes.data.users.map(user => {
					const isUserLate = isLate(user.firstCheckInTime)
					// Chiqish qayd etilmagan ogohlantirish — xodim hali "ishda"
					// holatida, lekin kirgandan beri STALE_SESSION_HOURS dan
					// ko'proq vaqt o'tgan bo'lsa, chiqishni unutgan bo'lishi mumkin
					const isStaleOpen = user.attendanceStatus === 'ishda' && user.lastCheckInTime &&
						(Date.now() - new Date(user.lastCheckInTime).getTime()) > STALE_SESSION_HOURS * 60 * 60 * 1000

					return {
						...user,
						attendanceStatus: user.attendanceStatus || 'kelmagan',
						firstEntryTime: formatTime(user.firstCheckInTime) || '-',
						entryTime: formatTime(user.lastCheckInTime) || '-',
						exitTime: formatTime(user.lastCheckOutTime) || '-',
						comment: user.lastComment || '-',
						isLate: isUserLate,
						lateMinutes: isUserLate ? calculateLateMinutes(user.firstCheckInTime) : 0,
						isStaleOpen,
						originalCheckInTime: user.lastCheckInTime,
						originalCheckOutTime: user.lastCheckOutTime,
						lastCheckInPhoto: user.lastCheckInPhoto || null,
						lastCheckOutPhoto: user.lastCheckOutPhoto || null,
						lastCheckInLocation: user.lastCheckInLocation || null,
						lastCheckOutLocation: user.lastCheckOutLocation || null,
						lastCheckInFaceMatchConfidence: user.lastCheckInFaceMatchConfidence ?? null,
						lastCheckOutFaceMatchConfidence: user.lastCheckOutFaceMatchConfidence ?? null
					}
				})

				// Daraja (lavel) bo'yicha saralash
				processedUsers.sort((a, b) => {
					if (!a.lavel && !b.lavel) return 0
					if (!a.lavel) return 1
					if (!b.lavel) return -1
					return a.lavel - b.lavel
				})

				// Avto-yangilanishda holati o'zgargan xodimlarni aniqlash —
				// jadvalda qisqa muddat pulslovchi belgi ko'rsatish uchun
				if (silent && prevUsersRef.current.length) {
					const prevById = new Map(prevUsersRef.current.map(u => [u._id, u]))
					const changed = new Set()
					processedUsers.forEach(u => {
						const prev = prevById.get(u._id)
						if (prev && (
							prev.attendanceStatus !== u.attendanceStatus ||
							prev.originalCheckInTime !== u.originalCheckInTime ||
							prev.originalCheckOutTime !== u.originalCheckOutTime
						)) {
							changed.add(u._id)
						}
					})
					if (changed.size) {
						setRecentChangeIds(changed)
						setTimeout(() => setRecentChangeIds(new Set()), 4000)
					}
				}
				prevUsersRef.current = processedUsers

				setUsers(processedUsers)
				setDepartments(deptRes.data.sinfs)
				setLastUpdated(new Date())
			}
		} catch {
			if (seq !== requestSeqRef.current) return
			toast.error("Ma'lumotlarni yuklashda xato")
		} finally {
			if (seq === requestSeqRef.current) {
				setLoading(false)
				setRefreshing(false)
			}
		}
	}

	// Foydalanuvchi ID sini olish
	const fetchCurrentUserId = async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getuserId`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data.success) {
				setCurrentUserId(res.data.userId)
			}
		} catch {
			toast.error("Foydalanuvchi ID sini olishda xato")
		}
	}

	// Statistikani hisoblash
	const calculateStats = () => {
		const totalUsers = users.length
		const ishdaCount = users.filter(u => u.attendanceStatus === 'ishda').length
		const tashqaridaCount = users.filter(u => u.attendanceStatus === 'tashqarida').length
		const isAbsent = (u) => u.attendanceStatus === 'kelmagan' || !['ishda', 'tashqarida'].includes(u.attendanceStatus)
		const kelmaganCount = users.filter(u => isAbsent(u) && !commentMap[u._id]).length
		const sababliCount = users.filter(u => isAbsent(u) && commentMap[u._id]).length
		const kechikkanCount = users.filter(user => user.isLate).length

		return {
			total: totalUsers,
			ishda: { count: ishdaCount },
			tashqarida: { count: tashqaridaCount },
			kelmagan: { count: kelmaganCount },
			sababli: { count: sababliCount },
			kechikkan: { count: kechikkanCount }
		}
	}

	const stats = calculateStats()

	// Status funksiyalari
	const getStatusIcon = (status) => {
		switch (status) {
			case 'ishda': return <FaUserCheck className="text-emerald-500" />
			case 'kelmagan': return <FaUserTimes className="text-rose-500" />
			case 'tashqarida': return <FaUserSlash className="text-blue-500" />
			default: return <FaUserTimes className="text-rose-500" />
		}
	}

	const getStatusColor = (status) => {
		switch (status) {
			case 'ishda': return 'bg-emerald-100 text-emerald-800'
			case 'kelmagan': return 'bg-rose-100 text-rose-800'
			case 'tashqarida': return 'bg-blue-100 text-blue-800'
			default: return 'bg-rose-100 text-rose-800'
		}
	}

	const getStatusText = (status) => {
		switch (status) {
			case 'ishda': return 'Ishda'
			case 'kelmagan': return 'Kelmadi'
			case 'tashqarida': return 'Tashqarida'
			default: return 'Kelmadi'
		}
	}

	// Mobil check-in dalilini ko'rsatish (faqat lastCheckInLocation/
	// lastCheckOutLocation mavjud bo'lganda chaqiriladi — bu maydonlar
	// FAQAT mobil orqali qilingan check-in/out'da to'ldiriladi, kamera/post
	// yozuvlarida bo'sh qoladi)
	const openEvidenceModal = (user, type) => {
		const photo = type === 'entry' ? user.lastCheckInPhoto : user.lastCheckOutPhoto
		const location = type === 'entry' ? user.lastCheckInLocation : user.lastCheckOutLocation
		const confidence = type === 'entry' ? user.lastCheckInFaceMatchConfidence : user.lastCheckOutFaceMatchConfidence
		setEvidenceData({ user, type, photo, location, confidence })
		setEvidenceModalOpen(true)
	}

	// Kommentariya funksiyalari
	const openCommentModal = (user) => {
		setSelectedUser(user)
		setCommentText(user.comment || '')
		setCommentModalOpen(true)
	}

	const handleCommentSubmit = async () => {
		if (submitting) return
		setSubmitting(true)
		try {
			const res = await axios.put(
				`${import.meta.env.VITE_BASE_URL}/api/user/comment/${selectedUser.lastLogId}`,
				{ comment: commentText },
				{ headers: { Authorization: `Bearer ${token}` } }
			)
			if (res.data.success) {
				toast.success("Komentariya saqlandi!")
				fetchData()
				setCommentModalOpen(false)
			}
		} catch (error) {
			toast.error(error.response?.data?.message || "Komentariyani saqlashda xatolik")
		} finally {
			setSubmitting(false)
		}
	}

	// Vaqtni tahrirlash funksiyalari
	const openTimeModal = (user, type) => {
		setSelectedUser(user)
		setModalType(type)
		setTimeModalOpen(true)
	}

	const handleTimeSubmit = async () => {
		if (submitting) return
		setSubmitting(true)
		try {
			const res = await axios.put(
				`${import.meta.env.VITE_BASE_URL}/api/user/user-time/${selectedUser.hodimID}`,
				{
					qayer: MANUAL_ENTRY_CHECKPOINT_ID,
					type: modalType,
					userId: selectedUser._id
				},
				{ headers: { Authorization: `Bearer ${token}` } }
			)

			if (res.data.success) {
				toast.success(
					modalType === "entry"
						? "Xodim muvaffaqiyatli kiritildi!"
						: "Xodim muvaffaqiyatli chiqarildi!"
				)
				fetchData()
				setTimeModalOpen(false)
			}
		} catch (error) {
			toast.error(error.response?.data?.message || error.message)
		} finally {
			setSubmitting(false)
		}
	}

	// Statistik filterlarni tozalash
	const clearStatFilter = () => {
		setSelectedStat(null)
	}

	// Barcha filtrlarni tozalash
	const resetFilters = () => {
		setSearchTerm('')
		setSelectedDepartment('all')
		setSelectedStatus('all')
		setSelectedStat(null)
	}

	// Foydalanuvchilarni filtrlash
	const filteredUsers = users.filter(user => {
		const matchesSearch =
			user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.hodimID?.toLowerCase().includes(searchTerm.toLowerCase())

		const matchesDepartment =
			selectedDepartment === 'all' ||
			(selectedDepartment === 'no-dept' && !user.sinf) ||
			user.sinf?._id === selectedDepartment

		const matchesStatus =
			selectedStatus === 'all' ||
			user.attendanceStatus === selectedStatus ||
			(selectedStatus === 'kelmagan' && !['ishda', 'tashqarida'].includes(user.attendanceStatus))

		const matchesStat = !selectedStat ||
			(selectedStat === 'ishda' && user.attendanceStatus === 'ishda') ||
			(selectedStat === 'tashqarida' && user.attendanceStatus === 'tashqarida') ||
			(selectedStat === 'kelmagan' && (user.attendanceStatus === 'kelmagan' || !['ishda', 'tashqarida'].includes(user.attendanceStatus)) && !commentMap[user._id]) ||
			(selectedStat === 'sababli' && !['ishda', 'tashqarida'].includes(user.attendanceStatus) && !!commentMap[user._id]) ||
			(selectedStat === 'kechikkan' && user.isLate)

		return matchesSearch && matchesDepartment && matchesStatus && matchesStat
	})

	// Mobile card ko'rinishi
	const renderMobileCards = () => {
		return (
			<div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
				{filteredUsers.map((user, index) => (
					<div
						key={user._id}
						className={`
							bg-white rounded-lg shadow-sm border p-3
							${!user.attendanceStatus || user.attendanceStatus === 'kelmagan'
								? 'border-red-200'
								: user.attendanceStatus === 'ishda'
									? 'border-green-200'
									: 'border-blue-200'
							}
						`}
					>
						{/* Card header - User info */}
						<div className="flex items-center justify-between mb-3">
							<button
								onClick={() => setHistoryUserId(user._id)}
								className="flex items-center space-x-3 text-left hover:opacity-75 transition-opacity"
								title={tx("To'liq tarixni ko'rish")}
							>
								<div className="flex-shrink-0 h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
									{user.photo ? (
										<img
											src={`${uploadUrl(user.photo)}`}
											alt={user.fullName}
											className="h-full w-full rounded-full object-cover"
											onError={(e) => {
												e.target.onerror = null
												e.target.parentElement.textContent = user.fullName?.charAt(0)?.toUpperCase()
											}}
										/>
									) : (
										user.fullName?.charAt(0)?.toUpperCase()
									)}
								</div>
								<div>
									<p className="font-medium text-gray-900 text-sm">{user.fullName}</p>
									<p className="text-xs text-gray-500">{user.position || '-'}</p>
								</div>
							</button>
							<div className="text-right">
								<div className="flex items-center justify-end space-x-1">
									<span className="text-xs text-gray-500">#{index + 1}</span>
									{user.isLate && (
										<span className="text-yellow-500" title={`${user.lateMinutes} daqiqa kechikkan`}>
											<FaClock size={12} />
										</span>
									)}
									{user.isStaleOpen && (
										<span className="text-red-500" title={tx("Diqqat: chiqish qayd etilmagan")}>
											<FiAlertTriangle size={12} />
										</span>
									)}
									{recentChangeIds.has(user._id) && (
										<span className="relative flex h-2 w-2" title={tx("Yangi holat o'zgarishi")}>
											<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
											<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
										</span>
									)}
								</div>
								{commentMap[user._id] && user.attendanceStatus === 'kelmagan' ? (
									<div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${typeColor(commentMap[user._id].type)}`}>
										<span>{typeLabel(commentMap[user._id].type)}</span>
									</div>
								) : (
									<div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(user.attendanceStatus)}`}>
										{getStatusIcon(user.attendanceStatus)}
										<span className="ml-1">
											{getStatusText(user.attendanceStatus)}
										</span>
									</div>
								)}
							</div>
						</div>

						{/* Card body - Details */}
						<div className="grid grid-cols-2 gap-3 text-xs">
							{/* Sinf */}
							<div className="col-span-2">
								<span className="text-gray-500">{tx("Sinf:")}</span>
								<p className="font-medium text-black mt-1">
									{user.sinf?.name || tx("Sinfsiz")}
								</p>
							</div>

							{/* Telefon */}
							<div className="col-span-2">
								<span className="text-gray-500">{tx("Telefon:")}</span>
								<p className="font-medium mt-1">
									{user.phone_personal || user.phone_work
										? `${user.phone_personal || ''}${user.phone_personal && user.phone_work ? ' / ' : ''}${user.phone_work || ''}`
										: '-'}
								</p>
							</div>

							{/* Dastlabki kirish vaqti */}
							<div className="col-span-2">
								<span className="text-gray-500">{tx("Dastlabki kirish:")}</span>
								<p className="font-medium text-black mt-1">{user.firstEntryTime}</p>
							</div>

							{/* Kirish vaqti */}
							<div>
								<span className="text-gray-500">{tx("Kirish vaqti:")}</span>
								<div className="flex items-center gap-1 mt-1">
									<span className="font-medium text-black">{user.entryTime}</span>
									{user.lastCheckInLocation && (
										<button
											onClick={() => openEvidenceModal(user, 'entry')}
											className="p-1 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors flex-shrink-0"
											title={tx("Mobil check-in dalili")}
										>
											<FaMobileAlt size={10} />
										</button>
									)}
									{(!user.lastCheckInTime || (user.lastCheckInTime && user.lastCheckOutTime)) && (
										<button
											onClick={() => openTimeModal(user, 'entry')}
											className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex-shrink-0"
											title={tx("Kirish vaqtini qo'shish/tahrirlash")}
										>
											<FaEdit size={10} />
										</button>
									)}
								</div>
							</div>

							{/* Chiqish vaqti */}
							<div>
								<span className="text-gray-500">{tx("Chiqish vaqti:")}</span>
								<div className="flex items-center gap-1 mt-1">
									<span className="font-medium text-black">{user.exitTime}</span>
									{user.lastCheckOutLocation && (
										<button
											onClick={() => openEvidenceModal(user, 'exit')}
											className="p-1 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors flex-shrink-0"
											title={tx("Mobil check-out dalili")}
										>
											<FaMobileAlt size={10} />
										</button>
									)}
									{user.lastCheckInTime && !user.lastCheckOutTime && (
										<button
											onClick={() => openTimeModal(user, 'exit')}
											className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex-shrink-0"
											title={tx("Chiqish vaqtini qo'shish")}
										>
											<FaEdit size={10} />
										</button>
									)}
								</div>
							</div>

							{/* Kechikish (agar mavjud bo'lsa) */}
							{user.isLate && (
								<div className="col-span-2">
									<span className="text-gray-500">{tx("Kechikish:")}</span>
									<p className="font-medium text-black mt-1">
										{tx("{{n}} daqiqa", { n: user.lateMinutes })}
									</p>
								</div>
							)}

							{/* Izoh */}
							<div className="col-span-2">
								<span className="text-gray-500">{tx("Izoh:")}</span>
								{commentMap[user._id] && user.attendanceStatus === 'kelmagan' ? (
									<p className="mt-1">
										<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(commentMap[user._id].type)}`}>
											{typeLabel(commentMap[user._id].type)}: {commentMap[user._id].comment}
										</span>
									</p>
								) : (
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<p className="font-medium text-black mt-1 break-words">{user.comment}</p>
									</div>
									{user.lastCheckInTime && !user.lastCheckOutTime && (
										<button
											onClick={() => openCommentModal(user)}
											className="ml-2 text-gray-400 hover:text-blue-500 flex-shrink-0 mt-1"
											title={tx("Komentariya qo'shish")}
										>
											<FaRegCommentDots size={14} />
										</button>
									)}
								</div>
								)}
							</div>
						</div>
					</div>
				))}
			</div>
		)
	}

	// Desktop table ko'rinishi
	const renderDesktopTable = () => {
		return (
			<div className="h-full flex flex-col overflow-hidden">
				{/* Bitta table ichida header va body */}
				<div className="flex-1 min-h-0 overflow-auto">
					<table className="w-full">
						{/* Sticky header */}
						<thead className="sticky top-0 z-20 bg-gray-50">
							<tr>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap w-[80px] sticky left-0 bg-gray-50 z-30">
									№
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[200px] sticky left-[80px] bg-gray-50 z-20">
									{tx("Xodim")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[150px]">
									{tx("Lavozim")}
								</th>

								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[150px]">
									{tx("Telefon")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">
									{tx("Dastlabki")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">
									{tx("Kirish")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">
									{tx("Chiqish")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[200px]">
									{tx("Izoh")}
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[120px]">
									{tx("Holat")}
								</th>
							</tr>
						</thead>

						{/* Body */}
						<tbody className="divide-y divide-gray-200 bg-white">
							{filteredUsers.map((user, index) => (
								<tr key={user._id} className={`
									hover:bg-opacity-90 group
									${!user.attendanceStatus || user.attendanceStatus === 'kelmagan'
										? 'bg-red-50 hover:bg-red-100'
										: user.attendanceStatus === 'ishda'
											? 'bg-green-50 hover:bg-green-100'
											: 'bg-blue-50 hover:bg-blue-100'
									}
								`}>
									{/* Sticky columns */}
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 sticky left-0 z-10 min-w-[80px] bg-inherit">
										<div className="flex items-center">
											{index + 1}
											{user.isLate && (
												<span className="ml-2 text-yellow-500" title={`${user.lateMinutes} daqiqa kechikkan`}>
													<FaClock className="inline" size={12} />
												</span>
											)}
											{user.isStaleOpen && (
												<span className="ml-2 text-red-500" title={tx("Diqqat: chiqish qayd etilmagan")}>
													<FiAlertTriangle className="inline" size={12} />
												</span>
											)}
											{recentChangeIds.has(user._id) && (
												<span className="ml-2 relative flex h-2 w-2" title={tx("Yangi holat o'zgarishi")}>
													<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
													<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
												</span>
											)}
										</div>
									</td>

									<td className="px-4 py-4 min-w-[200px] sticky left-[80px] z-10 bg-inherit">
										<button
											onClick={() => setHistoryUserId(user._id)}
											className="flex items-center text-left hover:opacity-75 transition-opacity"
											title={tx("To'liq tarixni ko'rish")}
										>
											<div className="flex-shrink-0 h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
												{user.photo ? (
													<img
														src={`${uploadUrl(user.photo)}`}
														alt={user.fullName}
														className="h-full w-full rounded-full object-cover"
														onError={(e) => {
															e.target.onerror = null
															e.target.parentElement.textContent = user.fullName?.charAt(0)?.toUpperCase()
														}}
													/>
												) : (
													user.fullName?.charAt(0)?.toUpperCase()
												)}
											</div>
											<div className="ml-3">
												<p className="text-sm font-medium text-gray-900">
													{user.fullName}
												</p>
												<p className="text-xs text-gray-500">{publicId(user.hodimID)}</p>
											</div>
										</button>
									</td>

									{/* Qolgan ustunlar */}
									<td className="px-4 py-4 text-sm text-gray-900 min-w-[150px]">
										{user.position || '-'}
									</td>

									<td className="px-4 py-4 text-sm text-gray-900 min-w-[150px]">
										{user.phone_personal || user.phone_work
											? `${user.phone_personal || ''}${user.phone_personal && user.phone_work ? ' (' : ''}${user.phone_work || ''}${user.phone_personal && user.phone_work ? ')' : ''}`
											: '-'}
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
										{user.firstEntryTime}
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
										<div className="flex items-center gap-2">
											{user.entryTime}
											{user.lastCheckInLocation && (
												<button
													onClick={() => openEvidenceModal(user, 'entry')}
													className="p-1 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
													title={tx("Mobil check-in dalili")}
												>
													<FaMobileAlt size={12} />
												</button>
											)}
											{(!user.lastCheckInTime || (user.lastCheckInTime && user.lastCheckOutTime)) && (
												<button
													onClick={() => openTimeModal(user, 'entry')}
													className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
													title={tx("Kirish vaqtini qo'shish/tahrirlash")}
												>
													<FaEdit size={12} />
												</button>
											)}
										</div>
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
										<div className="flex items-center gap-2">
											{user.exitTime}
											{user.lastCheckOutLocation && (
												<button
													onClick={() => openEvidenceModal(user, 'exit')}
													className="p-1 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors"
													title={tx("Mobil check-out dalili")}
												>
													<FaMobileAlt size={12} />
												</button>
											)}
											{user.lastCheckInTime && !user.lastCheckOutTime && (
												<button
													onClick={() => openTimeModal(user, 'exit')}
													className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
													title={tx("Chiqish vaqtini qo'shish")}
												>
													<FaEdit size={12} />
												</button>
											)}
										</div>
									</td>
									<td className="px-4 py-4 text-sm text-gray-900 whitespace-normal break-words min-w-[200px] max-w-xs">
										<div className="flex items-center gap-2">
											{commentMap[user._id] && user.attendanceStatus === 'kelmagan' ? (
												<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(commentMap[user._id].type)}`}>
													{typeLabel(commentMap[user._id].type)}: {commentMap[user._id].comment}
												</span>
											) : (
												<>
													<span className="flex-1">{user.comment}</span>
													{user.lastCheckInTime && !user.lastCheckOutTime && (
														<button
															onClick={() => openCommentModal(user)}
															className="ml-2 text-gray-400 hover:text-blue-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
															title={tx("Komentariya qo'shish")}
														>
															<FaRegCommentDots size={14} />
														</button>
													)}
												</>
											)}
										</div>
									</td>
									<td className="px-4 py-4 whitespace-nowrap min-w-[120px]">
										<div className="flex items-center">
											{commentMap[user._id] && user.attendanceStatus === 'kelmagan' ? (
											<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeColor(commentMap[user._id].type)}`}>
												{typeLabel(commentMap[user._id].type)}
											</span>
										) : (
											<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(user.attendanceStatus)}`}>
												{getStatusIcon(user.attendanceStatus)}
												<span className="ml-1.5">
													{getStatusText(user.attendanceStatus)}
												</span>
											</span>
										)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>

				{/* Table footer */}
				<div className="flex-shrink-0 bg-gray-50 px-6 py-3 border-t">
					<p className="text-sm text-gray-600">
						{tx("Jami: {{n}} ta xodim", { n: filteredUsers.length })}
					</p>
				</div>
			</div>
		)
	}

	const renderStatistics = () => {
		const toggle = (key) => () => selectedStat === key ? clearStatFilter() : setSelectedStat(key)
		return (
			<div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4">
				<KpiCard
					compact
					icon={<FaUserCheck size={14} />}
					label={tx("Ishda")}
					value={stats.ishda.count}
					total={stats.total}
					tone="good"
					active={selectedStat === 'ishda'}
					onClick={toggle('ishda')}
				/>
				<KpiCard
					compact
					icon={<FaUserSlash size={14} />}
					label={tx("Tashqarida")}
					value={stats.tashqarida.count}
					total={stats.total}
					tone="blue"
					active={selectedStat === 'tashqarida'}
					onClick={toggle('tashqarida')}
				/>
				<KpiCard
					compact
					icon={<FaClock size={14} />}
					label={tx("Kechikkan")}
					value={stats.kechikkan.count}
					total={stats.total}
					tone="warning"
					active={selectedStat === 'kechikkan'}
					onClick={toggle('kechikkan')}
				/>
				<KpiCard
					compact
					icon={<FaUserTimes size={14} />}
					label={tx("Kelmagan")}
					value={stats.kelmagan.count}
					total={stats.total}
					tone="critical"
					active={selectedStat === 'kelmagan'}
					onClick={toggle('kelmagan')}
				/>
				<KpiCard
					compact
					icon={<FaRegCommentDots size={14} />}
					label={tx("Sababli")}
					value={stats.sababli.count}
					total={stats.total}
					tone="blue"
					active={selectedStat === 'sababli'}
					onClick={toggle('sababli')}
				/>
			</div>
		)
	}

	useEffect(() => {
		const init = async () => {
			// workStartTimeRef fetchData() dan OLDIN tayyor bo'lishi kerak —
			// aks holda birinchi hisoblash standart 09:00 bilan ketib qoladi
			await fetchWorkStartTime()
			fetchCurrentUserId()
			fetchCommentMap()
		}
		init()
	}, [])

	// Sana o'zgarganda ro'yxatni qayta yuklash (birinchi render ham shu
	// orqali — mount'da alohida fetchData() chaqirish shart emas)
	useEffect(() => {
		fetchData()
	}, [selectedDate])

	// Real-vaqt monitoring: har AUTO_REFRESH_MS'da sokin (spinnersiz)
	// qayta yuklash — modal ochiq bo'lsa, foydalanuvchi o'chirgan bo'lsa,
	// yoki o'tgan kun ko'rilayotgan bo'lsa (tarixiy ma'lumot — jonli
	// so'rov qilishning ma'nosi yo'q) o'tkazib yuboriladi
	useEffect(() => {
		if (!autoRefreshEnabled || !isViewingToday) return
		const interval = setInterval(() => {
			if (modalOpenRef.current) return
			fetchData(true)
			fetchCommentMap()
		}, AUTO_REFRESH_MS)
		return () => clearInterval(interval)
	}, [autoRefreshEnabled, isViewingToday])

	const renderModeToggle = () => (
		<div className="flex-shrink-0 flex gap-2 px-2 sm:px-3 lg:px-4 pt-2 sm:pt-3 lg:pt-4">
			<button
				onClick={() => setViewMode('staff')}
				className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${viewMode === 'staff' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
			>
				<FaUsers size={14} />
				{tx("Xodimlar")}
			</button>
			<button
				onClick={() => setViewMode('student')}
				className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${viewMode === 'student' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'}`}
			>
				<FaUserGraduate size={14} />
				{tx("O'quvchilar")}
			</button>
		</div>
	)

	if (viewMode === 'student') {
		return (
			<div className="h-full flex flex-col w-full max-w-full overflow-hidden bg-gray-50">
				{renderModeToggle()}
				<div className="flex-1 min-h-0 flex flex-col">
					<StudentEntryExit />
				</div>
			</div>
		)
	}

	return (
		<div className="h-full flex flex-col w-full max-w-full overflow-hidden bg-gray-50">
			{renderModeToggle()}

			{/* Statistics section */}
			{renderStatistics()}

			{/* Filters and table section - Takes remaining space */}
			<div className="flex-1 min-h-0 flex flex-col">
				{/* Filters section */}
				<div className="flex-shrink-0 bg-white p-3 sm:p-4 shadow-sm">
					<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap">
						{/* Qidiruv maydoni */}
						<div className="flex-1 min-w-[200px]">
							<div className="relative max-w-md w-full">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
									<FiSearch size={16} />
								</div>
								<input
									type="text"
									placeholder={tx("Xodimlarni qidirish...")}
									className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black bg-gray-50"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
								/>
							</div>
						</div>

						{/* Filterlar guruhi */}
						<div className="flex flex-wrap gap-2 sm:gap-3 justify-end">
							{/* Sana tanlagich — standart bugun, istalgan o'tgan kunni
								tanlab, o'sha kunning holatini ko'rish mumkin */}
							<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
								<FiCalendar className="text-gray-400 flex-shrink-0" size={13} />
								<input
									type="date"
									max={getTashkentDateString()}
									value={selectedDate}
									onChange={(e) => setSelectedDate(e.target.value)}
									className="bg-transparent text-gray-700 border-none focus:outline-none focus:ring-0 text-sm"
								/>
							</div>

							{/* Sinf filteri */}
							<SearchableSelect className="min-w-[150px] max-w-[200px]" searchPlaceholder={tx("Sinf qidirish...")} value={selectedDepartment} onChange={setSelectedDepartment} options={[{ value: 'all', label: 'Barcha sinflar' }, ...sinfs.map(dept => ({ value: dept._id, label: dept.name })), { value: 'no-dept', label: 'Sinfsiz' }]} />

							{/* Holat filteri */}
							<SearchableSelect className="min-w-[120px] max-w-[160px]" value={selectedStatus} onChange={setSelectedStatus} options={[{ value: 'all', label: 'Barcha holat' }, { value: 'ishda', label: 'Ishda' }, { value: 'kelmagan', label: 'Kelmagan' }, { value: 'tashqarida', label: 'Tashqarida' }]} />

								{/* Avto-yangilanish holati — o'tgan kun ko'rilayotganda
									butunlay statik "Tarixiy ma'lumot" belgisiga almashadi
									(jonli poll qilishning ma'nosi yo'q) */}
								<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
									{!isViewingToday ? (
										<span className="flex items-center gap-1.5 text-xs font-medium text-gray-500" title={tx("O'tgan kun uchun avto-yangilanish ishlamaydi")}>
											<FiClock size={13} />
											<span className="whitespace-nowrap">{tx("Tarixiy ma'lumot")}</span>
										</span>
									) : (
										<button
											onClick={() => setAutoRefreshEnabled(prev => !prev)}
											className={`flex items-center gap-1.5 text-xs font-medium transition-colors duration-200 ${
												autoRefreshEnabled ? 'text-blue-600' : 'text-gray-400'
											}`}
											title={autoRefreshEnabled ? tx("Avto-yangilanishni to'xtatish") : tx("Avto-yangilanishni yoqish")}
										>
											{autoRefreshEnabled ? <FiPause size={13} /> : <FiPlay size={13} />}
											{autoRefreshEnabled && (
												<span className="relative flex h-1.5 w-1.5">
													<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
													<span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
												</span>
											)}
											<span className="hidden sm:inline whitespace-nowrap">
												{autoRefreshEnabled
													? (lastUpdated ? `Jonli (${formatUzTime(lastUpdated)})` : tx("Jonli"))
													: tx("To'xtatilgan")}
											</span>
										</button>
									)}
								</div>

								{/* Yangilash tugmasi */}
								<button
									onClick={() => {
										setRefreshing(true)
										fetchData()
									}}
									disabled={refreshing}
									className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors duration-200 font-medium min-w-[120px] max-w-[150px]"
									title={tx("Yangilash")}
								>
									{refreshing ? (
										<PulseLoader size={6} color="white" />
									) : (
										<>
											<FiRefreshCw size={16} />
											<span className="truncate">{tx("Yangilash")}</span>
										</>
									)}
								</button>
						</div>
					</div>
				</div>


				{/* Content container - Takes remaining space */}
				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					{loading ? (
						<div className="flex justify-center items-center h-full py-8">
							<PulseLoader color="#6366F1" size={16} />
						</div>
					) : filteredUsers.length === 0 ? (
						<div className="text-center py-12 h-full flex items-center justify-center">
							<div className="px-6">
								<div className="mx-auto h-24 w-24 text-gray-400 mb-4">
									<FaUserTimes className="w-full h-full" />
								</div>
								<h3 className="text-lg font-medium text-gray-900">{tx("Xodimlar topilmadi")}</h3>
								<p className="text-base text-gray-500 mt-2">
									{searchTerm ? tx("Qidiruv bo'yicha xodim topilmadi") : tx("Tizimda xodimlar mavjud emas")}
								</p>
							</div>
						</div>
					) : (
						<>
							{/* Mobile view - Cards */}
							{isMobile ? (
								renderMobileCards()
							) : (
								/* Desktop view - Table */
								renderDesktopTable()
							)}
						</>
					)}
				</div>
			</div>

			{/* Kommentariya Modali */}
			{commentModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="fixed inset-0 backdrop-blur-sm bg-opacity-30" onClick={() => setCommentModalOpen(false)}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto z-10">
						<div className="p-6">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-lg font-bold text-gray-800">
									{tx("{{name}} uchun izoh", { name: selectedUser?.fullName })}
								</h3>
								<button
									onClick={() => setCommentModalOpen(false)}
									className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
								>
									<FiX size={20} />
								</button>
							</div>
							<textarea
								className="w-full p-3 border border-gray-300 text-black rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
								rows={4}
								value={commentText}
								onChange={(e) => setCommentText(e.target.value)}
								placeholder={tx("Komentariya yozing...")}
							/>
							<div className="flex justify-end gap-3">
								<button
									className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors duration-200"
									onClick={() => setCommentModalOpen(false)}
								>
									{tx("Bekor qilish")}
								</button>
								<button
									className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200"
									onClick={handleCommentSubmit}
									disabled={submitting}
								>
									{submitting ? tx("Saqlanmoqda...") : tx("Saqlash")}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Xodimni Kiritish/Chiqarish Modali */}
			{timeModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="fixed inset-0 backdrop-blur-sm bg-opacity-30" onClick={() => setTimeModalOpen(false)}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto z-10">
						<div className="p-6">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-lg font-bold text-gray-800">
									{tx("{{name}} uchun {{type}}", { name: selectedUser?.fullName, type: modalType === "entry" ? tx("Kirish") : tx("Chiqish") })}
								</h3>
								<button
									onClick={() => setTimeModalOpen(false)}
									className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
								>
									<FiX size={20} />
								</button>
							</div>

							<div className="mb-6 text-sm text-gray-700 bg-blue-50 p-4 rounded-lg">
								{tx("Ushbu amalni tasdiqlashni xohlaysizmi?")}
								<br />
								<strong>{selectedUser?.fullName}</strong> - {tx("{{type}} vaqti qayd etiladi.", { type: modalType === "entry" ? tx("kirish") : tx("chiqish") })}
							</div>

							<div className="flex justify-end gap-3">
								<button
									className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors duration-200"
									onClick={() => setTimeModalOpen(false)}
								>
									{tx("Bekor qilish")}
								</button>
								<button
									className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200"
									onClick={handleTimeSubmit}
									disabled={submitting}
								>
									{submitting ? tx("Saqlanmoqda...") : (modalType === "entry" ? tx("Xodimni kiritish") : tx("Xodimni chiqarish"))}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Mobil check-in/out dalili modali */}
			{evidenceModalOpen && evidenceData && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="fixed inset-0 backdrop-blur-sm bg-opacity-30" onClick={() => setEvidenceModalOpen(false)}></div>
					<div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto z-10">
						<div className="p-6">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-lg font-bold text-gray-800">
									{tx("{{name}} — {{type}} dalili", { name: evidenceData.user?.fullName, type: evidenceData.type === 'entry' ? tx("Kirish") : tx("Chiqish") })}
								</h3>
								<button
									onClick={() => setEvidenceModalOpen(false)}
									className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
								>
									<FiX size={20} />
								</button>
							</div>

							{evidenceData.photo ? (
								<img
									src={`${uploadUrl(evidenceData.photo)}`}
									alt={tx("Selfie")}
									className="w-full h-56 object-cover rounded-lg mb-4 bg-gray-100"
								/>
							) : (
								<div className="w-full h-56 flex items-center justify-center rounded-lg mb-4 bg-gray-100 text-gray-400 text-sm">
									{tx("Surat mavjud emas")}
								</div>
							)}

							<div className="space-y-2 text-sm">
								<div className="flex justify-between">
									<span className="text-gray-500">{tx("Ishonch darajasi:")}</span>
									<span className="font-medium text-black">
										{evidenceData.confidence != null ? `${Math.round(evidenceData.confidence)}%` : '-'}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-gray-500">{tx("Joylashuv:")}</span>
									{evidenceData.location?.lat != null && evidenceData.location?.lng != null ? (
										<a
											href={`https://www.google.com/maps?q=${evidenceData.location.lat},${evidenceData.location.lng}`}
											target="_blank"
											rel="noopener noreferrer"
											className="font-medium text-blue-600 hover:underline"
										>
											{tx("Xaritada ko'rish")}
										</a>
									) : (
										<span className="font-medium text-black">-</span>
									)}
								</div>
							</div>

							<div className="flex justify-end mt-6">
								<button
									className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors duration-200"
									onClick={() => setEvidenceModalOpen(false)}
								>
									{tx("Yopish")}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Xodim bo'yicha to'liq tarix */}
			{historyUserId && (
				<UserAttendanceModal
					userId={historyUserId}
					onClose={() => setHistoryUserId(null)}
				/>
			)}
		</div>
	)
}

export default AdminEntryExit
