import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FiDownload, FiPlus, FiSearch } from 'react-icons/fi'
import { EXCUSE, ExcuseChip, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, Segmented, exportXlsx, fmt, todayStr, useMonitorData, usePanel } from './monitorKit'
import SearchableSelect from '../../components/SearchableSelect'
import { FaHome, FaNotesMedical, FaPlane, FaRegCommentDots, FaTrophy, FaUmbrellaBeach, FaUsers } from 'react-icons/fa'
import { tx } from '../../i18n'

// O'quvchilar sabablari (sinf rahbari kiritadi) — xodimlar sabablaridan farqli turlar
const S_TYPES = {
	kasallik: { label: 'Kasallik', dot: 'bg-rose-500', cls: 'bg-rose-50 text-rose-700 ring-rose-200' },
	oilaviy: { label: 'Oilaviy sabab', dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
	musobaqa: { label: 'Musobaqa / olimpiada', dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
	boshqa: { label: 'Boshqa sabab', dot: 'bg-slate-400', cls: 'bg-slate-100 text-slate-700 ring-slate-200' }
}
const StudentChip = ({ type }) => { const e = S_TYPES[type] || S_TYPES.boshqa; return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${e.cls}`}><i className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />{e.label}</span> }
const COLOR = { tatil: 'sky', safar: 'violet', kasallik: 'rose', oilaviy: 'amber', musobaqa: 'emerald', boshqa: 'slate' }
const ICON = { tatil: <FaUmbrellaBeach />, safar: <FaPlane />, kasallik: <FaNotesMedical />, oilaviy: <FaHome />, musobaqa: <FaTrophy />, boshqa: <FaRegCommentDots /> }
// Tailwind klasslari to'liq yozilishi shart (dinamik qurilmaydi)
const TINT = {
	slate: { icon: 'bg-slate-100 text-slate-700', bar: 'bg-slate-500', on: 'border-slate-300 bg-slate-50 ring-2 ring-slate-200' },
	sky: { icon: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500', on: 'border-sky-300 bg-sky-50/60 ring-2 ring-sky-100' },
	violet: { icon: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500', on: 'border-violet-300 bg-violet-50/60 ring-2 ring-violet-100' },
	rose: { icon: 'bg-rose-50 text-rose-600', bar: 'bg-rose-500', on: 'border-rose-300 bg-rose-50/60 ring-2 ring-rose-100' },
	amber: { icon: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500', on: 'border-amber-300 bg-amber-50/60 ring-2 ring-amber-100' },
	emerald: { icon: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500', on: 'border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-100' }
}
// Filtr vazifasini bajaradigan ko'rsatkich kartasi: rangli belgi, katta son, ulushi; tanlanganda yumshoq rangli ramka
const StatCard = ({ active, color, icon, label, value, share, note, onClick }) => {
	const t = TINT[color] || TINT.slate
	return (
		<button type="button" onClick={onClick} aria-pressed={active} className={`group flex flex-col gap-3 rounded-2xl border p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${active ? t.on : 'border-gray-100 bg-white'}`}>
			<div className="flex items-center gap-3">
				<span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base ${t.icon}`}>{icon}</span>
				<span className="min-w-0 truncate text-xs font-medium text-gray-500" title={label}>{label}</span>
			</div>
			<div className="flex items-end justify-between gap-2">
				<span className="text-3xl font-bold leading-none text-gray-900">{fmt(value)}</span>
				{note ? <span className="text-[11px] text-gray-400">{note}</span> : share !== undefined && <span className="text-[11px] text-gray-400">{share}%</span>}
			</div>
			{share !== undefined && <div className="h-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${t.bar}`} style={{ width: `${share}%` }} /></div>}
		</button>
	)
}
const shiftDay = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
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
			.sort((a, b) => (b.active - a.active) || String(b.startDate).localeCompare(String(a.startDate)))
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
				{(base === '/user' || base === '/admin') && <Link to={addTo} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"><FiPlus size={15} /> {tx("Sabab qo'shish")}</Link>}
				<button onClick={download} disabled={!rows.length} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={15} /> {tx("Excel")}</button>
			</PageHeader>
			<p className="mb-4 text-sm text-gray-500">{isStudent ? tx("Darsga kelmagan, ammo sababi sinf rahbari tomonidan kiritilgan o'quvchilar. Ular davomat foizini tushirmaydi va \"kelmagan\" qatoriga kirmaydi.") : tx("Ta'til, xizmat safari, kasallik kabi sabab bilan ishga kelmagan xodimlar. Ular davomat foizini tushirmaydi va \"kelmagan\" qatoriga kirmaydi.")} {tx("Sabab qo'shish yoki yopish uchun «Sabab qo'shish» tugmasi orqali {{section}} bo'limiga o'ting.", { section: isStudent ? tx("Kirish-chiqish") : tx("Izohlar") })}</p>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} />{!isToday && <button onClick={() => setRange({ from: today, to: today })} className="text-sm text-blue-600 hover:underline">{tx("Faqat bugun")}</button>}</div>

			<div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
				<StatCard active={type === ''} color="slate" icon={<FaUsers />} label={isToday ? tx("Bugun sababli kelmagan") : tx("Jami (davrda)")} value={all.length} note={tx("hozir faol: {{n}}", { n: fmt(activeCount) })} onClick={() => { setType(''); setState('') }} />
				{Object.entries(typeDefs).map(([key, e]) => (
					<StatCard key={key} active={type === key} color={COLOR[key] || 'slate'} icon={ICON[key] || <FaRegCommentDots />} label={e.label} value={byType[key] ?? 0} share={all.length ? Math.round(((byType[key] ?? 0) / all.length) * 100) : 0} onClick={() => setType(type === key ? '' : key)} />
				))}
			</div>

			<div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
					<h2 className="font-semibold text-gray-900">{tx("{{who}} ro'yxati ({{n}})", { who: isStudent ? tx("O'quvchilar") : tx("Xodimlar"), n: fmt(rows.length) })}</h2>
					<div className="flex flex-wrap items-center gap-2">
						{isStudent && <SearchableSelect variant="outline" icon={false} searchFrom={2} className="min-w-[150px] max-w-[220px]" searchPlaceholder={tx("Sinf qidirish...")} value={sinf} onChange={setSinf} options={[{ value: '', label: 'Barcha sinflar' }, ...sinfs.map(s => ({ value: s, label: s }))]} />}
						<SearchableSelect variant="outline" icon={false} searchFrom={99} className="min-w-[150px] max-w-[200px]" value={state} onChange={setState} options={[{ value: '', label: 'Barcha holat' }, { value: 'active', label: 'Hozir faol' }, { value: 'done', label: 'Yakunlangan' }]} />
						<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`${isStudent ? "O'quvchi" : 'Xodim'}${isStudent ? '' : ', lavozim'} yoki izoh`} className="h-10 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-black" /></div>
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="bg-gray-50/70 text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{[isStudent ? "O'quvchi" : 'Xodim', ...(isStudent ? ['Sinf'] : []), ...(scoped ? [] : ['Maktab']), 'Sabab', 'Izoh', 'Muddat', 'Kun', 'Holat'].map(h => <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map(r => (
								<tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-5 py-3"><PersonLink kind={kind} id={r.person._id} name={r.person.fullName} sub={isStudent ? '' : r.sub} photo={r.person.photo} /></td>
									{isStudent && <td className="px-5 py-3 text-gray-700">{r.sinf || '—'}</td>}
									{!scoped && <td className="px-5 py-3"><SchoolLink id={r.schoolId} name={r.schoolName} className="text-sm" /></td>}
									<td className="px-5 py-3">{isStudent ? <StudentChip type={r.type} /> : <ExcuseChip type={r.type} />}</td>
									<td className="max-w-[260px] px-5 py-3 text-gray-600"><span className="line-clamp-2" title={r.comment}>{r.comment || '—'}</span>{r.createdBy && <span className="block text-[11px] text-gray-400">{tx("qo'shgan: {{name}}", { name: r.createdBy })}</span>}</td>
									<td className="whitespace-nowrap px-5 py-3 text-gray-700">{r.startDate} → {r.endDate || tx("muddatsiz")}</td>
									<td className="px-5 py-3 font-medium text-gray-900">{r.days}</td>
									<td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.active ? tx("Hozir faol") : tx("Yakunlangan")}</span></td>
								</tr>
							))}
							{!loading && !error && rows.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-500"><FaUmbrellaBeach className="mx-auto mb-3 text-gray-300" size={30} />{all.length ? tx("Filtrga mos yozuv topilmadi") : isToday ? `Bugun sababli kelmagan ${noun} yo'q` : `Bu davrda sababli kelmagan ${noun} yo'q`}{!all.length && isToday && <button onClick={() => setRange({ from: shiftDay(today, -29), to: today })} className="mt-3 block mx-auto text-sm text-blue-600 hover:underline">{tx("Oxirgi 30 kunni ko'rish")}</button>}</td></tr>}
							{loading && !data && <tr><td colSpan={8} className="px-5 py-14 text-center text-gray-500">{tx("Yuklanmoqda...")}</td></tr>}
							{error && !data && <tr><td colSpan={8} className="px-5 py-14 text-center"><p className="text-red-600">{tx("Ma'lumotni yuklab bo'lmadi")}</p><button onClick={reload} className="mt-3 inline-flex h-9 items-center rounded-lg border border-gray-200 px-4 text-sm text-gray-700 hover:bg-gray-50">{tx("Qayta urinish")}</button></td></tr>}
						</tbody>
					</table>
				</div>
			</div>
		</Page>
	)
}

export default MonitorLeaves
