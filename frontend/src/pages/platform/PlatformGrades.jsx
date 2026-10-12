import { tx } from '../../i18n'
import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FiPlus, FiPower, FiTrash2 } from 'react-icons/fi'
import { toast } from 'react-toastify'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })

// Sinf darajalari (1-sinf ... 11-sinf): tizim egasi belgilaydi. Maktab adminlari shu darajalar ichida A, B, V... sinflarini yaratadi
const PlatformGrades = () => {
	const [grades, setGrades] = useState([])
	const [loading, setLoading] = useState(true)
	const [number, setNumber] = useState('')

	const load = useCallback(async () => {
		try { setGrades((await api.get('/api/grades', auth())).data.grades || []) } catch { toast.error("Ma'lumotni yuklab bo'lmadi") } finally { setLoading(false) }
	}, [])
	useEffect(() => { load() }, [load])

	const run = async (fn, okText) => {
		try { await fn(); if (okText) toast.success(okText); load() } catch (e) { toast.error(tx(e.response?.data?.message || 'Xatolik yuz berdi')) }
	}
	const add = (e) => { e.preventDefault(); run(async () => { await api.post('/api/grades', { number }, auth()); setNumber('') }, "Daraja qo'shildi") }

	return (
		<div className="p-4 md:p-6 space-y-5">
			<form onSubmit={add} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-end gap-3">
				<div><label className="block text-sm font-medium text-gray-700 mb-1.5">{tx("Yangi daraja raqami")}</label><input type="number" min="1" max="12" value={number} onChange={e => setNumber(e.target.value)} required placeholder={tx("Masalan: 12")} className="w-44 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400" /></div>
				<button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"><FiPlus /> {tx("Qo'shish")}</button>
				<p className="text-sm text-gray-500 md:ml-auto">{tx("Maktab admini shu darajalar ichida A, B, V... sinflarini yaratadi")}</p>
			</form>

			{loading ? <p className="text-center text-gray-500 py-10">{tx("Yuklanmoqda...")}</p> : (
				<div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
					<div className="overflow-x-auto rounded-2xl">
						<table className="w-full text-sm">
							<thead>
								<tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
									{[tx('Daraja'), tx('Parallel sinflar'), tx('Maktablar'), tx('Holat')].map(h => <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}
									<th className="px-5 py-3 font-semibold text-right whitespace-nowrap">{tx("Amallar")}</th>
								</tr>
							</thead>
							<tbody>
								{grades.map(g => (
									<tr key={g._id} className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/30 ${g.isActive ? '' : 'opacity-60'}`}>
										<td className="px-5 py-3 font-semibold text-gray-900">{g.name}</td>
										<td className="px-5 py-3 text-gray-700"><b className="text-gray-900">{g.sections}</b> {tx("ta")}</td>
										<td className="px-5 py-3 text-gray-700"><b className="text-gray-900">{g.schools}</b> {tx("ta maktabda")}</td>
										<td className="px-5 py-3"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${g.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{g.isActive ? tx("Faol") : tx("Yopiq")}</span></td>
										<td className="px-5 py-3">
											<div className="flex items-center justify-end gap-2">
												<button onClick={() => run(() => api.put(`/api/grades/${g._id}`, { isActive: !g.isActive }, auth()), g.isActive ? 'Daraja yopildi' : 'Daraja ochildi')} title={g.isActive ? tx("Yangi sinf ochishni yopish") : tx("Ochish")} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"><FiPower size={13} /> {g.isActive ? tx("Yopish") : tx("Ochish")}</button>
												<button onClick={() => window.confirm(tx("{{name}} darajasini o'chirasizmi?", { name: g.name })) && run(() => api.delete(`/api/grades/${g._id}`, auth()), "Daraja o'chirildi")} title={tx("O'chirish")} className="p-2 rounded-lg border border-gray-200 text-red-600 hover:bg-red-50"><FiTrash2 size={14} /></button>
											</div>
										</td>
									</tr>
								))}
								{grades.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-gray-400">{tx("Daraja yo'q")}</td></tr>}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	)
}

export default PlatformGrades
