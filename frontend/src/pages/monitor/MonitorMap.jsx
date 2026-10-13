import { useCallback, useMemo, useState } from 'react'
import { FiMapPin, FiRefreshCw, FiSearch } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import SchoolsMapPanel, { METRICS, colorFor, fmtPct } from '../../components/SchoolsMapPanel'
import useSchoolMap from '../../hooks/useSchoolMap'
import { tx } from '../../i18n'

const Tile = ({ to, children }) => {
	const cls = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
	return to ? <Link to={to} className={`block ${cls} transition hover:border-blue-300 hover:shadow-md`}>{children}</Link> : <div className={cls}>{children}</div>
}

// Xarita sahifasi: tuman chegarasi, maktablar belgilari (ichida foiz) va yon ro'yxat. Monitor faqat o'z tumanini, tizim egasi hamma tumanni ko'radi
const MonitorMap = () => {
	const platform = useLocation().pathname.startsWith('/platform')
	const navigate = useNavigate()
	const { data, error, refreshing, refresh } = useSchoolMap({ platform })
	const [metric, setMetric] = useState('student')
	const [q, setQ] = useState('')
	const [focus, setFocus] = useState(null)
	const [selected, setSelected] = useState(null)

	const M = METRICS[metric]
	const schools = useMemo(() => data?.schools || [], [data])
	const list = useMemo(() => {
		const t = q.trim().toLowerCase()
		const dir = M.good ? 1 : -1, empty = M.good ? 101 : -1
		return schools.filter(s => !t || `${s.name} ${s.district}`.toLowerCase().includes(t))
			.sort((a, b) => ((M.value(a) ?? empty) - (M.value(b) ?? empty)) * dir || a.name.localeCompare(b.name))
	}, [schools, q, M])
	const openSchool = useCallback((s) => navigate(platform ? `/platform/schools/${s._id}` : `/monitor/schools/${s._id}`), [navigate, platform])

	if (error && !data) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Xaritani yuklab bo'lmadi")}</div></div>

	return (
		<div className="min-h-full space-y-4 bg-slate-50 p-4 md:p-6">
			<div className="flex flex-wrap items-end justify-end gap-3">
				<button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"><FiRefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {tx("Yangilash")}</button>
			</div>

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
				<div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
					<SchoolsMapPanel data={data} metric={metric} onMetric={setMetric} selectedId={selected} focus={focus} height="max(560px, calc(100vh - 210px))" onOpenSchool={openSchool} />
				</div>

				<aside className="flex max-h-[max(610px,calc(100vh-140px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
					<div className="relative border-b border-slate-100 p-3">
						<FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Maktab qidirish")} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:bg-white" />
					</div>
					<ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
						{list.map(s => {
							const v = M.value(s)
							return (
								<li key={s._id}>
									<button onClick={() => { if (s.location) { setSelected(s._id); setFocus({ lat: s.location.lat, lng: s.location.lng, zoom: 15, t: Date.now() }) } }} className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected === s._id ? 'bg-blue-50/70' : s.location ? 'hover:bg-slate-50' : 'cursor-default opacity-70'}`}>
										<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: colorFor(v, M.good) }}>{fmtPct(v)}</span>
										<span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{s.name}</span><span className="flex items-center gap-1 truncate text-xs text-slate-400">{s.location ? <><FiMapPin size={10} />{s.district}</> : tx("Joylashuvi belgilanmagan")}</span></span>
									</button>
								</li>
							)
						})}
						{data && list.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">{tx("Maktab topilmadi")}</li>}
					</ul>
					{data && data.unlocated > 0 && <p className="border-t border-slate-100 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">{tx("{{n}} ta maktab xaritada yo'q: maktab admini «Sozlamalar» bo'limida joylashuvni belgilashi kerak.", { n: data.unlocated })}</p>}
				</aside>
			</div>
		</div>
	)
}

export default MonitorMap
