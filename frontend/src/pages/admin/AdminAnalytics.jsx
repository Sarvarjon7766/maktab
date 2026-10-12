import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import {
	FiActivity,
	FiClock,
	FiDownload,
	FiFileText,
	FiLogIn,
	FiLogOut,
	FiUser,
	FiUserCheck,
	FiUsers,
} from 'react-icons/fi'
import { toast } from 'react-toastify'
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import KpiCard from '../../components/KpiCard'
import useLiveFeed from '../../hooks/useLiveFeed'
import { formatUzDate, formatUzTime, formatShortDateFromDateString, getWeekdayIndexFromDateString, UZ_WEEKDAYS_SHORT } from '../../utils/formatDate'
import { exportAnalyticsExcel, exportAnalyticsPDF } from '../../utils/exportAttendance'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'

// dataviz skill: sequential = bitta hue (ko'k), status holatlar uchun
// alohida (fixed) status-palette ishlatiladi — AdminHome.jsx bilan bir xil
// palitra, ikkala sahifa vizual jihatdan izchil bo'lishi uchun
const BLUE = '#2a78d6'
const BLUE_SOFT = 'rgba(42, 120, 214, 0.10)'
const GOOD = '#0ca30c'
const WARNING = '#fab219'
const CRITICAL = '#d03b3b'
const ROSE = '#e34968'
const INK_PRIMARY = '#0b0b0b'
const INK_SECONDARY = '#52514e'
const INK_MUTED = '#898781'
const GRID = '#e1e0d9'
const SURFACE = '#fcfcfb'

const RANGE_OPTIONS = [
	{ value: 7, label: '7 kun' },
	{ value: 30, label: '30 kun' },
	{ value: 90, label: '90 kun' },
	{ value: 365, label: '365 kun' },
]

const TrendTooltip = ({ active, payload, label }) => {
	if (!active || !payload?.length) return null
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-500 mb-1">{label}</p>
			<div className="flex items-center gap-2">
				<span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: BLUE }} />
				<span className="font-semibold text-gray-900">{payload[0]?.value}</span>
				<span className="text-gray-500">{tx("keldi")}</span>
			</div>
			<div className="flex items-center gap-2 mt-0.5">
				<span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: ROSE }} />
				<span className="font-semibold text-gray-900">{payload[1]?.value}</span>
				<span className="text-gray-500">{tx("kelmadi")}</span>
			</div>
		</div>
	)
}

const DeptTooltip = ({ active, payload }) => {
	if (!active || !payload?.length) return null
	const d = payload[0].payload
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-700 font-medium mb-1">{d.name}</p>
			<p><span className="font-semibold text-gray-900">{d.rate}%</span> <span className="text-gray-500">({tx("{{n}} xodim", { n: d.headcount })})</span></p>
		</div>
	)
}

const WeekdayTooltip = ({ active, payload }) => {
	if (!active || !payload?.length) return null
	const d = payload[0].payload
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-700 font-medium mb-1">{d.name}</p>
			<p><span className="font-semibold text-gray-900">{d.rate}%</span> <span className="text-gray-500">({tx("{{n}} kishi-kun", { n: d.total })})</span></p>
		</div>
	)
}

const HoursTooltip = ({ active, payload, label }) => {
	if (!active || !payload?.length) return null
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-500 mb-1">{label}</p>
			<div className="flex items-center gap-2">
				<span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: BLUE }} />
				<span className="font-semibold text-gray-900">{payload[0].value}</span>
				<span className="text-gray-500">{tx("soat")}</span>
			</div>
		</div>
	)
}

const CardSkeleton = ({ className = '' }) => (
	<div className={`bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse ${className}`}>
		<div className="h-full w-full bg-gray-50 rounded-2xl" />
	</div>
)

// Xodim avatari — rasm mavjud bo'lsa surat, aks holda ism bosh harfi bilan
// doiraviy fallback (AdminUsers.jsx / UserAttendanceModal.jsx bilan bir xil naqsh)
const Avatar = ({ photo, fullName, size = 'h-9 w-9' }) => (
	photo ? (
		<img
			src={`${uploadUrl(photo)}`}
			alt={fullName || ''}
			className={`${size} rounded-full object-cover shrink-0 border border-gray-100`}
		/>
	) : (
		<div className={`${size} rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold shrink-0`}>
			{fullName ? fullName.charAt(0).toUpperCase() : <FiUser size={14} />}
		</div>
	)
)

