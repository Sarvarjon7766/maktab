import { tx } from '../../i18n'
import { useEffect, useMemo, useState } from 'react'
import { FaChalkboardTeacher, FaClock, FaSchool, FaUserGraduate, FaVideo } from 'react-icons/fa'
import { FiAlertTriangle, FiArrowLeft, FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi'
import { Link, useParams } from 'react-router-dom'
import { EvidenceGallery } from '../../components/EvidenceViewer'
import { Badge, DateField, KpiLink, LoadState, Page, Panel, PersonLink, Progress, Table, Td, Tr, fmt, levelText, shiftDate, todayStr, useMonitorData, pctFmt } from './monitorKit'

const TABS = [['schools', 'Maktablar'], ['staff', 'Xodimlar'], ['students', "O'quvchilar"], ['late', 'Kech qolganlar'], ['risk', 'Xavf guruhi'], ['ai', 'Aqlli kuzatuv (AI)']]
const STATUS = { inside: ['Maktabda', 'bg-green-50 text-green-700'], out: ['Chiqib ketgan', 'bg-sky-50 text-sky-700'], absent: ['Kelmagan', 'bg-red-50 text-red-700'] }
const STATUS_FILTERS = [['', 'Hammasi'], ['came', 'Kelgan'], ['absent', 'Kelmagan'], ['late', 'Kech qolgan']]

// Maktablar jadvali: tuman maktablari bugungi holat bilan; maktabni bossangiz maktab sahifasi ochiladi
const SchoolsTab = ({ district, date }) => {
	const { data, loading, error } = useMonitorData('overview', { date, district }, { auto: date === todayStr() })
	const ai = useMonitorData('ai', { date, district }, { auto: true })
	const aiBy = useMemo(() => new Map((ai.data?.schools || []).map(s => [String(s._id), s])), [ai.data])
	const rows = data?.schools || []
	return (
		<LoadState loading={loading && !data} error={error}>
			<Table head={['Maktab', "O'quvchilar", 'Xodimlar', { label: 'Kech qolgan', right: true }, { label: 'Kameralar', right: true }, { label: 'AI hodisa', right: true }, 'Holat']}>
				{rows.map(s => {
					const a = aiBy.get(String(s._id))
					return (
						<Tr key={s._id}>
							<Td><Link to={`/monitor/schools/${s._id}`} className="font-medium text-gray-900 hover:text-blue-600">{s.name}</Link><p className="text-xs text-gray-500">{s.code}</p></Td>
							<Td><Progress present={s.stats.studentCame} total={s.stats.studentTotal} /></Td>
							<Td><Progress present={s.stats.staffCame} total={s.stats.staffTotal} /></Td>
							<Td right className="whitespace-nowrap">{tx("{{a}} o'q. · {{b}} xod.", { a: fmt(s.stats.studentLate), b: fmt(s.stats.staffLate) })}</Td>
							<Td right className="whitespace-nowrap">{s.stats.cameraTotal ? <span className={s.stats.cameraOffline ? 'font-medium text-red-600' : 'text-gray-700'}>{s.stats.cameraOnline}/{s.stats.cameraTotal}</span> : <span className="text-gray-300">yo'q</span>}</Td>
							<Td right>{a?.alerts ? <b className="text-red-600">{a.alerts}</b> : <span className="text-gray-300">0</span>}</Td>
							<Td><Badge ok={s.isActive} /></Td>
						</Tr>
					)
				})}
				{rows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Bu tumanda maktab topilmadi</td></tr>}
			</Table>
		</LoadState>
	)
}

// Xodimlar yoki o'quvchilar: tuman bo'yicha ro'yxat (holat, kirish/chiqish vaqti). Odamni bossangiz uning sahifasi ochiladi
const PeopleTab = ({ kind, district, date }) => {
	const [status, setStatus] = useState('')
	const [q, setQ] = useState('')
	const [page, setPage] = useState(1)
	const [school, setSchool] = useState('')
	useEffect(() => { setPage(1) }, [status, q, school, date])
	const { data, loading, error } = useMonitorData('people-all', { kind, date, district, status, q, page, limit: 30, schoolId: school }, { auto: date === todayStr() })
	const s = data?.summary
	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">{STATUS_FILTERS.map(([k, l]) => <button key={k} onClick={() => setStatus(k)} className={`rounded-lg px-3 py-1.5 ${status === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}{s && k === '' ? ` ${fmt(s.total)}` : s && k === 'came' ? ` ${fmt(s.came)}` : s && k === 'absent' ? ` ${fmt(s.absent)}` : s && k === 'late' ? ` ${fmt(s.late)}` : ''}</button>)}</div>
				<select value={school} onChange={e => setSchool(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-black outline-none"><option value="">Barcha maktablar</option>{(data?.bySchool || []).map(b => <option key={b.schoolId} value={b.schoolId}>{b.schoolName} ({b.n})</option>)}</select>
				<div className="relative ml-auto"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'staff' ? 'Xodim ismi yoki lavozimi' : "O'quvchi ismi"} className="w-60 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm text-black outline-none focus:border-blue-400" /></div>
			</div>
			<LoadState loading={loading && !data} error={error}>
				<Table head={[kind === 'staff' ? 'Xodim' : "O'quvchi", 'Maktab', kind === 'staff' ? 'Lavozim' : 'Sinf', 'Holat', 'Kirish', 'Chiqish']}>
					{(data?.people || []).map(p => {
						const [label, cls] = STATUS[p.status] || STATUS.absent
						return (
							<Tr key={p._id}>
								<Td><PersonLink kind={kind} id={p._id} name={p.fullName} photo={p.photo} /></Td>
								<Td className="text-gray-600">{p.schoolName}</Td>
								<Td className="text-gray-600">{kind === 'staff' ? p.position || '—' : p.sinf || '—'}</Td>
								<Td><span className="flex items-center gap-1.5"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>{p.late && <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Kech</span>}</span></Td>
								<Td className="font-mono text-xs text-gray-600">{p.firstIn || '—'}</Td>
								<Td className="font-mono text-xs text-gray-600">{p.lastOut || '—'}</Td>
							</Tr>
						)
					})}
					{data && data.people.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Hech kim topilmadi</td></tr>}
				</Table>
				{data && data.pages > 1 && (
					<div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>{tx("{{n}} ta · {{p}}/{{pages}}", { n: fmt(data.total), p: data.page, pages: data.pages })}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"><FiChevronLeft size={14} /> Oldingi</button><button disabled={page >= data.pages} onClick={() => setPage(p => p + 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">Keyingi <FiChevronRight size={14} /></button></div></div>
				)}
			</LoadState>
		</div>
	)
}

// Kech qoluvchilar (o'quvchi va xodim) va xavf guruhi: davr bo'yicha
const LateTab = ({ district, range }) => {
	const [kind, setKind] = useState('student')
	const { data, loading, error } = useMonitorData('late-people', { kind, ...range, district, limit: 50 }, { auto: false })
	return (
		<div>
			<div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">{[['student', "O'quvchilar"], ['staff', 'Xodimlar']].map(([k, l]) => <button key={k} onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 ${kind === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>)}</div>
			<LoadState loading={loading && !data} error={error}>
				<Table head={[kind === 'staff' ? 'Xodim' : "O'quvchi", 'Maktab', kind === 'staff' ? 'Lavozim' : 'Sinf', { label: 'Kech qolgan kunlar', right: true }, { label: 'Kech %', right: true }, { label: 'Eng kech', right: true }]}>
					{(data?.people || []).map(p => (
						<Tr key={p._id}>
							<Td><PersonLink kind={kind} id={p._id} name={p.fullName} photo={p.photo} /></Td>
							<Td className="text-gray-600">{p.schoolName}</Td>
							<Td className="text-gray-600">{kind === 'staff' ? p.position || '—' : p.sinf || '—'}</Td>
							<Td right><b className="text-orange-600">{p.lateDays}</b> <span className="text-xs text-gray-400">/ {p.days}</span></Td>
							<Td right>{pctFmt(p.percent)}</Td>
							<Td right className="font-mono text-xs">{p.worst}</Td>
						</Tr>
					))}
					{data && data.people.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Tanlangan davrda kech qolgan odam yo'q</td></tr>}
				</Table>
			</LoadState>
		</div>
	)
}

const RiskTab = ({ district, range }) => {
	const { data, loading, error } = useMonitorData('at-risk', { ...range, district, limit: 80 }, { auto: false })
	return (
		<LoadState loading={loading && !data} error={error}>
			<Table head={["O'quvchi", 'Maktab', 'Sinf', { label: tx("Ketma-ket kelmagan"), right: true }, { label: 'Davomat', right: true }, { label: 'Oxirgi kelgan', right: true }]}>
				{(data?.students || []).map(s => (
					<Tr key={s._id}>
						<Td><PersonLink kind="student" id={s._id} name={s.fullName} photo={s.photo} /></Td>
						<Td className="text-gray-600">{s.schoolName}</Td>
						<Td className="text-gray-600">{s.sinf || '—'}</Td>
						<Td right><b className="text-red-600">{s.streak}</b> <span className="text-xs text-gray-400">kun</span></Td>
						<Td right><b className={levelText(s.percent)}>{pctFmt(s.percent)}</b> <span className="text-xs text-gray-400">({s.present}/{s.schoolDays})</span></Td>
						<Td right className="text-xs text-gray-500">{s.lastPresent || '—'}</Td>
					</Tr>
				))}
				{data && data.students.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-500">Xavf guruhidagi o'quvchi yo'q</td></tr>}
			</Table>
		</LoadState>
	)
}

const AiTab = ({ district, date }) => {
	const [group, setGroup] = useState('all')
	const [page, setPage] = useState(1)
	useEffect(() => { setPage(1) }, [group])
	const ev = useMonitorData('ai-evidence', { date, district, group, page }, { auto: false })
	return (
		<div>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">{[['all', 'Hammasi'], ['alerts', 'Muhim hodisalar'], ['samples', 'Namunalar'], ['clips', 'Qisqa lavhalar']].map(([k, l]) => <button key={k} onClick={() => setGroup(k)} className={`rounded-lg px-3 py-1.5 ${group === k ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>)}</div>
				<Link to="/monitor/ai" className="ml-auto text-sm font-medium text-blue-600 hover:underline">Viloyat AI sahifasi →</Link>
			</div>
			<LoadState loading={ev.loading && !ev.data} error={ev.error}>
				{ev.data && (
					<>
						<EvidenceGallery items={ev.data.items} empty="Bu tumanda hodisa topilmadi" />
						{ev.data.pages > 1 && <div className="mt-4 flex items-center justify-between text-sm text-slate-500"><span>{tx("{{n}} ta · {{p}}/{{pages}}", { n: fmt(ev.data.total), p: ev.data.page, pages: ev.data.pages })}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Oldingi</button><button disabled={page >= ev.data.pages} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Keyingi</button></div></div>}
					</>
				)}
			</LoadState>
		</div>
	)
}

// Tuman sahifasi: tumanning hamma ma'lumoti bir joyda. Viloyat → tuman → maktab → xodim/o'quvchi zanjirining ikkinchi qadami
// Bo'sh massiv har renderda yangi bo'lib effekt/useMemo'ni qayta ishga tushirmasligi uchun
const EMPTY = []

const MonitorDistrictHub = () => {
	const district = decodeURIComponent(useParams().name || '')
	const [tab, setTab] = useState('schools')
	const [date, setDate] = useState(todayStr())
	const range = useMemo(() => ({ from: shiftDate(todayStr(), -29), to: todayStr() }), [])
	const ov = useMonitorData('overview', { date, district }, { auto: date === todayStr() })
	const schools = ov.data?.schools || EMPTY
	const t = useMemo(() => schools.reduce((a, s) => ({
		students: a.students + s.stats.studentTotal, studentCame: a.studentCame + s.stats.studentCame, staff: a.staff + s.stats.staffTotal, staffCame: a.staffCame + s.stats.staffCame,
		late: a.late + s.stats.studentLate + s.stats.staffLate, cams: a.cams + s.stats.cameraTotal, camsOnline: a.camsOnline + s.stats.cameraOnline
	}), { students: 0, studentCame: 0, staff: 0, staffCame: 0, late: 0, cams: 0, camsOnline: 0 }), [schools])
	const sp = t.students ? Math.round((t.studentCame / t.students) * 1000) / 10 : null

	return (
		<Page>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div>
					<Link to="/monitor/districts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600"><FiArrowLeft size={14} /> Tumanlar</Link>
					<h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{district} <span className="text-base font-medium text-slate-400">tumani</span></h1>
				</div>
				<div className="flex flex-wrap items-center gap-2"><DateField value={date} max={todayStr()} onChange={setDate} /><Link to={`/monitor/cameras?district=${encodeURIComponent(district)}`} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Kameralar (papkalar)</Link><Link to="/monitor/map" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Xarita</Link></div>
			</div>

			<LoadState loading={ov.loading && !ov.data} error={ov.error}>
				<div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
					<KpiLink onClick={() => setTab('schools')} icon={<FaSchool />} label="Maktablar" value={schools.length} detail={tx("{{n}} tasi faol", { n: schools.filter(s => s.isActive).length })} />
					<KpiLink onClick={() => setTab('students')} icon={<FaUserGraduate />} color="bg-amber-50 text-amber-600" label="Kelgan o'quvchilar" value={`${sp ?? '—'}${sp !== null ? '%' : ''}`} detail={`${fmt(t.studentCame)} / ${fmt(t.students)}`} />
					<KpiLink onClick={() => setTab('staff')} icon={<FaChalkboardTeacher />} color="bg-violet-50 text-violet-600" label="Kelgan xodimlar" value={t.staff ? `${Math.round((t.staffCame / t.staff) * 1000) / 10}%` : '—'} detail={`${fmt(t.staffCame)} / ${fmt(t.staff)}`} />
					<KpiLink onClick={() => setTab('late')} icon={<FaClock />} color="bg-orange-50 text-orange-600" label="Kech qolganlar" value={t.late} detail="o'quvchi va xodim" />
					<KpiLink to={`/monitor/cameras?district=${encodeURIComponent(district)}`} icon={<FaVideo />} color="bg-green-50 text-green-600" label="Kameralar online" value={`${fmt(t.camsOnline)}/${fmt(t.cams)}`} detail={t.cams && t.camsOnline < t.cams ? <span className="inline-flex items-center gap-1 text-amber-600"><FiAlertTriangle size={11} /> {tx("{{n}} tasi offline", { n: t.cams - t.camsOnline })}</span> : 'hammasi ishlayapti'} />
				</div>

				<div className="mb-4 flex flex-wrap gap-1.5">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-2 text-sm transition ${tab === k ? 'bg-slate-900 font-medium text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{l}</button>)}</div>

				<Panel title={TABS.find(x => x[0] === tab)[1]}>
					{tab === 'schools' && <SchoolsTab district={district} date={date} />}
					{tab === 'staff' && <PeopleTab kind="staff" district={district} date={date} />}
					{tab === 'students' && <PeopleTab kind="student" district={district} date={date} />}
					{tab === 'late' && <LateTab district={district} range={range} />}
					{tab === 'risk' && <RiskTab district={district} range={range} />}
					{tab === 'ai' && <AiTab district={district} date={date} />}
				</Panel>
			</LoadState>
		</Page>
	)
}

export default MonitorDistrictHub
