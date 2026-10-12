import { FiActivity, FiAlertOctagon, FiAlertTriangle, FiArrowRight, FiBarChart2, FiCheckCircle, FiChevronDown, FiInfo, FiList, FiRefreshCw, FiUserX, FiVideo, FiWifiOff } from 'react-icons/fi'
import { FaChalkboardTeacher, FaClock, FaDoorOpen, FaFire, FaLandmark, FaMapMarkerAlt, FaMedal, FaSchool, FaUmbrellaBeach, FaUserGraduate, FaUsers, FaVideo } from 'react-icons/fa'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartBox, Chips, DateField, Empty, LoadState, Page, PageHeader, Panel, RangePicker, SearchBox, StatCard, Table, Td, Tr, WEEKDAYS, fmt, levelText, matchText, shiftDate, todayStr, useMonitorData, KpiLink, SelectBox, pctFmt } from './monitorKit'
import { tx } from '../../i18n'
// tumanlar kesimida jamlanadi. Qatordagi tumanni bossangiz, tuman sahifasi ochiladi (maktab, xodim, o'quvchigacha chuqurlashish).
const hub = (name, tab) => `/monitor/districts/${encodeURIComponent(name)}${tab ? `?tab=${tab}` : ''}`
// Tooltip kartasi va gradient ustunlar (chartlar uchun umumiy)
const gid = (c) => `rg${String(c).replace('#', '')}`
const Gradients = ({ colors }) => <defs>{[...new Set(colors.filter(Boolean))].map(c => <linearGradient key={c} id={gid(c)} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={c} stopOpacity={0.55} /><stop offset="100%" stopColor={c} stopOpacity={1} /></linearGradient>)}</defs>
const Tip = ({ active, payload, label, unit = '' }) => {
	if (!active || !payload?.length) return null
	return <div className="rounded-xl bg-white px-3.5 py-2.5 text-xs shadow-xl ring-1 ring-slate-200"><p className="mb-1 font-semibold text-slate-900">{label ?? payload[0].payload?.name}</p>{payload.filter(p => p.value !== null && p.value !== undefined).map(p => <p key={p.dataKey + p.name} className="flex items-center justify-between gap-4 text-slate-600"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />{p.name === 'value' ? '' : p.name}</span><b className="text-slate-900">{fmt(p.value)}{unit}</b></p>)}</div>
}
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#be123c', '#a16207', '#7c3aed', '#0369a1', '#15803d']

const Dist = ({ name, tab, sub }) => <div><Link to={hub(name, tab)} className="font-semibold text-slate-900 hover:text-blue-600">{name}</Link>{sub && <p className="text-xs text-slate-400">{sub}</p>}</div>
const Names = ({ list, unit = '' }) => (list?.length ? <ul className="space-y-0.5 text-xs text-slate-600">{list.map(p => <li key={p._id || p.name} className="truncate"><span className="font-medium text-slate-800">{p.name}</span>{p.schoolName ? <span className="text-slate-400"> · {p.schoolName}</span> : null}{p.value !== null && p.value !== undefined ? <b className="ml-1 text-slate-700">{p.value}{unit}</b> : null}</li>)}</ul> : <span className="text-slate-300">—</span>)

// Sahifa sarlavhasi: ikonka, yo'l (viloyat › bo'lim), nom, izoh va boshqaruvlar (davr/sana, yangilash)
// Boshqaruvlar qatori (davr/sana, yangilash). Sahifa nomi yuqori panelda ko'rinadi, shuning uchun alohida sarlavha yo'q
const Head = ({ onReload, loading, children }) => (
	<div className="mb-5 flex flex-wrap items-center justify-end gap-2">
		{children}
		{onReload && <button onClick={onReload} disabled={loading} title={tx("Yangilash")} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={16} /></button>}
	</div>
)

// Yuklanish skeleti (sahifa yuklanguncha shakl ko'rinib turadi)
const Skeleton = () => <div className="space-y-4"><div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-white" /></div>

const SORTS = [['high', 'Eng yuqori ko\'rsatkich'], ['low', 'Eng past ko\'rsatkich'], ['name', 'Nomi bo\'yicha']]
const RED = '#dc2626'

