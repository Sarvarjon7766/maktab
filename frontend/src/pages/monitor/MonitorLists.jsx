import { tx } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { FiDownload } from 'react-icons/fi'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Chips, DateField, Empty, Page, PageHeader, PersonLink, Pagination, SchoolLink, SchoolSelect, SearchBox, Segmented, exportXlsx, fmt, todayStr, useMonitorData } from './monitorKit'

const STATE = { inside: ['Maktabda', 'bg-green-50 text-green-700'], out: ['Chiqib ketgan', 'bg-blue-50 text-blue-700'], absent: ['Kelmagan', 'bg-red-50 text-red-700'] }

// Butun tizim bo'yicha shaxslar ro'yxati (kelmaganlar, kech qolganlar, ...). Holat URL'da saqlanadi — havolani ulashish mumkin
const MonitorLists = () => {
	const [params, setParams] = useSearchParams()
	const kind = params.get('kind') === 'staff' ? 'staff' : 'student'
	const status = params.get('status') || ''
	const schoolId = params.get('school') || ''
	const date = params.get('date') || todayStr()
	const [q, setQ] = useState('')
	const [search, setSearch] = useState('')
	const [page, setPage] = useState(1)
	const [exporting, setExporting] = useState(false)

	const update = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); setParams(next); setPage(1) }
	useEffect(() => { const t = setTimeout(() => { setSearch(q); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

	const query = { kind, status, schoolId, date, q: search, page, limit: 50 }
	const { data, loading, error } = useMonitorData('people-all', query)
	const { data: overview } = useMonitorData('overview', { date })
	const s = data?.summary

	// Unmount'dan keyin yuklash tugamasin/setState bo'lmasin
	const aliveRef = useRef(true)
	useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])

	const download = async () => {
		setExporting(true)
		try {
			const all = []
			for (let p = 1; p <= 40; p++) {
				const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/people-all`, { params: { ...query, page: p, limit: 200 }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
				if (!aliveRef.current) return
				all.push(...(res.data.people || []))
				if (p >= res.data.pages) break
			}
			if (!aliveRef.current) return
			await exportXlsx(`royxat-${kind}-${status || 'hammasi'}-${date}`, [{ name: 'Royxat', rows: all.map(r => ({ 'F.I.Sh': r.fullName, Maktab: r.schoolName, [kind === 'student' ? 'Sinf' : 'Lavozim']: kind === 'student' ? r.sinf : r.position, ID: r.code || '', Holat: STATE[r.status][0], 'Kech qolgan': r.late ? 'Ha' : '', Kelgan: r.firstIn || '', Ketgan: r.lastOut || '' })) }])
		} catch {
			if (aliveRef.current) toast.error(tx("Excel faylni tayyorlab bo'lmadi"))
		} finally { if (aliveRef.current) setExporting(false) }
	}

	return (
		<Page>
			<PageHeader>
				<Segmented value={kind} onChange={k => update({ kind: k === 'student' ? '' : k })} options={[{ key: 'student', label: "O'quvchilar" }, { key: 'staff', label: 'Xodimlar' }]} />
				<DateField value={date} max={todayStr()} onChange={v => update({ date: v === todayStr() ? '' : v })} />
				<SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={v => update({ school: v })} />
				<button onClick={download} disabled={exporting || !data?.total} className="inline-flex items-center gap-2 px-3 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={14} /> {exporting ? '...' : tx("Excel")}</button>
			</PageHeader>

			<div className="flex flex-wrap items-center gap-3 mb-4">
				<Chips value={status} onChange={v => update({ status: v })} options={[
					{ key: '', label: 'Hammasi', count: s?.total }, { key: 'came', label: 'Kelgan', count: s?.came }, { key: 'inside', label: 'Maktabda', count: s?.inside },
					{ key: 'late', label: 'Kech qolgan', count: s?.late }, { key: 'absent', label: 'Kelmagan', count: s?.absent }]} />
				<div className="ml-auto"><SearchBox value={q} onChange={setQ} placeholder={tx("Ism, ID")} /></div>
			</div>

			{data?.bySchool?.length > 0 && !schoolId && (
				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
					<p className="text-xs font-semibold text-gray-500 mb-2">{tx("Maktablar kesimi — bosing, shu maktabga filtrlang")}</p>
					<div className="flex flex-wrap gap-2">
						{data.bySchool.map(b => <button key={b.schoolId} onClick={() => update({ school: b.schoolId })} className="px-3 py-1.5 rounded-full text-xs bg-slate-50 border border-slate-200 text-slate-700 hover:bg-blue-50 hover:border-blue-200">{b.schoolName || tx("Noma'lum maktab")} <b className="ml-1">{fmt(b.n)}</b></button>)}
					</div>
				</div>
			)}

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Shaxs', 'Maktab', kind === 'student' ? 'Sinf' : 'Lavozim', 'Holat', 'Kelgan', 'Ketgan'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
						<tbody>
							{(data?.people || []).map(p => (
								<tr key={p._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-4 py-2.5"><PersonLink kind={kind} id={p._id} name={p.fullName} sub={p.code} photo={p.photo} /></td>
									<td className="px-4 py-2.5">{p.schoolName ? <SchoolLink id={p.schoolId} name={p.schoolName} className="text-sm" /> : <span className="text-sm text-gray-400">{tx("Maktab topilmadi")}</span>}</td>
									<td className="px-4 py-2.5 text-gray-600">{(kind === 'student' ? p.sinf : p.position) || '—'}</td>
									<td className="px-4 py-2.5 whitespace-nowrap"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATE[p.status][1]}`}>{STATE[p.status][0]}</span>{p.late && <span className="ml-1.5 px-2 py-1 rounded-full text-xs font-medium bg-orange-50 text-orange-700">{tx("Kech")}</span>}</td>
									<td className="px-4 py-2.5">{p.firstIn || '—'}</td><td className="px-4 py-2.5">{p.lastOut || '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && data?.people?.length === 0 && <Empty text={tx("Topilmadi")} />}
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
				{data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
			</div>
		</Page>
	)
}

export default MonitorLists
