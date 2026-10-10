import axios from 'axios'
import { useState, useEffect } from 'react'
import { FiUserCheck, FiLogOut, FiClock, FiUserX, FiDownload, FiBarChart2, FiFileText, FiLogIn, FiUser, FiUsers } from 'react-icons/fi'
import { Link, useNavigate } from 'react-router-dom'
import KpiCard from '../../components/KpiCard'
import useLiveFeed from '../../hooks/useLiveFeed'
import { formatUzDate, formatUzTime, formatShortDateFromDateString } from '../../utils/formatDate'
import { exportDailySnapshotExcel } from '../../utils/exportAttendance'
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'
import { toast } from 'react-toastify'

// dataviz skill: sequential = bitta hue (ko'k), status holatlar uchun
// alohida (fixed) status-palette ishlatiladi — hech qachon aralashtirilmaydi
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

const TrendTooltip = ({ active, payload, label }) => {
	if (!active || !payload?.length) return null
	return (
		<div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm">
			<p className="text-gray-500 mb-1">{label}</p>
			<div className="flex items-center gap-2">
				<span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: BLUE }} />
				<span className="font-semibold text-gray-900">{payload[0].value}</span>
				<span className="text-gray-500">keldi</span>
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
			<p><span className="font-semibold text-gray-900">{d.rate}%</span> <span className="text-gray-500">({d.present}/{d.total} xodim)</span></p>
		</div>
	)
}

const CardSkeleton = ({ className = '' }) => (
	<div className={`bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse ${className}`}>
		<div className="h-full w-full bg-gray-50 rounded-2xl" />
	</div>
)

// Xodim avatari — AdminAnalytics.jsx / AdminAttandance.jsx bilan bir xil naqsh
const Avatar = ({ photo, fullName, size = 'h-9 w-9' }) => (
	photo ? (
		<img
			src={`${import.meta.env.VITE_BASE_URL}/uploads/${photo}`}
			alt={fullName || ''}
			className={`${size} rounded-full object-cover shrink-0 border border-gray-100`}
		/>
	) : (
		<div className={`${size} rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold shrink-0`}>
			{fullName ? fullName.charAt(0).toUpperCase() : <FiUser size={14} />}
		</div>
	)
)

