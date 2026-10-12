import axios from 'axios'
import { useRef, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiFileText, FiUpload, FiX, FiXCircle } from 'react-icons/fi'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx-js-style'
import { tx } from '../../i18n'

// Backend (student.service.js -> bulkImportFromExcel) ustunlarni QATʼIY
// joylashuv emas, 1-qatordagi SARLAVHA NOMI bo'yicha aniqlaydi
const TEMPLATE_HEADERS = ['F.I.Sh', 'Sinf', "Ota-ona ismi", 'Ota-ona telefoni']
const TEMPLATE_EXAMPLE = ["Aliyev Vali Aliyevich", '5-A', 'Aliyev Ali', '+998901234567']

const downloadTemplate = () => {
	const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE])
	ws['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 22 }, { wch: 18 }]
	const range = XLSX.utils.decode_range(ws['!ref'])
	for (let C = range.s.c; C <= range.e.c; C++) {
		const addr = XLSX.utils.encode_cell({ r: 0, c: C })
		if (ws[addr]) {
			ws[addr].s = {
				font: { bold: true, color: { rgb: 'FFFFFF' } },
				fill: { fgColor: { rgb: '2563EB' } },
				alignment: { horizontal: 'center', vertical: 'center' },
			}
		}
	}
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, "O'quvchilar")
	const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
	const blob = new Blob([wbout], { type: 'application/octet-stream' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = "oquvchilar_shabloni.xlsx"
	a.click()
	URL.revokeObjectURL(url)
}

const AdminStudentImportExcel = ({ onClose, onImported }) => {
	const token = localStorage.getItem('token')
	const fileInputRef = useRef(null)
	const [selectedFile, setSelectedFile] = useState(null)
	const [uploading, setUploading] = useState(false)
	const [result, setResult] = useState(null)

	const handleFileChange = (e) => {
		const file = e.target.files[0]
		if (!file) return
		if (!file.name.toLowerCase().endsWith('.xlsx')) {
			toast.error("Faqat .xlsx formatidagi fayl tanlang")
			e.target.value = ''
			return
		}
		setSelectedFile(file)
		setResult(null)
	}

	const handleUpload = async () => {
		if (!selectedFile || uploading) return
		setUploading(true)
		try {
			const formData = new FormData()
			formData.append('file', selectedFile)
			const res = await axios.post(
				`${import.meta.env.VITE_BASE_URL}/api/student/import-excel`,
				formData,
				{ headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
			)
			setResult(res.data)
			if (res.data.successCount > 0) {
				toast.success(res.data.message)
				onImported?.()
			} else {
				toast.error(res.data.message || "Hech qanday o'quvchi qo'shilmadi")
			}
		} catch (error) {
			toast.error(error.response?.data?.message || "Faylni yuklashda xatolik")
		} finally {
			setUploading(false)
		}
	}

	const reset = () => {
		setSelectedFile(null)
		setResult(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
				<div className="sticky top-0 bg-white z-10 p-6 border-b border-gray-200 flex justify-between items-center">
					<h2 className="text-xl font-bold text-gray-800 flex items-center gap-3">
						<FiFileText className="text-blue-500" /> {tx("Excel'dan o'quvchilarni ommaviy qo'shish")}
					</h2>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
						disabled={uploading}
					>
						<FiX size={24} />
					</button>
				</div>

				<div className="p-6 space-y-5">
					<div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-900 space-y-2">
						<p>
							{tx("O'quvchilarni bir vaqtning o'zida ko'plab qo'shish uchun quyidagi shablonni yuklab oling, to'ldiring va qayta shu yerga yuklang.")}
						</p>
						<p className="text-blue-700">
							{tx("Sinf nomi shu maktabda ALLAQACHON mavjud bo'lishi kerak (masalan \"5-A\") — aks holda o'sha qator o'tkazib yuboriladi.")}
						</p>
						<button
							onClick={downloadTemplate}
							className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition"
						>
							<FiDownload size={16} /> {tx("Shablonni yuklab olish")}
						</button>
					</div>

					<div className="text-xs text-gray-500 space-y-1">
						<p><strong>{tx("Majburiy ustunlar:")}</strong> {tx("F.I.Sh, Sinf")}</p>
						<p><strong>{tx("Ixtiyoriy:")}</strong> {tx("Ota-ona ismi, Ota-ona telefoni")}</p>
					</div>

					{!result && (
						<div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center">
							<input
								ref={fileInputRef}
								type="file"
								accept=".xlsx"
								onChange={handleFileChange}
								className="hidden"
								id="student-excel-file-input"
								disabled={uploading}
							/>
							<label
								htmlFor="student-excel-file-input"
								className="cursor-pointer inline-flex flex-col items-center gap-2 text-gray-600"
							>
								<FiUpload size={28} className="text-blue-500" />
								<span className="text-sm font-medium">{selectedFile ? selectedFile.name : tx("To'ldirilgan .xlsx faylni tanlang")}</span>
							</label>
						</div>
					)}

					{result && (
						<div className="space-y-3">
							<div className="flex gap-3">
								<div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3 text-center">
									<p className="text-2xl font-bold text-green-700">{result.successCount}</p>
									<p className="text-xs text-green-700">{tx("muvaffaqiyatli qo'shildi")}</p>
								</div>
								<div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
									<p className="text-2xl font-bold text-red-700">{result.failCount}</p>
									<p className="text-xs text-red-700">{tx("qatorda muammo")}</p>
								</div>
							</div>

							<div className="max-h-64 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
								{result.rows.map((r) => (
									<div key={r.row} className="p-3 flex items-start gap-2 text-sm">
										{r.success ? (
											<FiCheckCircle className="text-green-500 shrink-0 mt-0.5" size={16} />
										) : (
											<FiXCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
										)}
										<div className="min-w-0">
											<p className="font-medium text-gray-800">{tx("{{n}}-qator —", { n: r.row })} {r.fullName}</p>
											{r.message && (
												<p className={`text-xs mt-0.5 flex items-start gap-1 ${r.success ? 'text-amber-600' : 'text-red-600'}`}>
													{r.success && <FiAlertTriangle className="shrink-0 mt-0.5" size={12} />}
													{r.message}
												</p>
											)}
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="sticky bottom-0 bg-white flex flex-col sm:flex-row justify-end gap-3 p-6 border-t border-gray-200">
					{result ? (
						<>
							<button
								onClick={reset}
								className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
							>
								{tx("Yana bir fayl yuklash")}
							</button>
							<button
								onClick={onClose}
								className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
							>
								{tx("Yopish")}
							</button>
						</>
					) : (
						<>
							<button
								onClick={onClose}
								className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
								disabled={uploading}
							>
								{tx("Bekor qilish")}
							</button>
							<button
								onClick={handleUpload}
								disabled={!selectedFile || uploading}
								className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
							>
								{uploading ? tx("Yuklanmoqda...") : tx("Yuklash")}
							</button>
						</>
					)}
				</div>
			</div>
		</div>
	)
}

export default AdminStudentImportExcel
