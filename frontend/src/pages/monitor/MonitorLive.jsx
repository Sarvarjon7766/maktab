import { useEffect, useMemo, useState } from 'react'
import AutoSelect from '../../components/AutoSelect'
import { FiArrowDown, FiArrowUp, FiMinus, FiRefreshCw } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartBox, Empty, KpiLink, Page, Panel, SchoolLink, Segmented, fmt, levelColor, levelText, pct, useMonitorData, pctFmt } from './monitorKit'
import { tx } from '../../i18n'

const REFRESH_MS = 20000
const SORTS = [
	{ key: 'percent', label: 'Davomat', get: s => s.percent },
	{ key: 'came', label: 'Kelganlar', get: s => s.came },
	{ key: 'inside', label: 'Hozir maktabda', get: s => s.inside },
	{ key: 'late', label: 'Kech qolgan', get: s => s.late },
	{ key: 'delta', label: 'Kechagidan farq', get: s => s.delta }
]
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569']

// Kirish dinamikasi: bugun (qalin) va kecha (punktir) — kun bo'yicha to'plangan kirishlar
const Spark = ({ curve, prev, total, hour }) => {
	const w = 120, h = 34, top = Math.max(total, 1)
	const pts = (arr, n) => arr.slice(0, n).map((v, i) => `${(i / Math.max(n - 1, 1)) * w},${h - 2 - Math.min(v / top, 1) * (h - 4)}`).join(' ')
	const n = Math.max(hour + 1, 2)
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
			<polyline points={pts(prev, n)} fill="none" stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="3 3" />
			<polyline points={pts(curve, n)} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" />
		</svg>
	)
}

const Delta = ({ value }) => (
	value === 0 ? <span className="inline-flex items-center gap-1 text-gray-400"><FiMinus size={13} /> 0</span>
		: value > 0 ? <span className="inline-flex items-center gap-1 text-green-600 font-medium"><FiArrowUp size={13} />{fmt(value)}</span>
			: <span className="inline-flex items-center gap-1 text-red-600 font-medium"><FiArrowDown size={13} />{fmt(Math.abs(value))}</span>
)

