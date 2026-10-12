import { useEffect, useMemo, useState } from 'react'
import { FaVideo } from 'react-icons/fa'
import { FiAlertTriangle, FiChevronLeft, FiChevronRight, FiFilm, FiImage, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { EvidenceGallery } from '../../components/EvidenceViewer'
import { ALERT_KINDS } from '../../utils/vision'
import { DateField, KpiLink, LoadState, Page, PageHeader, Panel, Table, Td, Tr, fmt, todayStr, useMonitorData } from './monitorKit'
import { tx } from '../../i18n'

const GROUPS = [['all', 'Hammasi'], ['alerts', 'Muhim hodisalar'], ['samples', 'Avtomatik namunalar'], ['clips', 'Qisqa lavhalar']]
const ago = (d) => {
	if (!d) return '—'
	const min = Math.round((Date.now() - new Date(d).getTime()) / 60000)
	return min < 1 ? 'hozirgina' : min < 60 ? `${min} daqiqa oldin` : min < 1440 ? `${Math.round(min / 60)} soat oldin` : `${Math.round(min / 1440)} kun oldin`
}

// Aqlli kuzatuv (AI tahlil): hududingiz maktablarida sun'iy intellekt aniqlagan hodisalar, kadrlar va qisqa lavhalar.
// Viloyat monitori tumanlar kesimida, tuman monitori maktablar kesimida ko'radi. Tuman yoki maktabni tanlab, chuqurlashish mumkin
const MonitorAI = () => {
	const [date, setDate] = useState(todayStr())
	const [district, setDistrict] = useState('')
	const [school, setSchool] = useState(null) // { _id, name }
	const [group, setGroup] = useState('all')
	const [page, setPage] = useState(1)
	const overview = useMonitorData('ai', { date }, { auto: true })
	const evidence = useMonitorData('ai-evidence', { date, district, schoolId: school?._id || '', group, page }, { auto: true })
	useEffect(() => { setPage(1) }, [date, district, school, group])

	const data = overview.data
	const districts = data?.districts || []
	const multi = districts.length > 1
	const schools = useMemo(() => (data?.schools || []).filter(s => !district || s.district === district), [data, district])
	const t = data?.totals
	const goGroup = (g) => { setGroup(g); setTimeout(() => document.getElementById('ai-gallery')?.scrollIntoView({ behavior: 'smooth' }), 50) }

	return (
		<Page>
			<PageHeader onReload={() => { overview.reload(); evidence.reload() }} loading={overview.loading}>
				<DateField value={date || todayStr()} max={todayStr()} onChange={setDate} />
				<button onClick={() => setDate('')} className={`rounded-xl border px-3.5 py-2.5 text-sm font-medium transition ${date === '' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{tx("Hamma kunlar")}</button>
			</PageHeader>

			<LoadState loading={overview.loading && !data} error={overview.error}>
				{t && (
					<>
						<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
							<KpiLink onClick={() => goGroup('alerts')} icon={<FiAlertTriangle />} color="bg-red-50 text-red-600" label={tx("Muhim hodisalar")} value={t.alerts} detail={tx("bo'sh sinf, keskin o'zgarish, ortiqcha odam")} />
							<KpiLink onClick={() => goGroup('all')} icon={<FiImage />} color="bg-blue-50 text-blue-600" label={tx("Jami lahzalar")} value={t.total} detail={`${fmt(t.total - t.alerts)} avtomatik namuna`} />
							<KpiLink onClick={() => goGroup('clips')} icon={<FiFilm />} color="bg-violet-50 text-violet-600" label={tx("Qisqa lavhalar")} value={t.clips} detail={tx("harakat tasvirga olingan")} />
							<KpiLink to="/monitor/camera-health" icon={<FaVideo />} color="bg-green-50 text-green-600" label={tx("AI kameralar online")} value={`${fmt(t.online)}/${fmt(t.cameras)}`} detail={`${t.withAI}/${t.schools} maktabda yoqilgan`} />
						</div>

						{multi && (
							<Panel title={tx("Tumanlar bo'yicha")} className="mb-6" action={district && <button onClick={() => { setDistrict(''); setSchool(null) }} className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"><FiX size={13} /> {tx("Filtrni olib tashlash")}</button>}>
								<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
									{districts.map(d => (
										<button key={d.name} onClick={() => { setDistrict(district === d.name ? '' : d.name); setSchool(null) }} className={`rounded-xl border p-4 text-left transition hover:shadow-md ${district === d.name ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}>
											<p className="flex items-center justify-between gap-2 font-semibold text-slate-900">{d.name}{d.alerts > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{d.alerts}</span>}</p>
											<p className="mt-1 text-xs text-slate-500">{tx("{{a}} maktab · {{b}} tasida AI yoqilgan", { a: d.schools, b: d.withAI })}</p>
											<div className="mt-3 flex items-center justify-between text-xs text-slate-600"><span>{tx("{{n}} ta lahza", { n: d.total })}</span><span className={d.cameras && d.online < d.cameras ? 'font-semibold text-amber-600' : ''}>{tx("{{a}}/{{b}} kamera online", { a: d.online, b: d.cameras })}</span></div>
										</button>
									))}
								</div>
							</Panel>
						)}

						<Panel title={district ? `${district}: maktablar` : tx("Maktablar")} className="mb-6">
							<Table head={['Maktab', ...(multi ? ['Tuman'] : []), { label: 'Muhim hodisa', right: true }, { label: 'Lahzalar', right: true }, { label: 'Lavhalar', right: true }, { label: 'AI kamera', right: true }, 'Oxirgisi', '']}>
								{schools.map(s => (
									<Tr key={s._id} className={school?._id === s._id ? 'bg-blue-50/50' : ''}>
										<Td><button onClick={() => setSchool(school?._id === s._id ? null : { _id: s._id, name: s.name })} className="text-left font-medium text-slate-900 hover:text-blue-600">{s.name}</button></Td>
										{multi && <Td className="text-slate-500">{s.district || '—'}</Td>}
										<Td right>{s.alerts > 0 ? <b className="text-red-600">{s.alerts}</b> : <span className="text-slate-400">0</span>}</Td>
										<Td right>{s.total}</Td>
										<Td right>{s.clips}</Td>
										<Td right>{s.cameras ? <span className={s.online < s.cameras ? 'font-semibold text-amber-600' : 'text-slate-700'}>{s.online}/{s.cameras}</span> : <span className="text-slate-300">{tx("yoqilmagan")}</span>}</Td>
										<Td className="whitespace-nowrap text-xs text-slate-500">{ago(s.last)}</Td>
										<Td right><Link to={`/monitor/schools/${s._id}`} className="text-xs font-medium text-blue-600 hover:underline">{tx("Maktab →")}</Link></Td>
									</Tr>
								))}
								{schools.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">{tx("Maktab topilmadi")}</td></tr>}
							</Table>
						</Panel>
					</>
				)}

				<div id="ai-gallery" className="scroll-mt-4" />
				<Panel title={tx("Kadrlar va qisqa lavhalar")} action={
					<div className="flex flex-wrap items-center gap-2">
						{district && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{district}<button onClick={() => { setDistrict(''); setSchool(null) }}><FiX size={12} /></button></span>}
						{school && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">{school.name}<button onClick={() => setSchool(null)}><FiX size={12} /></button></span>}
						<div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">{GROUPS.map(([k, l]) => <button key={k} onClick={() => setGroup(k)} className={`rounded-lg px-3 py-1.5 ${group === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}{evidence.data?.byKind && k === 'alerts' ? ` (${ALERT_KINDS.reduce((a, x) => a + (evidence.data.byKind[x] || 0), 0)})` : ''}</button>)}</div>
					</div>
				}>
					<LoadState loading={evidence.loading && !evidence.data} error={evidence.error}>
						{evidence.data && (
							<>
								<EvidenceGallery items={evidence.data.items} empty={tx("Tanlangan filtr bo'yicha hodisa topilmadi")} cols="grid-cols-2 md:grid-cols-3 xl:grid-cols-6" />
								{evidence.data.pages > 1 && (
									<div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-500">
										<span>{tx("{{n}} ta hodisa · {{p}}/{{pp}}-sahifa", { n: fmt(evidence.data.total), p: evidence.data.page, pp: evidence.data.pages })}</span>
										<div className="flex gap-2">
											<button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"><FiChevronLeft size={14} /> {tx("Oldingi")}</button>
											<button disabled={page >= evidence.data.pages} onClick={() => setPage(p => p + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">{tx("Keyingi")} <FiChevronRight size={14} /></button>
										</div>
									</div>
								)}
							</>
						)}
					</LoadState>
				</Panel>
			</LoadState>
		</Page>
	)
}

export default MonitorAI