// Tuman qatori (reyting): o'rin, nom, asosiy ko'rsatkich chizig'i va 2–3 asosiy raqam. Bosilsa qolgan ko'rsatkichlar va nomlar ochiladi
const DistrictRow = ({ x, rank, chart, columns, tab, max }) => {
	const [open, setOpen] = useState(false)
	const raw = chart ? chart.value(x) : null
	const color = chart?.color ? chart.color(raw) : '#2563eb'
	const pctBar = chart ? (chart.unit === '%' ? raw : max ? (raw / max) * 100 : 0) : 0
	const small = columns.filter(c => c.right), lists = columns.filter(c => !c.right)
	// bo'sh ro'yxatlar (faqat "—") ko'rsatilmaydi
	const shownLists = lists.map(c => ({ c, node: c.render(x) })).filter(({ node }) => node && node.props?.className !== 'text-slate-300')
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
			<div className="flex items-center gap-3 pr-3">
				<button onClick={() => setOpen(o => !o)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50" aria-expanded={open}>
					{rank != null && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rank === 1 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{rank}</span>}
					<div className="w-40 shrink-0 sm:w-48"><p className="truncate font-semibold text-slate-900">{x.district}</p><p className="text-xs text-slate-400">{tx("{{n}} maktab", { n: x.schools })}</p></div>
					{chart && (
						<div className="min-w-0 flex-1">
							<div className="mb-1 flex items-baseline justify-between gap-2"><span className="text-lg font-extrabold leading-none" style={{ color }}>{raw === null || raw === undefined ? '—' : `${fmt(raw)}${chart.unit || ''}`}</span></div>
							<div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, pctBar || 0))}%`, background: color }} /></div>
						</div>
					)}
					<div className="hidden shrink-0 items-center gap-5 lg:flex">{small.slice(0, 3).map(c => <div key={c.label} className="text-right"><p className="text-sm font-semibold text-slate-800">{c.render(x)}</p><p className="text-[10px] uppercase tracking-wide text-slate-400">{c.label}</p></div>)}</div>
					<FiChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
				</button>
				<Link to={hub(x.district, tab)} title={tx("Tuman sahifasi")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-blue-600 hover:bg-blue-50"><FiArrowRight size={18} /></Link>
			</div>
			{open && (
				<div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
					{small.length > 0 && <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 xl:grid-cols-6">{small.map(c => <div key={c.label}><dt className="text-[11px] text-slate-400">{c.label}</dt><dd className="text-sm font-semibold text-slate-800">{c.render(x)}</dd></div>)}</dl>}
					{shownLists.length > 0 && <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">{shownLists.map(({ c, node }) => <div key={c.label}><p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">{c.label}</p>{node}</div>)}</div>}
					<Link to={hub(x.district, tab)} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">{tx("Tuman sahifasi: maktablar, xodimlar, o'quvchilar")} <FiArrowRight size={14} /></Link>
				</div>
			)}
		</div>
	)
}

const RegionPage = ({ title, subtitle, metric, range = false, date = false, kpis, kpiTo, columns, chart, tab, icon }) => {
	const [r, setR] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [d, setD] = useState(todayStr())
	const [q, setQ] = useState('')
	const [sort, setSort] = useState('high')
	const params = { ...(range ? r : {}), ...(date ? { date: d } : {}) }
	const { data, loading, error, reload } = useMonitorData(`region/${metric}`, params, { auto: !range })
	const rows = useMemo(() => data?.rows || [], [data])
	const cd = useMemo(() => (chart ? rows.map(x => ({ ...(chart.stack ? { ...Object.fromEntries(chart.stack.map(([k]) => [k, x[k] || 0])), total: chart.stack.reduce((a, [k]) => a + (x[k] || 0), 0) } : {}), name: x.district, value: chart.value(x) ?? 0, raw: chart.value(x) })).sort((a, b) => b.value - a.value) : []), [rows, chart])
	const max = useMemo(() => Math.max(0, ...cd.map(c => c.value)), [cd])
	const rankOf = useMemo(() => new Map(cd.map((c, i) => [c.name, i + 1])), [cd])
	const list = useMemo(() => {
		const val = (x) => (chart ? (chart.value(x) ?? -Infinity) : 0)
		return rows.filter(x => matchText(q, x.district)).sort((a, b) => (sort === 'name' ? a.district.localeCompare(b.district, 'uz') : sort === 'low' ? val(a) - val(b) : val(b) - val(a)))
	}, [rows, q, sort, chart])
	const bad = chart?.kind === 'bad', plain = chart?.kind === 'count'
	// "bad": son qancha ko'p bo'lsa shuncha yomon (ogohlantirish, offline, kech qolish). Yuqori — qizil, nol — yashil
	const top = cd[0], low = cd.length > 1 ? cd[cd.length - 1] : null
	const cdv = bad || plain ? cd.filter(c => (c.total ?? c.raw) > 0) : cd // grafik: nol qiymatli tumanlar yashiriladi (ularni Diqqat blokida sanaymiz)
	const best = bad ? null : top, worst = bad ? (top && top.raw > 0 ? top : null) : low
	const clean = bad ? cd.filter(c => !c.raw) : []
	const alertRows = bad ? cd.filter(c => c.raw > 0) : chart?.color ? cd.filter(c => chart.color(c.raw) === RED) : []
	const unit = chart?.unit || ''

	return (
		<Page>
			<Head icon={icon} title={title} subtitle={`${subtitle}${range ? ` · ${r.from} — ${r.to}` : ''}${date ? ` · ${d}` : ''}`} onReload={reload} loading={loading}>
				{range && <RangePicker from={r.from} to={r.to} onChange={setR} />}
				{date && <DateField value={d} max={todayStr()} onChange={setD} />}
			</Head>
			<LoadState loading={false} error={error}>
				{!data ? <Skeleton /> : (
					<>
						<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">{kpis(data.totals, rows).map(([ic, label, value, detail, color], i) => <KpiLink key={label} to={label === "Eng ko'p tuman" && value !== '—' ? hub(value, tab) : kpiTo?.[i]} icon={ic} label={label} value={value} detail={detail} color={color} />)}</div>

						{chart && cd.length > 0 && (
							<div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
								<Panel title={chart.title}>
									{cdv.length === 0 ? <div className="flex flex-col items-center justify-center py-14 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><FiCheckCircle size={24} /></span><p className="font-semibold text-slate-800">{bad ? tx("Hamma tumanda muammo yo'q") : tx("Ma'lumot yo'q")}</p><p className="mt-1 text-sm text-slate-500">{bad ? tx("Tanlangan sana yoki davrda e'tibor talab holat topilmadi") : tx("Tanlangan davrda hodisa qayd etilmagan")}</p></div> : <ChartBox height={Math.max(230, cdv.length * 34)}>
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={cdv} layout="vertical" margin={{ left: 4, right: 48, top: 4, bottom: 4 }} barCategoryGap="28%">
												<Gradients colors={cdv.map(c => (chart.color ? chart.color(c.raw) : '#2563eb'))} />
												<CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" horizontal={false} />
												<XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={chart.stack ? [0, 'auto'] : chart.domain || [0, 'auto']} allowDecimals={false} />
												<YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
												<Tooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} content={<Tip unit={chart.stack ? '' : unit} />} />
												{chart.stack ? (<>
													{chart.stack.map(([k, l, col], i) => <Bar key={k} dataKey={k} name={l} stackId="a" fill={col} maxBarSize={24} radius={i === chart.stack.length - 1 ? [0, 8, 8, 0] : 0} label={i === chart.stack.length - 1 ? { position: 'right', content: p => <text x={p.x + p.width + 6} y={p.y + p.height / 2 + 4} fontSize={11} fontWeight={700} fill="#334155">{cd[p.index]?.total}</text> } : undefined} />)}
													<Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: 12, paddingBottom: 8 }} />
												</>) : (
													<Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={24} background={{ fill: '#f1f5f9', radius: 8 }} label={{ position: 'right', fontSize: 11, fontWeight: 700, fill: '#334155', formatter: v => `${fmt(v)}${unit}` }}>
														{cdv.map(c => <Cell key={c.name} fill={`url(#${gid(chart.color ? chart.color(c.raw) : '#2563eb')})`} />)}
													</Bar>
												)}
											</BarChart>
										</ResponsiveContainer>
									</ChartBox>}
								{cd.length > cdv.length && cdv.length > 0 && <p className="mt-2 px-1 text-xs text-slate-400">{tx("{{n}} ta tumanda", { n: cd.length - cdv.length })} {bad ? tx("muammo yo'q") : tx("hodisa yo'q")}{tx(", grafikda ko'rsatilmagan")}</p>}
								</Panel>
								<div className="space-y-3">
									<p className="px-1 text-sm font-semibold text-slate-700">{tx("Diqqat")}</p>
									{bad && worst && <Link to={hub(worst.name, tab)} className="block rounded-2xl border border-red-200 bg-red-50/70 p-4 transition hover:shadow-md"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700"><FiAlertTriangle size={13} /> {chart.worstLabel || tx("Eng ko'p")}</p><p className="mt-1 text-lg font-bold text-slate-900">{worst.name}</p><p className="text-sm text-slate-600">{fmt(worst.raw)}{unit}</p></Link>}
									{bad && clean.length > 0 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><FiCheckCircle size={13} /> {tx("Muammosiz tumanlar")}</p><p className="mt-1 text-lg font-bold text-slate-900">{tx("{{n}} ta", { n: clean.length })}</p><p className="text-sm text-slate-600">{clean.slice(0, 3).map(c => c.name).join(', ')}{clean.length > 3 ? tx(" va boshqalar") : ''}</p></div>}
									{!bad && best && <Link to={hub(best.name, tab)} className={`block rounded-2xl border p-4 transition hover:shadow-md ${plain ? 'border-blue-200 bg-blue-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}><p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${plain ? 'text-blue-700' : 'text-emerald-700'}`}><FiCheckCircle size={13} /> {plain ? tx("Eng ko'p") : tx("Eng yuqori")}</p><p className="mt-1 text-lg font-bold text-slate-900">{best.name}</p><p className="text-sm text-slate-600">{fmt(best.raw)}{unit}</p></Link>}
									{!bad && worst && <Link to={hub(worst.name, tab)} className={`block rounded-2xl border p-4 transition hover:shadow-md ${plain ? 'border-slate-200 bg-white' : 'border-red-200 bg-red-50/70'}`}><p className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${plain ? 'text-slate-500' : 'text-red-700'}`}><FiAlertTriangle size={13} /> {plain ? tx("Eng kam") : tx("Eng past")}</p><p className="mt-1 text-lg font-bold text-slate-900">{worst.name}</p><p className="text-sm text-slate-600">{fmt(worst.raw)}{unit}</p></Link>}
									{!plain && <div className={`rounded-2xl border p-4 ${alertRows.length ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-white'}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tx("Holat")}</p><p className="mt-1 text-sm text-slate-700">{alertRows.length ? <><b className="text-red-600">{tx("{{n}} ta tumanda", { n: alertRows.length })}</b> {bad ? tx("muammo bor") : tx("ko'rsatkich past")}: {alertRows.slice(0, 3).map(a => a.name).join(', ')}{alertRows.length > 3 ? tx(" va boshqalar") : ''}.</> : bad ? tx("Hamma tumanda muammo yo'q.") : tx("Hamma tumanda ko'rsatkich me'yorda.")}</p></div>}
								</div>
							</div>
						)}

						<div className="mb-3 flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-semibold text-slate-700">{tx("Tumanlar reytingi")} <span className="font-normal text-slate-400">· {tx("{{n}} ta", { n: list.length })}</span></h2>
							{rows.length > 5 && (
								<div className="ml-auto flex flex-wrap items-center gap-2">
									<SearchBox value={q} onChange={setQ} placeholder={tx("Tuman qidirish")} />
									{chart && <SelectBox value={sort} onChange={setSort} className="min-w-[190px]" options={SORTS.map(([k, l]) => ({ value: k, label: l }))} />}
								</div>
							)}
						</div>
						{list.length ? <div className="space-y-2.5">{list.map(x => <DistrictRow key={x.district} x={x} rank={chart ? rankOf.get(x.district) : null} chart={chart} columns={columns} tab={tab} max={max} />)}</div>
							: <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">{tx("Topilmadi")}</div>}
					</>
				)}
			</LoadState>
		</Page>
	)
}