const EmptyList = ({ text = "Ma'lumot yo'q" }) => (
	<div className="flex flex-col items-center justify-center py-10 text-gray-400">
		<FiUsers size={32} className="mb-2" />
		<p className="text-sm">{text}</p>
	</div>
)

const AdminAnalytics = () => {
	const BASE_URL = import.meta.env.VITE_BASE_URL
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }

	// --- Davr bo'yicha tahlil holati ---
	const [range, setRange] = useState(30)
	const [loading, setLoading] = useState(true)
	const [analytics, setAnalytics] = useState(null)
	const [exportingExcel, setExportingExcel] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)
	// TOP-10dan tashqarisini ko'rish — backend endi 50tagacha qaytaradi
	const [showAllLate, setShowAllLate] = useState(false)
	const [showAllTop, setShowAllTop] = useState(false)
	// UserAttendanceModal.jsx dagi naqsh: davr tugmasi tez-tez bosilsa, eski
	// (sekin) so'rov yangisidan KEYIN qaytishi mumkin — shu holatda eski javob
	// to'g'ri natijani ustidan yozib qo'yardi. Har so'rovga tartib raqami
	// berib, faqat ENG OXIRGI so'rov javobini qabul qilamiz.
	const requestSeqRef = useRef(0)

	const fetchAnalytics = async (selectedRange) => {
		const seq = ++requestSeqRef.current
		try {
			setLoading(true)
			const res = await axios.get(`${BASE_URL}/api/user/dashboard-analytics`, {
				params: { range: selectedRange },
				headers,
			})
			if (seq !== requestSeqRef.current) return // eskirgan javob — e'tiborsiz qoldiramiz
			if (res.data.success) {
				setAnalytics(res.data)
			} else {
				setAnalytics(null)
				toast.error(res.data.message || "Tahlil ma'lumotlarini yuklashda xatolik")
			}
		} catch (err) {
			if (seq !== requestSeqRef.current) return
			setAnalytics(null)
			toast.error(err.response?.data?.message || "Tahlil ma'lumotlarini yuklashda xatolik")
		} finally {
			if (seq === requestSeqRef.current) setLoading(false)
		}
	}

	useEffect(() => {
		fetchAnalytics(range)
	}, [range])

	// --- Jonli kuzatish holati (umumiy hook — AdminHome.jsx ham ishlatadi) ---
	const { events: liveEvents, stats: liveStats, loading: liveLoading, lastUpdated } = useLiveFeed({ limit: 30 })

	const handleExportExcel = async () => {
		if (!analytics) return toast.error("Eksport uchun ma'lumot yo'q")
		setExportingExcel(true)
		try {
			const ok = exportAnalyticsExcel({
				range,
				trend: analytics.trend,
				bySinf: analytics.bySinf,
				lateLeaderboard: analytics.lateLeaderboard,
				topPerformers: analytics.topPerformers,
				avgWorkHoursTrend: analytics.avgWorkHoursTrend,
			})
			if (!ok) toast.error("Eksport uchun ma'lumot yo'q")
		} catch {
			toast.error("Excel eksport qilishda xatolik")
		} finally {
			setExportingExcel(false)
		}
	}

	const handleExportPdf = async () => {
		if (!analytics) return toast.error("Eksport uchun ma'lumot yo'q")
		setExportingPdf(true)
		try {
			exportAnalyticsPDF({
				range,
				bySinf: analytics.bySinf,
				lateLeaderboard: analytics.lateLeaderboard,
				topPerformers: analytics.topPerformers,
			})
		} catch {
			toast.error("PDF eksport qilishda xatolik")
		} finally {
			setExportingPdf(false)
		}
	}

	if (loading) {
		return (
			<div className="min-h-full bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					{[1, 2, 3, 4].map(i => <CardSkeleton key={i} className="h-36" />)}
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
					<CardSkeleton className="lg:col-span-2 h-80" />
					<CardSkeleton className="h-80" />
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					<CardSkeleton className="h-96" />
					<CardSkeleton className="h-96" />
				</div>
			</div>
		)
	}

	if (!analytics) {
		return (
			<div className="min-h-full flex items-center justify-center bg-gray-50">
				<p className="text-gray-500">{tx("Ma'lumot topilmadi")}</p>
			</div>
		)
	}

	const { trend = [], bySinf = [], lateLeaderboard = [], topPerformers = [], avgWorkHoursTrend = [] } = analytics

	const trendData = trend.map(t => ({
		...t,
		label: formatShortDateFromDateString(t.date),
	}))
	const deptData = bySinf.slice(0, 8) // token ceiling — 8 tadan ortig'i ko'rsatilmaydi
	const hoursData = avgWorkHoursTrend.map(h => ({
		...h,
		label: formatShortDateFromDateString(h.date),
	}))

	// Hafta kunlari bo'yicha davomat foizi — yangi so'rovsiz, mavjud
	// `trend`dan (kun bo'yicha present/absent) hisoblanadi. 7 kunlik davrda
	// har hafta kuniga ≤1 na'muna to'g'ri keladi va ma'nosiz bo'lgani uchun
	// faqat range >= 30'da ko'rsatiladi (pastda render qilinadi).
	const weekdayTotals = [0, 1, 2, 3, 4, 5, 6].map(() => ({ present: 0, absent: 0 }))
	trend.forEach(t => {
		const idx = getWeekdayIndexFromDateString(t.date)
		weekdayTotals[idx].present += t.present || 0
		weekdayTotals[idx].absent += t.absent || 0
	})
	// Dush(1) → Yak(0) tartibida — ish haftasi tabiiy tartibda o'qilsin
	const weekdayData = [1, 2, 3, 4, 5, 6, 0].map(idx => {
		const { present, absent } = weekdayTotals[idx]
		const total = present + absent
		return { name: UZ_WEEKDAYS_SHORT[idx], rate: total ? Math.round((present / total) * 100) : 0, total }
	})

	// Davr uchun umumlashtiruvchi ko'rsatkichlar — fetch qilingan
	// ma'lumotlardan olingan (backend alohida "summary" qaytarmaydi)
	const totalPresentDays = trend.reduce((sum, t) => sum + (t.present || 0), 0)
	const totalAbsentDays = trend.reduce((sum, t) => sum + (t.absent || 0), 0)
	const totalDaysSum = totalPresentDays + totalAbsentDays
	const avgDeptRate = bySinf.length
		? Math.round(bySinf.reduce((sum, d) => sum + (d.rate || 0), 0) / bySinf.length)
		: 0
	const avgWorkHours = avgWorkHoursTrend.length
		? (avgWorkHoursTrend.reduce((sum, h) => sum + (h.avgHours || 0), 0) / avgWorkHoursTrend.length).toFixed(1)
		: '0.0'
	const totalLateCount = lateLeaderboard.reduce((sum, r) => sum + (r.lateCount || 0), 0)

	const nowWorking = liveStats ? Math.max(liveStats.keldi - liveStats.ketdi, 0) : null
	const totalHeadcount = liveStats ? liveStats.total : null

	return (
		<div className="min-h-full bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
			<div>
				{/* Sarlavha + davr tanlovchi */}
				<div className="flex flex-wrap items-center justify-between gap-3 mb-6">
					<p className="text-sm text-gray-500">{formatUzDate(new Date())}</p>
					<div className="bg-white rounded-xl border border-gray-100 shadow-sm p-1 inline-flex">
						{RANGE_OPTIONS.map(opt => (
							<button
								key={opt.value}
								onClick={() => setRange(opt.value)}
								className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
									range === opt.value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
				</div>

				{/* ===================== STATISTIKA ===================== */}
				<section className="mb-8">
					<h2 className="text-lg font-semibold text-gray-800 mb-3">{tx("Statistika")}</h2>

					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
						<KpiCard icon={<FiUserCheck size={16} />} label={tx("Kelgan kunlar (davr)")} value={totalPresentDays} total={totalDaysSum || undefined} tone="good" />
						<KpiCard icon={<FiUsers size={16} />} label={tx("Sinflar o'rtacha davomati")} value={`${avgDeptRate}%`} tone="blue" />
						<KpiCard icon={<FiClock size={16} />} label={tx("Jami kechikishlar (top 10)")} value={totalLateCount} tone="warning" />
						<KpiCard icon={<FiActivity size={16} />} label={tx("O'rtacha ish soati")} value={`${avgWorkHours} soat`} tone="critical" />
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
						{/* Trend chart — davomat: keldi/kelmadi */}
						<div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("Davomat trendi")}</h3>
							<p className="text-sm text-gray-500 mb-4">{tx("So'nggi {{range}} kunda kelgan/kelmagan xodimlar soni", { range })}</p>
							{trendData.length === 0 ? (
								<EmptyList text={tx("Trend ma'lumoti yo'q")} />
							) : (
								<ResponsiveContainer width="100%" height={260}>
									<AreaChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
										<CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
										<XAxis
											dataKey="label"
											tick={{ fill: INK_MUTED, fontSize: 12 }}
											axisLine={{ stroke: GRID }}
											tickLine={false}
											interval="preserveStartEnd"
										/>
										<YAxis
											tick={{ fill: INK_MUTED, fontSize: 12 }}
											axisLine={false}
											tickLine={false}
											allowDecimals={false}
											width={32}
										/>
										<Tooltip content={<TrendTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
										<Area
											type="monotone"
											dataKey="present"
											stroke={BLUE}
											strokeWidth={2}
											fill={BLUE_SOFT}
											dot={false}
											activeDot={{ r: 4, fill: BLUE, stroke: SURFACE, strokeWidth: 2 }}
										/>
										<Area
											type="monotone"
											dataKey="absent"
											stroke={ROSE}
											strokeWidth={2}
											fill="rgba(227, 73, 104, 0.08)"
											dot={false}
											activeDot={{ r: 4, fill: ROSE, stroke: SURFACE, strokeWidth: 2 }}
										/>
									</AreaChart>
								</ResponsiveContainer>
							)}
						</div>

						{/* Sinflar bo'yicha davomat foizi */}
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("Sinflar bo'yicha")}</h3>
							<p className="text-sm text-gray-500 mb-4">{tx("Davr davomida davomat foizi")}</p>
							{deptData.length === 0 ? (
								<EmptyList text={tx("Sinf ma'lumotlari yo'q")} />
							) : (
								<ResponsiveContainer width="100%" height={Math.max(deptData.length * 42, 120)}>
									<BarChart
										data={deptData}
										layout="vertical"
										margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
										barSize={16}
									>
										<CartesianGrid stroke={GRID} horizontal={false} strokeWidth={1} />
										<XAxis type="number" domain={[0, 100]} hide />
										<YAxis
											type="category"
											dataKey="name"
											tick={{ fill: INK_SECONDARY, fontSize: 12 }}
											axisLine={false}
											tickLine={false}
											width={90}
										/>
										<Tooltip content={<DeptTooltip />} cursor={{ fill: 'rgba(42,120,214,0.05)' }} />
										<Bar dataKey="rate" fill={BLUE} radius={[0, 4, 4, 0]}>
											<LabelList
												dataKey="rate"
												position="right"
												formatter={(v) => `${v}%`}
												style={{ fill: INK_PRIMARY, fontSize: 12, fontWeight: 600 }}
											/>
										</Bar>
									</BarChart>
								</ResponsiveContainer>
							)}
						</div>
					</div>

					{/* Kechikuvchilar / intizomlilar */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("Eng ko'p kechikkan xodimlar")}</h3>
							<p className="text-sm text-gray-500 mb-4">
								{tx("Davr bo'yicha eng ko'p kechikkan {{n}} nafar", { n: showAllLate ? lateLeaderboard.length : Math.min(10, lateLeaderboard.length) })}
							</p>
							{lateLeaderboard.length === 0 ? (
								<EmptyList />
							) : (
								<>
									<ul className={`divide-y divide-gray-100 ${showAllLate ? 'max-h-96 overflow-y-auto' : ''}`}>
										{(showAllLate ? lateLeaderboard : lateLeaderboard.slice(0, 10)).map((r, i) => (
											<li key={r.userId || i} className="flex items-center gap-3 py-2.5">
												<span className="text-xs font-semibold text-gray-400 w-4 shrink-0">{i + 1}</span>
												<Avatar photo={r.photo} fullName={r.fullName} />
												<div className="min-w-0 flex-1">
													<p className="text-sm font-medium text-gray-900 truncate">{r.fullName}</p>
													<p className="text-xs text-gray-500 truncate">{r.sinf || tx("Sinfsiz")}</p>
												</div>
												<span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
													{tx("{{n}} marta", { n: r.lateCount })}
												</span>
											</li>
										))}
									</ul>
									{lateLeaderboard.length > 10 && (
										<button
											onClick={() => setShowAllLate(v => !v)}
											className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
										>
											{showAllLate ? tx("Faqat TOP 10") : `Barchasini ko'rish (${lateLeaderboard.length})`}
										</button>
									)}
								</>
							)}
						</div>

						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("Eng intizomli xodimlar")}</h3>
							<p className="text-sm text-gray-500 mb-4">
								{tx("O'z vaqtida kelish foizi eng yuqori {{n}} nafar", { n: showAllTop ? topPerformers.length : Math.min(10, topPerformers.length) })}
							</p>
							{topPerformers.length === 0 ? (
								<EmptyList />
							) : (
								<>
									<ul className={`divide-y divide-gray-100 ${showAllTop ? 'max-h-96 overflow-y-auto' : ''}`}>
										{(showAllTop ? topPerformers : topPerformers.slice(0, 10)).map((r, i) => (
											<li key={r.userId || i} className="flex items-center gap-3 py-2.5">
												<span className="text-xs font-semibold text-gray-400 w-4 shrink-0">{i + 1}</span>
												<Avatar photo={r.photo} fullName={r.fullName} />
												<div className="min-w-0 flex-1">
													<p className="text-sm font-medium text-gray-900 truncate">{r.fullName}</p>
													<p className="text-xs text-gray-500 truncate">{r.sinf || tx("Sinfsiz")}</p>
												</div>
												<span className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
													{r.onTimeRate}%
												</span>
											</li>
										))}
									</ul>
									{topPerformers.length > 10 && (
										<button
											onClick={() => setShowAllTop(v => !v)}
											className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
										>
											{showAllTop ? tx("Faqat TOP 10") : `Barchasini ko'rish (${topPerformers.length})`}
										</button>
									)}
								</>
							)}
						</div>
					</div>

					{/* O'rtacha ish soati */}
					<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
						<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("O'rtacha ish soati")}</h3>
						<p className="text-sm text-gray-500 mb-4">{tx("Kun bo'yicha o'rtacha ishlangan soatlar")}</p>
						{hoursData.length === 0 ? (
							<EmptyList text={tx("Ish soati ma'lumoti yo'q")} />
						) : (
							<ResponsiveContainer width="100%" height={220}>
								<LineChart data={hoursData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
									<CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
									<XAxis
										dataKey="label"
										tick={{ fill: INK_MUTED, fontSize: 12 }}
										axisLine={{ stroke: GRID }}
										tickLine={false}
										interval="preserveStartEnd"
									/>
									<YAxis
										tick={{ fill: INK_MUTED, fontSize: 12 }}
										axisLine={false}
										tickLine={false}
										width={32}
									/>
									<Tooltip content={<HoursTooltip />} cursor={{ stroke: GRID, strokeWidth: 1 }} />
									<Line
										type="monotone"
										dataKey="avgHours"
										stroke={BLUE}
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 4, fill: BLUE, stroke: SURFACE, strokeWidth: 2 }}
									/>
								</LineChart>
							</ResponsiveContainer>
						)}
					</div>

					{/* Hafta kunlari bo'yicha naqsh — 7 kunlik davrda ma'nosiz
						(har kunga ≤1 na'muna to'g'ri keladi), shuning uchun
						faqat 30+ kunlik davrda ko'rsatiladi */}
					{range >= 30 && (
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-4">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("Haftaning kunlari bo'yicha davomat")}</h3>
							<p className="text-sm text-gray-500 mb-4">{tx("Qaysi kunda davomat past — shu kunga alohida e'tibor kerak bo'lishi mumkin")}</p>
							<ResponsiveContainer width="100%" height={220}>
								<BarChart data={weekdayData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
									<CartesianGrid stroke={GRID} vertical={false} strokeWidth={1} />
									<XAxis
										dataKey="name"
										tick={{ fill: INK_MUTED, fontSize: 12 }}
										axisLine={{ stroke: GRID }}
										tickLine={false}
									/>
									<YAxis
										domain={[0, 100]}
										tick={{ fill: INK_MUTED, fontSize: 12 }}
										axisLine={false}
										tickLine={false}
										width={32}
									/>
									<Tooltip content={<WeekdayTooltip />} cursor={{ fill: 'rgba(42,120,214,0.05)' }} />
									<Bar dataKey="rate" fill={BLUE} radius={[4, 4, 0, 0]}>
										<LabelList
											dataKey="rate"
											position="top"
											formatter={(v) => `${v}%`}
											style={{ fill: INK_PRIMARY, fontSize: 12, fontWeight: 600 }}
										/>
									</Bar>
								</BarChart>
							</ResponsiveContainer>
						</div>
					)}
				</section>

				{/* ===================== JONLI KUZATISH ===================== */}
				<section className="mb-8">
					<div className="flex items-center justify-between mb-3">
						<h2 className="text-lg font-semibold text-gray-800">{tx("Jonli kuzatish")}</h2>
						<span className="text-xs text-gray-400 flex items-center gap-1.5">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
							</span>
							{lastUpdated ? `yangilanmoqda... (${formatUzTime(lastUpdated)})` : tx("yangilanmoqda...")}
						</span>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
						{/* Hozir ishda indikatori */}
						<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col justify-center items-center text-center">
							<div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-3">
								<FiUsers size={24} />
							</div>
							<p className="text-sm text-gray-500 mb-1">{tx("Hozir ishda")}</p>
							<p className="text-3xl font-semibold text-gray-900">
								{nowWorking !== null ? nowWorking : '—'}
								<span className="text-lg font-normal text-gray-400"> / {totalHeadcount !== null ? totalHeadcount : '—'}</span>
							</p>
							<p className="text-xs text-gray-400 mt-1">{tx("xodim")}</p>
						</div>

						{/* Jonli hodisalar ro'yxati */}
						<div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h3 className="text-base font-semibold text-gray-800 mb-1">{tx("So'nggi hodisalar")}</h3>
							<p className="text-sm text-gray-500 mb-4">{tx("Tizim bo'yicha oxirgi 30 ta kirish/chiqish")}</p>
							{liveLoading && liveEvents.length === 0 ? (
								<div className="py-10 text-center text-sm text-gray-400">{tx("Yuklanmoqda...")}</div>
							) : liveEvents.length === 0 ? (
								<EmptyList text={tx("Hozircha hodisalar yo'q")} />
							) : (
								<ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
									{liveEvents.map((e) => (
										<li key={e.id} className="flex items-center gap-3 py-2.5">
											<Avatar photo={e.photo} fullName={e.fullName} />
											<div className="min-w-0 flex-1">
												<p className="text-sm font-medium text-gray-900 truncate">{e.fullName}</p>
												<p className="text-xs text-gray-500 truncate">{e.sinf || tx("Sinfsiz")}{e.position ? ` · ${e.position}` : ''}</p>
											</div>
											<span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
												e.type === 'entry' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
											}`}>
												{e.type === 'entry' ? <FiLogIn size={12} /> : <FiLogOut size={12} />}
												{e.type === 'entry' ? tx("Kirdi") : tx("Chiqdi")}
											</span>
											<span className="shrink-0 text-xs font-mono text-gray-500 w-12 text-right">
												{formatUzTime(new Date(e.time))}
											</span>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</section>

				{/* ===================== EKSPORT ===================== */}
				<section>
					<h2 className="text-lg font-semibold text-gray-800 mb-3">{tx("Eksport")}</h2>
					<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
						<p className="text-sm text-gray-500 mb-4">
							{tx("Tanlangan davr ({{label}}) uchun to'liq tahlil hisobotini yuklab oling.", { label: RANGE_OPTIONS.find(o => o.value === range)?.label })}
						</p>
						<div className="flex flex-col sm:flex-row gap-3">
							<button
								onClick={handleExportExcel}
								disabled={exportingExcel}
								className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-800 transition shadow-sm disabled:opacity-60"
							>
								<FiDownload size={16} />
								{exportingExcel ? tx("Tayyorlanmoqda...") : tx("Excel yuklab olish")}
							</button>
							<button
								onClick={handleExportPdf}
								disabled={exportingPdf}
								className="inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm disabled:opacity-60"
							>
								<FiFileText size={16} />
								{exportingPdf ? tx("Tayyorlanmoqda...") : tx("PDF yuklab olish")}
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	)
}

export default AdminAnalytics

