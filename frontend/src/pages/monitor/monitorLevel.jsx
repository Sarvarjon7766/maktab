import axios from 'axios'
import { useEffect, useState } from 'react'

// Monitor darajasi: 'region' (viloyat), 'district' (tuman) yoki 'global' (cheklovsiz). Bir marta so'raladi va eslab qolinadi
let level = null
let pending = null
export const resetMonitorLevel = () => { level = null; pending = null }

export function useMonitorLevel() {
	const [lvl, setLvl] = useState(level)
	useEffect(() => {
		if (level) return
		let p = pending
		if (!p) {
			// /me xatosi keshlanmaydi: keyingi safar qayta so'raladi (hozircha 'global' ko'rsatiladi)
			const mine = axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
				.then(r => { level = r.data.level || 'global'; return level })
				.catch(() => { if (pending === mine) pending = null; return 'global' })
			pending = p = mine
		}
		let alive = true
		p.then(v => { if (alive) setLvl(v) })
		return () => { alive = false }
	}, [])
	return lvl
}

// Daraja bo'yicha sahifa tanlash: viloyat monitori uchun viloyat darajasidagi, qolganlari uchun tuman darajasidagi sahifa
export const ByLevel = ({ region, district }) => {
	const lvl = useMonitorLevel()
	if (!lvl) return <div className="p-6"><div className="h-64 animate-pulse rounded-2xl bg-white" /></div>
	return lvl === 'region' ? region : district
}
