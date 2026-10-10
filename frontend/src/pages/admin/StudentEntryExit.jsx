import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import {
	FaClock,
	FaEdit,
	FaFilter,
	FaRegCommentDots,
	FaUserCheck,
	FaUserGraduate,
	FaUserSlash,
	FaUserTimes
} from 'react-icons/fa'
import {
	FiRefreshCw,
	FiSearch,
	FiX
} from 'react-icons/fi'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import KpiCard from '../../components/KpiCard'
import { getTashkentHourMinute, formatUzTime } from '../../utils/formatDate'
import { MANUAL_ENTRY_CHECKPOINT_ID } from '../../utils/constants'
import { ListPager, usePaged } from '../../components/ListPager'

const BASE_URL = import.meta.env.VITE_BASE_URL

// AdminEntryExit.jsx'ning o'quvchi versiyasi — ATAYLAB ALOHIDA komponent
// (umumiy render funksiyalari emas), chunki maydonlar to'plami farq qiladi
// (username/JSHR/telefon yo'q, Sinf/ota-ona bor) va mobil check-in dalili
// o'quvchida umuman mavjud emas. Ikkala rol daraxtida ham (AdminEntryExit,
// AdminUserEntryExit) shu bitta komponent ishlatiladi.
//
// `fixedSinfId` — SinfDetail.jsx'dan (biror sinfni bosib kirilganda)
// ishlatiladi: shu sinfga "qulflab" qo'yadi, sinf filtri dropdown'ini
// yashiradi (chunki allaqachon bitta sinf konteksti)
const StudentEntryExit = ({ fixedSinfId }) => {
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }
	const workStartTimeRef = useRef('09:00')
	const requestSeqRef = useRef(0)

	const [students, setStudents] = useState([])
	const [sinfs, setSinfs] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedSinf, setSelectedSinf] = useState(fixedSinfId || 'all')
	const [selectedStatus, setSelectedStatus] = useState('all')
	const [selectedStat, setSelectedStat] = useState(null)
	const [commentModalOpen, setCommentModalOpen] = useState(false)
	const [timeModalOpen, setTimeModalOpen] = useState(false)
	const [submitting, setSubmitting] = useState(false)
	const [modalType, setModalType] = useState('')
	const [selectedStudent, setSelectedStudent] = useState(null)
	const [commentText, setCommentText] = useState('')
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

	useEffect(() => {
		const handleResize = () => setIsMobile(window.innerWidth < 768)
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

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

	const fetchWorkStartTime = async () => {
		try {
			const res = await axios.get(`${BASE_URL}/api/settings`, { headers })
			if (res.data?.success && res.data.settings?.workStartTime) {
				workStartTimeRef.current = res.data.settings.workStartTime
			}
		} catch { /* standart 09:00 bilan davom etadi */ }
	}

	const fetchSinfs = async () => {
		try {
			const res = await axios.get(`${BASE_URL}/api/sinf/getAll`, { headers })
			if (res.data.success) setSinfs(res.data.sinfs)
		} catch { /* sinf filtri shunchaki bo'sh qoladi */ }
	}

	const fetchData = async () => {
		const seq = ++requestSeqRef.current
		try {
			setLoading(true)
			const res = await axios.get(`${BASE_URL}/api/student/entry-exit`, { headers })
			if (seq !== requestSeqRef.current) return

			if (res.data.success) {
				const processed = res.data.students.map(student => {
					const late = isLate(student.firstCheckInTime)
					return {
						...student,
						attendanceStatus: student.attendanceStatus || 'kelmagan',
						firstEntryTime: formatTime(student.firstCheckInTime),
						entryTime: formatTime(student.lastCheckInTime),
						exitTime: formatTime(student.lastCheckOutTime),
						comment: student.lastComment || '-',
						isLate: late,
						lateMinutes: late || 0,
					}
				})
				setStudents(processed)
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

	useEffect(() => {
		const init = async () => {
			await fetchWorkStartTime()
			fetchSinfs()
			fetchData()
		}
		init()
	}, [])

	const calculateStats = () => {
		const total = students.length
		const ishda = students.filter(s => s.attendanceStatus === 'ishda').length
		const tashqarida = students.filter(s => s.attendanceStatus === 'tashqarida').length
		const kelmagan = students.filter(s => !['ishda', 'tashqarida'].includes(s.attendanceStatus)).length
		const kechikkan = students.filter(s => s.isLate).length
		return { total, ishda, tashqarida, kelmagan, kechikkan }
	}
	const stats = calculateStats()

	const getStatusIcon = (status) => {
		switch (status) {
			case 'ishda': return <FaUserCheck className="text-emerald-500" />
			case 'tashqarida': return <FaUserSlash className="text-blue-500" />
			default: return <FaUserTimes className="text-rose-500" />
		}
	}
	const getStatusColor = (status) => {
		switch (status) {
			case 'ishda': return 'bg-emerald-100 text-emerald-800'
			case 'tashqarida': return 'bg-blue-100 text-blue-800'
			default: return 'bg-rose-100 text-rose-800'
		}
	}
	const getStatusText = (status) => {
		switch (status) {
			case 'ishda': return 'Ishda'
			case 'tashqarida': return 'Tashqarida'
			default: return 'Kelmadi'
		}
	}

	const openCommentModal = (student) => {
		setSelectedStudent(student)
		setCommentText(student.comment === '-' ? '' : student.comment)
		setCommentModalOpen(true)
	}

	const handleCommentSubmit = async () => {
		if (submitting) return
		setSubmitting(true)
		try {
			const res = await axios.put(
				`${BASE_URL}/api/student/comment/${selectedStudent.lastLogId}`,
				{ comment: commentText },
				{ headers }
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

	const openTimeModal = (student, type) => {
		setSelectedStudent(student)
		setModalType(type)
		setTimeModalOpen(true)
	}

	const handleTimeSubmit = async () => {
		if (submitting) return
		setSubmitting(true)
		try {
			const res = await axios.put(
				`${BASE_URL}/api/student/student-time/${selectedStudent.studentIdNumber}`,
				{ qayer: MANUAL_ENTRY_CHECKPOINT_ID, type: modalType },
				{ headers }
			)
			if (res.data.success) {
				toast.success(modalType === "entry" ? "O'quvchi muvaffaqiyatli kiritildi!" : "O'quvchi muvaffaqiyatli chiqarildi!")
				fetchData()
				setTimeModalOpen(false)
			}
		} catch (error) {
			toast.error(error.response?.data?.message || error.message)
		} finally {
			setSubmitting(false)
		}
	}

	const clearStatFilter = () => setSelectedStat(null)
	const resetFilters = () => {
		setSearchTerm('')
		setSelectedSinf('all')
		setSelectedStatus('all')
		setSelectedStat(null)
	}
	// eslint-disable-next-line no-unused-vars
	const _unusedResetFilters = resetFilters

	const filteredStudents = students.filter(student => {
		const matchesSearch = student.fullName?.toLowerCase().includes(searchTerm.toLowerCase())

		const matchesSinf =
			selectedSinf === 'all' ||
			(selectedSinf === 'no-sinf' && !student.sinf) ||
			student.sinf?._id === selectedSinf

		const matchesStatus =
			selectedStatus === 'all' ||
			student.attendanceStatus === selectedStatus ||
			(selectedStatus === 'kelmagan' && !['ishda', 'tashqarida'].includes(student.attendanceStatus))

		const matchesStat = !selectedStat ||
			(selectedStat === 'ishda' && student.attendanceStatus === 'ishda') ||
			(selectedStat === 'tashqarida' && student.attendanceStatus === 'tashqarida') ||
			(selectedStat === 'kelmagan' && !['ishda', 'tashqarida'].includes(student.attendanceStatus)) ||
			(selectedStat === 'kechikkan' && student.isLate)

		return matchesSearch && matchesSinf && matchesStatus && matchesStat
	})
	const paged = usePaged(filteredStudents, 50)

	const renderMobileCards = () => (
		<div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
			{paged.items.map((student, index) => (
				<div
					key={student._id}
					className={`bg-white rounded-lg shadow-sm border p-3 ${!['ishda', 'tashqarida'].includes(student.attendanceStatus) ? 'border-red-200' : student.attendanceStatus === 'ishda' ? 'border-green-200' : 'border-blue-200'}`}
				>
					<div className="flex items-center justify-between mb-3">
						<div className="flex items-center space-x-3">
							<div className="flex-shrink-0 h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold overflow-hidden">
								{student.photo ? (
									<img src={`${BASE_URL}/uploads/${student.photo}`} alt={student.fullName} className="h-full w-full object-cover" />
								) : (
									student.fullName?.charAt(0)?.toUpperCase()
								)}
							</div>
							<div>
								<p className="font-medium text-gray-900 text-sm">{student.fullName}</p>
								<p className="text-xs text-gray-500">{student.sinf?.name || "Sinfsiz"}</p>
							</div>
						</div>
						<div className="text-right">
							<div className="flex items-center justify-end space-x-1">
								<span className="text-xs text-gray-500">#{index + 1}</span>
								{student.isLate && (
									<span className="text-yellow-500" title={`${student.lateMinutes} daqiqa kechikkan`}>
										<FaClock size={12} />
									</span>
								)}
							</div>
							<div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-1 ${getStatusColor(student.attendanceStatus)}`}>
								{getStatusIcon(student.attendanceStatus)}
								<span className="ml-1">{getStatusText(student.attendanceStatus)}</span>
							</div>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-3 text-xs">
						<div className="col-span-2">
							<span className="text-gray-500">Ota-ona:</span>
							<p className="font-medium text-black mt-1">
								{student.parentName || student.parentPhone
									? `${student.parentName || ''}${student.parentName && student.parentPhone ? ' — ' : ''}${student.parentPhone || ''}`
									: '-'}
							</p>
						</div>
						<div className="col-span-2">
							<span className="text-gray-500">Dastlabki kirish:</span>
							<p className="font-medium text-black mt-1">{student.firstEntryTime}</p>
						</div>
						<div>
							<span className="text-gray-500">Kirish vaqti:</span>
							<div className="flex items-center gap-1 mt-1">
								<span className="font-medium text-black">{student.entryTime}</span>
								{(!student.lastCheckInTime || (student.lastCheckInTime && student.lastCheckOutTime)) && (
									<button
										onClick={() => openTimeModal(student, 'entry')}
										className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex-shrink-0"
										title="Kirish vaqtini qo'shish/tahrirlash"
									>
										<FaEdit size={10} />
									</button>
								)}
							</div>
						</div>
						<div>
							<span className="text-gray-500">Chiqish vaqti:</span>
							<div className="flex items-center gap-1 mt-1">
								<span className="font-medium text-black">{student.exitTime}</span>
								{student.lastCheckInTime && !student.lastCheckOutTime && (
									<button
										onClick={() => openTimeModal(student, 'exit')}
										className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors flex-shrink-0"
										title="Chiqish vaqtini qo'shish"
									>
										<FaEdit size={10} />
									</button>
								)}
							</div>
						</div>
						{student.isLate && (
							<div className="col-span-2">
								<span className="text-gray-500">Kechikish:</span>
								<p className="font-medium text-black mt-1">{student.lateMinutes} daqiqa</p>
							</div>
						)}
						<div className="col-span-2">
							<span className="text-gray-500">Izoh:</span>
							<div className="flex items-start justify-between">
								<div className="flex-1">
									<p className="font-medium text-black mt-1 break-words">{student.comment}</p>
								</div>
								{student.lastCheckInTime && !student.lastCheckOutTime && (
									<button
										onClick={() => openCommentModal(student)}
										className="ml-2 text-gray-400 hover:text-blue-500 flex-shrink-0 mt-1"
										title="Komentariya qo'shish"
									>
										<FaRegCommentDots size={14} />
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
			))}
		</div>
	)

	const renderDesktopTable = () => (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex-1 min-h-0 overflow-auto">
				<table className="w-full">
					<thead className="sticky top-0 z-20 bg-gray-50">
						<tr>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap w-[80px] sticky left-0 bg-gray-50 z-30">№</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[200px] sticky left-[80px] bg-gray-50 z-20">O'quvchi</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[120px]">Sinf</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[180px]">Ota-ona</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">Dastlabki</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">Kirish</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[100px]">Chiqish</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[200px]">Izoh</th>
							<th className="px-4 py-4 text-left text-sm font-medium text-gray-500 tracking-wider whitespace-nowrap min-w-[120px]">Holat</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-gray-200 bg-white">
						{paged.items.map((student, index) => (
							<tr key={student._id} className={`hover:bg-opacity-90 group ${!['ishda', 'tashqarida'].includes(student.attendanceStatus) ? 'bg-red-50 hover:bg-red-100' : student.attendanceStatus === 'ishda' ? 'bg-green-50 hover:bg-green-100' : 'bg-blue-50 hover:bg-blue-100'}`}>
								<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 sticky left-0 z-10 min-w-[80px] bg-inherit">
									<div className="flex items-center">
										{index + 1}
										{student.isLate && (
											<span className="ml-2 text-yellow-500" title={`${student.lateMinutes} daqiqa kechikkan`}>
												<FaClock className="inline" size={12} />
											</span>
										)}
									</div>
								</td>
								<td className="px-4 py-4 min-w-[200px] sticky left-[80px] z-10 bg-inherit">
									<div className="flex items-center">
										<div className="flex-shrink-0 h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold overflow-hidden">
											{student.photo ? (
												<img src={`${BASE_URL}/uploads/${student.photo}`} alt={student.fullName} className="h-full w-full object-cover" />
											) : (
												student.fullName?.charAt(0)?.toUpperCase()
											)}
										</div>
										<div className="ml-3">
											<p className="text-sm font-medium text-gray-900">{student.fullName}</p>
										</div>
									</div>
								</td>
								<td className="px-4 py-4 text-sm text-gray-900 min-w-[120px]">
									<span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800">
										{student.sinf?.name || "Sinfsiz"}
									</span>
								</td>
								<td className="px-4 py-4 text-sm text-gray-900 min-w-[180px]">
									{student.parentName || student.parentPhone
										? `${student.parentName || ''}${student.parentName && student.parentPhone ? ' — ' : ''}${student.parentPhone || ''}`
										: '-'}
								</td>
								<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">{student.firstEntryTime}</td>
								<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
									<div className="flex items-center gap-2">
										{student.entryTime}
										{(!student.lastCheckInTime || (student.lastCheckInTime && student.lastCheckOutTime)) && (
											<button
												onClick={() => openTimeModal(student, 'entry')}
												className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
												title="Kirish vaqtini qo'shish/tahrirlash"
											>
												<FaEdit size={12} />
											</button>
										)}
									</div>
								</td>
								<td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 min-w-[100px]">
									<div className="flex items-center gap-2">
										{student.exitTime}
										{student.lastCheckInTime && !student.lastCheckOutTime && (
											<button
												onClick={() => openTimeModal(student, 'exit')}
												className="p-1 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors opacity-0 group-hover:opacity-100"
												title="Chiqish vaqtini qo'shish"
											>
												<FaEdit size={12} />
											</button>
										)}
									</div>
								</td>
								<td className="px-4 py-4 text-sm text-gray-900 whitespace-normal break-words min-w-[200px] max-w-xs">
									<div className="flex items-center gap-2">
										<span className="flex-1">{student.comment}</span>
										{student.lastCheckInTime && !student.lastCheckOutTime && (
											<button
												onClick={() => openCommentModal(student)}
												className="ml-2 text-gray-400 hover:text-blue-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
												title="Komentariya qo'shish"
											>
												<FaRegCommentDots size={14} />
											</button>
										)}
									</div>
								</td>
								<td className="px-4 py-4 whitespace-nowrap min-w-[120px]">
									<span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(student.attendanceStatus)}`}>
										{getStatusIcon(student.attendanceStatus)}
										<span className="ml-1.5">{getStatusText(student.attendanceStatus)}</span>
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex-shrink-0 bg-gray-50 border-t">
				<ListPager {...paged} />
				<p className="px-6 py-3 text-sm text-gray-600">Jami: {filteredStudents.length} ta o'quvchi</p>
			</div>
		</div>
	)

	const renderStatistics = () => {
		const toggle = (key) => () => selectedStat === key ? clearStatFilter() : setSelectedStat(key)
		return (
			<div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4">
				<KpiCard compact icon={<FaUserCheck size={14} />} label="Ishda" value={stats.ishda} total={stats.total} tone="good" active={selectedStat === 'ishda'} onClick={toggle('ishda')} />
				<KpiCard compact icon={<FaUserSlash size={14} />} label="Tashqarida" value={stats.tashqarida} total={stats.total} tone="blue" active={selectedStat === 'tashqarida'} onClick={toggle('tashqarida')} />
				<KpiCard compact icon={<FaClock size={14} />} label="Kechikkan" value={stats.kechikkan} total={stats.total} tone="warning" active={selectedStat === 'kechikkan'} onClick={toggle('kechikkan')} />
				<KpiCard compact icon={<FaUserTimes size={14} />} label="Kelmagan" value={stats.kelmagan} total={stats.total} tone="critical" active={selectedStat === 'kelmagan'} onClick={toggle('kelmagan')} />
			</div>
		)
	}

	return (
		<div className="h-full flex flex-col w-full max-w-full overflow-hidden bg-gray-50">
			{renderStatistics()}

			<div className="flex-1 min-h-0 flex flex-col">
				<div className="flex-shrink-0 bg-white p-3 sm:p-4 shadow-sm">
					<div className="flex flex-col sm:flex-row gap-3 sm:gap-4 flex-wrap">
						<div className="flex-1 min-w-[200px]">
							<div className="relative max-w-md w-full">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
									<FiSearch size={16} />
								</div>
								<input
									type="text"
									placeholder="O'quvchilarni qidirish..."
									className="pl-10 pr-4 py-2 w-full border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black bg-gray-50"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
								/>
							</div>
						</div>

						<div className="flex flex-wrap gap-2 sm:gap-3 justify-end">
							{!fixedSinfId && (
								<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg min-w-[150px] max-w-[200px] overflow-hidden">
									<FaFilter className="text-gray-400 flex-shrink-0" size={13} />
									<select
										className="bg-transparent text-gray-700 border-none focus:outline-none focus:ring-0 text-sm w-full truncate"
										value={selectedSinf}
										onChange={(e) => setSelectedSinf(e.target.value)}
									>
										<option value="all">Barcha sinflar</option>
										{sinfs.map(sinf => (
											<option key={sinf._id} value={sinf._id}>{sinf.name}</option>
										))}
										<option value="no-sinf">Sinfsiz</option>
									</select>
								</div>
							)}

							<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg min-w-[120px] max-w-[160px] overflow-hidden">
								<FaFilter className="text-gray-400 flex-shrink-0" size={13} />
								<select
									className="bg-transparent text-gray-700 border-none focus:outline-none focus:ring-0 text-sm w-full truncate"
									value={selectedStatus}
									onChange={(e) => setSelectedStatus(e.target.value)}
								>
									<option value="all">Barcha holat</option>
									<option value="ishda">Ishda</option>
									<option value="kelmagan">Kelmagan</option>
									<option value="tashqarida">Tashqarida</option>
								</select>
							</div>

							<button
								onClick={() => { setRefreshing(true); fetchData() }}
								disabled={refreshing}
								className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors duration-200 font-medium min-w-[120px] max-w-[150px]"
								title="Yangilash"
							>
								{refreshing ? <PulseLoader size={6} color="white" /> : (<><FiRefreshCw size={16} /><span className="truncate">Yangilash</span></>)}
							</button>
						</div>
					</div>
				</div>

				<div className="flex-1 min-h-0 flex flex-col overflow-hidden">
					{loading ? (
						<div className="flex justify-center items-center h-full py-8">
							<PulseLoader color="#6366F1" size={16} />
						</div>
					) : filteredStudents.length === 0 ? (
						<div className="text-center py-12 h-full flex items-center justify-center">
							<div className="px-6">
								<div className="mx-auto h-24 w-24 text-gray-400 mb-4">
									<FaUserGraduate className="w-full h-full" />
								</div>
								<h3 className="text-lg font-medium text-gray-900">O'quvchilar topilmadi</h3>
								<p className="text-base text-gray-500 mt-2">
									{searchTerm ? "Qidiruv bo'yicha o'quvchi topilmadi" : "Tizimda o'quvchilar mavjud emas"}
								</p>
							</div>
						</div>
					) : (
						isMobile ? renderMobileCards() : renderDesktopTable()
					)}
				</div>
			</div>

			{commentModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="fixed inset-0 backdrop-blur-sm bg-opacity-30" onClick={() => setCommentModalOpen(false)}></div>
					<div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-auto z-10">
						<div className="p-6">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-lg font-bold text-gray-800">{selectedStudent?.fullName} uchun izoh</h3>
								<button onClick={() => setCommentModalOpen(false)} className="text-gray-500 hover:text-gray-700"><FiX size={20} /></button>
							</div>
							<textarea
								className="w-full p-3 border border-gray-300 text-black rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
								rows={4}
								value={commentText}
								onChange={(e) => setCommentText(e.target.value)}
								placeholder="Komentariya yozing..."
							/>
							<div className="flex justify-end gap-3">
								<button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium" onClick={() => setCommentModalOpen(false)}>Bekor qilish</button>
								<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium" onClick={handleCommentSubmit} disabled={submitting}>
									{submitting ? "Saqlanmoqda..." : "Saqlash"}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{timeModalOpen && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					<div className="fixed inset-0 backdrop-blur-sm bg-opacity-30" onClick={() => setTimeModalOpen(false)}></div>
					<div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-auto z-10">
						<div className="p-6">
							<div className="flex justify-between items-center mb-4">
								<h3 className="text-lg font-bold text-gray-800">{selectedStudent?.fullName} uchun {modalType === "entry" ? "Kirish" : "Chiqish"}</h3>
								<button onClick={() => setTimeModalOpen(false)} className="text-gray-500 hover:text-gray-700"><FiX size={20} /></button>
							</div>
							<div className="mb-6 text-sm text-gray-700 bg-blue-50 p-4 rounded-lg">
								Ushbu amalni tasdiqlashni xohlaysizmi?
								<br />
								<strong>{selectedStudent?.fullName}</strong> - {modalType === "entry" ? "kirish" : "chiqish"} vaqti qayd etiladi.
							</div>
							<div className="flex justify-end gap-3">
								<button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium" onClick={() => setTimeModalOpen(false)}>Bekor qilish</button>
								<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 text-sm font-medium" onClick={handleTimeSubmit} disabled={submitting}>
									{submitting ? "Saqlanmoqda..." : (modalType === "entry" ? "O'quvchini kiritish" : "O'quvchini chiqarish")}
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

export default StudentEntryExit

