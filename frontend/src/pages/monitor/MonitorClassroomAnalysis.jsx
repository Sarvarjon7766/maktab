import { useMemo, useState } from 'react'
import { FiAlertTriangle, FiCheckCircle, FiVideo } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { tx } from '../../i18n'
import { DateField, Empty, KpiLink, Page, PageHeader, SchoolLink, SchoolSelect, SearchBox, SelectBox, exportXlsx, fmt, matchText, todayStr, useMonitorData } from './monitorKit'

// Sinfxonalar tahlili (tuman monitori): kamerali sinflar ball va darajasi bo'yicha, e'tibor talab qilganlari yuqorida
const LEVELS = {
	attention: { label: tx('Diqqat'), badge: 'bg-red-50 text-red-700 border-red-200', rank: 0 },
	mid: { label: tx("O'rtacha"), badge: 'bg-amber-50 text-amber-700 border-amber-200', rank: 1 },
	idle: { label: tx("Dars yo'q"), badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', rank: 2 },
	nodata: { label: tx("Ma'lumot yo'q"), badge: 'bg-gray-100 text-gray-600 border-gray-200', rank: 3 },
	good: { label: tx('Yaxshi'), badge: 'bg-green-50 text-green-700 border-green-200', rank: 4 }
}
const keyOf = (c) => (c.analysis?.idle ? 'idle' : c.analysis?.level || 'nodata')

const MonitorClassroomAnalysis = () => {
	const [date, setDate] = useState(todayStr())
	const [schoolId, setSchoolId] = useState('')
	const [query, setQuery] = useState('')
	const [level, setLevel] = useState('')
	const { data, loading, error, reload } = useMonitorData('classrooms-all', { date, schoolId }, { auto: date === todayStr() })
	const { data: overview } = useMonitorData('overview', { date })

	const classes = useMemo(() => data?.classes || [], [data])
	const counts = useMemo(() => classes.reduce((a, c) => ({ ...a, [keyOf(c)]: (a[keyOf(c)] || 0) + 1 }), {}), [classes])
	const rows = useMemo(() => classes
		.filter(c => (!level || keyOf(c) === level) && matchText(query, c.name, c.schoolName, c.head))
		.sort((a, b) => LEVELS[keyOf(a)].rank - LEVELS[keyOf(b)].rank || (a.analysis?.score ?? 0) - (b.analysis?.score ?? 0) || String(a.name).localeCompare(String(b.name))), [classes, level, query])

	const download = () => exportXlsx(`sinfxonalar-tahlili-${date}`, [{ name: 'Sinfxonalar', rows: rows.map(c => ({ Maktab: c.schoolName, Sinf: c.name, 'Sinf rahbari': c.head || '', Daraja: LEVELS[keyOf(c)].label, Ball: c.analysis?.score ?? '', Xulosa: c.analysis?.headline || '', "O'quvchilar": c.students ?? c.total ?? 0, Kelgan: c.came ?? 0, Kelmagan: c.absent ?? 0 })) }])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<DateField value={date} max={todayStr()} onChange={setDate} />
				<SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />
				<button onClick={download} disabled={!rows.length} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{tx("Excel")}</button>
			</PageHeader>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
				<KpiLink icon={<FiVideo />} color="bg-slate-100 text-slate-600" label={tx("Sinfxonalar")} value={fmt(classes.length)} />
				<KpiLink icon={<FiAlertTriangle />} color="bg-red-50 text-red-600" label={tx("Diqqat talab")} value={fmt(counts.attention || 0)} onClick={() => setLevel('attention')} />
				<KpiLink icon={<FiAlertTriangle />} color="bg-amber-50 text-amber-600" label={tx("O'rtacha")} value={fmt(counts.mid || 0)} onClick={() => setLevel('mid')} />
				<KpiLink icon={<FiCheckCircle />} color="bg-green-50 text-green-600" label={tx("Yaxshi")} value={fmt(counts.good || 0)} onClick={() => setLevel('good')} />
			</div>

			<div className="flex flex-wrap items-center gap-3 mb-4">
				<SearchBox value={query} onChange={setQuery} placeholder={tx("Sinf, maktab yoki sinf rahbari")} />
				<SelectBox value={level} onChange={setLevel} searchPlaceholder={tx("Daraja qidirish...")} options={[{ value: '', label: 'Barcha darajalar' }, ...Object.entries(LEVELS).map(([value, v]) => ({ value, label: `${v.label} · ${counts[value] || 0}` }))]} />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Sinf', 'Maktab', 'Daraja', 'Ball', 'Xulosa', 'Kelgan / jami', ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
						<tbody>
							{rows.map(c => {
								const lv = LEVELS[keyOf(c)]
								const total = c.students ?? c.total ?? 0
								return (
									<tr key={`${c.schoolId}-${c._id}`} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
										<td className="px-4 py-2.5 font-semibold text-gray-900">{c.name}</td>
										<td className="px-4 py-2.5"><SchoolLink id={c.schoolId} name={c.schoolName} className="text-sm" /></td>
										<td className="px-4 py-2.5"><span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${lv.badge}`}>{lv.label}</span></td>
										<td className="px-4 py-2.5 font-semibold text-gray-800">{keyOf(c) === 'nodata' ? '—' : c.analysis?.score}</td>
										<td className="px-4 py-2.5 text-gray-600 max-w-md truncate" title={c.analysis?.headline}>{c.analysis?.headline || '—'}</td>
										<td className="px-4 py-2.5 text-gray-700">{total ? `${fmt(c.came)} / ${fmt(total)}` : '—'}</td>
										<td className="px-4 py-2.5 text-right"><Link to={`/monitor/classrooms/${c.schoolId}/${c._id}`} className="text-sm text-blue-600 hover:underline whitespace-nowrap">{tx("Batafsil tahlil →")}</Link></td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && !error && rows.length === 0 && <Empty text={tx("Sinfxonalar topilmadi")} hint={tx("Tahlil faqat sinfga biriktirilgan kameralar uchun ishlaydi")} />}
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
			</div>
		</Page>
	)
}

export default MonitorClassroomAnalysis
