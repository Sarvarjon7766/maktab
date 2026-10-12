import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiKey, FiLock, FiUpload, FiUser, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'

const AdminUserUpdate = ({ user, onClose, sinfs }) => {
	const token = localStorage.getItem('token')
	const [userData, setUserData] = useState({
		fullName: '',
		position: '',
		hodimID: '',
		username: '',
		password: '',
		sinf: '',
		role: 'viewer',
		phone_personal: '',
		phone_work: '',
		jshr: '',
		isEdit: false,
		syncToCamera: false
	})
	const [imageFile, setImageFile] = useState(null)
	const [imagePreview, setImagePreview] = useState(null)
	const [loading, setLoading] = useState(false)
	const [originalUserData, setOriginalUserData] = useState(null)
	const [imageValidation, setImageValidation] = useState({
		size: true,
		dimensions: true,
		format: true
	})

	useEffect(() => {
		if (user) {
			setUserData({
				fullName: user.fullName || '',
				position: user.position || '',
				hodimID: user.hodimID || '',
				username: user.username || '',
				password: '',
				sinf: user.sinf?._id || '',
				role: user.role || 'viewer',
				phone_personal: user.phone_personal || '',
				phone_work: user.phone_work || '',
				jshr: user.jshr || '',
				isEdit: user.isEdit || false,
				// Xodimning hali umuman rasmi bo'lmasa (masalan Excel'dan
				// rasmsiz import qilingan bo'lsa) — standart holatda
				// belgilangan turadi, aks holda admin katakchani bilmasdan
				// belgilamay, yuklagan rasmi hech qachon kameraga yetib
				// bormay qolishi mumkin edi. Rasmi bor xodimlar uchun esa
				// (odatiy tahrirlashda tasodifan qayta yuborilib
				// ketmasligi uchun) hamon o'chirilgan holda qoladi.
				syncToCamera: !user.photo
			})
			setOriginalUserData(user)
			if (user.photo) setImagePreview(`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`)
		}
	}, [user])

	const validateImage = (file) => {
		return new Promise((resolve, reject) => {
			// Hajmni tekshirish (200KB = 200 * 1024 bytes)
			const maxSize = 200 * 1024 // 200KB
			if (file.size > maxSize) {
				setImageValidation(prev => ({ ...prev, size: false }))
				reject(new Error(`Rasm hajmi ${maxSize / 1024}KB dan oshmasligi kerak!`))
				return
			}
			setImageValidation(prev => ({ ...prev, size: true }))

			// Formatni tekshirish
			const validFormats = ['image/jpeg', 'image/jpg', 'image/png']
			if (!validFormats.includes(file.type)) {
				setImageValidation(prev => ({ ...prev, format: false }))
				reject(new Error("Faqat JPG yoki PNG formatidagi rasmlar qabul qilinadi!"))
				return
			}
			setImageValidation(prev => ({ ...prev, format: true }))

			// Rasm o'lchamlarini tekshirish
			const img = new Image()
			const objectUrl = URL.createObjectURL(file)

			img.onload = function () {
				// Rasm o'lchamlarini tekshirish
				const width = this.width
				const height = this.height

				// Minimal o'lchamlar
				const minWidth = 100
				const minHeight = 100

				// Maksimal o'lchamlar
				const maxWidth = 1920
				const maxHeight = 1080

				// O'lchamlar tekshiruvi
				if (width < minWidth || height < minHeight) {
					setImageValidation(prev => ({ ...prev, dimensions: false }))
					URL.revokeObjectURL(objectUrl)
					reject(new Error(`Rasm o'lchami minimal ${minWidth}x${minHeight}px bo'lishi kerak! (Hozirgi: ${width}x${height}px)`))
					return
				}

				if (width > maxWidth || height > maxHeight) {
					setImageValidation(prev => ({ ...prev, dimensions: false }))
					URL.revokeObjectURL(objectUrl)
					reject(new Error(`Rasm o'lchami maksimal ${maxWidth}x${maxHeight}px dan oshmasligi kerak! (Hozirgi: ${width}x${height}px)`))
					return
				}

				// Barcha tekshiruvlar muvaffaqiyatli
				setImageValidation(prev => ({ ...prev, dimensions: true }))
				URL.revokeObjectURL(objectUrl)

				// Rasm ma'lumotlarini qaytarish
				resolve({
					file,
					dimensions: { width, height },
					size: file.size,
					format: file.type
				})
			}

			img.onerror = function () {
				setImageValidation(prev => ({ ...prev, dimensions: false }))
				URL.revokeObjectURL(objectUrl)
				reject(new Error("Rasmni yuklashda xatolik yuz berdi!"))
			}

			img.src = objectUrl
		})
	}

	const handleInputChange = (e) => {
		const { name, value, type, checked } = e.target
		setUserData({ ...userData, [name]: type === 'checkbox' ? checked : value })
	}

	const handleImageChange = async (e) => {
		const file = e.target.files[0]
		if (!file) return

		try {
			await validateImage(file)

			setImageFile(file)

			const reader = new FileReader()
			reader.onloadend = () => {
				setImagePreview(reader.result)
			}
			reader.readAsDataURL(file)

			// Muvaffaqiyatli yuklangan haqida xabar
			const sizeInKB = (file.size / 1024).toFixed(2)
			toast.success(`Rasm muvaffaqiyatli yuklandi! Hajmi: ${sizeInKB}KB`)

		} catch (error) {
			toast.error(error.message)
			// Inputni tozalash
			e.target.value = ''
		}
	}

	const removeImage = () => {
		setImageFile(null)
		if (originalUserData?.photo) {
			setImagePreview(`${import.meta.env.VITE_BASE_URL}/uploads/${originalUserData.photo}`)
		} else {
			setImagePreview(null)
		}
		setImageValidation({
			size: true,
			dimensions: true,
			format: true
		})
	}

	const resetForm = () => {
		if (originalUserData) {
			setUserData({
				fullName: originalUserData.fullName || '',
				position: originalUserData.position || '',
				hodimID: originalUserData.hodimID || '',
				username: originalUserData.username || '',
				password: '',
				sinf: originalUserData.sinf?._id || '',
				role: originalUserData.role || 'viewer',
				phone_personal: originalUserData.phone_personal || '',
				phone_work: originalUserData.phone_work || '',
				jshr: originalUserData.jshr || '',
				isEdit: originalUserData.isEdit || false,
				syncToCamera: !originalUserData.photo
			})
			if (originalUserData.photo) setImagePreview(`${import.meta.env.VITE_BASE_URL}/uploads/${originalUserData.photo}`)
			else setImagePreview(null)
		}
		setImageFile(null)
		setImageValidation({
			size: true,
			dimensions: true,
			format: true
		})
	}

	const handleSubmit = async (e) => {
		e.preventDefault()

		// Rasmni tekshirish (agar yuklangan bo'lsa)
		if (imageFile) {
			try {
				await validateImage(imageFile)
			} catch (error) {
				toast.error("Rasmni tekshirishda xatolik: " + error.message)
				return
			}
		}

		setLoading(true)
		try {
			const formData = new FormData()
			Object.keys(userData).forEach(key => {
				// Hodim ID ni o'zgartirmaslik uchun serverga yubormaymiz
				if (key === 'hodimID') return

				// rol va o'zgartirish ruxsati bu oynada boshqarilmaydi (xodim har doim oddiy xodim)
				if (key === 'role' || key === 'isEdit') return

				if (userData[key] !== null && userData[key] !== undefined) {
					formData.append(key, userData[key])
				}
			})

			// Parol bo'sh bo'lsa, uni yubormaymiz
			if (!userData.password) formData.delete('password')

			if (imageFile) formData.append('image', imageFile)

			const res = await axios.put(
				`${import.meta.env.VITE_BASE_URL}/api/user/update/${user._id}`,
				formData,
				{
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'multipart/form-data'
					}
				}
			)

			if (res.data.success) {
				toast.success("Xodim maʼlumotlari yangilandi!")
				onClose()
			}
			else toast.error(res.data.message || "Xodimni yangilashda xatolik")
		} catch (error) {
			toast.error(error.response?.data?.message || "Server xatosi")
		}
		finally { setLoading(false) }
	}

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
			<div className="relative bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto animate-slide-up">
				{/* Header */}
				<div className="sticky top-0 bg-white z-10 p-6 border-b border-gray-200 flex justify-between items-center">
					<h2 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
						<FiUser className="text-blue-500" /> Xodimni tahrirlash
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
							{/* Avatar Section */}
							<div className="flex-shrink-0 flex flex-col items-center w-full md:w-1/3">
								<div className="relative mb-4 w-40 h-40">
									{imagePreview ? (
										<div className="relative group">
											<img
												src={imagePreview}
												alt="Preview"
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

								{/* Rasm talablari haqida ma'lumot */}
								<div className="w-full mb-4 bg-gray-50 rounded-lg p-4">
									<h4 className="font-medium text-gray-700 mb-2">Rasm talablari:</h4>
									<ul className="text-xs text-gray-600 space-y-1">
										<li className={`flex items-center ${imageValidation.size ? 'text-green-600' : 'text-red-600'}`}>
											<div className={`w-2 h-2 rounded-full mr-2 ${imageValidation.size ? 'bg-green-500' : 'bg-red-500'}`}></div>
											Hajmi: 200KB dan kichik
										</li>
										<li className={`flex items-center ${imageValidation.format ? 'text-green-600' : 'text-red-600'}`}>
											<div className={`w-2 h-2 rounded-full mr-2 ${imageValidation.format ? 'bg-green-500' : 'bg-red-500'}`}></div>
											Format: JPG yoki PNG
										</li>
										<li className={`flex items-center ${imageValidation.dimensions ? 'text-green-600' : 'text-red-600'}`}>
											<div className={`w-2 h-2 rounded-full mr-2 ${imageValidation.dimensions ? 'bg-green-500' : 'bg-red-500'}`}></div>
											O'lchami: 100x100px - 1920x1080px
										</li>
									</ul>
								</div>

								<label className={`cursor-pointer bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors shadow-sm w-full justify-center ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}>
									<FiUpload size={18} /> Rasm yangilash
									<input
										type="file"
										accept="image/jpeg,image/jpg,image/png"
										onChange={handleImageChange}
										className="hidden"
										disabled={loading}
									/>
								</label>
								<p className="text-xs text-gray-500 mt-2 text-center">200KB gacha (JPG, PNG)</p>

								{/* Yuklangan rasm haqida ma'lumot */}
								{imageFile && (
									<div className="mt-4 w-full bg-blue-50 rounded-lg p-3">
										<p className="text-sm font-medium text-blue-700">Yangi rasm:</p>
										<p className="text-xs text-blue-600 mt-1">
											Nomi: {imageFile.name.length > 20 ? imageFile.name.substring(0, 20) + '...' : imageFile.name}
										</p>
										<p className="text-xs text-blue-600">
											Hajmi: {(imageFile.size / 1024).toFixed(2)} KB
										</p>
									</div>
								)}

								{/* Kameraga ham yubor checkbox */}
								<label className="flex items-center cursor-pointer p-3 mt-4 w-full bg-white rounded-lg border border-gray-200">
									<div className="relative mr-3 shrink-0">
										<input
											type="checkbox"
											name="syncToCamera"
											checked={userData.syncToCamera}
											onChange={handleInputChange}
											className="sr-only"
										/>
										<div className={`block w-12 h-6 rounded-full ${userData.syncToCamera ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
										<div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${userData.syncToCamera ? "transform translate-x-6" : ""}`}></div>
									</div>
									<span className="text-sm font-medium text-gray-700">Kameraga ham yubor</span>
								</label>
								<p className="text-xs text-gray-500 mt-1 text-center">
									{userData.syncToCamera
										? "Bu xodimning hali rasmi yo'q edi — shuning uchun standart holatda belgilangan: saqlaganda rasm kamera terminaliga yuboriladi"
										: "Belgilansa, joriy rasm kamera terminaliga qayta yuboriladi"}
								</p>
							</div>

							{/* Form Fields */}
							<div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
								{/* Column 1 */}
								<div className="space-y-4">
									<div className="bg-gray-50 p-4 rounded-lg space-y-4">
										<h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center gap-2">
											<FiUser className="text-blue-500" /> Asosiy ma'lumotlar
										</h3>
										<div className="flex flex-col gap-4">
											<input
												type="text"
												name="fullName"
												value={userData.fullName}
												onChange={handleInputChange}
												placeholder="To'liq ism sharifingiz*"
												required
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="text"
												name="position"
												value={userData.position}
												onChange={handleInputChange}
												placeholder="Lavozimi*"
												required
												className="w-full px-4 py-2.5 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											
											<input
												type="tel"
												name="phone_personal"
												value={userData.phone_personal}
												onChange={handleInputChange}
												placeholder="Shaxsiy telefon"
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<input
												type="tel"
												name="phone_work"
												value={userData.phone_work}
												onChange={handleInputChange}
												placeholder="Ish telefoni"
												className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<div>
												<input
													type="text"
													name="jshr"
													value={userData.jshr}
													onChange={handleInputChange}
													placeholder="JSHR (ixtiyoriy, 14 xonali)"
													inputMode="numeric"
													maxLength={14}
													pattern="\d{14}"
													title="JSHR 14 xonali raqamdan iborat bo'lishi kerak"
													className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												/>
												<p className="text-xs text-gray-400 mt-1">Faqat super admin va admin ko'radi</p>
											</div>
										</div>
									</div>
								</div>

								{/* Column 2 */}
								<div className="space-y-4">
									<div className="bg-gray-50 p-4 rounded-lg space-y-4">
										<h3 className="text-lg font-medium text-gray-800 mb-4 flex items-center gap-2">
											<FiKey className="text-blue-500" /> Kirish ma'lumotlari
										</h3>
										<div className="flex flex-col gap-4">
											<input
												type="text"
												name="username"
												value={userData.username}
												onChange={handleInputChange}
												placeholder="Foydalanuvchi nomi*"
												required
												className="w-full px-4 py-2.5 text-black border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
											/>
											<div className="relative">
												<input
													type="password"
													name="password"
													value={userData.password}
													onChange={handleInputChange}
													placeholder="Parol (faqat o'zgartirish uchun)"
													className="w-full px-4 py-2.5 pl-10 border border-gray-300 text-black rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
												/>
												<FiKey className="absolute left-3 top-3.5 text-gray-400" size={18} />
											</div>
											<SearchableSelect
												value={userData.sinf || ""}
												onChange={(val) => handleInputChange({ target: { name: 'sinf', value: val } })}
												placeholder="Sinfsiz (ixtiyoriy)"
												searchPlaceholder="Sinf qidirish..."
												options={[{ value: '', label: "Sinfsiz (sinfga biriktirilmagan)" }, ...sinfs.map(dept => ({ value: dept._id, label: dept.name }))]}
											/>
										</div>
									</div>
								</div>
							</div>
						</div>


						{/* Buttons */}
						<div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200">
							<button
								type="button"
								onClick={() => { onClose(); resetForm() }}
								className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
								disabled={loading}
							>
								Bekor qilish
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
										Saqlanmoqda...
									</>
								) : "Saqlash"}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	)
}

export default AdminUserUpdate