const num = (v, tone = '') => <b className={tone}>{fmt(v)}</b>
const dash = <span className="text-slate-300">—</span>
const green = 'bg-green-50 text-green-600', red = 'bg-red-50 text-red-600', amber = 'bg-amber-50 text-amber-600', blue = 'bg-blue-50 text-blue-600'

export const RegionLate = () => <RegionPage title={tx("Kech qolish: tumanlar bo'yicha")} subtitle={tx("Dars boshlanishidan keyin kelgan o'quvchi va xodimlar")} metric="late" icon={<FaClock />} range tab="late" kpiTo={['/monitor/lists?kind=student&status=late', '/monitor/lists?kind=staff&status=late']}
	kpis={(t, rows) => [[<FaClock key="i" />, "Kech qolgan o'quvchilar", t.students, 'davr ichida kamida bir marta', amber], [<FaChalkboardTeacher key="i" />, 'Kech qolgan xodimlar', t.staff, 'davr ichida kamida bir marta', amber], [<FaMapMarkerAlt key="i" />, "Eng ko'p tuman", rows.slice().sort((a, b) => b.students - a.students)[0]?.district || '—', "o'quvchilar bo'yicha", red], [<FaClock key="i" />, 'Jami kech qolgan', t.students + t.staff, `${rows.filter(x => x.students + x.staff > 0).length} ta tumanda`, red]]}
	columns={[{ label: "O'quvchilar", right: true, render: x => num(x.students, x.students ? 'text-orange-600' : 'text-slate-400') }, { label: 'Xodimlar', right: true, render: x => num(x.staff, x.staff ? 'text-orange-600' : 'text-slate-400') }, { label: "Eng ko'p kech qolgan o'quvchilar", render: x => <Names list={x.topStudents} unit=" kun" /> }, { label: "Eng ko'p kech qolgan xodimlar", render: x => <Names list={x.topStaff} unit=" kun" /> }]}
	chart={{ title: "Kech qolgan o'quvchi va xodimlar soni", kind: 'bad', stack: [['students', "O'quvchi", '#f97316'], ['staff', 'Xodim', '#8b5cf6']], value: x => x.students + x.staff, color: v => (v ? '#f97316' : '#16a34a') }} />

