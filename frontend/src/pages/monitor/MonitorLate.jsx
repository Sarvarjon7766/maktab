import { useMemo, useState } from 'react'
import SearchableSelect from '../../components/SearchableSelect'
import { FaClock, FaUsers } from 'react-icons/fa'
import { Empty, KpiLink, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, SearchBox, Segmented, matchText, exportXlsx, fmt, shiftDate, todayStr, useMonitorData, usePanel, pctFmt } from './monitorKit'

// Eng ko'p kech qolganlar: shaxslar reytingi. Har qator — o'sha shaxsning to'liq profiliga va maktabiga havola
const MonitorLate = () => {
	const { base, scoped } = usePanel()
	const [kind, setKind] = useState('student')
	const [schoolId, setSchoolId] = useState('')
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error, reload } = useMonitorData('late-people', { kind, schoolId, ...range, limit: 150 })
	const { data: overview } = useMonitorData('overview', {})
	const [q, setQ] = useState('')
	const [group, setGroup] = useState('')
	const [sort, setSort] = useState('days')
	const all = data?.people || []
	// sinf (o'quvchilar) yoki lavozim (xodimlar) bo'yicha filtr: variantlar kelgan ro'yxatning o'zidan olinadi
	const groupOf = r => (kind === 'student' ? r.sinf : r.position) || ''
	const groups = useMemo(() => [...new Set(all.map(groupOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz', { numeric: true })), [all, kind])
	const SORTS = { days: (a, b) => b.lateDays - a.lateDays, percent: (a, b) => b.percent - a.percent, worst: (a, b) => String(b.worst).localeCompare(String(a.worst)), name: (a, b) => a.fullName.localeCompare(b.fullName, 'uz') }
	const rows = all.filter(r => (!group || groupOf(r) === group) && matchText(q, r.fullName, r.schoolName, r.sinf, r.position)).sort(SORTS[sort])
	const worst = all[0]
	const latest = rows.reduce((a, r) => (!a || r.worst > a.worst ? r : a), null)
	const download = () => exportXlsx(`kech-qolganlar-${kind}-${range.from}_${range.to}`, [{ name: 'Kech qolganlar', rows: rows.map((r, i) => ({ "O'rin": i + 1, 'F.I.Sh': r.fullName, ...(scoped ? {} : { Maktab: r.schoolName }), [kind === 'student' ? 'Sinf' : 'Lavozim']: kind === 'student' ? r.sinf : r.position, 'Kech qolgan kunlar': r.lateDays, 'Kelgan kunlar': r.days, 'Kechikish %': r.percent, 'Eng kech kelgan': r.worst, 'Boshlanish': r.limit })) }])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<Segmented value={kind} onChange={k => { setKind(k); setGroup('') }} options={[{ key: 'student', label: "O'quvchilar" }, { key: 'staff', label: 'Xodimlar' }]} />
				{!scoped && <SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />}
				<button onClick={download} disabled={!rows.length} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">Excel</button>
			</PageHeader>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} /><SearchBox value={q} onChange={setQ} placeholder={scoped ? 'Ism yoki sinf qidirish...' : 'Ism, maktab yoki sinf qidirish...'} />
				<SearchableSelect variant="outline" icon={false} searchFrom={2} className="min-w-[180px] max-w-[260px]" searchPlaceholder={kind === 'student' ? 'Sinf qidirish...' : 'Lavozim qidirish...'} value={group} onChange={setGroup} options={[{ value: '', label: kind === 'student' ? 'Barcha sinflar' : 'Barcha lavozimlar' }, ...groups.map(g => ({ value: g, label: g }))]} />
				<SearchableSelect variant="outline" icon={false} searchFrom={99} className="min-w-[200px] max-w-[260px]" value={sort} onChange={setSort} options={[{ value: 'days', label: 'Saralash: kech qolgan kunlar' }, { value: 'percent', label: 'Saralash: kechikish foizi' }, { value: 'worst', label: 'Saralash: eng kech kelgan' }, { value: 'name', label: "Saralash: ism bo'yicha" }]} /></div>
			<p className="mb-4 text-sm text-gray-500">Tanlangan davrda belgilangan ish/dars boshlanish vaqtidan keyin kelgan shaxslar reytingi: kim necha kun kechikkan, eng kech qachon kelgan. Ismni bossangiz uning to'liq davomat sahifasi ochiladi.</p>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<KpiLink to={scoped ? undefined : `/monitor/lists?kind=${kind}&status=late${schoolId ? `&school=${schoolId}` : ''}`} icon={<FaUsers />} color="bg-orange-50 text-orange-600" label="Kamida bir marta kech qolgan" value={data?.totalLatePeople ?? 0} />
				<KpiLink to={worst ? `${base}/people/${kind}/${worst._id}` : undefined} icon={<FaClock />} color="bg-red-50 text-red-600" label="Eng ko'p kech qolgan" value={worst ? `${worst.lateDays} kun` : '—'} detail={worst ? worst.fullName : ''} />
				<KpiLink to={latest ? `${base}/people/${kind}/${latest._id}` : undefined} icon={<FaClock />} color="bg-amber-50 text-amber-600" label="Eng kech kelgan vaqt" value={rows.length ? rows.map(r => r.worst).sort().pop() : '—'} />
			</div>

			<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{["O'rin", 'Shaxs', ...(scoped ? [] : ['Maktab']), kind === 'student' ? 'Sinf' : 'Lavozim', 'Kech qolgan kunlar', 'Eng kech', 'Boshlanish'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map((r, i) => (
								<tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-4 py-2.5"><span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</span></td>
									<td className="px-4 py-2.5"><PersonLink kind={kind} id={r._id} name={r.fullName} sub={r.code} photo={r.photo} /></td>
									{!scoped && <td className="px-4 py-2.5"><SchoolLink id={r.schoolId} name={r.schoolName} className="text-sm" /></td>}
									<td className="px-4 py-2.5 text-gray-600">{(kind === 'student' ? r.sinf : r.position) || '—'}</td>
									<td className="px-4 py-2.5 min-w-[180px]">
										<div className="flex items-center justify-between mb-1"><span className="font-medium text-gray-900">{fmt(r.lateDays)} <span className="text-gray-400 font-normal">/ {fmt(r.days)}</span></span><span className="text-xs text-orange-600 font-semibold">{pctFmt(r.percent)}</span></div>
										<div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full bg-orange-400" style={{ width: `${Math.min(r.percent, 100)}%` }} /></div>
									</td>
									<td className="px-4 py-2.5 text-red-600 font-medium">{r.worst}</td>
									<td className="px-4 py-2.5 text-gray-500">{r.limit}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				{loading && !data && <Empty text="Yuklanmoqda..." />}
				{!loading && rows.length === 0 && !error && <Empty text={all.length ? 'Topilmadi' : 'Bu davrda kech qolgan shaxs topilmadi'} />}
				{error && <Empty text="Ma'lumotni yuklab bo'lmadi" />}
			</div>
		</Page>
	)
}

export default MonitorLate
