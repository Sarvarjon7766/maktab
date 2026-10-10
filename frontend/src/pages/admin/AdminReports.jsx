import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiCalendar, FiDownload, FiFileText, FiGrid } from 'react-icons/fi'
import { FaFileExcel, FaFilePdf } from 'react-icons/fa'
import { toast } from 'react-toastify'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import TabelExportPanel from '../../components/TabelExportPanel'
import { useLocation, useNavigate } from 'react-router-dom'
import AutoReports from '../../components/AutoReports'
import ReportCenter from '../../components/ReportCenter'
import { exportDailySnapshotExcel, exportAnalyticsExcel, exportAnalyticsPDF } from '../../utils/exportAttendance'
import { formatShortDateFromDateString } from '../../utils/formatDate'

const BASE_URL = import.meta.env.VITE_BASE_URL

const RANGE_OPTIONS = [
	{ value: 7, label: '7 kun' },
	{ value: 30, label: '30 kun' },
	{ value: 90, label: '90 kun' },
	{ value: 365, label: '365 kun' },
]

const statusLabel = (s) => ({ ishda: 'Ishda', tashqarida: 'Tashqarida', kelmagan: 'Kelmagan' }[s] || "Noma'lum")

// Hisobotlar markazi — moderator/admin uchun barcha eksport turlari bitta
// joyda. Har bir karta o'z ma'lumotini o'zi yuklaydi (AdminHome.jsx /
// AdminAnalytics.jsx / AdminAttandance.jsx'dagi bilan bir xil endpointlar
// va umumiy eksport util'lari — bu yerda yangi backend so'rov turi yo'q).
const AdminReports = () => {
	const navigate = useNavigate()
	const token = localStorage.getItem('token')
	const headers = { Authorization: `Bearer ${token}` }

	// --- a) Bugungi hisobot ---
	const [dailyExporting, setDailyExporting] = useState(false)
	const exportDaily = async () => {
		setDailyExporting(true)
		try {
			const res = await axios.get(`${BASE_URL}/api/user/getAll`, { headers })
			if (!res.data.success) {
				toast.error(res.data.message || "Ma'lumot topilmadi")
				return
			}
			if (!exportDailySnapshotExcel(res.data.users, statusLabel)) {
				toast.error("Eksport uchun ma'lumot yo'q")
			}
		} catch {
			toast.error("Eksport qilishda xatolik")
		} finally {
			setDailyExporting(false)
		}
	}

	// --- b) Davr tahlili ---
	const [range, setRange] = useState(30)
	const [rangeLoading, setRangeLoading] = useState(true)
	const [analytics, setAnalytics] = useState(null)
	const [exportingExcel, setExportingExcel] = useState(false)
	const [exportingPdf, setExportingPdf] = useState(false)
	const trendData = (analytics?.trend || []).map(item => ({
		name: formatShortDateFromDateString(item.date),
		Keldi: item.present || 0,
		Kelmadi: item.absent || 0,
	}))

	useEffect(() => {
		let cancelled = false
		const fetchAnalytics = async () => {
			setRangeLoading(true)
			try {
				const res = await axios.get(`${BASE_URL}/api/user/dashboard-analytics`, { params: { range }, headers })
				if (cancelled) return
				setAnalytics(res.data.success ? res.data : null)
			} catch {
				if (!cancelled) setAnalytics(null)
			} finally {
				if (!cancelled) setRangeLoading(false)
			}
		}
		fetchAnalytics()
		return () => { cancelled = true }
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [range])

	const handleExportRangeExcel = async () => {
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

	const handleExportRangePdf = async () => {
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

	// --- c) Tabel ---
	const [sinfs, setSinfs] = useState([])
	useEffect(() => {
		axios.get(`${BASE_URL}/api/sinf/getAll`, { headers })
			.then(res => { if (res.data.success) setSinfs(res.data.sinfs || []) })
			.catch(() => {})
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6">
			<div className="mb-6">
				<h1 className="text-2xl font-bold tracking-tight text-slate-900">Hisobotlar</h1>
				<p className="text-sm text-gray-500 mt-0.5">Maktab bo'yicha Excel hisobotlari: davomat, intizom, sinflar, kameralar va ota-onalar</p>
			</div>

			<ReportCenter />

			<h2 className="mb-3 mt-8 text-sm font-semibold text-slate-700">Xodimlar tahlili, tabel va PDF</h2>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
				{/* a) Bugungi hisobot */}
				<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col hover:shadow-md transition-shadow">
					<div className="flex items-center gap-2 mb-1">
						<FiFileText className="text-blue-600" size={18} />
						<h2 className="text-base font-semibold text-gray-800">Bugungi hisobot</h2>
					</div>
					<p className="text-sm text-gray-500 mb-4 flex-1">
						Barcha xodimlarning bugungi holati (kelgan/kelmagan, birinchi kirish, oxirgi chiqish) — bitta Excel varag'ida.
					</p>
					<button
						onClick={exportDaily}
						disabled={dailyExporting}
						className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl hover:from-blue-700 hover:to-indigo-800 transition shadow-sm disabled:opacity-60"
					>
						<FiDownload size={16} />
						{dailyExporting ? "Tayyorlanmoqda..." : "Bugungi Excel"}
					</button>
				</div>

				{/* b) Davr tahlili */}
				<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col hover:shadow-md transition-shadow">
					<div className="flex items-center gap-2 mb-1">
						<FiGrid className="text-blue-600" size={18} />
						<h2 className="text-base font-semibold text-gray-800">Davr tahlili</h2>
					</div>
					<p className="text-sm text-gray-500 mb-3">
						Trend, sinflar bo'yicha davomat, kechikish/intizom reytingi — tanlangan davr bo'yicha.
					</p>
					<div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
						{RANGE_OPTIONS.map(opt => (
							<button
								key={opt.value}
								onClick={() => setRange(opt.value)}
								className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
									range === opt.value ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
								}`}
							>
								{opt.label}
							</button>
						))}
					</div>
					<div className="flex gap-2 mt-auto">
						<button
							onClick={handleExportRangeExcel}
							disabled={rangeLoading || exportingExcel || !analytics}
							className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-medium px-3 py-2.5 rounded-xl hover:shadow-md transition disabled:opacity-60"
						>
							<FaFileExcel size={14} />
							{exportingExcel ? '...' : 'Excel'}
						</button>
						<button
							onClick={handleExportRangePdf}
							disabled={rangeLoading || exportingPdf || !analytics}
							className="flex-1 inline-flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-medium px-3 py-2.5 rounded-xl hover:shadow-md transition disabled:opacity-60"
						>
							<FaFilePdf size={14} />
							{exportingPdf ? '...' : 'PDF'}
						</button>
					</div>
				</div>

				{/* c) Tabel */}
				<div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col hover:shadow-md transition-shadow">
					<div className="flex items-center gap-2 mb-1">
						<FiCalendar className="text-blue-600" size={18} />
						<h2 className="text-base font-semibold text-gray-800">Tabel</h2>
					</div>
					<p className="text-sm text-gray-500 mb-4">
						Xodim yoki o'quvchi uchun kalendar ko'rinishidagi davomat jadvali, tanlangan sana oralig'ida.
					</p>
					<TabelExportPanel sinfs={sinfs} />
				</div>
			</div>

			<section onClick={() => navigate('../analytics')} title="Batafsil tahlil" className="mt-5 cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
					<div>
						<h2 className="font-semibold text-slate-900">Davomat dinamikasi</h2>
						<p className="mt-1 text-sm text-slate-500">Oxirgi {range} kun bo‘yicha kelgan va kelmagan xodimlar</p>
					</div>
					<div className="flex gap-4 text-xs font-medium text-slate-600">
						<span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Keldi</span>
						<span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-rose-500" />Kelmadi</span>
					</div>
				</div>
				{rangeLoading ? <div className="h-64 animate-pulse rounded-xl bg-slate-100" /> : trendData.length ? (
					<ResponsiveContainer width="100%" height={260}>
						<AreaChart data={trendData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
							<defs>
								<linearGradient id="reportsPresentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
								<linearGradient id="reportsAbsentFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity={0.16} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
							</defs>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} minTickGap={24} />
							<YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
							<Tooltip contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', boxShadow: '0 8px 24px rgba(15,23,42,.08)' }} />
							<Area type="monotone" dataKey="Keldi" stroke="#2563eb" strokeWidth={2.5} fill="url(#reportsPresentFill)" />
							<Area type="monotone" dataKey="Kelmadi" stroke="#e11d48" strokeWidth={2.5} fill="url(#reportsAbsentFill)" />
						</AreaChart>
					</ResponsiveContainer>
				) : <div className="flex h-64 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">Tanlangan davr uchun statistik ma’lumot topilmadi.</div>}
			</section>

			<AutoReports />
		</div>
	)
}

export default AdminReports