export const RegionRisk = () => <RegionPage title={tx("Xavf guruhi: tumanlar bo'yicha")} subtitle={tx("Ketma-ket yoki tez-tez kelmayotgan o'quvchilar")} metric="risk" icon={<FiAlertTriangle />} range tab="risk"
	kpis={(t, rows) => {
		const high = rows.reduce((a, x) => a + (x.high || 0), 0), maxStreak = Math.max(0, ...rows.map(x => x.maxStreak))
		return [
			[<FiAlertTriangle key="i" />, "Xavf guruhidagi o'quvchilar", t.total, `${rows.filter(x => x.total > 0).length} ta tumanda`, t.total ? red : green],
			[<FaFire key="i" />, 'Yuqori xavf', high, '10 va undan ko\'p kun ketma-ket kelmagan', high ? red : green],
			[<FaClock key="i" />, 'Eng uzoq kelmagan', `${maxStreak} kun`, 'ketma-ket', maxStreak >= 10 ? red : amber],
			[<FaMapMarkerAlt key="i" />, "Eng ko'p tuman", rows.slice().sort((a, b) => b.total - a.total)[0]?.district || '—', "o'quvchilar bo'yicha", amber]
		]
	}}
	columns={[{ label: 'Jami', right: true, render: x => num(x.total, x.total ? 'text-red-600' : 'text-slate-400') }, { label: 'Yuqori', right: true, render: x => num(x.high || 0, x.high ? 'text-red-600' : 'text-slate-400') }, { label: "O'rta", right: true, render: x => num(x.mid || 0, x.mid ? 'text-orange-600' : 'text-slate-400') }, { label: 'Eng uzoq ketma-ket', right: true, render: x => (x.maxStreak ? `${x.maxStreak} kun` : dash) }, { label: "Eng xavfli o'quvchilar", render: x => <Names list={x.top} unit=" kun" /> }]}
	chart={{ title: "Xavf guruhi: xavf darajasi bo'yicha", kind: 'bad', worstLabel: "Eng ko'p xavf guruhi", stack: [['low', "Kam (3–4 kun yoki tez-tez)", '#f59e0b'], ['mid', "O'rta (5–9 kun)", '#f97316'], ['high', 'Yuqori (10+ kun)', '#dc2626']], value: x => x.total, color: v => (v ? '#dc2626' : '#16a34a') }} />

