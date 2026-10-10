import axios from 'axios'
import { clearSession } from './sessionCleanup'

// Har bir sahifa o'zi alohida axios.get/post chaqirgani uchun (markazlashgan
// API-klient yo'q), 401 (token yo'q/muddati tugagan) holatini bitta joyda,
// global interceptor orqali ushlaymiz — shunda har bir sahifani alohida
// tuzatish shart emas. `axios` paketi butun ilova bo'ylab bitta umumiy
// instance ekanligi uchun (hech qayerda `axios.create()` ishlatilmagan),
// shu yerda bir marta ro'yxatga olish yetarli.
let redirecting = false

// Login va parol almashtirish 401'i "sessiya tugadi" degani emas (noto'g'ri parol)
const isExcludedUrl = (url = '') => /\/user\/auth(\?|$)|change-password/.test(url)

const getBearer = (config) => {
	const h = config?.headers
	const v = (h && (typeof h.get === 'function' ? h.get('Authorization') : h.Authorization || h.authorization)) || ''
	return String(v).replace(/^Bearer\s+/i, '')
}

// Superadmin maktab ichida (impersonation) bo'lganda maktab tokeni eskirsa —
// butun sessiyani o'chirmaymiz, faqat kesh yozuvini o'chirib qobiqni qayta yuklaymiz
const tryRecoverImpersonation = (error) => {
	const m = window.location.pathname.match(/^\/platform\/schools\/([^/]+)/)
	const platformToken = localStorage.getItem('platformToken')
	if (!m || !platformToken) return false
	// platforma tokenining o'zi 401 bergan bo'lsa — haqiqiy logout
	if (getBearer(error.config) === platformToken) return false
	try { sessionStorage.removeItem('school-impersonation:' + m[1]) } catch { /* ixtiyoriy */ }
	localStorage.setItem('token', platformToken)
	return true
}

axios.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response?.status === 401 && window.location.pathname !== '/' && !redirecting && !isExcludedUrl(error.config?.url)) {
			redirecting = true
			if (tryRecoverImpersonation(error)) {
				window.location.reload()
			} else {
				clearSession().finally(() => { window.location.href = '/' })
			}
		}
		return Promise.reject(error)
	}
)
