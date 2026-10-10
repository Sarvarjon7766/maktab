import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiClock } from 'react-icons/fi'
import { tx } from '../i18n'

let cached = null
// Aqlli kuzatuv dalillari (rasm va qisqa lavhalar) necha kun saqlanishi haqida izoh; qiymat platforma sozlamalaridan olinadi
const RetentionNote = ({ className = '' }) => {
	const [info, setInfo] = useState(cached)
	useEffect(() => {
		if (cached) return
		let alive = true
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/vision/retention`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(r => { if (r.data?.success) { cached = r.data; if (alive) setInfo(r.data) } }).catch(() => { })
		return () => { alive = false }
	}, [])
	if (!info) return null
	return (
		<p className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
			<FiClock size={12} className="shrink-0" />
			{tx("Dalil rasm va lavhalari: muhim hodisalar {{a}} kun, oddiy namunalar {{b}} kun saqlanadi, keyin avtomatik o'chiriladi", { a: info.alertDays, b: info.sampleDays })}
		</p>
	)
}

export default RetentionNote
