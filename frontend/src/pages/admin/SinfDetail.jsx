import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiArrowLeft } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'
import StudentEntryExit from './StudentEntryExit'
import PersonPhotoPreview from '../../components/PersonPhotoPreview'
import { tx } from '../../i18n'

const BASE_URL = import.meta.env.VITE_BASE_URL

// Sinf.jsx/UserSinf.jsx'da biror sinf bosilganda ochiladigan sahifa — sinf
// haqida qisqa ma'lumot (rahbar, tavsif) + shu sinfning bugungi kirish-
// chiqish/davomat holati (StudentEntryExit'ning fixedSinfId bilan "qulflangan"
// varianti — alohida ro'yxat so'ramaydi, mavjud /api/student/entry-exit'dan
// shu sinf bo'yicha filtrlaydi)
const SinfDetail = () => {
	const { id } = useParams()
	const navigate = useNavigate()
	const token = localStorage.getItem('token')
	const [sinf, setSinf] = useState(null)
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		let cancelled = false
		axios.get(`${BASE_URL}/api/sinf/getAll`, { headers: { Authorization: `Bearer ${token}` } })
			.then(res => {
				if (cancelled) return
				if (res.data.success) {
					const found = res.data.sinfs.find(s => s._id === id)
					if (found) setSinf(found)
				}
			})
			.catch(() => toast.error("Sinf ma'lumotini yuklashda xatolik"))
			.finally(() => { if (!cancelled) setLoading(false) })
		return () => { cancelled = true }
	}, [id, token])

	if (loading) {
		return (
			<div className="flex justify-center items-center h-full py-16">
				<PulseLoader color="#2563eb" size={16} />
			</div>
		)
	}

	if (!sinf) {
		return (
			<div className="p-6 text-center">
				<p className="text-gray-500 mb-4">{tx("Sinf topilmadi")}</p>
				<button
					onClick={() => navigate(-1)}
					className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
				>
					<FiArrowLeft size={16} /> {tx("Orqaga")}
				</button>
			</div>
		)
	}

	return (
		<div className="h-full flex flex-col w-full max-w-full overflow-hidden bg-gray-50">
			<div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
				<button
					onClick={() => navigate(-1)}
					className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3"
				>
					<FiArrowLeft size={14} /> {tx("Sinflarga qaytish")}
				</button>
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="h-12 w-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg flex-shrink-0">
							{sinf.name?.charAt(0)}
						</div>
						<div>
							<h1 className="text-xl font-semibold text-gray-900">{sinf.name}</h1>
							{sinf.description && <p className="text-sm text-gray-500">{sinf.description}</p>}
						</div>
					</div>
					{sinf.head && (
						<div className="flex items-center gap-2.5 bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
							<PersonPhotoPreview photo={sinf.head.photo} name={sinf.head.fullName} size="md" className="!h-10 !w-10 !bg-purple-100 !text-purple-600" />
							<div className="leading-tight">
								<p className="text-xs text-purple-500">{tx("Sinf rahbari")}</p>
								<p className="text-sm font-medium text-gray-800">{sinf.head.fullName}</p>
							</div>
						</div>
					)}
				</div>
			</div>

			<div className="flex-1 min-h-0 flex flex-col">
				<StudentEntryExit fixedSinfId={id} />
			</div>
		</div>
	)
}

export default SinfDetail
