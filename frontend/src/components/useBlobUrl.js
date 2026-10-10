import axios from 'axios'
import { useEffect, useState } from 'react'

// Hik papkasidagi himoyalangan rasmni (autentifikatsiya bilan) olib, <img src> uchun blob manzil qaytaradi.
// path — `/api/hik/` dan keyingi qism; null bo'lsa hech narsa yuklanmaydi
export const useBlobUrl = (path) => {
	const [url, setUrl] = useState(null)
	useEffect(() => {
		setUrl(null)
		if (!path) return
		let gone = false, objectUrl = null
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/${path}`, { responseType: 'blob', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(res => { if (!gone) { objectUrl = URL.createObjectURL(res.data); setUrl(objectUrl) } }).catch(() => { })
		return () => { gone = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
	}, [path])
	return url
}

export default useBlobUrl
