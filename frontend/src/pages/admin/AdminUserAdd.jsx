import axios from 'axios'
import { useState } from 'react'
import { FiCheck, FiKey, FiUpload, FiUser, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'
import { tx } from '../../i18n'

const AdminUserAdd = ({ onClose, sinfs }) => {
	const token = localStorage.getItem('token')
	const [userData, setUserData] = useState({
		fullName: '',
		position: '',
		username: '',
		password: '',
		sinf: '',
		role: 'viewer',
		phone_personal: '',
		phone_work: '',
		jshr: '',
		isEdit: false
	})

	const [imageFile, setImageFile] = useState(null)
	const [imagePreview, setImagePreview] = useState(null)
	const [loading, setLoading] = useState(false)

	const handleInputChange = (e) => {
		const { name, value, type, checked } = e.target
		setUserData({
			...userData,
			[name]: type === 'checkbox' ? checked : value
		})
	}

	// Oddiy rasm tekshiruvi
	const validateImage = (file) => {
		const errors = []

		// 1. Format tekshiruvi
		const validFormats = ['image/jpeg', 'image/jpg', 'image/png']
		if (!validFormats.includes(file.type)) {
			errors.push("Faqat JPG, JPEG yoki PNG formatidagi rasmlar qabul qilinadi!")
		}

		// 2. Hajm tekshiruvi (200KB)
		if (file.size > 200 * 1024) {
			errors.push(`Rasm hajmi 200KB dan oshmasligi kerak! (Hozirgi: ${(file.size / 1024).toFixed(1)}KB)`)
		}

		// 3. Minimum hajm tekshiruvi (10KB)
		if (file.size < 10 * 1024) {
			errors.push(`Rasm hajmi juda kichik! (Hozirgi: ${(file.size / 1024).toFixed(1)}KB)`)
		}

		return {
			isValid: errors.length === 0,
			errors: errors
		}
	}

	const handleImageChange = (e) => {
		const file = e.target.files[0]
		if (!file) return

		try {
			// Dastlabki tekshiruv
			const validation = validateImage(file)
			if (!validation.isValid) {
				validation.errors.forEach(error => toast.error(error))
				e.target.value = ''
				return
			}

			// Faylni saqlash
			setImageFile(file)

			// Preview yaratish
			const reader = new FileReader()
			reader.onloadend = () => {
				setImagePreview(reader.result)
			}
			reader.readAsDataURL(file)

			// Muvaffaqiyatli yuklash haqida xabar
			toast.success(`✅ Rasm yuklandi! Hajmi: ${(file.size / 1024).toFixed(1)}KB`)

		} catch (error) {
			console.error('Rasm yuklashda xatolik:', error)
			toast.error("Rasmni yuklashda xatolik: " + error.message)
			e.target.value = ''
		}
	}

	const removeImage = () => {
		setImageFile(null)
		setImagePreview(null)
	}

	const resetForm = () => {
		setUserData({
			fullName: '',
			position: '',
			username: '',
			password: '',
			sinf: '',
			role: 'viewer',
			phone_personal: '',
			phone_work: '',
			jshr: '',
			isEdit: false
		})
		setImageFile(null)
		setImagePreview(null)
	}

	const handleSubmit = async (e) => {
		e.preventDefault()

		// Rasmni oxirgi tekshiruv
		if (imageFile) {
			const validation = validateImage(imageFile)
			if (!validation.isValid) {
				validation.errors.forEach(error => toast.error(error))
				return
			}
		}

		// Majburiy maydonlarni tekshirish
		if (!userData.fullName || !userData.position || !userData.username || !userData.password) {
			toast.error("Barcha majburiy maydonlarni to'ldiring!")
			return
		}

		setLoading(true)

		try {
			const formData = new FormData()

			// User ma'lumotlarini qo'shish
			Object.keys(userData).forEach(key => {
				if (userData[key] !== null && userData[key] !== undefined) {
					if (key === "role" && !userData[key]) {
						formData.append("role", userData.role || "viewer")
						return
					}
					if (key === "sinf" && !userData[key]) return
					formData.append(key, userData[key])
				}
			})

			// Rasmni qo'shish
			if (imageFile) formData.append("image", imageFile)

			// Serverga yuborish
			const res = await axios.post(
				`${import.meta.env.VITE_BASE_URL}/api/user/register`,
				formData,
				{
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'multipart/form-data'
					},
				}
			)

			if (res.data.success) {
				toast.success("✅ Xodim muvaffaqiyatli qo'shildi!")
				resetForm()
				onClose()
			} else {
				toast.error(res.data.message || "Xodim qo'shishda xatolik")
			}
		} catch (error) {
			toast.error(error.response?.data?.message || "Server xatosi")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
			<div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
				{/* Header */}
				<div className="sticky top-0 bg-white z-10 p-6 border-b border-gray-200 flex justify-between items-center">
					<h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
						<FiUser className="text-blue-500" /> {tx("Yangi xodim qo'shish")}
					</h2>
					<button
						onClick={() => { onClose(); resetForm() }}
						className="text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
						disabled={loading}
					>
						<FiX size={24} />
					</button>
				</div>

				{/* Form */}
				<div className="p-6">
					<form onSubmit={handleSubmit} className="space-y-6">
						<div className="flex flex-col md:flex-row gap-8">
							{/* Rasm qismi */}
							<div className="flex-shrink-0 flex flex-col items-center w-full md:w-1/3">
								{/* Avatar */}
								<div className="relative mb-4 w-40 h-40">
									{imagePreview ? (
										<div className="relative group">
											<img
												src={imagePreview}
												alt={tx("Preview")}
												className="h-full w-full rounded-full object-cover border-4 border-white shadow-lg"
											/>
											<button
												type="button"
												onClick={removeImage}
												className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1.5 hover:bg-red-600 transition-colors shadow-md"
												disabled={loading}
											>
												<FiX size={16} />
											</button>
										</div>
									) : (
										<div className="h-full w-full rounded-full bg-gray-100 flex items-center justify-center shadow-inner">
											<FiUser size={60} className="text-gray-400" />
										</div>
									)}
								</div>

								{/* Rasm talablari */}
								<div className="w-full mb-4 bg-gray-50 rounded-lg p-4">
									<h4 className="font-medium text-gray-700 mb-2">{tx("Rasm talablari:")}</h4>
									<ul className="text-xs text-gray-600 space-y-1">
										<li className="flex items-center text-green-600">
											<FiCheck className="mr-2" />
											{tx("Hajmi: 10KB - 200KB oralig'ida")}
										</li>
										<li className="flex items-center text-green-600">
											<FiCheck className="mr-2" />
											{tx("Format: JPG, JPEG, PNG")}
										</li>
										<li className="flex items-center text-green-600">
											<FiCheck className="mr-2" />
											{tx("Yuz aniq ko'rinishi kerak")}
										</li>
										<li className="flex items-center text-green-600">
											<FiCheck className="mr-2" />
											{tx("Yorug'lik yaxshi bo'lishi kerak")}
										</li>
									</ul>
								</div>

								<label className={`cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm w-full justify-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
									<FiUpload size={18} /> {tx("Rasm yuklash")}
									<input
										type="file"
										accept=".jpg,.jpeg,.png"
										onChange={handleImageChange}
										className="hidden"
										disabled={loading}
									/>
								</label>

								<p className="text-xs text-gray-500 mt-2 text-center">
									{tx("10KB - 200KB oralig'ida")}<br />
									{tx("JPG, JPEG, PNG formatlari")}
								</p>

								{/* Yuklangan rasm ma'lumoti */}
								{imageFile && (
									<div className="mt-4 w-full bg-blue-50 rounded-lg p-3">
										<p className="text-sm font-medium text-blue-700">{tx("Yuklangan rasm:")}</p>
										<p className="text-xs text-blue-600 mt-1">
											{tx("Hajmi: {{kb}} KB", { kb: (imageFile.size / 1024).toFixed(2) })}
										</p>
										<p className="text-xs text-blue-600">
											{tx("Format: {{fmt}}", { fmt: imageFile.type.split('/')[1].toUpperCase() })}
										</p>
										<p className="text-xs text-blue-600">
											{tx("Nomi: {{name}}", { name: imageFile.name.length > 20 ? `${imageFile.name.substring(0, 20)}...` : imageFile.name })}
										</p>
									</div>
								)}
							</div>

							{/* Form maydonlari */}
							<div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* 1-ustun */}
								<div className="space-y-4">
									<div className="bg-gray-50 p-4 rounded-lg space-y-4">
										<h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center gap-2">
											<FiUser className="text-blue-500" /> {tx("Asosiy ma'lumotlar")}
										</h3>
										<div className="flex flex-col gap-4">
											<input
												type="text"
												name="fullName"
												value={userData.fullName}
												onChange={handleInputChange}
												placeholder={tx("To'liq ism sharifingiz*")}
												required
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="text"
												name="position"
												value={userData.position}
												onChange={handleInputChange}
												placeholder={tx("Lavozimi*")}
												required
												className="w-full px-4 py-2.5 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="tel"
												name="phone_personal"
												value={userData.phone_personal}
												onChange={handleInputChange}
												placeholder={tx("Shaxsiy telefon")}
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="tel"
												name="phone_work"
												value={userData.phone_work}
												onChange={handleInputChange}
												placeholder={tx("Ish telefoni")}
												className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<div>
												<input
													type="text"
													name="jshr"
													value={userData.jshr}
													onChange={handleInputChange}
													placeholder={tx("JSHR (ixtiyoriy, 14 xonali)")}
													inputMode="numeric"
													maxLength={14}
													pattern="\d{14}"
													title={tx("JSHR 14 xonali raqamdan iborat bo'lishi kerak")}
													className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												/>
												<p className="text-xs text-gray-400 mt-1">{tx("Faqat super admin va admin ko'radi")}</p>
											</div>
										</div>
									</div>
								</div>

								{/* 2-ustun */}
								<div className="space-y-4">
									<div className="bg-gray-50 p-4 rounded-lg space-y-4">
										<h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center gap-2">
											<FiKey className="text-blue-500" /> {tx("Kirish ma'lumotlari")}
										</h3>
										<div className="flex flex-col gap-4">
											<input
												type="text"
												name="username"
												value={userData.username}
												onChange={handleInputChange}
												placeholder={tx("Foydalanuvchi nomi*")}
												required
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="password"
												name="password"
												value={userData.password}
												onChange={handleInputChange}
												placeholder={tx("Parol*")}
												required
												className="w-full px-4 py-2.5 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<SearchableSelect
												variant="outline"
												icon={false}
												className="w-full"
												searchPlaceholder={tx("Sinf qidirish...")}
												placeholder={tx("Sinfsiz (ixtiyoriy)")}
												value={userData.sinf || ''}
												onChange={v => setUserData({ ...userData, sinf: v })}
												options={[{ value: '', label: 'Sinfsiz (sinfga biriktirilmagan)' }, ...sinfs.map(sinf => ({ value: sinf._id, label: sinf.name }))]}
											/>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Tugmalar */}
						<div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200">
							<button
								type="button"
								onClick={() => { onClose(); resetForm() }}
								className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
								disabled={loading}
							>
								{tx("Bekor qilish")}
							</button>
							<button
								type="submit"
								className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-colors font-medium shadow-sm flex items-center justify-center"
								disabled={loading}
							>
								{loading ? (
									<>
										<svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
											<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
											<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
										</svg>
										{tx("Yuklanmoqda...")}
									</>
								) : tx("Xodim qo'shish")}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}

export default AdminUserAdd
