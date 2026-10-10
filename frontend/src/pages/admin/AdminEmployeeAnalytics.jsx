import { publicId } from '../../utils/ids'
import axios from 'axios'
import { tx } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FiArrowLeft, FiCalendar, FiClock, FiDownload, FiPhone, FiUserCheck, FiUserX } from 'react-icons/fi'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import KpiCard from '../../components/KpiCard'
import { formatShortDateFromDateString, formatUzTime, getTashkentHourMinute } from '../../utils/formatDate'
import { exportEmployeeExcel } from '../../utils/exportAttendance'

const pad = n => String(n).padStart(2, '0')
const toLocalStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// dataviz skill: AdminHome.jsx bilan bir xil rang palitrasi — ilova bo'ylab
// grafik ranglari izchil bo'lishi uchun (status holatlar uchun fixed
// status-palette, hech qachon aralashtirilmaydi)
const BLUE = '#2a78d6'
const GOOD = '#0ca30c'
const WARNING = '#fab219'
const CRITICAL = '#d03b3b'
const INK_SECONDARY = '#52514e'
const INK_MUTED = '#898781'
const GRID = '#e1e0d9'

// Tashkilotning standart ish boshlanish vaqti. Bu sahifa faqat getById va
// attandance endpoint'laridan foydalanadi — sozlamalar endpoint'i shartnoma
// tarkibiga kirmaydi, shuning uchun boshqa sahifalarda (UserAttandance.jsx,
// AdminEntryExit.jsx) ishlatiladigan standart 09:00 qiymati shu yerda ham
// ko'rsatma sifatida qattiq yozildi (>5 daqiqa — "kechikkan" chegarasi ham
// o'sha sahifalardagi bilan bir xil).
const WORK_START_HOUR = 9
const LATE_THRESHOLD_HOURS = WORK_START_HOUR + 5 / 60

const PERIODS = [
	{ key: 7, label: tx('7 kun') },
	{ key: 30, label: tx('30 kun') },
	{ key: 90, label: tx('90 kun') },
	{ key: 365, label: tx('365 kun') },
	{ key: 'month', label: tx('Shu oy') },
]

const TrendTooltipContent = ({ active, payload }) => {
	if (!active || !payload?.length) return null
	const p = payload[0].payload
	const text = p.status === 'absent' ? tx('Kelmadi') : p.status === 'tashqarida' ? tx('Tashqarida') : tx('Keldi')
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-500 mb-1">{p.label}</p>
			<p className="font-semibold text-gray-900">{text}</p>
		</div>
	)
}

const ArrivalTooltipContent = ({ active, payload }) => {
	if (!active || !payload?.length) return null
	const p = payload[0].payload
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-500 mb-1">{p.label}</p>
			<p className="font-semibold text-gray-900">{p.timeLabel}</p>
			{p.late && <p className="text-xs text-rose-600 mt-0.5">Kechikkan</p>}
		</div>
	)
}

