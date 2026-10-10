import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'

// Maktablar xaritasi ma'lumoti (/api/monitor/map): har daqiqada avtomatik yangilanadi
export default function useSchoolMap({ platform = false } = {}) {
	const token = platform ? (localStorage.getItem('platformToken') || localStorage.getItem('token')) : localStorage.getItem('token')
	const [data, setData] = useState(null)
	const [error, setError] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const load = useCallback(async () => {
		try {
			const r = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/map`, { headers: { Authorization: `Bearer ${token}` } })
			setData(r.data); setError(false)
		} catch { setError(true) } finally { setRefreshing(false) }
	}, [token])
	useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])
	const refresh = () => { setRefreshing(true); load() }
	return { data, error, refreshing, refresh }
}
