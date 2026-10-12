import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiDownload, FiPlus, FiSearch } from 'react-icons/fi'
import { EXCUSE, ExcuseChip, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, Segmented, exportXlsx, fmt, todayStr, useMonitorData, usePanel } from './monitorKit'
import SearchableSelect from '../../components/SearchableSelect'
import { FaUmbrellaBeach } from 'react-icons/fa'

// O'quvchilar sabablari (sinf rahbari kiritadi) — xodimlar sabablaridan farqli turlar
const S_TYPES = {
	kasallik: { label: 'Kasallik', dot: 'bg-rose-500', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
	oilaviy: { label: 'Oilaviy sabab', dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
	musobaqa: { label: 'Musobaqa / olimpiada', dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
	boshqa: { label: 'Boshqa sabab', dot: 'bg-slate-400', cls: 'bg-slate-100 text-slate-700 ring-slate-200' }
}
const StudentChip = ({ type }) => { const e = S_TYPES[type] || S_TYPES.boshqa; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${e.cls}`}><i className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />{e.label}</span> }
const daysBetween = (a, b) => Math.max(1, Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000) + 1)

// Sababli kelmaganlar: xodimlar (ta'til, safar, kasallik) va o'quvchilar (kasallik, oilaviy, musobaqa). Standart: bugun faol bo'lganlar.
// Monitor: barcha maktablar (maktab tanlash mumkin); maktab paneli: faqat o'z maktabi
const MonitorLeaves = () => {
	const { base, scoped } = usePanel()
	const today = todayStr()
	const [range, setRange] = useState({ from: today, to: today })
	const [kind, setKind] = useState('staff')
	const [type, setType] = useState('')
	const [state, setState] = useState('')
	const [sinf, setSinf] = useState('')
	const [schoolId, setSchoolId] = useState('')
	const [q, setQ] = useState('')
	const { data, loading, error, reload } = useMonitorData('leaves', { ...range, schoolId: scoped ? undefined : schoolId }, { auto: true })
	const { data: overview } = useMonitorData('overview', {}, { skip: scoped })
	const isToday = range.from === today && range.to === today
	const isStudent = kind === 'student'

	// Bir xil shaklga keltirilgan qatorlar (kun soni tanlangan davr bilan kesishmasi bo'yicha)
	const all = useMemo(() => {
		if (!data) return []
		const t = range.to
		const span = (s, e) => daysBetween(s > range.from ? s : range.from, e && e < t ? e : t)
		return isStudent
			? (data.studentLeaves || []).map(r => ({ ...r, person: r.student, sub: r.sinf, group: r.sinf, days: span(r.startDate, r.endDate) }))
			: (data.leaves || []).map(r => ({ ...r, person: r.employee, sub: r.employee.position, group: '' }))
	}, [data, isStudent, range])
	const counts = { staff: data?.leaves?.length || 0, student: data?.studentLeaves?.length || 0 }
	const typeDefs = isStudent ? S_TYPES : EXCUSE
	const byType = useMemo(() => all.reduce((m, r) => { const k = r.type in typeDefs ? r.type : 'boshqa'; m[k] = (m[k] || 0) + 1; return m }, {}), [all, typeDefs])
	const sinfs = useMemo(() => [...new Set(all.map(r => r.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'uz', { numeric: true })), [all])
	const activeCount = all.filter(r => r.active).length

	const rows = useMemo(() => {
		const t = q.trim().toLowerCase()
		return all.filter(r => (!type || r.type === type) && (!state || (state === 'active' ? r.active : !r.active)) && (!sinf || r.group === sinf)
			&& (!t || `${r.person.fullName} ${r.sub} ${r.schoolName} ${r.comment}`.toLowerCase().includes(t)))
	}, [all, type, state, sinf, q])

	const switchKind = (k) => { setKind(k); setType(''); setSinf(''); setState('') }
	const download = () => exportXlsx(`sababli-kelmaganlar-${isStudent ? 'oquvchilar' : 'xodimlar'}-${range.from}_${range.to}`, [{
		name: 'Sababli kelmaganlar', title: `Sababli kelmaganlar (${isStudent ? "o'quvchilar" : 'xodimlar'}): ${range.from} — ${range.to}`,
		rows: rows.map(r => ({ [isStudent ? "O'quvchi" : 'Xodim']: r.person.fullName, [isStudent ? 'Sinf' : 'Lavozim']: r.sub, ...(scoped ? {} : { Maktab: r.schoolName }), Sabab: r.label, Izoh: r.comment, Boshlanish: r.startDate, Tugash: r.endDate || 'muddatsiz', Kunlar: r.days, Holat: r.active ? 'Hozir faol' : 'Yakunlangan', "Kim qo'shgan": r.createdBy }))
	}])
	const addTo = isStudent ? `${base}/entry-exit` : `${base}/comments`
	const noun = isStudent ? "o'quvchi" : 'xodim'

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<Segmented value={kind} onChange={switchKind} options={[{ key: 'staff', label: `Xodimlar · ${fmt(counts.staff)}` }, { key: 'student', label: `O'quvchilar · ${fmt(counts.student)}` }]} />
				{!scoped && <SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />}
				{(base === '/user' || base === '/admin') && <Link to={addTo} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"><FiPlus size={15} /> Sabab qo'shish</Link>}
				<button onClick={download} disabled={!rows.length} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={15} /> Excel</button>
			</PageHeader>
			<p className="mb-4 text-sm text-gray-500">{isStudent ? "Darsga kelmagan, ammo sababi sinf rahbari tomonidan kiritilgan o'quvchilar. Ular davomat foizini tushirmaydi va \"kelmagan\" qatoriga kirmaydi." : "Ta'til, xizmat safari, kasallik kabi sabab bilan ishga kelmagan xodimlar. Ular davomat foizini tushirmaydi va \"kelmagan\" qatoriga kirmaydi."} Sabab qo'shish yoki yopish uchun «Sabab qo'shish» tugmasi orqali {isStudent ? 'Kirish-chiqish' : 'Izohlar'} bo'limiga o'ting.</p>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} />{!isToday && <button onClick={() => setRange({ from: today, to: today })} className="text-sm text-blue-600 hover:underline">Faqat bugun</button>}</div>

			<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
				<button onClick={() => { setType(''); setState('') }} className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${type === '' ? 'border-slate-900 ring-1 ring-slate-900' : 'border-gray-100'}`}>
					<p className="text-xs text-gray-500">{isToday ? 'Bugun sababli kelmagan' : 'Jami (davrda)'}</p><p className="mt-1 text-3xl font-bold text-gray-900">{fmt(all.length)}</p><p className="mt-1 text-xs text-gray-400">hozir faol: {fmt(activeCount)}</p>
				</button>
				{Object.entries(typeDefs).map(([key, e]) => (
					<button key={key} onClick={() => setType(type === key ? '' : key)} className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${type === key ? 'border-slate-900 ring-1 ring-slate-900' : 'border-gray-100'}`}>
						<div className="flex items-center gap-2 text-xs text-gray-500"><i className={`h-2 w-2 rounded-full ${e.dot}`} />{e.label}</div>
						<p className="mt-1 text-3xl font-bold text-gray-900">{fmt(byType[key] ?? 0)}</p>
					</button>
				))}
			</div>

			<div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
					<h2 className="font-semibold text-gray-900">{isStudent ? "O'quvchilar" : 'Xodimlar'} ro'yxati ({fmt(rows.length)})</h2>
					<div className="flex flex-wrap items-center gap-2">
						{isStudent && <SearchableSelect variant="outline" icon={false} searchFrom={2} className="min-w-[150px] max-w-[220px]" searchPlaceholder="Sinf qidirish..." value={sinf} onChange={setSinf} options={[{ value: '', label: 'Barcha sinflar' }, ...sinfs.map(s => ({ value: s, label: s }))]} />}
						<SearchableSelect variant="outline" icon={false} searchFrom={99} className="min-w-[150px] max-w-[200px]" value={state} onChange={setState} options={[{ value: '', label: 'Barcha holat' }, { value: 'active', label: 'Hozir faol' }, { value: 'done', label: 'Yakunlangan' }]} />
						<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`${isStudent ? "O'quvchi" : 'Xodim'}${isStudent ? '' : ', lavozim'} yoki izoh`} className="h-10 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-black" /></div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{[isStudent ? "O'quvchi" : 'Xodim', ...(isStudent ? ['Sinf'] : []), ...(scoped ? [] : ['Maktab']), 'Sabab', 'Izoh', 'Muddat', 'Kun', 'Holat'].map(h => <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map(r => (
								<tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-5 py-3"><PersonLink kind={kind} id={r.person._id} name={r.person.fullName} sub={isStudent ? '' : r.sub} photo={r.person.photo} /></td>
									{isStudent && <td className="px-5 py-3 text-gray-700">{r.sinf || '—'}</td>}
									{!scoped && <td className="px-5 py-3"><SchoolLink id={r.schoolId} name={r.schoolName} className="text-sm" /></td>}
									<td className="px-5 py-3">{isStudent ? <StudentChip type={r.type} /> : <ExcuseChip type={r.type} />}</td>
									<td className="max-w-[260px] px-5 py-3 text-gray-600"><span className="line-clamp-2" title={r.comment}>{r.comment || '—'}</span>{r.createdBy && <span className="block text-[11px] text-gray-400">qo'shgan: {r.createdBy}</span>}</td>
									<td className="whitespace-nowrap px-5 py-3 text-gray-700">{r.startDate} → {r.endDate || 'muddatsiz'}</td>
									<td className="px-5 py-3 font-medium text-gray-900">{r.days}</td>
									<td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.active ? 'Hozir faol' : 'Yakunlangan'}</span></td>
								</tr>
							))}
							{!loading && rows.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-500"><FaUmbrellaBeach className="mx-auto mb-3 text-gray-300" size={30} />{all.length ? 'Filtrga mos yozuv topilmadi' : isToday ? `Bugun sababli kelmagan ${noun} yo'q` : `Bu davrda sababli kelmagan ${noun} yo'q`}</td></tr>}
							{loading && !data && <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-500">Yuklanmoqda...</td></tr>}
							{error && <tr><td colSpan={8} className="px-5 py-14 text-center text-red-600">Ma'lumotni yuklab bo'lmadi</td></tr>}
						</tbody>
					</table>
				</div>
			</div>
		</Page>
	)
}

export default MonitorLeaves
