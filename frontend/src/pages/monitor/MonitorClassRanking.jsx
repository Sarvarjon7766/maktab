import { useMemo, useState } from 'react'
import { FaChalkboard, FaTrophy } from 'react-icons/fa'
import { Link } from 'react-router-dom'
import { DateField, Empty, KpiLink, Page, PageHeader, Progress, SchoolLink, SchoolSelect, SearchBox, SelectBox, Segmented, matchText, exportXlsx, fmt, todayStr, useMonitorData, pctFmt } from './monitorKit'
import { tx } from '../../i18n'

// Sinflar reytingi (butun tizim): har qator sinfning o'quvchilari ro'yxatiga (tafsilot) olib boradi
const MonitorClassRanking = () => {
	const [date, setDate] = useState(todayStr())
	const [schoolId, setSchoolId] = useState('')
	const [order, setOrder] = useState('asc')
	const [query, setQuery] = useState('')
	const [level, setLevel] = useState('')
	const { data, loading, error, reload } = useMonitorData('classes-all', { date, schoolId }, { auto: date === todayStr() })
	const { data: overview } = useMonitorData('overview', { date })

	const rows = useMemo(() => (data?.classes || [])
		.filter(c => matchText(query, c.name, c.schoolName, c.head) && (!level || (level === 'high' ? c.percent >= 85 : level === 'mid' ? c.percent >= 60 && c.percent < 85 : c.percent < 60)))
		.sort((a, b) => (order === 'asc' ? a.percent - b.percent : b.percent - a.percent) || a.name.localeCompare(b.name)), [data, query, order, level])
	const best = [...(data?.classes || [])].sort((a, b) => b.percent - a.percent)[0]
	const worst = [...(data?.classes || [])].sort((a, b) => a.percent - b.percent)[0]
	const download = () => exportXlsx(`sinflar-reyting-${date}`, [{ name: 'Sinflar', rows: rows.map(c => ({ Sinf: c.name, Maktab: c.schoolName, Rahbar: c.head || '', "O'quvchilar": c.total, Kelgan: c.came, Kelmagan: c.absent, 'Davomat %': c.percent })) }])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<DateField value={date} max={todayStr()} onChange={setDate} />
				<SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />
				<Segmented value={order} onChange={setOrder} options={[{ key: 'asc', label: 'Past → yuqori' }, { key: 'desc', label: 'Yuqori → past' }]} />
				<button onClick={download} disabled={!rows.length} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{tx("Excel")}</button>
			</PageHeader>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<KpiLink icon={<FaChalkboard />} color="bg-slate-100 text-slate-600" label={tx("Sinflar")} value={data?.classes?.length ?? 0} />
				<KpiLink to={best ? `/monitor/schools/${best.schoolId}?tab=students&sinf=${best._id}` : undefined} icon={<FaTrophy />} color="bg-green-50 text-green-600" label={tx("Eng yuqori davomat")} value={best ? `${pctFmt(best.percent)}` : '—'} detail={best ? `${best.name} · ${best.schoolName}` : ''} />
				<KpiLink to={worst ? `/monitor/schools/${worst.schoolId}?tab=students&sinf=${worst._id}&status=absent` : undefined} icon={<FaChalkboard />} color="bg-red-50 text-red-600" label={tx("Eng past davomat")} value={worst ? `${pctFmt(worst.percent)}` : '—'} detail={worst ? `${worst.name} · ${worst.schoolName}` : ''} />
			</div>

			<div className="flex flex-wrap items-center gap-3 mb-4">
				<SearchBox value={query} onChange={setQuery} placeholder={tx("Sinf, maktab yoki sinf rahbari")} />
				<SelectBox value={level} onChange={setLevel} searchPlaceholder={tx("Holat qidirish...")} options={[{ value: '', label: 'Barcha holatlar' }, { value: 'high', label: 'Yuqori davomat (85%+)' }, { value: 'mid', label: "O'rtacha (60-85%)" }, { value: 'low', label: 'Past (60% dan kam)' }]} />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">{['Sinf', 'Maktab', 'Sinf rahbari', 'Davomat', "O'quvchilar", 'Kelmagan', ''].map((h, i) => <th key={i} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
						<tbody>
							{rows.map(c => (
								<tr key={c._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-4 py-2.5 font-semibold text-gray-900">{c.name}</td>
									<td className="px-4 py-2.5"><SchoolLink id={c.schoolId} name={c.schoolName} className="text-sm" /></td>
									<td className="px-4 py-2.5 text-gray-600">{c.head || '—'}</td>
									<td className="px-4 py-2.5"><Progress present={c.came} total={c.total} percent={c.percent} /></td>
									<td className="px-4 py-2.5 text-gray-700">{fmt(c.total)}</td>
									<td className="px-4 py-2.5"><Link to={`/monitor/schools/${c.schoolId}?tab=students&sinf=${c._id}&status=absent`} className="text-red-600 font-medium hover:underline">{fmt(c.absent)}</Link></td>
									<td className="px-4 py-2.5 text-right"><Link to={`/monitor/schools/${c.schoolId}?tab=students&sinf=${c._id}`} className="text-sm text-blue-600 hover:underline whitespace-nowrap">{tx("O'quvchilar →")}</Link></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && rows.length === 0 && !error && <Empty text={tx("Topilmadi")} />}
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
			</div>
		</Page>
	)
}

export default MonitorClassRanking
