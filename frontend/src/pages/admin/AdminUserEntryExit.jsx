import { publicId } from '../../utils/ids'
import AutoSelect from '../../components/AutoSelect'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import {
	FaClock,
	FaEdit,
	FaFilter,
	FaUserCheck,
	FaUserGraduate,
	FaUsers,
	FaUserSlash,
	FaUserTimes
} from 'react-icons/fa'
import {
	FiDownload,
	FiFile,
	FiFileText,
	FiRefreshCw,
	FiSearch,
	FiX
} from 'react-icons/fi'
import * as XLSX from 'xlsx-js-style'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import KpiCard from '../../components/KpiCard'
import { typeColor, typeLabel } from '../../components/GlobalCommentModal'
import SearchableSelect from '../../components/SearchableSelect'
import { useOrg } from '../../context/OrgContext'
import { getTashkentDateString, formatUzDate } from '../../utils/formatDate'
import { buildAndDownloadDocx, docxTable, exportElementToPdf, styleExcelHeaderRow, toDocxColor } from '../../utils/exportUtils'
import { MANUAL_ENTRY_POST_ID } from '../../utils/constants'
import StudentEntryExit from './StudentEntryExit'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'

const BASE_URL = import.meta.env.VITE_BASE_URL

const AdminUserEntryExit = () => {
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }
	const org = useOrg()
	const reportRef = useRef(null)
	const workStartTimeRef = useRef('09:00')
	const [exportingExcel, setExportingExcel] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)
	const [exportingWord, setExportingWord] = useState(false)
	// Qo'lda "Yangilash" ustma-ust bosilsa, oldingi (sekinroq) so'rov javobi
	// keyingi (tezroq tugagan) so'rovdan KEYIN kelib, yangi ma'lumotni
	// eskisi bilan almashtirib qo'yishi mumkin edi. Har so'rovga tartib
	// raqami berib, faqat ENG OXIRGI so'rov javobini qabul qilamiz
	// (AdminAnalytics.jsx'dagi bilan bir xil naqsh)
	const [users, setUsers] = useState([])
	const [sinfs, setDepartments] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')
	const [selectedDepartment, setSelectedDepartment] = useState('all')
	const [selectedStatus, setSelectedStatus] = useState('all')
	const [selectedStat, setSelectedStat] = useState(null)
	const [commentMap, setCommentMap] = useState({})
	const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
	const [viewMode, setViewMode] = useState('staff')

	// Ekran o'lchamini kuzatish
	useEffect(() => {
		const handleResize = () => {
			setIsMobile(window.innerWidth < 768)
		}

		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	// Sozlamalardagi "Ish boshlanish vaqti"ga nisbatan (avval 09:00 kodga qattiq yozilgan edi)
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

	// isLate() bilan bir xil hisoblash usulidan foydalanadi (avval alohida, qo'lda UTC+5 qo'shadigan usul bor edi)
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

			if (usersRes.data.success && deptRes.data.success) {
				const processedUsers = usersRes.data.users.map(user => {
					const isUserLate = isLate(user.firstCheckInTime)

					return {
						...user,
						attendanceStatus: user.attendanceStatus || 'kelmagan',
						entryTime: formatTime(user.lastCheckInTime) || '-',
						exitTime: formatTime(user.lastCheckOutTime) || '-',
						comment: user.lastComment || '-',
						isLate: isUserLate,
						lateMinutes: isUserLate ? calculateLateMinutes(user.firstCheckInTime) : 0,
					}
				})

				// Daraja (lavel) bo'yicha saralash
				processedUsers.sort((a, b) => {
					if (!a.lavel && !b.lavel) return 0
					if (!a.lavel) return 1
					if (!b.lavel) return -1
					return a.lavel - b.lavel
				})

				setUsers(processedUsers)
				setDepartments(deptRes.data.sinfs)
			}
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
		const kelmaganCount = users.filter(u =>
			u.attendanceStatus === 'kelmagan' || !['ishda', 'tashqarida'].includes(u.attendanceStatus)
		).length
		const kechikkanCount = users.filter(user => user.isLate).length

		return {
			total: totalUsers,
			ishda: { count: ishdaCount },
			tashqarida: { count: tashqaridaCount },
			kelmagan: { count: kelmaganCount },
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

	// Statistik filterlarni tozalash
	const clearStatFilter = () => {
		setSelectedStat(null)
	}

	// Barcha filtrlarni tozalash
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

	const buildReportRows = () => filteredUsers.map((u, i) => ({
		index: i + 1,
		fullName: u.fullName,
		department: u.sinf?.name || "Sinfsiz",
		status: getStatusText(u.attendanceStatus),
		entryTime: u.entryTime,
		exitTime: u.exitTime,
		late: u.isLate ? `Ha (${u.lateMinutes} daq)` : "Yo'q",
	}))

	const exportToExcel = () => {
		setExportingExcel(true)
		try {
			const rows = buildReportRows().map(r => ({
				'№': r.index,
				"F.I.Sh": r.fullName,
				"Sinf": r.department,
				'Holati': r.status,
				'Kirish vaqti': r.entryTime,
				'Chiqish vaqti': r.exitTime,
				'Kechikdi': r.late,
			}))
			const ws = XLSX.utils.json_to_sheet(rows)
			ws['!cols'] = [{ wch: 5 }, { wch: 28 }, { wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
			styleExcelHeaderRow(ws, 0, 7, org.primaryColor)
			const wb = XLSX.utils.book_new()
			XLSX.utils.book_append_sheet(wb, ws, "Kirish-Chiqish")
			XLSX.writeFile(wb, `kirish_chiqish_${getTashkentDateString()}.xlsx`)
		} catch {
			toast.error("Eksport qilishda xatolik")
		} finally {
			setExportingExcel(false)
		}
	}

	const handleDownloadPdf = async () => {
		setExportingPdf(true)
		try {
			await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
			await exportElementToPdf(reportRef.current, `kirish_chiqish_${getTashkentDateString()}.pdf`)
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
				subtitle: 'Kirish-chiqish hisoboti',
				dateText: formatUzDate(new Date()),
				sections: [{
					heading: 'Xodimlar',
					table: docxTable(
						['№', 'F.I.Sh', "Sinf", 'Holati', 'Kirish', 'Chiqish', 'Kechikdi'],
						rows.map(r => [r.index, r.fullName, r.department, r.status, r.entryTime, r.exitTime, r.late]),
						toDocxColor(org.primaryColor)
					)
				}],
				filename: `kirish_chiqish_${getTashkentDateString()}.docx`
			})
		} catch {
			toast.error("Word hisobot yaratishda xatolik")
		} finally {
			setExportingWord(false)
		}
	}

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
							<div className="flex items-center space-x-3">
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
							</div>
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
							{/* Bo'lim */}
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

							{/* Kirish vaqti */}
							<div>
								<span className="text-gray-500">{tx("Kirish vaqti:")}</span>
								<span className="font-medium text-black mt-1 block">{user.entryTime}</span>
							</div>

							{/* Chiqish vaqti */}
							<div>
								<span className="text-gray-500">{tx("Chiqish vaqti:")}</span>
								<span className="font-medium text-black mt-1 block">{user.exitTime}</span>
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
										</div>
									</td>

									<td className="px-4 py-4 min-w-[200px] sticky left-[80px] z-10 bg-inherit">
										<div className="flex items-center">
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
										</div>
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
			<div className="flex-shrink-0 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 p-2 sm:p-3 lg:p-4">
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
			</div>
		)
	}


	useEffect(() => {
		const init = async () => {
			// workStartTimeRef fetchData() dan OLDIN tayyor bo'lishi kerak —
			// aks holda birinchi hisoblash standart 09:00 bilan ketib qoladi
			await fetchWorkStartTime()
			fetchData()
			fetchCommentMap()
		}
		init()
	}, [])

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
										className="pl-10 pr-4 py-2 w-full border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-black"
										value={searchTerm}
										onChange={(e) => setSearchTerm(e.target.value)}
									/>
								</div>
							</div>

							{/* Filterlar guruhi */}
							<div className="flex flex-wrap gap-2 sm:gap-3 justify-end">
								{/* Bo'lim filteri */}
								<div className="min-w-[150px] max-w-[220px] w-full sm:w-auto">
									<SearchableSelect
										icon={<FaFilter className="text-gray-400 flex-shrink-0" size={13} />}
										value={selectedDepartment}
										onChange={setSelectedDepartment}
										options={[
											{ value: 'all', label: "Barcha sinflar" },
											...sinfs.map(dept => ({ value: dept._id, label: dept.name })),
											{ value: 'no-dept', label: "Sinfsiz" },
										]}
										searchPlaceholder={tx("Sinf qidirish...")}
										triggerClassName="w-full flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg text-sm text-left"
									/>
								</div>

								{/* Holat filteri */}
								<div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg min-w-[120px] max-w-[160px] overflow-hidden">
									<FaFilter className="text-gray-400 flex-shrink-0" size={13} />
									<AutoSelect
										className="bg-transparent text-gray-800 border-none focus:outline-none focus:ring-0 text-sm w-full truncate"
										value={selectedStatus}
										onChange={(e) => setSelectedStatus(e.target.value)}
									>
										<option value="all">{tx("Barcha holat")}</option>
										<option value="ishda">{tx("Ishda")}</option>
										<option value="kelmagan">{tx("Kelmagan")}</option>
										<option value="tashqarida">{tx("Tashqarida")}</option>
									</AutoSelect>
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

								{/* Eksport tugmalari */}
								<button
									onClick={exportToExcel}
									disabled={exportingExcel}
									className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors duration-200 font-medium disabled:opacity-60"
									title={tx("Excel")}
								>
									<FiDownload size={16} />
									<span className="hidden sm:inline">{exportingExcel ? '...' : tx("Excel")}</span>
								</button>
								<button
									onClick={handleDownloadPdf}
									disabled={exportingPdf}
									className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors duration-200 font-medium disabled:opacity-60"
									title={tx("PDF")}
								>
									<FiFileText size={16} />
									<span className="hidden sm:inline">{exportingPdf ? '...' : tx("PDF")}</span>
								</button>
								<button
									onClick={handleDownloadWord}
									disabled={exportingWord}
									className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors duration-200 font-medium disabled:opacity-60"
									title={tx("Word")}
								>
									<FiFile size={16} />
									<span className="hidden sm:inline">{exportingWord ? '...' : tx("Word")}</span>
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

			{/* PDF eksporti uchun ekrandan tashqarida chizilgan hisobot shabloni */}
			<div style={{ position: 'fixed', top: 0, left: '-10000px', width: '900px', zIndex: -1 }}>
				<div ref={reportRef} style={{ background: '#ffffff', padding: '32px', fontFamily: 'Arial, sans-serif', color: '#111111' }}>
					<div style={{ textAlign: 'center', marginBottom: '6px' }}><img src="/logo-256.png" alt="" style={{ height: '64px', width: '64px', objectFit: 'contain' }} /></div>
					<h1 style={{ textAlign: 'center', fontSize: '22px', margin: '0 0 4px' }}>{org.orgName || tx("School Supervision")}</h1>
					<p style={{ textAlign: 'center', fontSize: '14px', color: '#666666', margin: '0 0 4px' }}>{tx("Kirish-chiqish hisoboti")}</p>
					<p style={{ textAlign: 'center', fontSize: '12px', color: '#999999', margin: '0 0 24px' }}>{formatUzDate(new Date())}</p>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr>
								{['№', 'F.I.Sh', "Sinf", 'Holati', 'Kirish', 'Chiqish', 'Kechikdi'].map(h => (
									<th key={h} style={{ background: org.primaryColor, color: '#fff', padding: '8px', fontSize: '12px', border: '1px solid #e1e0d9' }}>{h}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{buildReportRows().map(r => (
								<tr key={r.index}>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.index}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.fullName}</td>
									<td style={{ padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.department}</td>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.status}</td>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.entryTime}</td>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.exitTime}</td>
									<td style={{ textAlign: 'center', padding: '7px 8px', fontSize: '13px', border: '1px solid #e1e0d9' }}>{r.late}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	)
}

export default AdminUserEntryExit