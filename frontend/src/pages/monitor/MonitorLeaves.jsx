import { useMemo, useState } from 'react'
import { FiDownload, FiSearch } from 'react-icons/fi'
import { EXCUSE, ExcuseChip, KpiLink, Page, PageHeader, PersonLink, RangePicker, SchoolLink, SchoolSelect, exportXlsx, fmt, todayStr, useMonitorData, usePanel } from './monitorKit'
import { FaUmbrellaBeach } from 'react-icons/fa'

// Sababli kelmaganlar: mehnat ta'tili, xizmat safari, kasallik, boshqa sabab. Standart: bugun faol bo'lganlar.
// Monitor: barcha maktablar (maktab tanlash mumkin); maktab paneli: faqat o'z maktabi
const MonitorLeaves = () => {
	const { scoped } = usePanel()
	const today = todayStr()
	const [range, setRange] = useState({ from: today, to: today })
	const [type, setType] = useState('')
	const [schoolId, setSchoolId] = useState('')
	const [q, setQ] = useState('')
	const { data, loading, error, reload } = useMonitorData('leaves', { ...range, type, schoolId: scoped ? undefined : schoolId }, { auto: true })
	const { data: overview } = useMonitorData('overview', {}, { skip: scoped })
	const isToday = range.from === today && range.to === today

	const rows = useMemo(() => {
		const t = q.trim().toLowerCase()
		return (data?.leaves || []).filter(r => !t || `${r.employee.fullName} ${r.employee.position} ${r.schoolName} ${r.comment}`.toLowerCase().includes(t))
	}, [data, q])

	const download = () => exportXlsx(`sababli-kelmaganlar-${range.from}_${range.to}`, [{
		name: 'Sababli kelmaganlar', title: `Sababli kelmaganlar: ${range.from} — ${range.to}`,
		rows: rows.map(r => ({ Xodim: r.employee.fullName, Lavozim: r.employee.position, ...(scoped ? {} : { Maktab: r.schoolName }), Sabab: r.label, Izoh: r.comment, Boshlanish: r.startDate, Tugash: r.endDate || 'muddatsiz', Kunlar: r.days, Holat: r.active ? 'Hozir faol' : 'Yakunlangan', 'Kim qo\'shgan': r.createdBy }))
	}])

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}>
				{!scoped && <SchoolSelect schools={overview?.schools || []} value={schoolId} onChange={setSchoolId} />}
				<button onClick={download} disabled={!rows.length} className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"><FiDownload size={15} /> Excel</button>
			</PageHeader>
			<div className="mb-5 flex flex-wrap items-center gap-3"><RangePicker {...range} onChange={setRange} />{!isToday && <button onClick={() => setRange({ from: today, to: today })} className="text-sm text-blue-600 hover:underline">Faqat bugun</button>}</div>

			<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
				<button onClick={() => setType('')} className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${type === '' ? 'border-slate-900 ring-1 ring-slate-900' : 'border-gray-100'}`}>
					<p className="text-xs text-gray-500">{isToday ? 'Bugun sababli kelmagan' : 'Jami (davrda)'}</p><p className="mt-1 text-3xl font-bold text-gray-900">{fmt(data?.total ?? 0)}</p><p className="mt-1 text-xs text-gray-400">hozir faol: {fmt(data?.active ?? 0)}</p>
				</button>
				{Object.entries(EXCUSE).map(([key, e]) => (
					<button key={key} onClick={() => setType(type === key ? '' : key)} className={`text-left rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md ${type === key ? 'border-slate-900 ring-1 ring-slate-900' : 'border-gray-100'}`}>
						<div className="flex items-center gap-2 text-xs text-gray-500"><i className={`h-2 w-2 rounded-full ${e.dot}`} />{e.label}</div>
						<p className="mt-1 text-3xl font-bold text-gray-900">{fmt(data?.byType?.[key] ?? 0)}</p>
					</button>
				))}
			</div>

			<div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
					<h2 className="font-semibold text-gray-900">Xodimlar ro'yxati ({fmt(rows.length)})</h2>
					<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Xodim, lavozim yoki izoh" className="h-10 w-60 rounded-lg border border-gray-200 pl-9 pr-3 text-sm text-black" /></div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{['Xodim', ...(scoped ? [] : ['Maktab']), 'Sabab', 'Izoh', 'Muddat', 'Kun', 'Holat'].map(h => <th key={h} className="px-5 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{rows.map(r => (
								<tr key={r._id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/30">
									<td className="px-5 py-3"><PersonLink kind="staff" id={r.employee._id} name={r.employee.fullName} sub={r.employee.position} photo={r.employee.photo} /></td>
									{!scoped && <td className="px-5 py-3"><SchoolLink id={r.schoolId} name={r.schoolName} className="text-sm" /></td>}
									<td className="px-5 py-3"><ExcuseChip type={r.type} /></td>
									<td className="max-w-[260px] px-5 py-3 text-gray-600"><span className="line-clamp-2" title={r.comment}>{r.comment}</span>{r.createdBy && <span className="block text-[11px] text-gray-400">qo'shgan: {r.createdBy}</span>}</td>
									<td className="whitespace-nowrap px-5 py-3 text-gray-700">{r.startDate} → {r.endDate || 'muddatsiz'}</td>
									<td className="px-5 py-3 font-medium text-gray-900">{r.days}</td>
									<td className="px-5 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.active ? 'Hozir faol' : 'Yakunlangan'}</span></td>
								</tr>
							))}
							{!loading && rows.length === 0 && <tr><td colSpan={7} className="px-5 py-14 text-center text-gray-500"><FaUmbrellaBeach className="mx-auto mb-3 text-gray-300" size={30} />{isToday ? "Bugun sababli kelmagan xodim yo'q" : "Bu davrda sababli kelmagan xodim yo'q"}</td></tr>}
							{loading && !data && <tr><td colSpan={7} className="px-5 py-14 text-center text-gray-500">Yuklanmoqda...</td></tr>}
							{error && <tr><td colSpan={7} className="px-5 py-14 text-center text-red-600">Ma'lumotni yuklab bo'lmadi</td></tr>}
						</tbody>
					</table>
				</div>
			</div>
			<p className="mt-3 text-xs text-gray-400">Sababli kunlar xodimning davomat foiziga salbiy ta'sir qilmaydi va "kelmagan (sababsiz)" hisobiga kirmaydi. Sabab maktab admini tomonidan izoh sifatida qo'shiladi.</p>
		</Page>
	)
}

export default MonitorLeaves