export const RegionLeaves = () => <RegionPage title={tx("Sababli kelmaganlar: tumanlar bo'yicha")} subtitle={tx("Ta'til, safar, kasallik: xodimlar va o'quvchilar")} metric="leaves" icon={<FaUmbrellaBeach />} range tab="staff"
	kpis={(t, rows) => [[<FaUmbrellaBeach key="i" />, 'Sababli xodimlar', t.staff, `${t.active} tasi hozir faol`, blue], [<FaUserGraduate key="i" />, "Sababli o'quvchilar", t.students, 'davr ichida', blue], [<FaLandmark key="i" />, 'Tumanlar', rows.length, '', amber], [<FaMapMarkerAlt key="i" />, "Eng ko'p tuman", rows.slice().sort((a, b) => b.staff - a.staff)[0]?.district || '—', 'xodimlar bo\'yicha', amber]]}
	columns={[{ label: 'Xodimlar', right: true, render: x => num(x.staff) }, { label: 'Hozir faol', right: true, render: x => num(x.active) }, { label: "O'quvchilar", right: true, render: x => num(x.students) }, { label: 'Turlari (xodim)', render: x => <span className="text-xs text-slate-600">{[['tatil', "ta'til"], ['safar', 'safar'], ['kasallik', 'kasallik'], ['boshqa', 'boshqa']].filter(([k]) => x.byType[k]).map(([k, l]) => `${l}: ${x.byType[k]}`).join(' · ') || '—'}</span> }]}
	chart={{ title: 'Sababli kelmagan xodimlar: sabablari bo\'yicha', kind: 'count', stack: [['tatil', "Ta'til", '#0ea5e9'], ['safar', 'Safar', '#8b5cf6'], ['kasallik', 'Kasallik', '#ef4444'], ['boshqa', 'Boshqa', '#94a3b8']], value: x => x.staff, color: () => '#0ea5e9' }} />

const SEV = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-400' }
export const RegionAlerts = () => <RegionPage title={tx("Ogohlantirishlar: tumanlar bo'yicha")} subtitle={tx("Davomat pasayishi, kameralar, aqlli kuzatuv hodisalari")} metric="alerts" icon={<FiAlertOctagon />} date
	kpis={(t) => [[<FiAlertOctagon key="i" />, 'Jiddiy', t.high, 'zudlik bilan e\'tibor', red], [<FiAlertTriangle key="i" />, "O'rta", t.medium, '', amber], [<FiInfo key="i" />, 'Past', t.low, '', blue], [<FiList key="i" />, 'Jami', t.high + t.medium + t.low, 'ogohlantirish', amber]]}
	columns={[{ label: 'Jiddiy', right: true, render: x => num(x.high, x.high ? 'text-red-600' : 'text-slate-400') }, { label: "O'rta", right: true, render: x => num(x.medium, x.medium ? 'text-amber-600' : 'text-slate-400') }, { label: 'Past', right: true, render: x => num(x.low) }, { label: 'Asosiylari', render: x => (x.items.length ? <ul className="space-y-1 text-xs">{x.items.map(a => <li key={a.id} className="flex items-start gap-1.5"><i className={`mt-1 h-2 w-2 shrink-0 rounded-full ${SEV[a.severity]}`} /><Link to={a.link || '#'} className="text-slate-700 hover:text-blue-600"><b>{a.schoolName}</b>: {a.title}</Link></li>)}</ul> : <span className="text-emerald-600">{tx("Ogohlantirish yo'q")}</span>) }]}
	chart={{ title: 'Ogohlantirishlar soni (jiddiylik bo\'yicha)', kind: 'bad', stack: [['high', 'Jiddiy', '#dc2626'], ['medium', "O'rta", '#f59e0b'], ['low', 'Past', '#60a5fa']], value: x => x.high + x.medium + x.low, color: v => (v >= 3 ? '#dc2626' : v ? '#f59e0b' : '#16a34a') }} />

const onlineShare = (x) => (x.total ? Math.round((x.online / x.total) * 100) : null)
export const RegionCameras = () => <RegionPage title={tx("Kamera holati: tumanlar bo'yicha")} subtitle={tx("Oddiy va FaceControl kameralar: online va offline")} metric="cameras" icon={<FaVideo />} kpiTo={['/monitor/camera-health', '/monitor/camera-health', '/monitor/camera-health', '/monitor/camera-health']}
	kpis={(t, rows) => {
		const fcTotal = rows.reduce((a, x) => a + x.fcTotal, 0), fcOnline = rows.reduce((a, x) => a + x.fcOnline, 0)
		const bad = rows.filter(x => x.offline > 0 || x.fcOffline > 0).length
		return [
			[<FaVideo key="i" />, 'Kameralar', t.total, t.total ? `${t.online} tasi online · ${Math.round((t.online / t.total) * 100)}%` : '', green],
			[<FiWifiOff key="i" />, 'Offline', t.offline, t.offline ? 'oddiy kameralar, tekshirish kerak' : 'hammasi ishlayapti', t.offline ? red : green],
			[<FaDoorOpen key="i" />, 'FaceControl', fcTotal ? `${fcOnline}/${fcTotal}` : '—', t.fcOffline ? `${t.fcOffline} tasi offline: kirish/chiqish` : 'kirish/chiqish online', t.fcOffline ? red : green],
			[<FaLandmark key="i" />, 'Muammoli tumanlar', bad, `${rows.length} tadan`, bad ? amber : green]
		]
	}}
	columns={[{ label: 'Online', right: true, render: x => (x.total ? <b className={x.offline ? 'text-slate-800' : 'text-green-600'}>{x.online}/{x.total}</b> : dash) }, { label: 'Offline', right: true, render: x => num(x.offline, x.offline ? 'text-red-600' : 'text-slate-400') }, { label: 'FaceControl', right: true, render: x => (x.fcTotal ? <span className={x.fcOffline ? 'font-semibold text-red-600' : ''}>{x.fcOnline}/{x.fcTotal}</span> : dash) }, { label: "Eng ko'p offline maktablar", render: x => <Names list={x.worst} /> }]}
	chart={{ title: 'Kameralar holati: tumanlar kesimida', unit: '%', domain: [0, 100], value: onlineShare, color: v => (v === null || v === undefined ? '#cbd5e1' : v >= 90 ? '#16a34a' : v >= 70 ? '#f59e0b' : '#dc2626'),
		stack: [['online', 'Online', '#16a34a'], ['unknown', "Noma'lum", '#94a3b8'], ['offline', 'Offline', '#dc2626']] }} />