// Jonli solishtirish: barcha maktablar yonma-yon. Ma'lumot har 20 soniyada yangilanadi
const MonitorLive = () => {
	const [kind, setKind] = useState('student')
	const [sort, setSort] = useState('percent')
	const [tick, setTick] = useState(0)
	const { data, loading, error, reload, updatedAt } = useMonitorData('live', {}, { auto: REFRESH_MS })
	useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t) }, [])

	const rows = useMemo(() => {
		const def = SORTS.find(s => s.key === sort)
		const list = (data?.schools || []).map(s => ({ ...s, ...s[kind], _id: s._id, name: s.name, region: s.region, district: s.district, cameras: s.cameras }))
		const byPercent = [...list].sort((a, b) => b.percent - a.percent)
		return list.map(s => ({ ...s, rank: byPercent.findIndex(x => x._id === s._id) + 1 })).sort((a, b) => def.get(b) - def.get(a) || a.name.localeCompare(b.name))
	}, [data, kind, sort])

	const totals = rows.reduce((a, s) => ({ total: a.total + s.total, came: a.came + s.came, inside: a.inside + s.inside, late: a.late + s.late, delta: a.delta + s.delta, camOn: a.camOn + s.cameras.online, cam: a.cam + s.cameras.total }), { total: 0, came: 0, inside: 0, late: 0, delta: 0, camOn: 0, cam: 0 })
	const avg = pct(totals.came, totals.total)
	const seconds = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt.getTime()) / 1000)) + 0 * tick : 0

	// Kirish dinamikasi chizig'i uchun: eng yuqori 5 va eng past 4 maktab (o'ta ko'p chiziq o'qishni qiyinlashtirmasligi uchun)
	const lineSchools = useMemo(() => {
		const ranked = [...rows].sort((a, b) => b.percent - a.percent)
		return ranked.length <= 9 ? ranked : [...ranked.slice(0, 5), ...ranked.slice(-4)]
	}, [rows])
	const hours = data ? Array.from({ length: Math.max(data.nowHour - 5, 2) }, (_, i) => i + 6) : []
	const lineData = hours.map(h => Object.fromEntries([['soat', `${String(h).padStart(2, '0')}:00`], ...lineSchools.map(s => [s.name, s.total ? Math.round(((s.curve[h] ?? s.curve[s.curve.length - 1] ?? 0) / s.total) * 1000) / 10 : 0])]))
	const barData = [...rows].sort((a, b) => b.percent - a.percent).map(s => ({ name: s.name, Davomat: s.percent }))

	return (
		<Page>
			<div className="flex flex-wrap items-center justify-between gap-3 mb-5">
				<div className="flex items-center gap-3">
					<span className="inline-flex items-center gap-2 rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-sm font-medium text-green-700"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {tx("Jonli")}</span>
					<span className="text-sm text-gray-500">{updatedAt ? `${updatedAt.toLocaleTimeString('uz-UZ')} da yangilandi (${seconds} soniya oldin)` : ''}</span>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Segmented value={kind} onChange={setKind} options={[{ key: 'student', label: "O'quvchilar" }, { key: 'staff', label: 'Xodimlar' }]} />
					<AutoSelect value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm">
						{SORTS.map(s => <option key={s.key} value={s.key}>{tx("Saralash: {{label}}", { label: s.label })}</option>)}
					</AutoSelect>
					<button onClick={reload} title={tx("Yangilash")} className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={16} /></button>
				</div>
			</div>

			<div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
				<KpiLink to={`/monitor/lists?kind=${kind}&status=came`} label={tx("Umumiy davomat")} value={`${avg}%`} detail={`${fmt(totals.came)} / ${fmt(totals.total)}`} color="bg-blue-50 text-blue-600" icon={<span className="text-sm font-bold">%</span>} />
				<KpiLink to={`/monitor/lists?kind=${kind}&status=inside`} label={tx("Hozir maktabda")} value={totals.inside} detail={tx("ichkarida turganlar")} color="bg-green-50 text-green-600" icon={<span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />} />
				<KpiLink to={`/monitor/lists?kind=${kind}&status=late`} label={tx("Kech qolganlar")} value={totals.late} color="bg-orange-50 text-orange-600" icon={<span className="text-sm font-bold">!</span>} />
				<KpiLink to="/monitor/trend" label={tx("Kechagi shu vaqtga nisbatan")} value={`${totals.delta > 0 ? '+' : totals.delta < 0 ? '−' : ''}${fmt(Math.abs(totals.delta))}`} detail={data ? `${data.prevDate} bilan` : ''} color={totals.delta >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'} icon={totals.delta >= 0 ? <FiArrowUp /> : <FiArrowDown />} />
				<KpiLink to="/monitor/camera-health" label={tx("Kameralar online")} value={`${totals.camOn}/${totals.cam}`} color="bg-slate-100 text-slate-600" icon={<span className="text-sm font-bold">K</span>} />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{["O'rin", 'Maktab', 'Davomat', 'Kelgan', 'Hozir maktabda', 'Kech qolgan', 'Kechagidan farq', 'Bugungi kirish dinamikasi', 'Birinchi kirish', 'Kameralar'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map(s => {
								const best = s.rank === 1 && rows.length > 1, worst = s.rank === rows.length && rows.length > 1
								return (
									<tr key={s._id} className={`border-b border-gray-50 last:border-0 hover:bg-blue-50/30 ${best ? 'bg-green-50/30' : worst ? 'bg-red-50/30' : ''}`}>
										<td className="px-4 py-3"><span className={`inline-flex w-8 h-8 items-center justify-center rounded-full text-xs font-bold ${s.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{s.rank}</span></td>
										<td className="px-4 py-3"><SchoolLink id={s._id} name={s.name} tab={kind === 'student' ? 'students' : 'staff'} /><p className="text-xs text-gray-500">{[s.region, s.district].filter(Boolean).join(', ')}</p>{best && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-semibold">{tx("Eng yuqori")}</span>}{worst && <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{tx("Diqqat kerak")}</span>}</td>
										<td className="px-4 py-3 min-w-[170px]">
											<div className="flex items-center justify-between mb-1"><span className={`font-semibold ${levelText(s.percent)}`}>{pctFmt(s.percent)}</span><span className="text-xs text-gray-400">{s.percent >= avg ? '+' : '−'}{tx("{{n}} o'rtachadan", { n: Math.abs(Math.round((s.percent - avg) * 10) / 10) })}</span></div>
											<div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${levelColor(s.percent)}`} style={{ width: `${Math.min(s.percent, 100)}%` }} /></div>
										</td>
										<td className="px-4 py-3 whitespace-nowrap"><Link to={`/monitor/lists?kind=${kind}&status=came&school=${s._id}`} className="font-medium text-gray-900 hover:text-blue-600">{fmt(s.came)}</Link><span className="text-gray-400"> / {fmt(s.total)}</span></td>
										<td className="px-4 py-3 font-medium text-blue-700">{fmt(s.inside)}</td>
										<td className="px-4 py-3"><Link to={`/monitor/lists?kind=${kind}&status=late&school=${s._id}`} className={s.late ? 'text-orange-600 font-medium hover:underline' : 'text-gray-400'}>{fmt(s.late)}</Link></td>
										<td className="px-4 py-3 whitespace-nowrap"><Delta value={s.delta} /><span className="text-xs text-gray-400 ml-1.5">{tx("({{n}} edi)", { n: fmt(s.prevSameTime) })}</span></td>
										<td className="px-4 py-3"><Spark curve={s.curve} prev={s.prevCurve} total={s.total} hour={data?.nowHour ?? 8} /></td>
										<td className="px-4 py-3 text-gray-700">{s.firstArrival >= 0 ? `${String(s.firstArrival).padStart(2, '0')}:00` : '—'}</td>
										<td className="px-4 py-3 whitespace-nowrap"><span className={s.cameras.offline ? 'text-red-600 font-medium' : 'text-gray-700'}>{s.cameras.online}/{s.cameras.total}</span></td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && rows.length === 0 && !error && <Empty text={tx("Maktablar topilmadi")} />}
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
			</div>

			<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
				<Panel title={tx("Maktablar davomati yonma-yon")}>
					<ChartBox height={Math.max(220, barData.length * 34)}><ResponsiveContainer width="100%" height="100%">
						<BarChart data={barData} layout="vertical" margin={{ left: 10, right: 30 }}>
							<CartesianGrid strokeDasharray="3 3" horizontal={false} />
							<XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
							<YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
							<Tooltip formatter={v => `${v}%`} />
							<ReferenceLine x={avg} stroke="#64748b" strokeDasharray="4 4" label={{ value: `o'rtacha ${avg}%`, position: 'top', fontSize: 10, fill: '#64748b' }} />
							<Bar isAnimationActive={false} dataKey="Davomat" radius={[0, 5, 5, 0]} maxBarSize={20}>{barData.map(b => <Cell key={b.name} fill={b.Davomat >= 85 ? '#16a34a' : b.Davomat >= 60 ? '#f59e0b' : '#dc2626'} />)}</Bar>
						</BarChart>
					</ResponsiveContainer></ChartBox>
				</Panel>
				<Panel title={tx("Bugungi kirish dinamikasi, soat bo'yicha (%)")}>
					<ChartBox height={Math.max(220, barData.length * 34)}><ResponsiveContainer width="100%" height="100%">
						<LineChart data={lineData} margin={{ left: -8, right: 12, top: 8 }}>
							<CartesianGrid strokeDasharray="3 3" vertical={false} />
							<XAxis dataKey="soat" tick={{ fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
							<Tooltip formatter={v => `${v}%`} /><Legend wrapperStyle={{ fontSize: 11 }} />
							{lineSchools.map((s, i) => <Line isAnimationActive={false} key={s._id} type="monotone" dataKey={s.name} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />)}
						</LineChart>
					</ResponsiveContainer></ChartBox>
				</Panel>
			</div>
		</Page>
	)
}

export default MonitorLive
