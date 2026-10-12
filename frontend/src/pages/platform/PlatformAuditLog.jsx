import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiEye, FiSearch } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { tx } from '../../i18n'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

const formatDateTime = (iso) => {
	if (!iso) return '-'
	return new Date(iso).toLocaleString('uz-UZ', {
		day: '2-digit', month: '2-digit', year: 'numeric',
		hour: '2-digit', minute: '2-digit'
	})
}

const PlatformAuditLog = () => {
	const [logs, setLogs] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [q, setQ] = useState('')
	const navigate = useNavigate()
	const shown = useMemo(() => { const t = norm(q.trim()); return t ? logs.filter(l => norm(`${l.superadminUsername} ${l.school?.name || ''} ${l.school?.code || ''} ${l.impersonatedUser?.fullName || ''} ${l.impersonatedUser?.username || ''}`).includes(t)) : logs }, [logs, q])

	useEffect(() => {
		api.get('/api/schools/impersonation-logs', authHeaders())
			.then(res => { if (res.data.success) setLogs(res.data.logs) })
			.catch(() => toast.error("Audit jurnalini yuklashda xatolik"))
			.finally(() => setIsLoading(false))
	}, [])

	return (
		<div className="md:p-6 bg-gray-50 min-h-full">
			<div className="relative mb-4 mx-4 md:mx-0 max-w-md">
				<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
				<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Maktab, superadmin yoki hisob bo'yicha qidirish")} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
			</div>

			<div className="bg-white rounded-xl shadow overflow-hidden mx-4 md:mx-0">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Vaqt")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Superadmin")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Maktab")}</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Kirilgan hisob")}</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{isLoading ? (
								<tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-400">{tx("Yuklanmoqda...")}</td></tr>
							) : shown.length > 0 ? (
															shown.map(log => (
									<tr key={log._id} onClick={() => log.school?._id && navigate(`/platform/schools/${log.school._id}`)} title={log.school?._id ? tx("Maktabni ochish") : undefined} className={`hover:bg-gray-50 ${log.school?._id ? 'cursor-pointer' : ''}`}>
										<td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
										<td className="px-4 py-3.5 text-sm text-gray-900">
											<span className="inline-flex items-center gap-1.5">
												<FiEye className="text-indigo-500" size={14} />
												{log.superadminUsername}
											</span>
										</td>
										<td className="px-4 py-3.5">
											<div className="text-sm font-medium text-gray-900">{log.school?.name || tx("O'chirilgan maktab")}</div>
											<div className="text-xs text-gray-500">{log.school?.code}</div>
										</td>
										<td className="px-4 py-3.5 text-sm text-gray-600">
											{log.impersonatedUser?.fullName || '-'}
											<span className="text-gray-400"> ({log.impersonatedUser?.username || '-'})</span>
										</td>
									</tr>
								))
							) : (
								<tr><td colSpan="4" className="px-6 py-8 text-center text-sm text-gray-500">{logs.length ? tx("Qidiruv bo'yicha yozuv topilmadi") : tx("Hali hech kim \"Nazorat qilish\"ni ishlatmagan")}</td></tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	)
}

export default PlatformAuditLog