const AdminEmployeeAnalytics = () => {
	const { id } = useParams()
	const navigate = useNavigate()
	// Kartochkalar kunlik jadvalga (batafsil ma'lumot) olib boradi
	const goTable = () => document.getElementById('emp-daily-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
	const token = localStorage.getItem('token')
	const BASE_URL = import.meta.env.VITE_BASE_URL

	const [loading, setLoading] = useState(true)
	const [notFound, setNotFound] = useState(false)
	const [employee, setEmployee] = useState(null)
	const [history, setHistory] = useState([])
	const [stats, setStats] = useState({ totalDays: 0, presentDays: 0, absentDays: 0, averageHours: '0.0' })

	const now = new Date()
	const [from, setFrom] = useState(toLocalStr(new Date(now.getFullYear(), now.getMonth(), 1)))
	const [to, setTo] = useState(toLocalStr(now))
	const [activePeriod, setActivePeriod] = useState('month')

	// Filtr tez-tez o'zgartirilsa (masalan davr tugmalari ketma-ket bosilsa),
	// eski so'rov yangisidan KEYIN qaytishi mumkin — shu holatda eski javob
	// to'g'ri natijani ustidan yozib qo'yardi. Har so'rovga tartib raqami
	// berib, faqat ENG OXIRGI so'rov javobini qabul qilamiz.
	// (UserAttendanceModal.jsx'dagi bilan bir xil naqsh.)
	const requestSeqRef = useRef(0)

	const fetchData = async (fromDate, toDate) => {
		const seq = ++requestSeqRef.current
		try {
			setLoading(true)
			const [empRes, histRes] = await Promise.allSettled([
				axios.get(`${BASE_URL}/api/user/getById/${id}`, {
					headers: { Authorization: `Bearer ${token}` },
				}),
				axios.get(`${BASE_URL}/api/user/attandance/${id}`, {
					params: { from: fromDate, to: toDate },
					headers: { Authorization: `Bearer ${token}` },
				}),
			])
			if (seq !== requestSeqRef.current) return // eskirgan javob

			const empOk = empRes.status === 'fulfilled' && empRes.value.data?.success
			if (empOk) {
				setEmployee(empRes.value.data.user)
			} else {
				setNotFound(true)
				toast.error('Xodim topilmadi')
			}

			if (histRes.status === 'fulfilled' && histRes.value.data?.success) {
				setHistory(histRes.value.data.attendanceHistory || [])
				setStats(histRes.value.data.stats || { totalDays: 0, presentDays: 0, absentDays: 0, averageHours: '0.0' })
			} else if (empOk) {
				toast.error("Davomat ma'lumotlarini yuklashda xato yuz berdi")
			}
		} catch {
			if (seq !== requestSeqRef.current) return
			setNotFound(true)
			toast.error("Ma'lumotlarni yuklashda xato yuz berdi")
		} finally {
			if (seq === requestSeqRef.current) setLoading(false)
		}
	}

	useEffect(() => {
		if (id) fetchData(from, to)
		// Faqat id o'zgarganda qayta ishga tushadi — from/to boshlang'ich
		// qiymatlari shu yerda "yopiladi" (closure), xuddi UserAttendanceModal.jsx'dagidek.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id])

	const applyPeriod = (period) => {
		const today = new Date()
		let fromDate
		if (period === 'month') {
			fromDate = toLocalStr(new Date(today.getFullYear(), today.getMonth(), 1))
		} else {
			const d = new Date(today)
			d.setDate(d.getDate() - (period - 1))
			fromDate = toLocalStr(d)
		}
		const toDate = toLocalStr(today)
		setActivePeriod(period)
		setFrom(fromDate)
		setTo(toDate)
		fetchData(fromDate, toDate)
	}

	// Vaqtni ko'rsatish — Asia/Tashkent bo'yicha (browser'ning o'z lokal vaqt
	// zonasi bilan hisoblamaydi, aks holda boshqa zonadagi qurilmada vaqt
	// noto'g'ri ko'rsatilar edi). exportEmployeeExcel'ga ham shu funksiya
	// fmtTime sifatida beriladi.
	const fmt = (iso) => {
		if (!iso) return '--:--'
		return formatUzTime(new Date(iso))
	}

	// Diqqat: backend'dan kelgan `hoursWorked` — kunning HAR BIR kirish/chiqish
	// sessiyasi alohida yig'ilib hisoblangan (birinchi kirish — oxirgi chiqish
	// oralig'i emas), shuning uchun tushlik/tanaffus vaqtlari "ishlagan" deb
	// hisoblanib qolmaydi. (UserAttendanceModal.jsx bilan bir xil.)
	const workDuration = (hoursWorked) => {
		if (!hoursWorked) return '--:--'
		const totalMinutes = Math.round(hoursWorked * 60)
		const h = Math.floor(totalMinutes / 60)
		const m = totalMinutes % 60
		return `${pad(h)}:${pad(m)}`
	}

	const statusBadge = (record) => {
		if (record.arrivalTime && record.status === 'ishda')
			return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Ishda</span>
		if (record.arrivalTime && record.status === 'tashqarida')
			return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">Tashqarida</span>
		if (record.arrivalTime)
			return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">Kelgan</span>
		return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">Kelmadi</span>
	}

	const handleExport = () => {
		const ok = exportEmployeeExcel({ fullName: employee?.fullName, history, workDuration, fmtTime: fmt })
		if (!ok) toast.info("Eksport uchun ma'lumot yo'q")
		else toast.success('Excel yuklandi')
	}

	// Davomat trendi — har bir kun uchun holat rangi (Keldi/Tashqarida/Kelmadi).
	// `formatShortDateFromDateString` dateString'ni to'g'ridan-to'g'ri matn
	// sifatida o'qiydi (Date obyektiga aylantirmaydi) — vaqt zonasi xatosidan xoli.
	const trendData = history.map(r => ({
		label: formatShortDateFromDateString(r.dateString),
		value: 1,
		status: r.arrivalTime ? (r.status === 'tashqarida' ? 'tashqarida' : 'present') : 'absent',
	}))

	// Kelish vaqti tarqalishi — faqat kelgan kunlar, ish boshlanish vaqtiga
	// nisbatan. `getTashkentHourMinute` ishlatiladi — `Date.getHours()`
	// brauzer lokal vaqt zonasida hisoblab, boshqa zonadagi qurilmada
	// "kechikkan" holatini noto'g'ri belgilab qo'yishi mumkin edi.
	const arrivalData = history
		.filter(r => r.arrivalTime)
		.map(r => {
			const { hour, minute } = getTashkentHourMinute(new Date(r.arrivalTime))
			const hourDecimal = hour + minute / 60
			return {
				label: formatShortDateFromDateString(r.dateString),
				hourDecimal,
				timeLabel: fmt(r.arrivalTime),
				late: hourDecimal > LATE_THRESHOLD_HOURS,
			}
		})

	if (notFound) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
				<FiUserX size={48} className="text-gray-300" />
				<p className="text-gray-500 font-medium">Xodim topilmadi</p>
				<button
					onClick={() => navigate(-1)}
					className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
				>
					Orqaga
				</button>
			</div>
		)
	}

	if (loading && !employee) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
				<div className="animate-pulse space-y-4">
					<div className="h-28 bg-white rounded-2xl border border-gray-100" />
					<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
						{[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-2xl border border-gray-100" />)}
					</div>
					<div className="h-64 bg-white rounded-2xl border border-gray-100" />
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
			{/* Sarlavha */}
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 mb-6">
				<button
					onClick={() => navigate(-1)}
					className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition mb-4"
				>
					<FiArrowLeft size={16} /> Orqaga
				</button>
				<div className="flex flex-col sm:flex-row sm:items-center gap-4">
					{employee?.photo ? (
						<img
							className="h-16 w-16 rounded-full object-cover shrink-0"
							src={`${BASE_URL}/uploads/${employee.photo}`}
							alt={employee?.fullName}
						/>
					) : (
						<div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium text-xl shrink-0">
							{employee?.fullName?.charAt(0)}
						</div>
					)}
					<div className="min-w-0">
						<h1 className="text-xl font-semibold text-gray-900 truncate">{employee?.fullName || '...'}</h1>
						<p className="text-sm text-gray-500 mt-0.5">
							{employee?.position || '—'} · {employee?.sinf?.name || '—'}
						</p>
						<div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-400">
							{publicId(employee?.hodimID) && <span>ID: {publicId(employee.hodimID)}</span>}
							{employee?.phone_personal && (
								<span className="flex items-center gap-1"><FiPhone size={11} /> {employee.phone_personal}</span>
							)}
							{employee?.phone_work && (
								<span className="flex items-center gap-1"><FiPhone size={11} /> {employee.phone_work}</span>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Davr tanlash */}
			<div className="flex flex-wrap items-center justify-between gap-3 mb-6">
				<div className="flex flex-wrap gap-2">
					{PERIODS.map(p => (
						<button
							key={p.key}
							onClick={() => applyPeriod(p.key)}
							className={`px-3 py-1.5 text-sm rounded-lg transition font-medium ${
								activePeriod === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
							}`}
						>
							{p.label}
						</button>
					))}
				</div>
				<button
					onClick={handleExport}
					className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-indigo-800 transition shadow-sm"
				>
					<FiDownload size={16} /> Excel yuklab olish
				</button>
			</div>

			{loading ? (
				<div className="flex justify-center items-center py-16">
					<PulseLoader color={BLUE} size={12} />
				</div>
			) : (
				<>
					{/* KPI qatori */}
					<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
						<KpiCard onClick={goTable} icon={<FiCalendar size={16} />} label="Jami kun" value={stats.totalDays} tone="blue" />
						<KpiCard onClick={goTable} icon={<FiUserCheck size={16} />} label="Kelgan kunlar" value={stats.presentDays} total={stats.totalDays} tone="good" />
						<KpiCard onClick={goTable} icon={<FiUserX size={16} />} label="Kelmagan kunlar" value={stats.absentDays} total={stats.totalDays} tone="critical" />
						<KpiCard onClick={goTable} icon={<FiClock size={16} />} label="O'rtacha ish soati" value={`${stats.averageHours} soat`} tone="blue" />
					</div>

					{history.length === 0 ? (
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center justify-center text-gray-400">
							<FiCalendar size={40} className="mb-3" />
							<p className="text-base font-medium text-gray-600">Bu davrda ma'lumot yo'q</p>
						</div>
					) : (
						<>
							<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
								{/* Davomat trendi */}
								<div onClick={goTable} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition">
									<h2 className="text-base font-semibold text-gray-800 mb-1">Davomat trendi</h2>
									<p className="text-sm text-gray-500 mb-4">Tanlangan davrda kunlik holat</p>
									<ResponsiveContainer width="100%" height={220}>
										<BarChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
											<CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
											<XAxis
												dataKey="label"
												tick={{ fill: INK_MUTED, fontSize: 11 }}
												axisLine={{ stroke: GRID }}
												tickLine={false}
												interval="preserveStartEnd"
											/>
											<YAxis hide domain={[0, 1]} />
											<Tooltip content={<TrendTooltipContent />} cursor={{ fill: 'rgba(42,120,214,0.05)' }} />
											<Bar dataKey="value" radius={[4, 4, 0, 0]}>
												{trendData.map((entry, i) => (
													<Cell key={i} fill={entry.status === 'absent' ? CRITICAL : entry.status === 'tashqarida' ? WARNING : GOOD} />
												))}
											</Bar>
										</BarChart>
									</ResponsiveContainer>
									<div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
										<span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: GOOD }} /> Keldi</span>
										<span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: WARNING }} /> Tashqarida</span>
										<span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CRITICAL }} /> Kelmadi</span>
									</div>
								</div>

								{/* Kelish vaqti tarqalishi */}
								<div onClick={goTable} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition">
									<h2 className="text-base font-semibold text-gray-800 mb-1">Kelish vaqti</h2>
									<p className="text-sm text-gray-500 mb-4">Ish boshlanishi (09:00) ga nisbatan</p>
									{arrivalData.length === 0 ? (
										<p className="text-sm text-gray-400 py-16 text-center">Kelish ma'lumotlari yo'q</p>
									) : (
										<ResponsiveContainer width="100%" height={220}>
											<BarChart data={arrivalData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
												<CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
												<XAxis
													dataKey="label"
													tick={{ fill: INK_MUTED, fontSize: 11 }}
													axisLine={{ stroke: GRID }}
													tickLine={false}
													interval="preserveStartEnd"
												/>
												<YAxis
													domain={['dataMin - 1', 'dataMax + 1']}
													tickFormatter={(v) => `${pad(Math.floor(v))}:00`}
													tick={{ fill: INK_MUTED, fontSize: 11 }}
													axisLine={false}
													tickLine={false}
													width={40}
												/>
												<Tooltip content={<ArrivalTooltipContent />} cursor={{ fill: 'rgba(42,120,214,0.05)' }} />
												<ReferenceLine
													y={WORK_START_HOUR}
													stroke={INK_SECONDARY}
													strokeDasharray="4 4"
													label={{ value: '09:00', position: 'insideTopRight', fill: INK_MUTED, fontSize: 11 }}
												/>
												<Bar dataKey="hourDecimal" radius={[4, 4, 0, 0]}>
													{arrivalData.map((entry, i) => (
														<Cell key={i} fill={entry.late ? CRITICAL : GOOD} />
													))}
												</Bar>
											</BarChart>
										</ResponsiveContainer>
									)}
								</div>
							</div>

							{/* Kunlik yozuvlar jadvali */}
							<div id="emp-daily-table" className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden scroll-mt-4">
								<div className="overflow-x-auto">
									<table className="min-w-full">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sana</th>
												<th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Holat</th>
												<th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
													<span className="flex items-center gap-1"><FiClock size={12} /> Kirish</span>
												</th>
												<th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
													<span className="flex items-center gap-1"><FiClock size={12} /> Chiqish</span>
												</th>
												<th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ish vaqti</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-gray-100">
											{history.map((record, i) => (
												<tr key={record._id || i} className={`hover:bg-gray-50 transition-colors ${!record.arrivalTime ? 'bg-rose-50' : ''}`}>
													<td className="px-4 py-3 text-sm font-medium text-gray-800 whitespace-nowrap">
														{formatShortDateFromDateString(record.dateString)}
													</td>
													<td className="px-4 py-3 text-sm whitespace-nowrap">{statusBadge(record)}</td>
													<td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">{fmt(record.arrivalTime)}</td>
													<td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">{fmt(record.departureTime)}</td>
													<td className="px-4 py-3 text-sm font-mono text-gray-700 whitespace-nowrap">{workDuration(record.hoursWorked)}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						</>
					)}
				</>
			)}
		</div>
	)
}

export default AdminEmployeeAnalytics

