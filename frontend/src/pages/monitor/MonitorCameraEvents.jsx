import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Chips, ChartBox, Empty, Page, PageHeader, Pagination, Panel, RangePicker, SchoolLink, SchoolSelect, SearchBox, SelectBox, matchText, fmt, shiftDate, todayStr, useMonitorData } from './monitorKit'

const KINDS = {
	motion: { label: 'Harakat', color: '#2563eb', chip: 'bg-blue-50 text-blue-700' },
	density: { label: 'Odam zichligi', color: '#f59e0b', chip: 'bg-amber-50 text-amber-700' },
	people: { label: "Odamlar soni g'ayritabiiy", color: '#dc2626', chip: 'bg-red-50 text-red-700' },
	enter: { label: 'Hududga kirish', color: '#16a34a', chip: 'bg-green-50 text-green-700' },
	exit: { label: 'Hududdan chiqish', color: '#ea580c', chip: 'bg-orange-50 text-orange-700' },
	multi: { label: "Ko'p turdagi obyekt", color: '#7c3aed', chip: 'bg-violet-50 text-violet-700' }
}
const FALLBACK_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2']
const kindMeta = (k, i = 0) => KINDS[k] || { label: k, color: FALLBACK_COLORS[i % FALLBACK_COLORS.length], chip: 'bg-slate-100 text-slate-700' }
const timeOf = (d) => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tashkent' })

// Kamera hodisalari: har bir tahliliy signalning tafsiloti (vaqti, kamerasi, sinfi, maktabi) bilan
const MonitorCameraEvents = () => {
	const [params, setParams] = useSearchParams()
	const schoolId = params.get('school') || ''
	const kind = params.get('kind') || ''
	const range = { from: params.get('from') || shiftDate(todayStr(), -6), to: params.get('to') || todayStr() }
	const [page, setPage] = useState(1)
	const update = (patch) => { const next = new URLSearchParams(params); Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k))); setParams(next); setPage(1) }

	const { data, loading, error, reload } = useMonitorData('camera-events', { schoolId, kind, ...range, page, limit: 50 })
	const { data: overview } = useMonitorData('overview', {})
	const [q, setQ] = useState('')
	const [camera, setCamera] = useState('')
	const cameraOpts = useMemo(() => [{ value: '', label: 'Barcha kameralar' }, ...[...new Set((data?.events || []).map(e => e.camera).filter(Boolean))].sort().map(v => ({ value: v, label: v }))], [data])
	const events = useMemo(() => (data?.events || []).filter(e => (!camera || e.camera === camera) && matchText(q, e.camera, e.area, e.sinf, e.schoolName, kindMeta(e.kind).label)), [data, q, camera])
	const kindCounts = useMemo(() => Object.fromEntries((data?.byKind || []).map(k => [k.kind, k.n])), [data])
	const total = (data?.byKind || []).reduce((a, k) => a + k.n, 0)
	// Ma'lumotda uchragan hamma turlar (noma'lumlari ham): chiplar yig'indisi 'Hammasi'ga teng bo'ladi
	const allKinds = useMemo(() => [...Object.keys(KINDS), ...(data?.byKind || []).map(k => k.kind).filter(k => k && !KINDS[k])], [data])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}><SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={v => update({ school: v })} /></PageHeader>
			<div className="mb-4"><RangePicker {...range} onChange={r => update({ from: r.from, to: r.to })} /></div>
			<div className="mb-6"><Chips value={kind} onChange={v => update({ kind: v })} options={[{ key: '', label: 'Hammasi', count: total }, ...allKinds.map((k, i) => ({ key: k, label: kindMeta(k, i).label, count: kindCounts[k] || 0 }))]} /></div>
			{error && <Empty text="Ma'lumotni yuklab bo'lmadi" />}

			<div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-6">
				<Panel title="Kunlar bo'yicha hodisalar" className="xl:col-span-2">
					{data?.byDay?.length ? (
						<ChartBox height={240}><ResponsiveContainer width="100%" height="100%">
							<BarChart data={data.byDay.map(d => ({ ...d, kun: d.date.slice(5) }))} margin={{ left: -12, right: 8 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="kun" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Legend />
								{allKinds.map((k, i) => { const v = kindMeta(k, i); return <Bar key={k} dataKey={k} name={v.label} stackId="a" fill={v.color} maxBarSize={30} /> })}
							</BarChart>
						</ResponsiveContainer></ChartBox>
					) : <Empty text={loading ? 'Yuklanmoqda...' : "Bu davrda hodisa yo'q"} />}
				</Panel>
				<Panel title="Maktablar bo'yicha">
					<ul className="divide-y divide-gray-50 max-h-[240px] overflow-y-auto">
						{(data?.bySchool || []).map(s => (
							<li key={s.schoolId} className="py-2 flex items-center justify-between gap-2 text-sm">
								<button onClick={() => update({ school: String(s.schoolId) })} className="text-left text-gray-800 hover:text-blue-600 truncate">{s.schoolName}</button>
								<span className="shrink-0 text-gray-500">{fmt(s.n)}{s.density > 0 && <span className="ml-2 px-1.5 py-0.5 rounded bg-red-50 text-red-700 text-xs font-medium">zichlik {s.density}</span>}</span>
							</li>
						))}
						{!data?.bySchool?.length && <li className="py-6 text-center text-sm text-gray-400">—</li>}
					</ul>
				</Panel>
			</div>

			<div className="flex flex-wrap items-center gap-3 mb-3">
				<SearchBox value={q} onChange={setQ} placeholder="Kamera, sinf yoki maktab qidirish..." />
				<SelectBox value={camera} onChange={setCamera} searchPlaceholder="Kamera qidirish..." options={cameraOpts} />
			</div>
			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Vaqt', 'Hodisa', 'Maktab', 'Sinf', 'Kamera'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
						<tbody>
							{events.map(e => (
								<tr key={e._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{timeOf(e.time)}</td>
									<td className="px-4 py-2.5"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${kindMeta(e.kind).chip}`}>{kindMeta(e.kind).label}</span></td>
									<td className="px-4 py-2.5"><SchoolLink id={e.schoolId} name={e.schoolName} className="text-sm" /></td>
									<td className="px-4 py-2.5 text-gray-600">{e.sinf ? <Link to={`/monitor/schools/${e.schoolId}?tab=students&sinf=${e.sinfId}`} className="hover:text-blue-600">{e.sinf}</Link> : '—'}</td>
									<td className="px-4 py-2.5"><Link to={`/monitor/cameras?school=${e.schoolId}`} className="text-gray-800 hover:text-blue-600">{e.camera || '—'}</Link>{e.area && <span className="ml-2 text-xs text-gray-400">{e.area}</span>}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{!loading && data && events.length === 0 && <Empty text="Topilmadi" />}
				{data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
			</div>
		</Page>
	)
}

export default MonitorCameraEvents