const peopleKpis = (what) => (t, rows) => [[<FaUsers key="i" />, `Jami ${what}`, t.total, `${rows.length} ta tumanda`, blue], [<FiCheckCircle key="i" />, 'Bugun kelgan', t.came, `${t.percent ?? 0}%`, green], [<FiUserX key="i" />, 'Kelmagan', t.absent, '', t.absent ? red : green], [<FaClock key="i" />, 'Kech qolgan', t.late, 'bugun', amber]]
const listTo = (kind) => ['', 'came', 'absent', 'late'].map(s => `/monitor/lists?kind=${kind}${s ? `&status=${s}` : ''}`)
const peopleCols = [
	{ label: 'Jami', right: true, render: x => num(x.total) },
	{ label: 'Kelgan', right: true, render: x => num(x.came) },
	{ label: 'Hozir maktabda', right: true, render: x => num(x.inside) },
	{ label: 'Kelmagan', right: true, render: x => num(x.absent, x.absent ? 'text-red-600' : 'text-slate-400') },
	{ label: 'Kech', right: true, render: x => num(x.late, x.late ? 'text-orange-600' : 'text-slate-400') },
	{ label: 'Davomat', right: true, render: x => (x.percent === null ? dash : <b className={levelText(x.percent)}>{pctFmt(x.percent)}</b>) },
]
const peopleChart = (t) => ({ title: `${t} davomati (bugun)`, stack: [['came', 'Kelgan', '#16a34a'], ['absent', 'Kelmagan', '#dc2626']], value: x => x.percent, unit: '%', domain: [0, 100], color: v => (v === null || v === undefined ? '#cbd5e1' : v >= 85 ? '#16a34a' : v >= 60 ? '#f59e0b' : '#dc2626') })
export const RegionStaff = () => <RegionPage title={tx("Xodimlar: tumanlar bo'yicha")} subtitle={tx("Bugungi davomat tumanlar kesimida")} metric="staff" icon={<FaChalkboardTeacher />} date tab="staff" kpiTo={listTo('staff')} kpis={peopleKpis('xodim')} columns={peopleCols} chart={peopleChart('Xodimlar')} />
export const RegionStudents = () => <RegionPage title={tx("O'quvchilar: tumanlar bo'yicha")} subtitle={tx("Bugungi davomat tumanlar kesimida")} metric="students" icon={<FaUserGraduate />} date tab="students" kpiTo={listTo('student')} kpis={peopleKpis("o'quvchi")} columns={peopleCols} chart={peopleChart("O'quvchilar")} />

const goodShare = (x) => (x.classes - x.nodata > 0 ? Math.round((x.good / (x.classes - x.nodata)) * 100) : null)
export const RegionClassrooms = () => <RegionPage title={tx("Sinfxonalar tahlili: tumanlar bo'yicha")} subtitle={tx("Aqlli kuzatuv (AI) va davomat asosida sinflar holati")} metric="classrooms" icon={<FaSchool />} date tab="ai"
	kpiTo={['/monitor/classrooms', '/monitor/classrooms', '/monitor/classrooms', '/monitor/camera-health']}
	kpis={(t, rows) => {
		const mid = rows.reduce((a, x) => a + x.mid, 0), nodata = rows.reduce((a, x) => a + x.nodata, 0)
		return [
			[<FaSchool key="i" />, 'Sinflar', t.classes, `${rows.length} ta tumanda · o'rta ${mid}`, blue],
			[<FiAlertTriangle key="i" />, "E'tibor talab", t.attention, t.attention ? `${rows.filter(x => x.attention > 0).length} ta tumanda` : "hammasi me'yorda", t.attention ? red : green],
			[<FiCheckCircle key="i" />, 'Yaxshi', t.good, t.classes ? `sinflarning ${Math.round((t.good / t.classes) * 100)}%` : '', green],
			[<FiVideo key="i" />, "Ma'lumot yo'q", nodata, 'kamera yoki AI yoqilmagan', amber]
		]
	}}
	columns={[{ label: 'Sinflar', right: true, render: x => num(x.classes) }, { label: "E'tibor talab", right: true, render: x => num(x.attention, x.attention ? 'text-red-600' : 'text-slate-400') }, { label: "O'rta", right: true, render: x => num(x.mid, 'text-amber-600') }, { label: 'Yaxshi', right: true, render: x => num(x.good, 'text-green-600') }, { label: "Ma'lumot yo'q", right: true, render: x => num(x.nodata, 'text-slate-400') }, { label: "E'tibor talab sinflar", render: x => <Names list={x.worst} /> }]}
	chart={{ title: "Sinflar holati: tumanlar kesimida (AI bahosi)", unit: '%', domain: [0, 100], value: goodShare, color: v => (v === null || v === undefined ? '#cbd5e1' : v >= 60 ? '#16a34a' : v >= 30 ? '#f59e0b' : '#dc2626'),
		stack: [['attention', "E'tibor talab", '#dc2626'], ['mid', "O'rta", '#f59e0b'], ['good', 'Yaxshi', '#16a34a'], ['nodata', "Ma'lumot yo'q", '#cbd5e1']], valueLabel: 'yaxshi sinflar ulushi' }} />