const AdminHome = () => {
	const BASE_URL = import.meta.env.VITE_BASE_URL
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }
	const [loading, setLoading] = useState(true)
	const [stats, setStats] = useState(null)
	const [exporting, setExporting] = useState(false)
	// AdminHome /admin va /user (super-admin) rollari ostida bir xil
	// komponent sifatida ishlatiladi — "Tahlil" havolasi joriy rolga mos
	// (/admin/analytics yoki /user/analytics) bo'lishi uchun URL'dan olinadi
	const roleBase = (window.location.pathname.match(/^\/platform\/schools\/[^/]+/)?.[0] || '/' + (window.location.pathname.split('/')[1] || 'admin')).replace(/^\//, '')
	const navigate = useNavigate()

	useEffect(() => {
		const fetchStats = async () => {
			try {
				setLoading(true)
				const res = await axios.get(`${BASE_URL}/api/user/dashboard-stats`, { headers })
				if (res.data.success) setStats(res.data)
				else toast.error(res.data.message || "Statistikani yuklashda xatolik")
			} catch (err) {
				toast.error(err.response?.data?.message || "Statistikani yuklashda xatolik")
			} finally {
				setLoading(false)
			}
		}
		fetchStats()
	}, [])

	const statusLabel = (s) => ({ ishda: 'Ishda', tashqarida: 'Tashqarida', kelmagan: 'Kelmagan' }[s] || "Noma'lum")

	const { events: liveEvents, loading: liveLoading } = useLiveFeed({ limit: 8 })

	const exportToExcel = async () => {
		setExporting(true)
		try {
			const res = await axios.get(`${BASE_URL}/api/user/getAll`, { headers })
			if (!res.data.success) {
				toast.error(res.data.message || "Ma'lumot topilmadi")
				return
			}
			if (!exportDailySnapshotExcel(res.data.users, statusLabel)) {
				toast.error("Eksport uchun ma'lumot yo'q")
			}
		} catch (err) {
			toast.error("Eksport qilishda xatolik")
		} finally {
			setExporting(false)
		}
	}

	if (loading) {
		return (
			<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					{[1, 2, 3, 4].map(i => <CardSkeleton key={i} className="h-36" />)}
				</div>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					<CardSkeleton className="lg:col-span-2 h-80" />
					<CardSkeleton className="h-80" />
				</div>
			</div>
		)
	}

	if (!stats) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<p className="text-gray-500">Ma'lumot topilmadi</p>
			</div>
		)
	}

	const { today, trend, bySinf } = stats
	const trendData = trend.map(t => ({
		...t,
		label: formatShortDateFromDateString(t.date),
	}))
	const deptData = bySinf.slice(0, 8) // token ceiling — 8 tadan ortig'i ko'rsatilmaydi

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
			<div>
				<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
					<div>
						<h1 className="text-2xl font-semibold text-gray-900">Boshqaruv paneli</h1>
						<p className="text-sm text-gray-500 mt-0.5">
							{formatUzDate(new Date())}
							<span className="inline-flex items-center gap-1.5 ml-3 text-emerald-600 font-medium">
								<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
								Hozir ishda: {Math.max(today.keldi - today.ketdi, 0)} / {today.total}
							</span>
						</p>
					</div>
					<div className="flex gap-2 w-full sm:w-auto shrink-0">
						<Link
							to={`/${roleBase}/reports`}
							className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm"
						>
							<FiFileText size={16} />
							Hisobotlar
						</Link>
						<Link
							to={`/${roleBase}/analytics`}
							className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition shadow-sm"
						>
							<FiBarChart2 size={16} />
							Batafsil tahlil
						</Link>
						<button
							onClick={exportToExcel}
							disabled={exporting}
							className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-800 transition shadow-sm disabled:opacity-60"
						>
							<FiDownload size={16} />
							{exporting ? "Tayyorlanmoqda..." : "Bugungi Excel"}
						</button>
					</div>
				</div>

				{/* KPI qatori */}
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
					<KpiCard to={`/${roleBase}/attandance`} icon={<FiUserCheck size={16} />} label="Keldi" value={today.keldi} total={today.total} tone="good" />
					<KpiCard to={`/${roleBase}/entry-exit`} icon={<FiLogOut size={16} />} label="Ketdi" value={today.ketdi} total={today.total} tone="rose" />
					<KpiCard to={`/${roleBase}/late`} icon={<FiClock size={16} />} label="Kechikdi" value={today.kechikdi} total={today.total} tone="warning" />
					<KpiCard to={`/${roleBase}/attandance`} icon={<FiUserX size={16} />} label="Kelmadi" value={today.kelmagan} total={today.total} tone="critical" />
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
					{/* Trend chart — oxirgi 14 kun, bitta seriya (kelgan xodimlar soni) */}
					<div onClick={() => navigate(`/${roleBase}/analytics`)} className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition">
						<h2 className="text-base font-semibold text-gray-800 mb-1">Davomat trendi</h2>
						<p className="text-sm text-gray-500 mb-4">Oxirgi 14 kunda kelgan xodimlar soni</p>
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
							</AreaChart>
						</ResponsiveContainer>
					</div>

					{/* Sinflar bo'yicha bugungi davomat foizi */}
					<div onClick={() => navigate(`/${roleBase}/sinf`)} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 cursor-pointer hover:shadow-md transition">
						<h2 className="text-base font-semibold text-gray-800 mb-1">Sinflar bo'yicha</h2>
						<p className="text-sm text-gray-500 mb-4">Bugungi davomat foizi</p>
						{deptData.length === 0 ? (
							<p className="text-sm text-gray-400 py-10 text-center">Sinf ma'lumotlari yo'q</p>
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

				{/* So'nggi hodisalar — jonli oqim (AdminAnalytics.jsx bilan bir xil useLiveFeed hook) */}
				<div className="mt-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
					<div className="flex items-center justify-between mb-1">
						<h2 className="text-base font-semibold text-gray-800">So'nggi hodisalar</h2>
						<span className="text-xs text-gray-400 flex items-center gap-1.5">
							<span className="relative flex h-2 w-2">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
								<span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
							</span>
							yangilanmoqda...
						</span>
					</div>
					<p className="text-sm text-gray-500 mb-4">Tizim bo'yicha oxirgi kirish/chiqishlar</p>
					{liveLoading && liveEvents.length === 0 ? (
						<div className="py-10 text-center text-sm text-gray-400">Yuklanmoqda...</div>
					) : liveEvents.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-10 text-gray-400">
							<FiUsers size={32} className="mb-2" />
							<p className="text-sm">Hozircha hodisalar yo'q</p>
						</div>
					) : (
						<ul className="divide-y divide-gray-100">
							{liveEvents.map((e) => (
								<li key={e.id} className="flex items-center gap-3 py-2.5">
									<Avatar photo={e.photo} fullName={e.fullName} />
									<div className="min-w-0 flex-1">
										<p className="text-sm font-medium text-gray-900 truncate">{e.fullName}</p>
										<p className="text-xs text-gray-500 truncate">{e.sinf || "Sinfsiz"}{e.position ? ` · ${e.position}` : ''}</p>
									</div>
									<span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
										e.type === 'entry' ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-700'
									}`}>
										{e.type === 'entry' ? <FiLogIn size={12} /> : <FiLogOut size={12} />}
										{e.type === 'entry' ? 'Kirdi' : 'Chiqdi'}
									</span>
									<span className="shrink-0 text-xs font-mono text-gray-500 w-12 text-right">
										{formatUzTime(new Date(e.time))}
									</span>
								</li>
							))}
						</ul>
					)}
					<Link
						to={`/${roleBase}/analytics`}
						className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
					>
						Barchasini ko'rish →
					</Link>
				</div>
			</div>
		</div>
	)
}

export default AdminHome

