import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiCheck, FiPhone, FiUpload, FiUser, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'
import FacePhotosCard from '../../components/FacePhotosCard'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'

const AdminStudentUpdate = ({ student, onClose, sinfs }) => {
	const token = localStorage.getItem('token')
	const [studentData, setStudentData] = useState({
		fullName: '',
		sinf: '',
		birthday: '',
		gender: '',
		parentName: '',
		parentPhone: '',
	})
	const [imageFile, setImageFile] = useState(null)
	const [imagePreview, setImagePreview] = useState(null)
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (student) {
			setStudentData({
				fullName: student.fullName || '',
				sinf: student.sinf?._id || '',
				birthday: student.birthday ? student.birthday.slice(0, 10) : '',
				gender: student.gender || '',
				parentName: student.parentName || '',
				parentPhone: student.parentPhone || '',
			})
			if (student.photo) setImagePreview(`${uploadUrl(student.photo)}`)
		}
	}, [student])

	const handleInputChange = (e) => {
		const { name, value } = e.target
		setStudentData({ ...studentData, [name]: value })
	}

	const validateImage = (file) => {
		const errors = []
		const validFormats = ['image/jpeg', 'image/jpg', 'image/png']
		if (!validFormats.includes(file.type)) {
			errors.push("Faqat JPG, JPEG yoki PNG formatidagi rasmlar qabul qilinadi!")
		}
		if (file.size > 200 * 1024) {
			errors.push(`Rasm hajmi 200KB dan oshmasligi kerak! (Hozirgi: ${(file.size / 1024).toFixed(1)}KB)`)
		}
		if (file.size < 10 * 1024) {
			errors.push(`Rasm hajmi juda kichik! (Hozirgi: ${(file.size / 1024).toFixed(1)}KB)`)
		}
		return { isValid: errors.length === 0, errors }
	}

	const handleImageChange = (e) => {
		const file = e.target.files[0]
		if (!file) return
		const validation = validateImage(file)
		if (!validation.isValid) {
			validation.errors.forEach(error => toast.error(error))
			e.target.value = ''
			return
		}
		setImageFile(file)
		const reader = new FileReader()
		reader.onloadend = () => setImagePreview(reader.result)
		reader.readAsDataURL(file)
	}

	const handleSubmit = async (e) => {
		e.preventDefault()
		if (!studentData.fullName || !studentData.sinf) {
			toast.error("F.I.Sh va Sinfni to'ldiring!")
			return
		}
		setLoading(true)
		try {
			const formData = new FormData()
			Object.entries(studentData).forEach(([key, value]) => {
				if (value !== null && value !== undefined) formData.append(key, value)
			})
			if (imageFile) formData.append("image", imageFile)

			const res = await axios.put(
				`${import.meta.env.VITE_BASE_URL}/api/student/update/${student._id}`,
				formData,
				{ headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
			)

			if (res.data.success) {
				toast.success("✅ O'quvchi ma'lumotlari yangilandi!")
				onClose()
			} else {
				toast.error(res.data.message || "Yangilashda xatolik")
			}
		} catch (error) {
			toast.error(error.response?.data?.message || "Server xatosi")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
				<div className="sticky top-0 bg-white z-10 p-6 border-b border-gray-200 flex justify-between items-center">
					<h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
						<FiUser className="text-blue-500" /> {tx("O'quvchini tahrirlash")}
					</h2>
					<button
						onClick={onClose}
						className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
						disabled={loading}
					>
						<FiX size={24} />
					</button>
				</div>

				<div className="p-6">
					<form onSubmit={handleSubmit} className="space-y-6">
						<div className="flex flex-col md:flex-row gap-8">
							<div className="flex-shrink-0 flex flex-col items-center w-full md:w-1/3">
								<div className="relative mb-4 w-40 h-40">
									{imagePreview ? (
										<img
											src={imagePreview}
											alt={tx("Preview")}
											className="h-full w-full rounded-full object-cover border-4 border-white shadow-lg"
										/>
									) : (
										<div className="h-full w-full rounded-full bg-gray-100 flex items-center justify-center shadow-inner">
											<FiUser size={60} className="text-gray-400" />
										</div>
									)}
								</div>
								<label className={`cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm w-full justify-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
									<FiUpload size={18} /> {tx("Rasmni almashtirish")}
									<input
										type="file"
										accept=".jpg,.jpeg,.png"
										onChange={handleImageChange}
										className="hidden"
										disabled={loading}
									/>
								</label>
							</div>

							<div className="flex-1 space-y-4">
								<div className="bg-gray-50 p-4 rounded-lg space-y-4">
									<h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
										<FiUser className="text-blue-500" /> {tx("O'quvchi ma'lumotlari")}
									</h3>
									<input
										type="text"
										name="fullName"
										value={studentData.fullName}
										onChange={handleInputChange}
										placeholder={tx("To'liq ism sharifi*")}
										required
										className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
									<SearchableSelect
										variant="outline"
										icon={false}
										className="w-full"
										searchPlaceholder={tx("Sinf qidirish...")}
										placeholder={tx("Sinfni tanlang*")}
										value={studentData.sinf}
										onChange={v => setStudentData({ ...studentData, sinf: v })}
										options={[{ value: '', label: 'Sinfni tanlang*' }, ...sinfs.map(sinf => ({ value: sinf._id, label: sinf.name }))]}
									/>
									<div className="grid grid-cols-2 gap-4">
										<input
											type="date"
											name="birthday"
											value={studentData.birthday}
											onChange={handleInputChange}
											className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
										/>
										<select
											name="gender"
											value={studentData.gender}
											onChange={handleInputChange}
											className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
										>
											<option value="">{tx("Jinsi")}</option>
											<option value="erkak">{tx("O'g'il bola")}</option>
											<option value="ayol">{tx("Qiz bola")}</option>
										</select>
									</div>
								</div>

								<div className="bg-gray-50 p-4 rounded-lg space-y-4">
									<h3 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
										<FiPhone className="text-blue-500" /> {tx("Ota-ona bilan aloqa")}
									</h3>
									<input
										type="text"
										name="parentName"
										value={studentData.parentName}
										onChange={handleInputChange}
										placeholder={tx("Ota-onasining ismi")}
										className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
									<input
										type="tel"
										name="parentPhone"
										value={studentData.parentPhone}
										onChange={handleInputChange}
										placeholder={tx("Ota-ona telefon raqami")}
										className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
									/>
								</div>
							</div>
						</div>

						<div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200">
							<button
								type="button"
								onClick={onClose}
								className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
								disabled={loading}
							>
								{tx("Bekor qilish")}
							</button>
							<button
								type="submit"
								className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2"
								disabled={loading}
							>
								{loading ? (
									<>
										<div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
										{tx("Saqlanmoqda...")}
									</>
								) : (
									<>
										<FiCheck /> {tx("Saqlash")}
									</>
								)}
							</button>
						</div>
					</form>
					{student?._id && <FacePhotosCard studentId={student._id} />}
				</div>
			</div>
		</div>
	)
}

export default AdminStudentUpdate
