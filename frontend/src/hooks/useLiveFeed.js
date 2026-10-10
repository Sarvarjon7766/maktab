import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'

const BASE_URL = import.meta.env.VITE_BASE_URL
const POLL_MS = 4000
const ERROR_TOAST_ID = 'live-feed-error'

// Jonli kirish/chiqish oqimi — dastlab AdminAnalytics.jsx ichida yozilgan
// poll naqshi (PostMonitor.jsx'dagi asl namunadan olingan), boshqa
// sahifalar (masalan AdminHome.jsx) ham qayta ishlata olishi uchun
// mustaqil hookka ajratilgan. Interval har 4 soniyada ikkita so'rov
// yuboradi (feed + stats). Ular tarmoqda kechikib, oldingi tsikldan
// KEYINGI javob avvalroq kelishi mumkin — requestIdRef orqali faqat ENG
// OXIRGI tsikl natijasini qabul qilamiz, eskirgan javob state'ni ustidan
// yozib qo'ymasin.
export default function useLiveFeed({ limit = 30 } = {}) {
	const [events, setEvents] = useState([])
	const [stats, setStats] = useState(null)
	const [loading, setLoading] = useState(true)
	const [lastUpdated, setLastUpdated] = useState(null)
	const requestIdRef = useRef(0)

	const fetchLive = async () => {
		const reqId = ++requestIdRef.current
		// Token har so'rovda joriy qiymatdan olinadi
		const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` }
		try {
			const [feedRes, statsRes] = await Promise.all([
				axios.get(`${BASE_URL}/api/user/live-feed`, { params: { limit }, headers }),
				axios.get(`${BASE_URL}/api/user/dashboard-stats`, { headers }),
			])
			if (reqId !== requestIdRef.current) return // eskirgan javob
			if (feedRes.data.success) setEvents(feedRes.data.events || [])
			if (statsRes.data.success) setStats(statsRes.data.today)
			setLastUpdated(new Date())
			toast.dismiss(ERROR_TOAST_ID)
		} catch (err) {
			if (reqId !== requestIdRef.current) return
			// Qayta-qayta chiqmasligi uchun doimiy toastId (bitta toast)
			toast.error(err.response?.data?.message || "Jonli ma'lumotlarni yuklashda xatolik", { toastId: ERROR_TOAST_ID })
		} finally {
			if (reqId === requestIdRef.current) setLoading(false)
		}
	}

	useEffect(() => {
		fetchLive()
		const interval = setInterval(() => { if (!document.hidden) fetchLive() }, POLL_MS)
		const onVisible = () => { if (!document.hidden) fetchLive() }
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(interval)
			document.removeEventListener('visibilitychange', onVisible)
			requestIdRef.current++ // unmount'dan keyin setState bo'lmasin
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [limit])

	return { events, stats, loading, lastUpdated, refresh: fetchLive }
}
