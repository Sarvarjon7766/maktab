import axios from 'axios'
import AutoSelect from '../../components/AutoSelect'
import { useEffect, useRef, useState } from 'react'
import { FaClock, FaFilter, FaRegCommentDots, FaUserCheck, FaUserSlash, FaUserTimes, FaUserGraduate } from 'react-icons/fa'
import { FiRefreshCw, FiSearch, FiX } from 'react-icons/fi'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import StudentEntryExit from '../admin/StudentEntryExit'
import KpiCard from '../../components/KpiCard'
import PersonLink from '../../components/PersonLink'
import { typeColor, typeLabel } from '../../components/GlobalCommentModal'
import SearchableSelect from '../../components/SearchableSelect'
import { getTashkentDateString } from '../../utils/formatDate'

const BASE_URL = import.meta.env.VITE_BASE_URL

const UserStaffAttendance = () => {
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }
	// ref (state emas) — sync yangilanadi, birinchi fetchData() eski qiymatni emas darhol to'g'risini ishlatsin uchun
	const workStartTimeRef = useRef('09:00')
	const [users, setUsers] = useState([])
	const [departments, setDepartments] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedDepartment, setSelectedDepartment] = useState('all')
	const [selectedStatus, setSelectedStatus] = useState('all')
	const [selectedStat, setSelectedStat] = useState(null)
	const [commentModalOpen, setCommentModalOpen] = useState(false)
	const [selectedUser, setSelectedUser] = useState(null)
	const [commentText, setCommentText] = useState('')
	const [submitting, setSubmitting] = useState(false)
	const [currentUserId, setCurrentUserId] = useState(null)
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
	const [commentMap, setCommentMap] = useState({})

	// Ekran o'lchamini kuzatish
	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768)
		}

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

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

	// Foydalanuvchi ID sini olish
	const fetchCurrentUserId = async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getuserId`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data?.success) {
				setCurrentUserId(res.data.userId)
			}
		} catch {
			toast.error("Foydalanuvchi ID sini olishda xato")
		}
	}

	// avval 09:00 kodga qattiq yozilgan edi, Sozlamalar bilan mos kelmasdi
	const isLate = (checkInTime) => {
		if (!checkInTime) return false

		const localDate = new Date(checkInTime)
		const localHours = localDate.getHours()
		const localMinutes = localDate.getMinutes()

		const [workStartHour, workStartMinutes] = workStartTimeRef.current.split(':').map(Number)

		const totalLocalMinutes = localHours * 60 + localMinutes
		const totalWorkStartMinutes = workStartHour * 60 + workStartMinutes

		const lateMinutes = totalLocalMinutes - totalWorkStartMinutes
		return lateMinutes > 5 ? lateMinutes : false
	}

	const formatTime = (isoString) => {
		if (!isoString) return '-'
		const date = new Date(isoString)

		const hours = date.getHours().toString().padStart(2, '0')
		const minutes = date.getMinutes().toString().padStart(2, '0')

		return `${hours}:${minutes}`
	}

	// avval isLate() bilan boshqa (zid) usulda hisoblanardi
	const calculateLateMinutes = (checkInTime) => {
		const result = isLate(checkInTime)
		return result || 0
	}

	// Global kommentlarni yuklash
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

	// Ma'lumotlarni yuklash
	const fetchData = async () => {
		try {
			setLoading(true)
			const [usersRes, deptRes] = await Promise.all([
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, {
					headers: { Authorization: `Bearer ${token}` },
				})
			])

			if (!usersRes?.data?.success || !deptRes?.data?.success) {
				throw new Error("API dan noto'g'ri javob qaytdi")
			}

			const processedUsers = usersRes.data.users.map(user => {
				const status = user.attendanceStatus || 'kelmagan'
				const isUserLate = isLate(user.firstCheckInTime)

				return {
					...user,
					attendanceStatus: status,
					firstEntryTime: formatTime(user.firstCheckInTime),
					entryTime: formatTime(user.lastCheckInTime),
					exitTime: formatTime(user.lastCheckOutTime),
					comment: user.lastComment || '-',
					isLate: isUserLate,
					lateMinutes: isUserLate ? calculateLateMinutes(user.firstCheckInTime) : 0
				}
			})

			processedUsers.sort((a, b) => (a.lavel || 0) - (b.lavel || 0))

			setUsers(processedUsers)
			setDepartments(deptRes.data.sinfs)
		} catch {
			toast.error("Ma'lumotlarni yuklashda xato")
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}

	// Statistikani hisoblash
	const calculateStats = () => {
		const totalUsers = users.length

		const ishdaCount = users.filter(u => u.attendanceStatus === 'ishda').length
		const tashqaridaCount = users.filter(u => u.attendanceStatus === 'tashqarida').length
		const kelmaganCount = users.filter(u => u.attendanceStatus === 'kelmagan' || !['ishda', 'tashqarida'].includes(u.attendanceStatus)).length
		const kechikkanCount = users.filter(u => u.isLate).length

		return {
			total: totalUsers,
			ishda: { count: ishdaCount },
			tashqarida: { count: tashqaridaCount },
			kelmagan: { count: kelmaganCount },
			kechikkan: { count: kechikkanCount }
		}
	}

	const stats = calculateStats()

	// Status uchun ikonkalar
	const getStatusIcon = (status) => {
		switch (status) {
			case 'ishda': return <FaUserCheck className="text-emerald-500" />
			case 'kelmagan': return <FaUserTimes className="text-rose-500" />
			case 'tashqarida': return <FaUserSlash className="text-blue-500" />
			default: return <FaUserTimes className="text-rose-500" />
		}
	}

	// Status ranglari
	const getStatusColor = (status) => {
		switch (status) {
			case 'ishda': return 'bg-emerald-100 text-emerald-800'
			case 'kelmagan': return 'bg-rose-100 text-rose-800'
			case 'tashqarida': return 'bg-blue-100 text-blue-800'
			default: return 'bg-rose-100 text-rose-800'
		}
	}

	// Status matnlari
	const getStatusText = (status) => {
		switch (status) {
			case 'ishda': return 'Ishda'
			case 'kelmagan': return 'Kelmadi'
			case 'tashqarida': return 'Tashqarida'
			default: return 'Kelmadi'
		}
	}

	// Kommentariya modalini ochish
	const openCommentModal = (user) => {
		if (currentUserId && user._id === currentUserId && user.attendanceStatus === 'ishda') {
			setSelectedUser(user)
			setCommentText(user.comment || '')
			setCommentModalOpen(true)
		}
	}

	// Kommentariyani yuborish
	const handleCommentSubmit = async () => {
		if (!selectedUser?.lastLogId) {
			toast.error("Foydalanuvchi tanlanmagan yoki log ID mavjud emas")
			return
		}
		if (submitting) return
		setSubmitting(true)

		try {
			const res = await axios.put(
				`${import.meta.env.VITE_BASE_URL}/api/user/comment/${selectedUser.lastLogId}`,
				{ comment: commentText },
				{ headers: { Authorization: `Bearer ${token}` } }
			)

			if (res.data?.success) {
				toast.success("Komentariya saqlandi!")
				fetchData()
				setCommentModalOpen(false)
			} else {
				throw new Error("Noto'g'ri javob formati")
			}
		} catch (error) {
			toast.error(error.response?.data?.message || "Komentariyani saqlashda xatolik")
		} finally {
			setSubmitting(false)
		}
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
			(selectedStat === 'kelmagan' && (user.attendanceStatus === 'kelmagan' || !['ishda', 'tashqarida'].includes(user.attendanceStatus))) ||
			(selectedStat === 'kechikkan' && user.isLate)

		return matchesSearch && matchesDepartment && matchesStatus && matchesStat
	})

	// Statistik filterlarni tozalash
	const clearStatFilter = () => {
		setSelectedStat(null)
	}

	useEffect(() => {
		const init = async () => {
			// workStartTimeRef fetchData()dan OLDIN tayyor bo'lishi kerak, aks holda 09:00 standart ishlatiladi
			await fetchWorkStartTime()
			fetchCurrentUserId()
			fetchData()
			fetchCommentMap()
		}
		init()
	}, [])

	// Mobil card ko'rinishi - TO'G'RILANGAN VERSIYA
	const renderMobileCards = () => {
		return (
			<div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">

				{filteredUsers.map((user, index) => (
					<div
						key={user._id}
						className="bg-white rounded-lg shadow-sm border border-gray-200 p-3"
					>
						{/* Card header - User info */}
						<div className="flex items-center justify-between mb-3">
							<PersonLink kind="staff" id={user._id} className="flex items-center space-x-3">
								<div className="flex-shrink-0 h-12 w-12 rounded-full bg-[var(--org-primary)]/10 flex items-center justify-center text-[var(--org-primary)] font-bold">
									{user.photo ? (
										<img
											src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`}
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
									<p className="text-xs text-gray-500 line-clamp-2" title={user.position || ''}>{user.position || '-'}</p>
								</div>
							</PersonLink>
							<div className="text-right">
								<div className="flex items-center justify-end space-x-1">
									<span className="text-xs text-gray-500">#{index + 1}</span>
									{user.isLate && (
										<span className="text-yellow-500" title={`${user.lateMinutes} daqiqa kechikkan`}>
											<FaClock size={12} />
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
							{/* Telefon */}
							<div className="col-span-2">
								<span className="text-gray-500">Telefon:</span>
								<p className="font-medium mt-1">
									{user.phone_personal || user.phone_work
										? `${user.phone_personal || ''}${user.phone_personal && user.phone_work ? ' / ' : ''}${user.phone_work || ''}`
										: '-'}
								</p>
							</div>

							{/* Dastlabki kirish vaqti */}
							<div>
								<span className="text-gray-500">Dastlabki kirish:</span>
								<p className="font-medium text-black mt-1">{user.firstEntryTime}</p>
							</div>

							{/* Kirish vaqti */}
							<div>
								<span className="text-gray-500">Kirish vaqti:</span>
								<p className="font-medium text-black mt-1">{user.entryTime}</p>
							</div>

							{/* Chiqish vaqti */}
							<div>
								<span className="text-gray-500">Chiqish vaqti:</span>
								<p className="font-medium text-black mt-1">{user.exitTime}</p>
							</div>

							{/* Kechikish (agar mavjud bo'lsa) */}
							{user.isLate && (
								<div className="col-span-2">
									<span className="text-gray-500">Kechikish:</span>
									<p className="font-medium text-black mt-1">
										{user.lateMinutes} daqiqa
									</p>
								</div>
							)}

							{/* Izoh */}
							<div className="col-span-2">
								<span className="text-gray-500">Izoh:</span>
								{commentMap[user._id] && user.attendanceStatus === 'kelmagan' ? (
									<p className="mt-1">
										<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(commentMap[user._id].type)}`}>
											{typeLabel(commentMap[user._id].type)}: {commentMap[user._id].comment}
										</span>
									</p>
								) : (
									<div className="flex items-start justify-between">
										<p className="font-medium text-black mt-1 break-words flex-1">{user.comment}</p>
										{currentUserId && user._id === currentUserId && user.attendanceStatus === 'ishda' && (
											<button
												onClick={() => openCommentModal(user)}
												className="ml-2 text-gray-400 hover:text-[var(--org-primary)] flex-shrink-0 mt-1"
												title="Komentariya qo'shish"
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

	// Desktop table ko'rinishi - TO'G'RILANGAN VERSIYA
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
									Xodim
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[150px]">
									Lavozim
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[150px]">
									Telefon
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[110px]">
									Dastlabki kirish
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">
									Kirish
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">
									Chiqish
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[200px]">
									Izoh
								</th>
								<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[120px]">
									Holat
								</th>
							</tr>
						</thead>

						{/* Body */}
						<tbody className="divide-y divide-gray-200 bg-white">
							{filteredUsers.map((user, index) => (
								<tr key={user._id} className="hover:bg-gray-50 group bg-white transition-colors">
									{/* Sticky columns */}
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 sticky left-0 z-10 min-w-[80px] bg-inherit">
										<div className="flex items-center">
											{index + 1}
											{user.isLate && (
												<span className="ml-2 text-yellow-500" title={`${user.lateMinutes} daqiqa kechikkan`}>
													<FaClock className="inline" size={12} />
												</span>
											)}
										</div>
									</td>

									<td className="px-4 py-4 min-w-[200px] sticky left-[80px] z-10 bg-inherit">
										<PersonLink kind="staff" id={user._id} className="flex items-center">
											<div className="flex-shrink-0 h-16 w-16 rounded-full bg-[var(--org-primary)]/10 flex items-center justify-center text-[var(--org-primary)] font-bold">
												{user.photo ? (
													<img
														src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`}
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
											</div>
										</PersonLink>
									</td>

									{/* Qolgan ustunlar */}
									<td className="px-4 py-4 text-sm text-gray-900 min-w-[150px] max-w-[220px]">
										<p className="line-clamp-2" title={user.position || ''}>{user.position || '-'}</p>
									</td>
									<td className="px-4 py-4 text-sm text-gray-900 min-w-[150px]">
										{user.phone_personal || user.phone_work
											? `${user.phone_personal || ''}${user.phone_personal && user.phone_work ? ' (' : ''}${user.phone_work || ''}${user.phone_personal && user.phone_work ? ')' : ''}`
											: '-'}
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[110px]">
										{user.firstEntryTime}
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
										{user.entryTime}
									</td>
									<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
										{user.exitTime}
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
													{currentUserId && user._id === currentUserId && user.attendanceStatus === 'ishda' && (
														<button
															onClick={() => openCommentModal(user)}
															className="ml-2 text-gray-400 hover:text-[var(--org-primary)] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
															title="Komentariya qo'shish"
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
						Jami: {filteredUsers.length} ta xodim
					</p>
				</div>
			</div>
		)
	}

	const renderStatistics = () => {
		const toggle = (key) => () => selectedStat === key ? clearStatFilter() : setSelectedStat(key)
		return (
			<div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4">
				<KpiCard
					compact
					icon={<FaUserCheck size={14} />}
					label="Ishda"
					value={stats.ishda.count}
					total={stats.total}
					tone="good"
					active={selectedStat === 'ishda'}
					onClick={toggle('ishda')}
				/>
				<KpiCard
					compact
					icon={<FaUserSlash size={14} />}
					label="Tashqarida"
					value={stats.tashqarida.count}
					total={stats.total}
					tone="blue"
					active={selectedStat === 'tashqarida'}
					onClick={toggle('tashqarida')}
				/>
				<KpiCard
					compact
					icon={<FaClock size={14} />}
					label="Kechikkan"
					value={stats.kechikkan.count}
					total={stats.total}
					tone="warning"
					active={selectedStat === 'kechikkan'}
					onClick={toggle('kechikkan')}
				/>
				<KpiCard
					compact
					icon={<FaUserTimes size={14} />}
					label="Kelmagan"
					value={stats.kelmagan.count}
					total={stats.total}
					tone="critical"
					active={selectedStat === 'kelmagan'}
					onClick={toggle('kelmagan')}
				/>
			</div>
		)
	}

	return (
		<div className="h-full flex flex-col w-full max-w-full overflow-hidden">
			<div className="flex-1 flex flex-col min-h-0 bg-gray-50 w-full max-w-full">
				{/* Statistics section */}
				{renderStatistics()}

				{/* Filters and table section - Takes remaining space */}
				<div className="flex-1 min-h-0 flex flex-col">
					{/* Filters section */}
					<div className="flex-shrink-0 bg-white px-2 sm:px-3 lg:px-4 pb-2 sm:pb-3">
						<div className="bg-white rounded-lg border p-2.5 sm:p-3 border-gray-200">
							<div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
								{/* 🔍 Qidiruv maydoni */}
								<div className="flex-1">
									<div className="relative max-w-md">
										<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
											<FiSearch size={16} />
										</div>
										<input
											type="text"
											placeholder="Xodimlarni qidirish..."
											className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--org-primary)] focus:border-transparent text-sm text-black"
											value={searchTerm}
											onChange={(e) => setSearchTerm(e.target.value)}
										/>
									</div>
								</div>

								{/* 🧩 Filterlar guruhi */}
								<div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
									{/* 🏢 Bo'lim filteri */}
									<div className="flex-1 sm:flex-none">
										<div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-lg border h-full min-w-[130px] max-w-[220px] border-gray-200">
											<div className="flex-1 min-w-0">
												<SearchableSelect
													icon={<FaFilter className="text-gray-500 flex-shrink-0" size={14} />}
													value={selectedDepartment}
													onChange={setSelectedDepartment}
													options={[
														{ value: 'all', label: "Barcha sinflar" },
														...departments.map(dept => ({ value: dept._id, label: dept.name })),
														{ value: 'no-dept', label: "Sinfsiz" },
													]}
													searchPlaceholder="Sinf qidirish..."
													triggerClassName="w-full flex items-center gap-2 px-1 py-1 text-sm text-left"
												/>
											</div>
											{selectedDepartment !== 'all' && (
												<button
													type="button"
													onClick={() => setSelectedDepartment('all')}
													className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-200 rounded-md transition-colors"
													title="Sinf filtrini tozalash"
												>
													<FiX size={14} />
												</button>
											)}
										</div>
									</div>

									{/* ⚙️ Holat filteri */}
									<div className="flex-1 sm:flex-none">
										<div className="flex items-center gap-1 bg-gray-100 px-3 py-2 rounded-lg border h-full min-w-[130px] max-w-[190px] border-gray-200">
											<FaFilter className="text-gray-500 flex-shrink-0" size={14} />
											<AutoSelect
												className="bg-transparent text-gray-800 border-none focus:outline-none focus:ring-0 text-sm w-full truncate"
												value={selectedStatus}
												onChange={(e) => setSelectedStatus(e.target.value)}
											>
												<option value="all">Barcha holat</option>
												<option value="ishda">Ishda</option>
												<option value="kelmagan">Kelmagan</option>
												<option value="tashqarida">Tashqarida</option>
											</AutoSelect>
											{selectedStatus !== 'all' && (
												<button
													type="button"
													onClick={() => setSelectedStatus('all')}
													className="shrink-0 p-1 text-gray-400 hover:text-red-500 rounded-md transition-colors"
													title="Holat filtrini tozalash"
												>
													<FiX size={14} />
												</button>
											)}
										</div>
									</div>

									{/* 🔄 Yangilash tugmasi */}
									<div className="flex-1 sm:flex-none">
										<button
											onClick={() => {
												setRefreshing(true)
												fetchData()
											}}
											disabled={refreshing}
											className="bg-[var(--org-primary)] hover:brightness-110 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm w-full h-full transition-colors duration-200 font-medium"
											title="Maʼlumotlarni yangilash"
										>
											{refreshing ? (
												<PulseLoader size={6} color="white" />
											) : (
												<>
													<FiRefreshCw size={16} />
													<span>Yangilash</span>
												</>
											)}
										</button>
									</div>
								</div>
							</div>
						</div>

					</div>

					{/* Content container - Takes remaining space */}
					<div className="flex-1 min-h-0 flex flex-col overflow-hidden mx-2 sm:mx-3 lg:mx-4 mb-2 sm:mb-3 bg-white rounded-xl border border-gray-100 shadow-sm">
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
									<h3 className="text-lg font-medium text-gray-900">Xodimlar topilmadi</h3>
									<p className="text-base text-gray-500 mt-2">
										{searchTerm ? "Qidiruv bo'yicha xodim topilmadi" : "Tizimda xodimlar mavjud emas"}
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
						<div className="fixed inset-0 backdrop-blur-sm  bg-opacity-30 animate-fade-in" onClick={() => setCommentModalOpen(false)}></div>
						<div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-auto z-10 animate-slide-up">
							<div className="p-6">
								<div className="flex justify-between items-center mb-4">
									<h3 className="text-lg font-bold text-gray-800">
										Chiqish sababi
									</h3>
									<button
										onClick={() => setCommentModalOpen(false)}
										className="text-gray-500 hover:text-gray-700 transition-colors duration-200"
									>
										<FiX size={20} />
									</button>
								</div>
								<textarea
									className="w-full p-3 border border-gray-300 text-black rounded-lg mb-4 focus:ring-2 focus:ring-[var(--org-primary)] focus:border-transparent text-sm resize-none"
									rows={4}
									value={commentText}
									onChange={(e) => setCommentText(e.target.value)}
									placeholder="Komentariya yozing..."
								/>
								<div className="flex justify-end gap-3">
									<button
										className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors duration-200"
										onClick={() => setCommentModalOpen(false)}
									>
										Bekor qilish
									</button>
									<button
										className="px-4 py-2 bg-[var(--org-primary)] text-white rounded-lg hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200"
										onClick={handleCommentSubmit}
										disabled={submitting}
									>
										{submitting ? "Saqlanmoqda..." : "Saqlash"}
									</button>
								</div>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// Sinf rahbari bo'lgan xodim uchun: o'z kirish-chiqishi va o'z sinfi o'quvchilari kirish-chiqishi (faqat o'qish)
const UserAttendance = () => {
	const [mode, setMode] = useState('staff')
	const [isHead, setIsHead] = useState(false)
	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/viewer-stats/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(res => setIsHead(!!res.data?.classes?.length))
			.catch(() => setIsHead(false))
	}, [])
	if (!isHead) return <UserStaffAttendance />
	const tab = (key, label, Icon) => (
		<button
			key={key}
			onClick={() => setMode(key)}
			className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${mode === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
		>
			<Icon size={14} />
			{label}
		</button>
	)
	return (
		<div className="h-full flex flex-col w-full max-w-full overflow-hidden bg-gray-50">
			<div className="flex gap-2 px-3 lg:px-4 pt-3 pb-1 shrink-0">
				{tab('staff', 'Mening kirish-chiqishim', FaUserCheck)}
				{tab('student', "Sinfim o'quvchilari", FaUserGraduate)}
			</div>
			<div className="flex-1 min-h-0 flex flex-col">
				{mode === 'student' ? <StudentEntryExit /> : <UserStaffAttendance />}
			</div>
		</div>
	)
}

export default UserAttendance
