import { useMemo, useState } from 'react'
import { FiArrowLeft, FiPlay } from 'react-icons/fi'
import { FaVideo, FaVideoSlash } from 'react-icons/fa'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { Link, useSearchParams } from 'react-router-dom'
import HikLiveModal from '../../components/HikLiveModal'
import { Chips, Empty, KpiLink, Page, PageHeader, Panel, SearchBox, fmt, matchText, useMonitorData } from './monitorKit'
import { tx } from '../../i18n'

const ROLE = { in: 'Kirish', out: 'Chiqish' }
const STATE = {
	online: { label: 'Online', chip: 'bg-green-50 text-green-700', dot: 'bg-green-500' },
	offline: { label: 'Offline', chip: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
	unknown: { label: "Noma'lum", chip: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
}
const stateOf = (c) => (c.online === true ? 'online' : c.online === false ? 'offline' : 'unknown')
const ago = (date) => {
	if (!date) return 'aloqa bo‘lmagan'
	const min = Math.round((Date.now() - new Date(date).getTime()) / 60000)
	if (min < 1) return 'hozirgina'
	if (min < 60) return `${min} daqiqa oldin`
	if (min < 1440) return `${Math.round(min / 60)} soat oldin`
	return `${Math.round(min / 1440)} kun oldin`
}
const canView = (c) => c.source === 'hikconnect' && c.online === true
const rate = (x) => (x.total ? Math.round((x.online / x.total) * 100) : 0)
const barColor = (p) => (p >= 80 ? 'bg-green-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500')

const Donut = ({ c }) => {
	const parts = [['online', c.online, '#22c55e'], ['offline', c.offline, '#ef4444'], ['unknown', c.unknown, '#cbd5e1']].filter(p => p[1] > 0)
	return (
		<div className="relative w-36 h-36 shrink-0">
			<ResponsiveContainer width="100%" height="100%">
				<PieChart>
					<Pie data={parts.length ? parts.map(p => ({ n: p[0], v: p[1] })) : [{ n: 'x', v: 1 }]} dataKey="v" innerRadius={46} outerRadius={64} paddingAngle={parts.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
						{(parts.length ? parts : [['x', 1, '#e5e7eb']]).map(p => <Cell key={p[0]} fill={p[2]} />)}
					</Pie>
				</PieChart>
			</ResponsiveContainer>
			<div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"><b className="text-2xl text-gray-900">{c.total ? `${rate(c)}%` : '—'}</b><span className="text-[11px] text-gray-500">{tx("online")}</span></div>
		</div>
	)
}

const Legend = ({ c }) => (
	<ul className="space-y-1.5 text-sm">
		{['online', 'offline', 'unknown'].map(k => <li key={k} className="flex items-center gap-2"><i className={`w-2.5 h-2.5 rounded-full ${STATE[k].dot}`} /><span className="text-gray-600 w-20">{STATE[k].label}</span><b className="text-gray-900">{fmt(c[k])}</b></li>)}
	</ul>
)

// Kamera holati: umumiy ko'rinish maktablar kesimida; maktab tanlansa uning oddiy kameralari (FaceControl alohida)
const MonitorCameraHealth = () => {
	const [params, setParams] = useSearchParams()
	const schoolId = params.get('school') || ''
	const { data, loading, error, reload } = useMonitorData('camera-health', {}, { auto: true })
	const [q, setQ] = useState('')
	const [filter, setFilter] = useState('all')
	const [open, setOpen] = useState(null)

	const schools = useMemo(() => data?.schools || [], [data])
	const school = schools.find(s => String(s.schoolId) === schoolId)
	const pick = (id) => { setQ(''); setFilter('all'); const n = new URLSearchParams(params); if (id) n.set('school', id); else n.delete('school'); setParams(n) }

	const list = useMemo(() => {
		return schools.filter(s => matchText(q, s.schoolName))
			.filter(s => filter === 'all' || (filter === 'problem' ? s.regular.offline > 0 || s.regular.unknown > 0 : filter === 'empty' ? s.regular.total === 0 : s.regular.total > 0 && s.regular.offline === 0 && s.regular.unknown === 0))
	}, [schools, q, filter])

	// --- Bitta maktab ---
	if (schoolId) {
		const all = (data?.cameras || []).filter(c => String(c.schoolId) === schoolId)
		const regular = all.filter(c => c.kind === 'regular')
		const fc = all.filter(c => c.kind === 'facecontrol')
		const c = school?.regular || { total: 0, online: 0, offline: 0, unknown: 0 }
		const shown = regular.filter(x => (filter === 'all' || stateOf(x) === filter) && matchText(q, x.name, x.sinf, x.place))
		return (
			<Page>
				<PageHeader onReload={reload} loading={loading}>
					<button onClick={() => pick('')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiArrowLeft /> {tx("Maktablar")}</button>
				</PageHeader>
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
				<div className="flex flex-wrap items-center justify-between gap-3 mb-5">
					<Link to={`/monitor/schools/${schoolId}`} className="text-2xl font-semibold text-gray-900 hover:text-blue-600">{school?.schoolName || tx("Maktab")}</Link>
					<Link to={`/monitor/cameras?school=${schoolId}`} className="text-sm font-medium text-blue-600 hover:underline">{tx("Jonli ko'rish →")}</Link>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 mb-5">
					<Panel title={tx("Kameralar holati")}><div className="flex items-center gap-6"><Donut c={c} /><Legend c={c} /></div></Panel>
					<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 content-start">
						<KpiLink onClick={() => setFilter('all')} icon={<FaVideo />} color="bg-slate-100 text-slate-600" label={tx("Kameralar")} value={c.total} />
						<KpiLink onClick={() => setFilter('online')} icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("Online")} value={c.online} detail={c.total ? `${rate(c)}%` : ''} />
						<KpiLink onClick={() => setFilter('offline')} icon={<FaVideoSlash />} color="bg-red-50 text-red-600" label={tx("Offline")} value={c.offline} />
						<KpiLink onClick={() => setFilter('unknown')} icon={<FaVideoSlash />} color="bg-gray-100 text-gray-500" label={tx("Noma'lum")} value={c.unknown} />
					</div>
				</div>

				<Panel title={`Kameralar (${fmt(shown.length)})`} action={
					<div className="flex flex-wrap items-center gap-2">
						<Chips value={filter} onChange={setFilter} options={[['all', 'Hammasi'], ['online', 'Online'], ['offline', 'Offline'], ['unknown', "Noma'lum"]].map(([value, label]) => ({ value, label }))} />
						<SearchBox value={q} onChange={setQ} placeholder={tx("Kamera yoki sinf qidirish")} />
					</div>}>
					{shown.length === 0 ? <Empty text={regular.length ? tx("Topilmadi") : tx("Bu maktabda oddiy kamera yo'q")} /> : (
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
							{shown.map(x => {
								const st = STATE[stateOf(x)]
								return (
									<div key={x._id} onClick={() => canView(x) && setOpen(x)} role={canView(x) ? 'button' : undefined} className={`rounded-xl border border-gray-100 bg-white p-4 ${canView(x) ? 'cursor-pointer hover:border-blue-200 hover:shadow-md transition' : ''}`}>
										<div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium text-gray-900 truncate">{x.name}</p><p className="text-xs text-gray-400 truncate">{[x.source === 'hikconnect' ? 'Hik-Connect' : 'Lokal', x.sinf, x.place].filter(Boolean).join(' · ')}</p></div><span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${st.chip}`}>{st.label}</span></div>
										<div className="flex items-center justify-between gap-2 mt-3"><p className="text-xs text-gray-500">{tx("Oxirgi aloqa: {{time}}", { time: ago(x.lastSeenAt) })}</p>{canView(x) && <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600"><FiPlay size={12} /> {tx("Jonli ko'rish")}</span>}</div>
										{x.error && <p className="text-xs text-red-500 mt-1 truncate" title={x.error}>{x.error}</p>}
									</div>
								)
							})}
						</div>
					)}
				</Panel>

				{fc.length > 0 && (
					<div className="mt-5"><Panel title={`FaceControl kameralari (${fc.length})`}>
						<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
							{fc.map(x => { const st = STATE[stateOf(x)]; return (
								<div key={x._id} onClick={() => canView(x) && setOpen(x)} className={`rounded-xl border border-gray-100 p-4 flex items-start justify-between gap-2 ${canView(x) ? 'cursor-pointer hover:border-blue-200 hover:shadow-md transition' : ''}`}>
									<div className="min-w-0"><p className="font-medium text-gray-900 truncate">{x.name}</p><p className="text-xs text-gray-400">{ROLE[x.role]} · {ago(x.lastSeenAt)}{canView(x) && tx(" · Jonli ko'rish")}</p></div>
									<span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${st.chip}`}>{st.label}</span>
								</div>
							) })}
						</div>
					</Panel></div>
				)}
				{open && <HikLiveModal camera={{ id: open._id, name: open.name, areaName: open.place, schoolName: school?.schoolName }} onClose={() => setOpen(null)} />}
			</Page>
		)
	}

	// --- Umumiy ko'rinish ---
	const t = data?.totals?.regular || { total: 0, online: 0, offline: 0, unknown: 0 }
	const f = data?.totals?.facecontrol || { total: 0, online: 0, offline: 0, unknown: 0 }
	const problem = schools.filter(s => s.regular.offline > 0).length
	return (
		<Page>
			<PageHeader onReload={reload} loading={loading} />
			{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}

			<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4 mb-5">
				<Panel title={tx("Oddiy kameralar")}><div className="flex items-center gap-6"><Donut c={t} /><Legend c={t} /></div></Panel>
				<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 content-start">
					<KpiLink onClick={() => setFilter('all')} icon={<FaVideo />} color="bg-slate-100 text-slate-600" label={tx("Jami kameralar")} value={t.total} />
					<KpiLink onClick={() => setFilter('ok')} icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("Online")} value={t.online} detail={t.total ? `${rate(t)}%` : ''} />
					<KpiLink onClick={() => setFilter('problem')} icon={<FaVideoSlash />} color="bg-red-50 text-red-600" label={tx("Offline")} value={t.offline} />
					<KpiLink onClick={() => setFilter('problem')} icon={<FaVideoSlash />} color="bg-amber-50 text-amber-600" label={tx("Muammoli maktablar")} value={problem} />
					<div className="col-span-2 xl:col-span-4 rounded-2xl border border-gray-100 bg-white px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
						<b className="text-gray-900">{tx("FaceControl")}</b><span className="text-gray-600">{tx("Jami {{n}}", { n: fmt(f.total) })}</span><span className="text-green-600">{tx("Online {{n}}", { n: fmt(f.online) })}</span><span className="text-red-600">{tx("Offline {{n}}", { n: fmt(f.offline) })}</span>
					</div>
				</div>
			</div>

			<Panel title={`Maktablar (${fmt(list.length)})`} action={
				<div className="flex flex-wrap items-center gap-2">
					<Chips value={filter} onChange={setFilter} options={[['all', 'Hammasi'], ['problem', 'Muammoli'], ['ok', 'Hammasi online'], ['empty', 'Kamerasiz']].map(([value, label]) => ({ value, label }))} />
					<SearchBox value={q} onChange={setQ} placeholder={tx("Maktab qidirish")} />
				</div>}>
				{list.length === 0 ? <Empty text={loading ? tx("Yuklanmoqda...") : tx("Topilmadi")} /> : (
					<div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
						{list.map(s => {
							const r = s.regular, p = rate(r)
							return (
								<button key={String(s.schoolId)} onClick={() => pick(String(s.schoolId))} className="text-left rounded-xl border border-gray-100 bg-white p-4 hover:border-blue-200 hover:shadow-md transition">
									<div className="flex items-start justify-between gap-2"><p className="font-medium text-gray-900 min-w-0 break-words">{s.schoolName}</p>{r.total > 0 && <b className={`text-sm shrink-0 ${p >= 80 ? 'text-green-600' : p >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{p}%</b>}</div>
									{r.total === 0 ? <p className="text-xs text-gray-400 mt-3">{tx("Oddiy kamera yo'q")}</p> : (
										<>
											<div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-3"><div className={`h-full rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} /></div>
											<div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-xs"><span className="text-gray-600">{tx("{{a}}/{{b}} online", { a: r.online, b: r.total })}</span>{r.offline > 0 && <b className="text-red-600">{tx("{{n}} offline", { n: r.offline })}</b>}{r.unknown > 0 && <span className="text-gray-400">{tx("{{n}} noma'lum", { n: r.unknown })}</span>}</div>
										</>
									)}
									{s.facecontrol.total > 0 && <p className="text-[11px] text-gray-400 mt-2">{tx("FaceControl: {{a}}/{{b}} online", { a: s.facecontrol.online, b: s.facecontrol.total })}</p>}
								</button>
							)
						})}
					</div>
				)}
			</Panel>
		</Page>
	)
}

export default MonitorCameraHealth
