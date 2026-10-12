import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import SearchableSelect from '../../components/SearchableSelect'
import { ListPager } from '../../components/ListPager'
import { FaClock, FaUsers } from 'react-icons/fa'
import { toast } from 'react-toastify'
import { Empty, KpiLink, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, SearchBox, Segmented, exportXlsx, fmt, shiftDate, todayStr, useMonitorData, usePanel, pctFmt } from './monitorKit'
import { tx } from '../../i18n'

const PAGE_SIZE = 50

// Eng ko'p kech qolganlar: shaxslar reytingi. Qidiruv, filtr, saralash va sahifalash SERVERDA bajariladi: ro'yxat qancha katta bo'lmasin
// brauzerga faqat joriy sahifa (50 ta) keladi va butun davr bo'yicha natija ko'rinadi (avval faqat eng ko'p kech qolgan 150 tasi edi).
// Har qator — o'sha shaxsning to'liq profiliga va maktabiga havola
const MonitorLate = () => {
	const { base, scoped, api } = usePanel()
	const [kind, setKind] = useState('student')
	const [schoolId, setSchoolId] = useState('')
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const [q, setQ] = useState('')
	const [qDebounced, setQDebounced] = useState('')
	const [group, setGroup] = useState('')
	const [sort, setSort] = useState('days')
	const [page, setPage] = useState(1)
	const [exporting, setExporting] = useState(false)
	useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 300); return () => clearTimeout(t) }, [q])
	// Filtr o'zgarsa 1-sahifadan boshlanadi
	useEffect(() => { setPage(1) }, [kind, schoolId, range.from, range.to, qDebounced, group, sort])

	const params = { kind, schoolId, ...range, q: qDebounced, group, sort }
	const { data: fresh, loading, error, reload } = useMonitorData('late-people', { ...params, page, pageSize: PAGE_SIZE })
	const { data: overview } = useMonitorData('overview', {})
	// Sahifa almashganda jadval yo'qolib qolmasin: yangi javob kelguncha oldingisi ko'rsatiladi
	const lastData = useRef(null)
	if (fresh) lastData.current = fresh
	const data = fresh || lastData.current
	const rows = data?.people || []
	const groups = data?.groups || []
	const worst = data?.top
	const offset = ((data?.page || 1) - 1) * (data?.pageSize || PAGE_SIZE)

	// Excel: sahifa emas, filtrga mos HAMMA natija serverdan olinadi
	const download = async () => {
		setExporting(true)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/${api}/late-people`, { params: { ...params, all: 1 }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			const list = res.data.people || []
			exportXlsx(`kech-qolganlar-${kind}-${range.from}_${range.to}`, [{ name: 'Kech qolganlar', rows: list.map((r, i) => ({ "O'rin": i + 1, 'F.I.Sh': r.fullName, ...(scoped ? {} : { Maktab: r.schoolName }), [kind === 'student' ? 'Sinf' : 'Lavozim']: kind === 'student' ? r.sinf : r.position, 'Kech qolgan kunlar': r.lateDays, 'Kelgan kunlar': r.days, 'Kechikish %': r.percent, 'Eng kech kelgan': r.worst, 'Boshlanish': r.limit })) }])
		} catch {
			toast.error(tx("Ma'lumotni yuklab bo'lmadi"))
		} finally {
			setExporting(false)
		}
	}

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				<Segmented value={kind} onChange={k => { setKind(k); setGroup('') }} options={[{ key: 'student', label: "O'quvchilar" }, { key: 'staff', label: 'Xodimlar' }]} />
				{!scoped && <SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />}
				<button onClick={download} disabled={!data?.total || exporting} className="px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50">{exporting ? tx("Yuklanmoqda...") : tx("Excel")}</button>
			</PageHeader>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} /><SearchBox value={q} onChange={setQ} placeholder={scoped ? tx("Ism yoki sinf qidirish...") : tx("Ism, maktab yoki sinf qidirish...")} />
				<SearchableSelect variant="outline" icon={false} searchFrom={2} className="min-w-[180px] max-w-[260px]" searchPlaceholder={kind === 'student' ? tx("Sinf qidirish...") : tx("Lavozim qidirish...")} value={group} onChange={setGroup} options={[{ value: '', label: kind === 'student' ? tx('Barcha sinflar') : tx('Barcha lavozimlar') }, ...groups.map(g => ({ value: g, label: g }))]} />
				<SearchableSelect variant="outline" icon={false} searchFrom={99} className="min-w-[200px] max-w-[260px]" value={sort} onChange={setSort} options={[{ value: 'days', label: tx('Saralash: kech qolgan kunlar') }, { value: 'percent', label: tx('Saralash: kechikish foizi') }, { value: 'worst', label: tx('Saralash: eng kech kelgan') }, { value: 'name', label: tx("Saralash: ism bo'yicha") }]} /></div>
			<p className="mb-4 text-sm text-gray-500">{tx("Tanlangan davrda belgilangan ish/dars boshlanish vaqtidan keyin kelgan shaxslar reytingi: kim necha kun kechikkan, eng kech qachon kelgan. Ismni bossangiz uning to'liq davomat sahifasi ochiladi.")}</p>

			<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
				<KpiLink to={scoped ? undefined : `/monitor/lists?kind=${kind}&status=late${schoolId ? `&school=${schoolId}` : ''}`} icon={<FaUsers />} color="bg-orange-50 text-orange-600" label={tx("Kamida bir marta kech qolgan")} value={data?.totalLatePeople ?? 0} />
				<KpiLink to={worst ? `${base}/people/${kind}/${worst._id}` : undefined} icon={<FaClock />} color="bg-red-50 text-red-600" label={tx("Eng ko'p kech qolgan")} value={worst ? tx('{{n}} kun', { n: worst.lateDays }) : '—'} detail={worst ? worst.fullName : ''} />
				<KpiLink icon={<FaClock />} color="bg-amber-50 text-amber-600" label={tx("Eng kech kelgan vaqt")} value={data?.latestWorst || '—'} />
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
									<td className="px-4 py-2.5"><span className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-bold ${offset + i < 3 ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{offset + i + 1}</span></td>
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
				{loading && !data && <Empty text={tx("Yuklanmoqda...")} />}
				{!loading && rows.length === 0 && !error && <Empty text={data?.totalLatePeople ? tx("Topilmadi") : tx("Bu davrda kech qolgan shaxs topilmadi")} />}
				{error && <Empty text={tx("Ma'lumotni yuklab bo'lmadi")} />}
				<ListPager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} size={data?.pageSize || PAGE_SIZE} setPage={setPage} className="border-t border-gray-100" />
			</div>
		</Page>
	)
}

export default MonitorLate
