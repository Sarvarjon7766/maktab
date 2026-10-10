import { useMemo, useState } from 'react'
import { FaExclamationTriangle, FaSchool, FaUserSlash } from 'react-icons/fa'
import { Empty, KpiLink, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, exportXlsx, fmt, levelColor, shiftDate, todayStr, useMonitorData, matchText, usePanel, SearchBox, SelectBox, pctFmt } from './monitorKit'

// Xavf guruhi: ketma-ket kelmayotgan yoki davomati past o'quvchilar. Har biri profiliga va maktabiga olib boradi
const MonitorRisk = () => {
	const { base, scoped } = usePanel()
	const [schoolId, setSchoolId] = useState('')
	const [minStreak, setMinStreak] = useState(3)
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('at-risk', { schoolId, minStreak, ...range })
	const { data: overview } = useMonitorData('overview', {})
	const [q, setQ] = useState('')
	const [sinf, setSinf] = useState('')
	const all = data?.students || []
	const sinfOpts = useMemo(() => [{ value: '', label: 'Barcha sinflar' }, ...[...new Set(all.map(r => r.sinf).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'uz', { numeric: true })).map(v => ({ value: v, label: v }))], [all])
	const rows = useMemo(() => all.filter(r => (!sinf || r.sinf === sinf) && matchText(q, r.fullName, r.schoolName, r.sinf)), [all, q, sinf])

	const stats = useMemo(() => {
		const bySchool = new Map()
		rows.forEach(r => bySchool.set(r.schoolName, (bySchool.get(r.schoolName) || 0) + 1))
		const top = [...bySchool.entries()].sort((a, b) => b[1] - a[1])[0]
		return { maxStreak: rows.reduce((a, r) => Math.max(a, r.streak), 0), top }
	}, [rows])

	const longest = rows.reduce((a, r) => (!a || r.streak > a.streak ? r : a), null)
	const topSchool = !scoped && stats.top ? rows.find(r => r.schoolName === stats.top[0]) : null
	const download = () => exportXlsx(`xavf-guruhi-${range.from}_${range.to}`, [{ name: 'Xavf guruhi', rows: rows.map(r => ({ "F.I.Sh": r.fullName, Maktab: r.schoolName, Sinf: r.sinf, "O'quv kunlari": r.schoolDays, Kelgan: r.present, Kelmagan: r.absent, 'Davomat %': r.percent, 'Ketma-ket kelmagan kunlar': r.streak, 'Oxirgi kelgan': r.lastPresent || '' })) }])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<label className="inline-flex items-center gap-2 text-sm text-gray-600">Ketma-ket
					<select value={minStreak} onChange={e => setMinStreak(Number(e.target.value))} className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm">
						{[2, 3, 5, 7, 10].map(n => <option key={n} value={n}>{n}+ kun</option>)}
					</select>
				</label>
				<SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />
				<button onClick={download} disabled={!rows.length} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} /><SearchBox value={q} onChange={setQ} placeholder="O'quvchi yoki maktab qidirish..." /><SelectBox value={sinf} onChange={setSinf} searchPlaceholder="Sinf qidirish..." options={sinfOpts} className="min-w-[150px] max-w-[220px]" /></div>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<KpiLink icon={<FaUserSlash />} color="bg-red-50 text-red-600" label="Xavf guruhidagi o'quvchilar" value={data?.total ?? 0} />
				<KpiLink to={longest ? `${base}/people/student/${longest._id}` : undefined} icon={<FaExclamationTriangle />} color="bg-orange-50 text-orange-600" label="Eng uzun kelmagan seriya" value={`${stats.maxStreak} kun`} />
				<KpiLink to={topSchool ? `/monitor/schools/${topSchool.schoolId}?tab=students` : undefined} icon={<FaSchool />} color="bg-slate-100 text-slate-600" label="Eng ko'p xavf guruhi" value={stats.top ? stats.top[0] : '—'} detail={stats.top ? `${stats.top[1]} nafar` : ''} />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{["O'quvchi", 'Maktab', 'Sinf', 'Davomat', { t: 'Kelmagan seriya', r: 1 }, 'Oxirgi kelgan'].map((h, i) => <th key={i} className={`px-4 py-3 font-semibold whitespace-nowrap ${h.r ? 'text-right' : ''}`}>{h.t || h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map(r => (
								<tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-4 py-2.5"><PersonLink kind="student" id={r._id} name={r.fullName} sub={r.code} /></td>
									<td className="px-4 py-2.5"><SchoolLink id={r.schoolId} name={r.schoolName} className="text-sm" /></td>
									<td className="px-4 py-2.5 text-gray-600">{r.sinf || '—'}</td>
									<td className="px-4 py-2.5 min-w-[170px]">
										<div className="flex items-center justify-between mb-1"><span className="text-gray-900 font-medium">{fmt(r.present)} <span className="text-gray-400 font-normal">/ {fmt(r.schoolDays)}</span></span><span className="text-xs font-semibold text-gray-600">{pctFmt(r.percent)}</span></div>
										<div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${levelColor(r.percent)}`} style={{ width: `${Math.min(r.percent, 100)}%` }} /></div>
									</td>
									<td className="px-4 py-2.5 text-right"><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${r.streak >= 5 ? 'bg-red-100 text-red-700' : r.streak >= 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{r.streak} kun</span></td>
									<td className="px-4 py-2.5 text-gray-500">{r.lastPresent || 'Davrda kelmagan'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text="Yuklanmoqda..." />}
				{!loading && rows.length === 0 && !error && <Empty text={all.length ? 'Topilmadi' : "Xavf guruhida o'quvchi yo'q"} />}
				{error && <Empty text="Ma'lumotni yuklab bo'lmadi" />}
			</div>
		</Page>
	)
}

export default MonitorRisk
