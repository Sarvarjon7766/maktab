import axios from 'axios'
import { useState } from 'react'
import { FaFileExcel, FaFilePdf, FaRegCalendarAlt } from 'react-icons/fa'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx-js-style'
import { buildTabelWorkbook, buildTabelPdf } from '../utils/tabelExport'
import SearchableSelect from './SearchableSelect'

// Tabel (davomat jadvali) yuklab olish paneli — AdminAttandance.jsx'dagi
// boshqaruvlardan ajratib olingan, AdminReports.jsx ham qayta ishlatadi.
// Xodim yoki o'quvchi uchun, ikkalasi ham /logstatistiks endpointlaridan
// bir xil `stats` shaklini oladi (buildTabelWorkbook/buildTabelPdf ikkalasida
// ham ishlaydi).
const TabelExportPanel = ({ sinfs = [] }) => {
	const token = localStorage.getItem('token')
	const [tabelPersonType, setTabelPersonType] = useState('staff')
	const [tabelSinfId, setTabelSinfId] = useState('all')
	const [startDate, setStartDate] = useState('')
	const [endDate, setEndDate] = useState('')
	const [downloadLoading, setDownloadLoading] = useState(false)
	const [downloadingPdf, setDownloadingPdf] = useState(false)

	const fetchStats = async () => {
		const isStudent = tabelPersonType === 'student'
		const url = isStudent
			? `${import.meta.env.VITE_BASE_URL}/api/student/logstatistiks`
			: `${import.meta.env.VITE_BASE_URL}/api/user/logstatistiks`
		const params = { startDate, endDate }
		if (isStudent && tabelSinfId !== 'all') params.sinfId = tabelSinfId

		const { data } = await axios.get(url, {
			headers: { Authorization: `Bearer ${token}` },
			params,
		})
		if (!data.success) throw new Error('Statistika olishda xato')
		return { stats: data.stats, isStudent }
	}

	const handleDownloadExcel = async () => {
		if (!startDate || !endDate) {
			toast.error("Iltimos, boshlangʻich va tugash sanalarini tanlang")
			return
		}
		try {
			setDownloadLoading(true)
			const { stats, isStudent } = await fetchStats()
			const wb = buildTabelWorkbook(stats, {
				personColumnLabel: isStudent ? "Sinfi" : "Ish joyi va lavozimi",
			})
			const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" })
			saveAs(
				new Blob([wbout], { type: "application/octet-stream" }),
				`${isStudent ? "Oquvchilar_davomat" : "Davomat"}_${startDate}_${endDate}.xlsx`
			)
			toast.success("Fayl muvaffaqiyatli yuklab olindi")
		} catch {
			toast.error("Yuklab olishda xato yuz berdi")
		} finally {
			setDownloadLoading(false)
		}
	}

	const handleDownloadPdf = async () => {
		if (!startDate || !endDate) {
			toast.error("Iltimos, boshlangʻich va tugash sanalarini tanlang")
			return
		}
		try {
			setDownloadingPdf(true)
			const { stats, isStudent } = await fetchStats()
			const ok = buildTabelPdf(stats, {
				personColumnLabel: isStudent ? "Sinfi" : "Ish joyi va lavozimi",
				startDate,
				endDate,
			})
			if (!ok) toast.error("Eksport uchun ma'lumot yo'q")
			else toast.success("Fayl muvaffaqiyatli yuklab olindi")
		} catch {
			toast.error("Yuklab olishda xato yuz berdi")
		} finally {
			setDownloadingPdf(false)
		}
	}

	return (
		<div>
			{/* Xodim/O'quvchi almashtirgichi + (o'quvchida) sinf filtri */}
			<div className="flex flex-wrap items-center gap-2">
				<div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 text-sm">
					<button
						onClick={() => setTabelPersonType('staff')}
						className={`px-3 py-1.5 rounded-md font-medium transition-colors ${tabelPersonType === 'staff' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
					>
						Xodimlar
					</button>
					<button
						onClick={() => setTabelPersonType('student')}
						className={`px-3 py-1.5 rounded-md font-medium transition-colors ${tabelPersonType === 'student' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
					>
						O'quvchilar
					</button>
				</div>
				{tabelPersonType === 'student' && (
					<SearchableSelect
						variant="outline"
						icon={false}
						className="min-w-[160px] max-w-[260px]"
						searchPlaceholder="Sinf qidirish..."
						value={tabelSinfId}
						onChange={setTabelSinfId}
						options={[{ value: 'all', label: 'Barcha sinflar' }, ...sinfs.map(sinf => ({ value: sinf._id, label: sinf.name }))]}
					/>
				)}
			</div>

			{/* Sana oralig'i + yuklash tugmalari */}
			<div className="flex flex-col sm:flex-row sm:items-center justify-between mt-3 gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<div className="relative min-w-[130px]">
						<input
							type="date"
							className="block w-full pl-10 text-black pr-3 py-2 text-sm border-gray-300 rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
						/>
						<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<FaRegCalendarAlt className="h-4 w-4 text-gray-400" />
						</div>
					</div>
					<span className="text-gray-500">dan</span>
					<div className="relative min-w-[130px]">
						<input
							type="date"
							className="block w-full pl-10 text-black pr-3 py-2 text-sm border-gray-300 rounded-lg border focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
							value={endDate}
							onChange={(e) => setEndDate(e.target.value)}
							min={startDate}
						/>
						<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<FaRegCalendarAlt className="h-4 w-4 text-gray-400" />
						</div>
					</div>
					<span className="text-gray-500">gacha</span>
				</div>

				<div className="flex gap-2">
					<button
						onClick={handleDownloadExcel}
						disabled={downloadLoading || downloadingPdf || !startDate || !endDate}
						className={`flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${downloadLoading || downloadingPdf || !startDate || !endDate
							? 'bg-gray-200 text-gray-500 cursor-not-allowed'
							: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:shadow-md'
							}`}
					>
						{downloadLoading ? (
							<PulseLoader size={8} color="#ffffff" />
						) : (
							<>
								<FaFileExcel className="mr-2" />
								Excel
							</>
						)}
					</button>
					<button
						onClick={handleDownloadPdf}
						disabled={downloadLoading || downloadingPdf || !startDate || !endDate}
						className={`flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${downloadLoading || downloadingPdf || !startDate || !endDate
							? 'bg-gray-200 text-gray-500 cursor-not-allowed'
							: 'bg-gradient-to-r from-rose-500 to-red-600 text-white hover:shadow-md'
							}`}
					>
						{downloadingPdf ? (
							<PulseLoader size={8} color="#ffffff" />
						) : (
							<>
								<FaFilePdf className="mr-2" />
								PDF
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	)
}

export default TabelExportPanel