// Kunlik dinamika: viloyat va har bir tuman davomati kunlar bo'yicha
export const RegionTrend = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [kind, setKind] = useState('student')
	const [off, setOff] = useState(() => new Set())
	const [tq, setTq] = useState('')
	const { data, loading, error, reload } = useMonitorData('region/trend', range, { auto: false })
	const rows = useMemo(() => data?.rows || [], [data])
	const series = useMemo(() => {
		if (!data) return []
		const dates = [...new Set([...data.region.map(d => d.date), ...rows.flatMap(r => r.days.map(d => d.date))])].sort()
		return dates.map(date => {
			const o = { kun: date.slice(5), Viloyat: data.region.find(d => d.date === date)?.[kind] ?? null }
			rows.forEach(r => { o[r.district] = r.days.find(d => d.date === date)?.[kind] ?? null })
			return o
		})
	}, [data, rows, kind])
	const avg = (r) => { const v = r.days.map(d => d[kind]).filter(x => x !== null && x !== undefined); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null }
	const toggle = (n) => setOff(s => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x })
	return (
		<Page>
			<Head icon={<FiActivity />} title={tx("Kunlik dinamika: viloyat va tumanlar")} subtitle={<>{tx("Davomat foizi kunma-kun · {{from}} — {{to}}", { from: range.from, to: range.to })}</>} onReload={reload} loading={loading}><RangePicker from={range.from} to={range.to} onChange={setRange} /></Head>
			<LoadState loading={loading && !data} error={error}>
				{data && (
					<>
						<div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm shadow-sm">{[['student', "O'quvchilar"], ['staff', 'Xodimlar']].map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-4 py-2 ${kind === k ? 'bg-blue-600 font-medium text-white' : 'text-slate-600'}`}>{l}</button>)}</div>
						<Panel title={tx("Davomat dinamikasi (%)")} className="mb-6">
							<ChartBox height={360}>
								<ResponsiveContainer width="100%" height="100%">
									<LineChart data={series} margin={{ left: -10, right: 12, top: 8 }}>
										<CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="kun" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><Tooltip content={<Tip unit="%" />} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
										<Line type="monotone" dataKey="Viloyat" stroke="#0f172a" strokeWidth={3.5} dot={false} connectNulls isAnimationActive={false} />
										{rows.filter(r => !off.has(r.district)).map((r) => <Line key={r.district} type="monotone" dataKey={r.district} stroke={PALETTE[rows.indexOf(r) % PALETTE.length]} strokeWidth={1.8} dot={false} connectNulls isAnimationActive={false} />)}
									</LineChart>
								</ResponsiveContainer>
							</ChartBox>
							<div className="mt-3 flex flex-wrap gap-2">{rows.map((r, i) => <button key={r.district} onClick={() => toggle(r.district)} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ring-inset transition ${off.has(r.district) ? 'bg-white text-slate-400 ring-slate-200' : 'bg-slate-50 text-slate-700 ring-slate-300'}`}><i className="h-2.5 w-2.5 rounded-full" style={{ background: off.has(r.district) ? '#cbd5e1' : PALETTE[i % PALETTE.length] }} />{r.district}</button>)}</div>
						</Panel>
						<Panel title={tx("Tumanlar: o'rtacha davomat")} action={rows.length > 5 ? <SearchBox value={tq} onChange={setTq} placeholder={tx("Tuman qidirish")} /> : null}>
							<Table head={['Tuman', { label: "O'rtacha (davr)", right: true }, { label: 'Oxirgi kun', right: true }, '']}>
								{rows.filter(r => matchText(tq, r.district)).map(r => { const a = avg(r), last = r.days.length ? r.days[r.days.length - 1][kind] : null; return (
									<Tr key={r.district}><Td><Dist name={r.district} sub={`${r.schools} maktab`} /></Td><Td right>{a === null ? dash : <b className={levelText(a)}>{a}%</b>}</Td><Td right>{last === null ? dash : `${last}%`}</Td><Td right><Link to={hub(r.district)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">{tx("Tuman sahifasi")} <FiArrowRight size={12} /></Link></Td></Tr>
								) })}
							</Table>
						</Panel>
					</>
				)}
			</LoadState>
		</Page>
	)
}

export const RegionCameraEvents = () => <RegionPage title={tx("Kamera hodisalari: tumanlar bo'yicha")} subtitle={tx("Aqlli tahlil signallari: harakat, odam zichligi, kirish/chiqish")} metric="cameraEvents" icon={<FiActivity />} range tab="ai"
	kpis={(t, rows) => [[<FiActivity key="i" />, 'Jami hodisa', t.total, 'tanlangan davrda', blue], [<FaUsers key="i" />, "Zichlik va g'ayritabiiy", t.density, "e'tibor talab", t.density ? red : green], [<FiActivity key="i" />, 'Kirish / chiqish', `${fmt(rows.reduce((a, x) => a + x.enter, 0))} / ${fmt(rows.reduce((a, x) => a + x.exit, 0))}`, 'hududga kirgan va chiqqan', green], [<FaMapMarkerAlt key="i" />, "Eng ko'p tuman", rows.slice().sort((a, b) => b.total - a.total)[0]?.district || '—', "hodisalar bo'yicha", blue]]}
	columns={[{ label: 'Jami', right: true, render: x => num(x.total) }, { label: 'Zichlik', right: true, render: x => num(x.density, x.density ? 'text-red-600' : 'text-slate-400') }, { label: 'Harakat', right: true, render: x => num(x.motion) }, { label: 'Kirish / chiqish', right: true, render: x => `${fmt(x.enter)} / ${fmt(x.exit)}` }, { label: 'Eng faol maktablar', render: x => <Names list={x.top} /> }]}
	chart={{ title: "Hodisalar turlari bo'yicha", kind: 'count', stack: [['motion', 'Harakat', '#2563eb'], ['density', "Zichlik va g'ayritabiiy", '#f59e0b'], ['enter', 'Kirish', '#16a34a'], ['exit', 'Chiqish', '#ea580c'], ['other', 'Boshqa', '#94a3b8']], value: x => x.total, color: () => '#2563eb' }} />

// Sinf darajalari: tumanlar x darajalar (davomat foizi) issiqlik jadvali
const heat = (p) => (p === null || p === undefined ? 'bg-slate-50 text-slate-300' : p >= 85 ? 'bg-green-100 text-green-800' : p >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800')
export const RegionGrades = () => {
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('region/grades', range, { auto: false })
	const [gq, setGq] = useState('')
	const rows = useMemo(() => data?.rows || [], [data])
	const grades = Array.from({ length: 11 }, (_, i) => i + 1)
	const chart = (data?.byGrade || []).map(g => ({ name: `${g.grade}-sinf`, Davomat: g.percent }))
	return (
		<Page>
			<Head icon={<FiBarChart2 />} title={tx("Umumiy statistika: viloyat va tumanlar")} subtitle={<>{tx("Sinf darajalari bo'yicha davomat · {{from}} — {{to}}", { from: range.from, to: range.to })}</>} onReload={reload} loading={loading}><RangePicker from={range.from} to={range.to} onChange={setRange} /></Head>
			<LoadState loading={loading && !data} error={error}>
				{data && (
					<>
						<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
							<KpiLink icon={<FiBarChart2 />} label={tx("Viloyat davomati")} value={data.overall === null ? '—' : `${data.overall}%`} detail={tx("barcha sinflar")} color="bg-blue-50 text-blue-600" />
							<KpiLink icon={<FaSchool />} label={tx("Sinflar")} value={data.totals.classes} detail={`${rows.length} ta tumanda`} color="bg-violet-50 text-violet-600" />
							<KpiLink icon={<FaUserGraduate />} label={tx("O'quvchilar")} value={data.totals.students} detail={tx("viloyat bo'yicha")} color="bg-amber-50 text-amber-600" />
							<KpiLink to={rows.some(x => x.overall !== null) ? hub(rows.filter(x => x.overall !== null).sort((a, b) => b.overall - a.overall)[0].district) : undefined} icon={<FaMedal />} label={tx("Eng yuqori tuman")} value={rows.filter(x => x.overall !== null).sort((a, b) => b.overall - a.overall)[0]?.district || '—'} detail={tx("umumiy davomat bo'yicha")} color="bg-green-50 text-green-600" />
						</div>
						<Panel title={tx("Viloyat: sinf darajalari bo'yicha davomat (%)")} className="mb-6">
							<ChartBox height={240}><ResponsiveContainer width="100%" height="100%">
								<BarChart data={chart} margin={{ left: -12, right: 8, top: 8 }}><CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'rgba(148,163,184,.12)' }} content={<Tip unit="%" />} /><Bar dataKey="Davomat" radius={[8, 8, 0, 0]} maxBarSize={46} background={{ fill: '#f1f5f9', radius: 8 }} label={{ position: 'top', fontSize: 11, fontWeight: 700, fill: '#334155', formatter: v => (v === null || v === undefined ? '' : `${v}%`) }} isAnimationActive={false}>{chart.map(c => <Cell key={c.name} fill={c.Davomat === null ? '#cbd5e1' : c.Davomat >= 85 ? '#16a34a' : c.Davomat >= 60 ? '#f59e0b' : '#dc2626'} />)}</Bar></BarChart>
							</ResponsiveContainer></ChartBox>
						</Panel>
						<Panel title={tx("Tumanlar × sinf darajalari")} action={<div className="flex flex-wrap items-center gap-3">{rows.length > 5 && <SearchBox value={gq} onChange={setGq} placeholder={tx("Tuman qidirish")} />}<span className="text-xs text-slate-400">{tx("Katak: davomat %. Tumanni bossangiz, tuman sahifasi ochiladi")}</span></div>}>
							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-2.5">{tx("Tuman")}</th>{grades.map(g => <th key={g} className="px-2 py-2.5 text-center">{tx("{{n}}-sinf", { n: g })}</th>)}<th className="px-3 py-2.5 text-center">{tx("Umumiy")}</th></tr></thead>
									<tbody>
										{rows.filter(x => matchText(gq, x.district)).map(x => (
											<tr key={x.district} className="border-t border-slate-100">
												<td className="px-3 py-2"><Dist name={x.district} sub={`${x.classes} sinf · ${fmt(x.students)} o'quvchi`} /></td>
												{grades.map(g => { const p = x.grades[g]?.percent ?? null; return <td key={g} className="px-1 py-1.5 text-center"><span className={`inline-block min-w-[44px] rounded-lg px-1.5 py-1.5 text-xs font-bold ${heat(p)}`} title={x.grades[g] ? `${x.grades[g].classes} sinf · ${x.grades[g].students} o'quvchi` : ''}>{p === null ? '—' : `${p}%`}</span></td> })}
												<td className="px-3 py-1.5 text-center"><span className={`inline-block min-w-[52px] rounded-lg px-2 py-1.5 text-xs font-bold ${heat(x.overall)}`}>{x.overall === null ? '—' : `${x.overall}%`}</span></td>
											</tr>
										))}
										{rows.length === 0 && <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-500">{tx("Topilmadi")}</td></tr>}
									</tbody>
								</table>
							</div>
						</Panel>
					</>
				)}
			</LoadState>
		</Page>
	)
}

