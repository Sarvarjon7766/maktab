import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaChalkboardTeacher, FaSchool, FaUserGraduate, FaVideo } from 'react-icons/fa'
import { FiRefreshCw, FiSearch } from 'react-icons/fi'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { tx } from '../../i18n'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const fmt = (n) => Number(n || 0).toLocaleString('uz-UZ')
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)
const tone = (p) => (p >= 85 ? 'text-green-600' : p >= 60 ? 'text-amber-600' : 'text-red-600')

const Kpi = ({ icon, label, value, detail, color }) => (
	<div className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
		<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>{icon}</div>
		<div className="min-w-0"><p className="truncate text-xs font-medium text-slate-500">{label}</p><p className="text-xl font-bold text-slate-900">{value}</p>{detail && <p className="truncate text-xs text-slate-400">{detail}</p>}</div>
	</div>
)

// Platforma statistikasi (tizim egasi): barcha maktablar bo'yicha jamlanma va bugungi davomat
const PlatformStatistics = () => {
	const [data, setData] = useState(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [query, setQuery] = useState('')

	const load = useCallback(async () => {
		setLoading(true)
		setError(false)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/schools/platform-stats`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			if (res.data.success) setData(res.data)
			else setError(true)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => { load() }, [load])

	const schools = useMemo(() => data?.schools || [], [data])
	const totals = useMemo(() => schools.reduce((a, s) => {
		const x = s.stats || {}
		return { staff: a.staff + x.staffTotal, staffCame: a.staffCame + x.staffPresent, students: a.students + x.studentTotal, studentCame: a.studentCame + x.studentPresent, cams: a.cams + x.cameraTotal, camsOn: a.camsOn + x.cameraOnline }
	}, { staff: 0, staffCame: 0, students: 0, studentCame: 0, cams: 0, camsOn: 0 }), [schools])

	const rows = useMemo(() => {
		const needle = norm(query.trim())
		return schools
			.filter(s => !needle || [s.name, s.code, s.region, s.district].some(v => norm(v).includes(needle)))
			.map(s => ({ ...s, studentPct: pct(s.stats.studentPresent, s.stats.studentTotal), staffPct: pct(s.stats.staffPresent, s.stats.staffTotal) }))
			.sort((a, b) => a.studentPct - b.studentPct)
	}, [schools, query])

	const chart = useMemo(() => rows.filter(s => s.isActive !== false && s.stats.studentTotal > 0).slice(0, 15).map(s => ({ name: s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name, [tx("O'quvchi %")]: s.studentPct, [tx('Xodim %')]: s.staffPct })), [rows])

	return (
		<main className="min-h-full bg-slate-50 p-4 md:p-6">
			<header className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<p className="text-sm text-slate-500">{data?.dateString ? tx('Bugungi holat: {{date}}', { date: data.dateString }) : ''}</p>
				<button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx('Yangilash')}</button>
			</header>

			{error && <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Statistikani yuklab bo'lmadi")}</div>}

			<div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
				<Kpi icon={<FaSchool />} color="bg-blue-50 text-blue-600" label={tx('Maktablar')} value={fmt(schools.length)} detail={tx('{{n}} ta faol', { n: schools.filter(s => s.isActive !== false).length })} />
				<Kpi icon={<FaUserGraduate />} color="bg-amber-50 text-amber-600" label={tx("O'quvchilar")} value={`${fmt(totals.studentCame)} / ${fmt(totals.students)}`} detail={`${pct(totals.studentCame, totals.students)}%`} />
				<Kpi icon={<FaChalkboardTeacher />} color="bg-violet-50 text-violet-600" label={tx('Xodimlar')} value={`${fmt(totals.staffCame)} / ${fmt(totals.staff)}`} detail={`${pct(totals.staffCame, totals.staff)}%`} />
				<Kpi icon={<FaVideo />} color="bg-cyan-50 text-cyan-600" label={tx('Kamera online')} value={`${fmt(totals.camsOn)} / ${fmt(totals.cams)}`} detail={`${pct(totals.camsOn, totals.cams)}%`} />
			</div>

			{chart.length > 0 && (
				<section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
					<h2 className="mb-3 text-sm font-semibold text-slate-900">{tx('Davomati eng past maktablar (bugun)')}</h2>
					<div style={{ height: 280 }}>
						<ResponsiveContainer width="100%" height="100%">
							<BarChart data={chart} margin={{ left: -16, right: 8, top: 4 }}>
								<CartesianGrid strokeDasharray="3 3" vertical={false} />
								<XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
								<YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
								<Tooltip /><Legend />
								<Bar isAnimationActive={false} dataKey={tx("O'quvchi %")} fill="#f59e0b" radius={[3, 3, 0, 0]} />
								<Bar isAnimationActive={false} dataKey={tx('Xodim %')} fill="#8b5cf6" radius={[3, 3, 0, 0]} />
							</BarChart>
						</ResponsiveContainer>
					</div>
				</section>
			)}

			<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
					<h2 className="font-semibold text-slate-900">{tx("Maktablar bo'yicha")}</h2>
					<label className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx('Maktab yoki hudud qidirish')} className="w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
				</div>
				{loading && !data ? <p className="p-10 text-center text-sm text-slate-400">{tx('Yuklanmoqda...')}</p> : !rows.length ? <p className="p-10 text-center text-sm text-slate-500">{tx('Maktab topilmadi')}</p> : (
					<div className="overflow-x-auto"><table className="w-full text-sm">
						<thead><tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">{[tx('Maktab'), tx('Hudud'), tx("O'quvchi"), tx('Xodim'), tx('Sinf'), tx('Kamera')].map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
						<tbody>{rows.map(s => (
							<tr key={s._id} className={`border-b border-slate-50 last:border-0 hover:bg-slate-50/60 ${s.isActive === false ? 'opacity-50' : ''}`}>
								<td className="px-4 py-2.5 font-medium text-slate-900">{s.name}<span className="ml-2 text-xs text-slate-400">{s.code}</span></td>
								<td className="px-4 py-2.5 text-slate-600">{[s.region, s.district].filter(Boolean).join(', ') || '—'}</td>
								<td className="px-4 py-2.5"><span className={`font-semibold ${tone(s.studentPct)}`}>{s.studentPct}%</span> <span className="text-xs text-slate-400">{fmt(s.stats.studentPresent)}/{fmt(s.stats.studentTotal)}</span></td>
								<td className="px-4 py-2.5"><span className={`font-semibold ${tone(s.staffPct)}`}>{s.staffPct}%</span> <span className="text-xs text-slate-400">{fmt(s.stats.staffPresent)}/{fmt(s.stats.staffTotal)}</span></td>
								<td className="px-4 py-2.5 text-slate-700">{fmt(s.stats.classTotal)}</td>
								<td className="px-4 py-2.5 text-slate-700">{fmt(s.stats.cameraOnline)}/{fmt(s.stats.cameraTotal)}</td>
							</tr>
						))}</tbody></table></div>
				)}
			</section>
		</main>
	)
}

export default PlatformStatistics
