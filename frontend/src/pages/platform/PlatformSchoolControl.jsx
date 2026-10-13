import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiArrowDown, FiArrowUp, FiCheckCircle, FiExternalLink, FiRefreshCw, FiSearch, FiVideo } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import SearchableSelect from '../../components/SearchableSelect'
import { tx } from '../../i18n'
import { setVisibleInterval } from '../../utils/poll'

const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ')
const pct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`)
const PAGE = 30

// Muammo turlari: kod (backend bilan bir xil), yorliq, jiddiylik, rang
const PROBLEMS = {
	no_attendance: { label: "Davomat yo'q", hint: "Bugun birorta o'quvchi/xodim qayd etilmagan", cls: 'bg-red-50 text-red-700' },
	low_attendance: { label: 'Past davomat', hint: "Bugungi o'quvchi davomati 60% dan past", cls: 'bg-orange-50 text-orange-700' },
	cam_offline: { label: 'Kamera offline', hint: "Biriktirilgan kameralardan kamida bittasi aloqada emas", cls: 'bg-red-50 text-red-700' },
	no_camera: { label: 'Kamerasiz', hint: "Maktabga hech qanday kamera biriktirilmagan", cls: 'bg-amber-50 text-amber-700' },
	no_admin: { label: "Admin yo'q", hint: "Maktab adminlari yo'q: maktab tizimga kira olmaydi", cls: 'bg-amber-50 text-amber-700' },
	sync_failed: { label: 'Sinxron xatosi', hint: "Xodim/o'quvchilar Hik-Connect'ga yuborilmadi", cls: 'bg-red-50 text-red-700' },
	no_location: { label: "Joylashuv yo'q", hint: "Maktab xaritada ko'rinmaydi", cls: 'bg-slate-100 text-slate-600' },
	inactive: { label: "To'xtatilgan", hint: "Maktab faolsizlantirilgan", cls: 'bg-slate-200 text-slate-700' }
}
const SORTS = {
	name: (a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true }),
	problems: (a, b) => (b.isActive ? b.problems.length : 0) - (a.isActive ? a.problems.length : 0) || a.name.localeCompare(b.name, 'uz', { numeric: true }),
	student: (a, b) => (a.studentPercent ?? -1) - (b.studentPercent ?? -1),
	staff: (a, b) => (a.staffPercent ?? -1) - (b.staffPercent ?? -1),
	camera: (a, b) => (a.cameras.total ? a.cameras.online / a.cameras.total : -1) - (b.cameras.total ? b.cameras.online / b.cameras.total : -1),
	students: (a, b) => a.students - b.students
}
const tone = (p) => (p === null || p === undefined ? 'bg-gray-300' : p >= 85 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500')

const Th = ({ id, sort, dir, onSort, children, right }) => (
	<th className={`px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${right ? 'text-right' : 'text-left'}`}>
		{id ? (
			<button type="button" onClick={() => onSort(id)} className={`inline-flex items-center gap-1 hover:text-gray-900 ${sort === id ? 'text-gray-900' : ''}`}>
				{children}{sort === id && (dir === 'asc' ? <FiArrowUp size={12} /> : <FiArrowDown size={12} />)}
			</button>
		) : children}
	</th>
)

// Tizim egasi: barcha maktablar holati bitta jadvalda — muammolar bo'yicha filtr, saralash va maktabga tez o'tish
const PlatformSchoolControl = () => {
	const [params, setParams] = useSearchParams()
	const filter = params.get('filter') || ''
	const district = params.get('district') || ''
	const [data, setData] = useState(null)
	const [error, setError] = useState(false)
	const [loading, setLoading] = useState(false)
	const [q, setQ] = useState('')
	const [sort, setSort] = useState('problems')
	const [dir, setDir] = useState('desc')
	const [shown, setShown] = useState(PAGE)

	const load = useCallback(async () => {
		setLoading(true)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/platform-settings/schools-health`, authHeaders())
			if (res.data.success) { setData(res.data); setError(false) } else setError(true)
		} catch { setError(true) } finally { setLoading(false) }
	}, [])
	useEffect(() => { load(); const t = setVisibleInterval(load, 60000); return () => clearInterval(t) }, [load])
	useEffect(() => { setShown(PAGE) }, [filter, district, q, sort, dir])

	const setParam = (k, v) => { const next = new URLSearchParams(params); if (v) next.set(k, v); else next.delete(k); setParams(next, { replace: true }) }
	const onSort = (id) => { if (sort === id) setDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSort(id); setDir(id === 'name' ? 'asc' : id === 'problems' || id === 'students' ? 'desc' : 'asc') } }

	const districts = useMemo(() => [...new Set((data?.schools || []).map(s => s.district).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz')), [data])
	const rows = useMemo(() => {
		const t = q.trim().toLowerCase()
		const list = (data?.schools || []).filter(s => (!district || s.district === district)
			&& (!filter || (filter === 'any' ? s.problems.length > 0 : s.problems.includes(filter)))
			&& (!t || `${s.name} ${s.code} ${s.district} ${s.region}`.toLowerCase().includes(t)))
		const cmp = SORTS[sort] || SORTS.name
		return list.sort((a, b) => (dir === 'asc' ? cmp(a, b) : -cmp(a, b)))
	}, [data, district, filter, q, sort, dir])

	if (error && !data) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")} <button onClick={load} className="ml-2 underline">{tx("Qayta urinish")}</button></div></div>
	if (!data) return <div className="space-y-3 p-6">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-14 animate-pulse rounded-xl bg-white" />)}</div>

	const chips = [['', tx('Hammasi'), data.total], ['any', tx('Muammoli'), data.problemSchools], ...Object.entries(PROBLEMS).filter(([k]) => data.counts[k]).map(([k, v]) => [k, tx(v.label), data.counts[k]])]
	const totals = rows.reduce((a, s) => ({ students: a.students + s.students, came: a.came + s.studentCame, staff: a.staff + s.staff, staffCame: a.staffCame + s.staffCame }), { students: 0, came: 0, staff: 0, staffCame: 0 })

	return (
		<div className="space-y-4 p-4 md:p-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold text-gray-900">{tx("Maktablar nazorati")}</h1>
					<p className="text-sm text-gray-500">{tx("Har bir maktabning bugungi holati va muammolari: {{n}} ta maktabdan {{m}} tasida diqqat talab qiladigan holat bor", { n: data.total, m: data.problemSchools })}</p>
				</div>
				<button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {tx("Yangilash")}</button>
			</div>

			<div className="flex flex-wrap gap-2">
				{chips.map(([key, label, n]) => (
					<button key={key || 'all'} onClick={() => setParam('filter', key)} className={`rounded-full border px-3.5 py-1.5 text-sm transition ${filter === key ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'}`}>
						{label} <span className={filter === key ? 'text-white/70' : 'text-gray-400'}>{n}</span>
					</button>
				))}
			</div>

			<div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
				<div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
					<div className="relative min-w-[220px] flex-1">
						<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Maktab nomi, kodi yoki hudud bo'yicha qidirish")} className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:bg-white" />
					</div>
					<SearchableSelect variant="outline" icon={false} searchFrom={8} className="min-w-[180px] max-w-[240px]" searchPlaceholder={tx("Tuman qidirish...")} value={district} onChange={v => setParam('district', v)} options={[{ value: '', label: 'Barcha tumanlar' }, ...districts.map(d => ({ value: d, label: d }))]} />
					<p className="text-sm text-gray-500">{tx("{{n}} ta maktab", { n: rows.length })} · {tx("o'quvchilar")} {fmt(totals.came)}/{fmt(totals.students)} · {tx("xodimlar")} {fmt(totals.staffCame)}/{fmt(totals.staff)}</p>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="border-b border-gray-100 bg-gray-50/70">
							<Th id="name" sort={sort} dir={dir} onSort={onSort}>{tx("Maktab")}</Th>
							<Th id="student" sort={sort} dir={dir} onSort={onSort}>{tx("O'quvchilar bugun")}</Th>
							<Th id="staff" sort={sort} dir={dir} onSort={onSort}>{tx("Xodimlar bugun")}</Th>
							<Th id="camera" sort={sort} dir={dir} onSort={onSort}>{tx("Kameralar")}</Th>
							<Th id="problems" sort={sort} dir={dir} onSort={onSort}>{tx("Holat")}</Th>
							<Th right>{tx("Amallar")}</Th>
						</tr></thead>
						<tbody>
							{rows.slice(0, shown).map(s => (
								<tr key={s._id} className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/30 ${s.isActive ? '' : 'opacity-60'}`}>
									<td className="px-4 py-3">
										<Link to={`/platform/schools/${s._id}`} className="font-semibold text-gray-900 hover:text-blue-600">{s.name}</Link>
										<p className="text-xs text-gray-400">{[s.region, s.district].filter(Boolean).join(', ')} · {fmt(s.students)} {tx("o'quvchi")} · {fmt(s.staff)} {tx("xodim")}</p>
									</td>
									<td className="min-w-[150px] px-4 py-3"><div className="mb-1 flex items-baseline justify-between text-xs"><b className="text-gray-900">{pct(s.studentPercent)}</b><span className="text-gray-400">{fmt(s.studentCame)}/{fmt(s.students)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone(s.studentPercent)}`} style={{ width: `${s.studentPercent || 0}%` }} /></div></td>
									<td className="min-w-[130px] px-4 py-3"><div className="mb-1 flex items-baseline justify-between text-xs"><b className="text-gray-900">{pct(s.staffPercent)}</b><span className="text-gray-400">{fmt(s.staffCame)}/{fmt(s.staff)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${tone(s.staffPercent)}`} style={{ width: `${s.staffPercent || 0}%` }} /></div></td>
									<td className="whitespace-nowrap px-4 py-3">
										{s.cameras.total ? <span className="inline-flex items-center gap-1.5"><FiVideo className="text-gray-400" size={14} /><b className={s.cameras.offline ? 'text-red-600' : 'text-gray-900'}>{s.cameras.online}/{s.cameras.total}</b></span> : <span className="text-gray-300">—</span>}
									</td>
									<td className="px-4 py-3">
										{s.problems.length === 0 ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><FiCheckCircle size={14} /> {tx("Muammo yo'q")}</span> : (
											<div className="flex max-w-[360px] flex-wrap gap-1">{s.problems.map(p => <span key={p} title={tx(PROBLEMS[p].hint)} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PROBLEMS[p].cls}`}>{tx(PROBLEMS[p].label)}</span>)}</div>
										)}
									</td>
									<td className="whitespace-nowrap px-4 py-3 text-right">
										<Link to={`/platform/schools/${s._id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"><FiExternalLink size={13} /> {tx("Maktabni ochish")}</Link>
									</td>
								</tr>
							))}
							{rows.length === 0 && <tr><td colSpan={6} className="px-4 py-14 text-center text-gray-500">{tx("Filtrga mos maktab topilmadi")}</td></tr>}
						</tbody>
					</table>
				</div>
				{rows.length > shown && <div className="border-t border-gray-100 p-3 text-center"><button onClick={() => setShown(n => n + PAGE)} className="rounded-lg border border-gray-200 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50">{tx("Yana {{n}} ta ko'rsatish", { n: Math.min(PAGE, rows.length - shown) })}</button></div>}
			</div>
		</div>
	)
}

export default PlatformSchoolControl
