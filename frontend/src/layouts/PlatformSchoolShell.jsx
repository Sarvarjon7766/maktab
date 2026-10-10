import axios from 'axios'
import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { PulseLoader } from 'react-spinners'
import { toast } from 'react-toastify'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const CACHE_PREFIX = 'school-impersonation:'
// Backend tokeni 2 soatga beriladi — shundan biroz oldin eskirgan deb
// hisoblab, yangisini so'raymiz (chegaraga yaqinlashib qolmaslik uchun)
const CACHE_TTL_MS = 90 * 60 * 1000

// /platform/schools/:schoolId/* ostidagi barcha sahifalar (Xodimlar,
// O'quvchilar, Sinflar, Kameralar...) /user/* bilan BIR XIL komponentlar —
// ular localStorage'dagi `token`dan API chaqiradi, schoolId haqida
// umuman bilishmaydi. Shu sababli bu qobiq shu "maktab ichida"ligi davomida
// `token`ni o'sha maktabning taqlid (impersonation) tokeniga almashtirib
// turadi, undan chiqilganda esa asl `platformToken`ga qaytaradi.
//
// `platformToken` (superadmin login/verify-token yo'lida saqlanadigan
// barqaror nusxa) HAR DOIM haqiqiy manba — sahifa qayta yuklansa ham shu
// yerdan qayta so'raladi, `token`dagi joriy (balki allaqachon almashtirilgan)
// qiymatga hech qachon ishonilmaydi.
//
// sessionStorage'dagi kesh — bir xil maktabga qayta-qayta "kirilganda"
// (masalan React StrictMode'ning dev-rejimidagi ikki karra effekt chaqiruvi,
// yoki foydalanuvchi bir necha marta orqaga/oldinga o'tishi) har safar yangi
// impersonate so'rovi (va shu bilan yangi Audit jurnali yozuvi) yubormaslik
// uchun
const PlatformSchoolShell = () => {
	const { schoolId } = useParams()
	const navigate = useNavigate()
	const [ready, setReady] = useState(false)

	useEffect(() => {
		let cancelled = false
		setReady(false)

		const cacheKey = CACHE_PREFIX + schoolId

		const enter = async () => {
			const cachedRaw = sessionStorage.getItem(cacheKey)
			if (cachedRaw) {
				try {
					const cached = JSON.parse(cachedRaw)
					if (cached.expiresAt > Date.now()) {
						localStorage.setItem('token', cached.token)
						if (!cancelled) setReady(true)
						return
					}
				} catch { /* buzilgan kesh — e'tiborsiz qoldirib, qaytadan so'raymiz */ }
			}

			const platformToken = localStorage.getItem('platformToken')
			if (!platformToken) {
				toast.error("Platforma sessiyasi topilmadi — qayta kiring")
				navigate('/')
				return
			}
			try {
				const res = await api.post(
					`/api/schools/${schoolId}/impersonate`,
					{},
					{ headers: { Authorization: `Bearer ${platformToken}` } }
				)
				if (cancelled) return
				if (res.data.success) {
					sessionStorage.setItem(cacheKey, JSON.stringify({
						token: res.data.token,
						expiresAt: Date.now() + CACHE_TTL_MS
					}))
					localStorage.setItem('token', res.data.token)
					setReady(true)
				} else {
					toast.error(res.data.message || "Maktabga kirib bo'lmadi")
					navigate('/platform/schools')
				}
			} catch (error) {
				if (cancelled) return
				const data = error.response?.data
				toast.error(data?.message || "Server xatosi")
				navigate(data?.code === 'NO_ADMIN' ? `/platform/schools?bootstrap=${schoolId}` : '/platform/schools')
			}
		}
		enter()

		return () => {
			cancelled = true
			const platformToken = localStorage.getItem('platformToken')
			if (platformToken) localStorage.setItem('token', platformToken)
		}
	}, [schoolId, navigate])

	if (!ready) {
		return (
			<div className="flex justify-center items-center h-full py-16">
				<PulseLoader color="#0891b2" size={16} />
			</div>
		)
	}

	return <Outlet />
}

export default PlatformSchoolShell

