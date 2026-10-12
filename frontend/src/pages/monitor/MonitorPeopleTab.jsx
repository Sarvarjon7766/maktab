import { tx } from '../../i18n'
import AutoSelect from '../../components/AutoSelect'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { FiChevronLeft, FiChevronRight, FiDownload, FiSearch } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { DateField, exportXlsx, fmt, todayStr, useMonitorData } from './monitorKit'
import axios from 'axios'

const STATUS_CHIPS = [
	{ key: '', label: 'Hammasi', field: 'total' },
	{ key: 'came', label: 'Kelgan', field: 'came' },
	{ key: 'inside', label: 'Maktabda', field: 'inside' },
	{ key: 'late', label: 'Kech qolgan', field: 'late' },
	{ key: 'absent', label: 'Kelmagan', field: 'absent' }
]

const STATE = {
	inside: { text: 'Maktabda', cls: 'bg-green-50 text-green-700' },
	out: { text: 'Chiqib ketgan', cls: 'bg-blue-50 text-blue-700' },
	absent: { text: 'Kelmagan', cls: 'bg-red-50 text-red-700' }
}

const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()

// Maktabning xodimlari yoki o'quvchilari: qidiruv, holat va sinf filtri, sahifalash. Qatorni bosish — shaxs profiliga
const MonitorPeopleTab = ({ schoolId, kind, initialStatus = '', initialSinf = '' }) => {
	const navigate = useNavigate()
	const isStudent = kind === 'student'
	const [q, setQ] = useState('')
	const [search, setSearch] = useState('')
	const [status, setStatus] = useState(initialStatus)
	const [sinfId, setSinfId] = useState(initialSinf)
	const [date, setDate] = useState(todayStr())
	const [page, setPage] = useState(1)
	const [exporting, setExporting] = useState(false)

	// qidiruv matni 300ms kutib yuboriladi
	useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

	const params = { q: search, status, sinfId, date, page, limit: 50 }
	const { data, loading, error } = useMonitorData(`school/${schoolId}/${isStudent ? 'students' : 'staff'}`, params)
	const { data: classData } = useMonitorData('classes', { schoolId, date }, { skip: !isStudent })
	const s = data?.summary

	// Unmount'dan keyin yuklash tugamasin/setState bo'lmasin
	const aliveRef = useRef(true)
	useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])

	const download = async () => {
		setExporting(true)
		try {
			const all = []
			for (let p = 1; p <= 40; p++) {
				const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/school/${schoolId}/${isStudent ? 'students' : 'staff'}`, { params: { ...params, page: p, limit: 200 }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
				if (!aliveRef.current) return
				all.push(...(res.data.people || []))
				if (p >= res.data.pages) break
			}
			if (!aliveRef.current) return
			await exportXlsx(`${isStudent ? 'oquvchilar' : 'xodimlar'}-${date}`, [{
				name: isStudent ? "O'quvchilar" : 'Xodimlar',
				rows: all.map(r => ({ 'F.I.Sh': r.fullName, [isStudent ? 'Sinf' : 'Lavozim']: isStudent ? r.sinf : r.position, ID: r.code || '', Holat: STATE[r.status].text, 'Kech qolgan': r.late ? 'Ha' : '', Kelgan: r.firstIn || '', Ketgan: r.lastOut || '', 'Jami vaqt': r.totalTime || '' }))
			}])
		} catch {
			if (aliveRef.current) toast.error(tx("Excel faylni tayyorlab bo'lmadi"))
		} finally {
			if (aliveRef.current) setExporting(false)
		}
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative flex-1 min-w-[220px]">
					<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
					<input value={q} onChange={e => setQ(e.target.value)} placeholder={isStudent ? tx("Ism yoki ID raqami") : tx("Ism, ID yoki lavozim")} className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm outline-none focus:border-blue-400" />
				</div>
				{isStudent && (
					<AutoSelect value={sinfId} onChange={e => { setSinfId(e.target.value); setPage(1) }} className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm">
						<option value="">{tx("Barcha sinflar")}</option>
						{(classData?.classes || []).map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
					</AutoSelect>
				)}
				<DateField value={date} max={todayStr()} onChange={v => { setDate(v); setPage(1) }} />
				<button onClick={download} disabled={exporting || !data?.total} title={tx("Excel")} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={14} /> {exporting ? '...' : tx("Excel")}</button>
			</div>

			<div className="flex flex-wrap gap-2">
				{STATUS_CHIPS.map(c => (
					<button key={c.key} onClick={() => { setStatus(c.key); setPage(1) }} className={`px-3.5 py-1.5 rounded-full text-sm border transition ${status === c.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
						{c.label} <span className="opacity-70">{s ? fmt(s[c.field]) : ''}</span>
					</button>
				))}
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{['Ism', isStudent ? 'Sinf' : 'Lavozim', 'ID', 'Holat', 'Kelgan', 'Ketgan', 'Vaqt'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{(data?.people || []).map(p => (
								<tr key={p._id} onClick={() => navigate(`/monitor/people/${kind}/${p._id}`)} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/40 cursor-pointer">
									<td className="px-4 py-2.5">
										<div className="flex items-center gap-3">
											<span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">{initials(p.fullName)}</span>
											<span className="font-medium text-gray-900">{p.fullName}</span>
										</div>
									</td>
									<td className="px-4 py-2.5 text-gray-600">{(isStudent ? p.sinf : p.position) || '—'}</td>
									<td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{p.code || '—'}</td>
									<td className="px-4 py-2.5 whitespace-nowrap">
										<span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATE[p.status].cls}`}>{STATE[p.status].text}</span>
										{p.late && <span className="ml-1.5 px-2 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">{tx("Kech")}</span>}
									</td>
									<td className="px-4 py-2.5 text-gray-700">{p.firstIn || '—'}</td>
									<td className="px-4 py-2.5 text-gray-700">{p.lastOut || '—'}</td>
									<td className="px-4 py-2.5 text-gray-700">{p.totalTime || '—'}</td>
								</tr>
							))}
							{!loading && data?.people?.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">{tx("Hech kim topilmadi")}</td></tr>}
							{loading && !data && <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-500">{tx("Yuklanmoqda...")}</td></tr>}
							{error && <tr><td colSpan={7} className="px-4 py-12 text-center text-red-600">{tx("Ma'lumotni yuklab bo'lmadi")}</td></tr>}
						</tbody>
					</table>
				</div>
				{data && data.pages > 1 && (
					<div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
						<span>{tx("{{total}} ta · {{page}}/{{pages}}-sahifa", { total: fmt(data.total), page: data.page, pages: data.pages })}</span>
						<div className="flex gap-2">
							<button disabled={data.page <= 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><FiChevronLeft /></button>
							<button disabled={data.page >= data.pages} onClick={() => setPage(p => p + 1)} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"><FiChevronRight /></button>
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default MonitorPeopleTab
