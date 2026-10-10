import { useState } from 'react'
import { FiArrowLeft, FiDownload, FiPhone } from 'react-icons/fi'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LoadState, Page, RangePicker, WEEKDAYS, exportXlsx, levelText, shiftDate, todayStr, useMonitorData, usePanel, ExcuseChip, pctFmt } from './monitorKit'

const initials = (name) => (name || '?').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase()
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const fmtMin = (v) => `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`

const DAY_STYLE = {
	present: 'bg-green-500 text-white',
	late: 'bg-orange-400 text-white',
	absent: 'bg-red-400 text-white',
	excused: 'bg-sky-400 text-white',
	off: 'bg-gray-100 text-gray-400'
}

const Stat = ({ label, value, tone = 'text-gray-900' }) => (
	<div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4"><p className={`text-2xl font-bold ${tone}`}>{value}</p><p className="text-sm text-gray-500 mt-0.5">{label}</p></div>
)


const STATUS = {
	present: ['Vaqtida kelgan', 'bg-green-50 text-green-700'],
	late: ['Kech qolgan', 'bg-orange-50 text-orange-700'],
	absent: ['Kelmagan', 'bg-red-50 text-red-700'],
	excused: ['Sababli kelmagan', 'bg-sky-50 text-sky-700'],
	off: ['Dam olish kuni', 'bg-gray-100 text-gray-500']
}
const dur = (m) => (m === null || m === undefined ? '—' : m >= 60 ? `${Math.floor(m / 60)} soat ${String(m % 60).padStart(2, '0')} daq` : `${m} daq`)

// Tanlangan kun tafsiloti: kirish-chiqishlar, kamera aniqlashlari, umumiy holat va sinf/maktab bilan solishtirish
const DayDetail = ({ kind, id, date }) => {
	const { data, loading, error } = useMonitorData(`person-day/${kind}/${id}`, { date })
	if (loading && !data) return <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-gray-500 mb-6">Yuklanmoqda...</section>
	if (error || !data) return <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center text-red-600 mb-6">Kun ma'lumotini yuklab bo'lmadi</section>
	const sm = data.summary, [label, chip] = STATUS[data.status]
	const AX0 = 6 * 60, AX1 = 20 * 60
	const pos = (t) => Math.min(100, Math.max(0, ((toMin(t) - AX0) / (AX1 - AX0)) * 100))
	const startPct = pos(data.workStartTime)
	const p = data.peers

	return (
		<section className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 mb-6">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
				<div><h2 className="font-semibold text-gray-900">{data.dateString} · {WEEKDAYS[data.weekday]}</h2><p className="text-xs text-gray-400">Ish boshlanishi: {data.workStartTime}</p></div>
				<span className={`px-3 py-1 rounded-full text-sm font-medium ${chip}`}>{label}{data.status === 'late' ? ` · +${sm.lateBy} daq` : ''}</span>
			</div>

			{data.status === 'off' && <p className="text-sm text-gray-500 py-4">Bu kuni maktabda o'quv mashg'uloti bo'lmagan.</p>}
			{data.status === 'excused' && data.excuse && (
				<div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 text-sm">
					<div className="flex flex-wrap items-center gap-2"><ExcuseChip type={data.excuse.type} /><span className="text-xs text-gray-500">{data.excuse.startDate} → {data.excuse.endDate || 'muddatsiz'}</span></div>
					{data.excuse.comment && <p className="mt-2 text-gray-700">{data.excuse.comment}</p>}
					<p className="mt-2 text-xs text-gray-400">Sababli kunlar davomat foiziga salbiy ta'sir qilmaydi.</p>
				</div>
			)}
			{data.status === 'absent' && <p className="text-sm text-red-600 py-2">Bu kuni kirish qayd etilmagan.{p && p.percent > 0 ? ` ${p.label === 'Sinf' ? 'Sinfdan' : 'Xodimlardan'} ${p.came} / ${p.total} kelgan.` : ''}</p>}

			{(data.status === 'present' || data.status === 'late') && (
				<>
					<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
						{[['Birinchi kirish', sm.firstIn || '—'], ['Oxirgi chiqish', sm.insideNow ? 'Hozir ichkarida' : sm.lastOut || '—'], ['Kirishlar soni', sm.entries], ['Ichkarida bo\'lgan', dur(sm.insideMinutes)], ['Tanaffuslar (tashqarida)', dur(sm.outsideMinutes)], ['Jami vaqt', sm.totalTime || '—']].map(([l, v]) => (
							<div key={l} className="rounded-xl bg-gray-50 px-4 py-3"><p className="text-lg font-bold text-gray-900">{v}</p><p className="text-xs text-gray-500 mt-0.5">{l}</p></div>
						))}
					</div>

					{data.visits.length > 0 && (
						<div className="mb-5">
							<p className="text-xs font-semibold text-gray-500 mb-2">Kun davomida (06:00 – 20:00)</p>
							<div className="relative h-9 rounded-lg bg-gray-100 overflow-hidden">
								<div className="absolute top-0 bottom-0 w-px bg-orange-400 z-10" style={{ left: `${pctFmt(startPct)}` }} title={`Ish boshlanishi ${data.workStartTime}`} />
								{data.visits.filter(v => v.in).map(v => {
									const a = pos(v.in), b = v.out ? pos(v.out) : Math.min(100, a + 1.5)
									return <div key={v.n} title={`${v.in} – ${v.out || 'ichkarida'}`} className={`absolute top-1 bottom-1 rounded-md ${v.out ? 'bg-blue-500' : 'bg-green-500'}`} style={{ left: `${a}%`, width: `${Math.max(b - a, 0.8)}%` }} />
								})}
							</div>
							<div className="flex justify-between text-[10px] text-gray-400 mt-1">{[6, 8, 10, 12, 14, 16, 18, 20].map(h => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}</div>
						</div>
					)}

					<div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
						<div>
							<p className="text-xs font-semibold text-gray-500 mb-2">Kirish va chiqishlar ({data.visits.length})</p>
							<table className="w-full text-sm">
								<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">{['№', 'Kirdi', 'Chiqdi', 'Davomiyligi', 'Izoh'].map(h => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
								<tbody>
									{data.visits.map((v, i) => (
										<tr key={v._id} className="border-b border-gray-50 last:border-0">
											<td className="py-2 pr-3 text-gray-400">{v.n}</td><td className="py-2 pr-3 font-medium text-green-700">{v.in || '—'}</td>
											<td className="py-2 pr-3 font-medium text-orange-700">{v.out || (v.open ? 'ichkarida' : '—')}</td><td className="py-2 pr-3">{dur(v.minutes)}</td>
											<td className="py-2 text-gray-500">{v.comment || (data.visits[i + 1]?.inAt && v.outAt ? `keyingi kirishgacha ${dur(Math.round((new Date(data.visits[i + 1].inAt) - new Date(v.outAt)) / 60000))}` : '')}</td>
										</tr>
									))}
									{data.visits.length === 0 && <tr><td colSpan={5} className="py-3 text-gray-400">Kirish yozuvi yo'q</td></tr>}
								</tbody>
							</table>
						</div>
						<div className="space-y-5">
							{p && (
								<div className="rounded-xl border border-gray-100 p-4">
									<p className="text-xs font-semibold text-gray-500 mb-2">Shu kuni: {p.label}</p>
									<p className="text-sm text-gray-700"><b className="text-gray-900">{p.came} / {p.total}</b> kelgan ({pctFmt(p.percent)}){p.late ? ` · ${p.late} tasi kech qolgan` : ''}</p>
									{p.avgArrival && <p className="text-sm text-gray-700 mt-1">O'rtacha kelish: <b className="text-gray-900">{p.avgArrival}</b>{p.diffMinutes !== null && (p.diffMinutes === 0 ? ' · aynan o\'rtacha' : <span className={p.diffMinutes < 0 ? 'text-green-600' : 'text-orange-600'}> · {Math.abs(p.diffMinutes)} daqiqa {p.diffMinutes < 0 ? 'erta' : 'kech'} kelgan</span>)}</p>}
								</div>
							)}
							<div>
								<p className="text-xs font-semibold text-gray-500 mb-2">Kamera aniqlashlari ({data.faceEvents.length})</p>
								{data.faceEvents.length === 0 ? <p className="text-sm text-gray-400">Bu kuni FaceControl kamerasi orqali aniqlash qayd etilmagan</p> : (
									<table className="w-full text-sm">
										<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b border-gray-100">{['Vaqt', 'Yo\'nalish', 'Kamera', 'O\'xshashlik', 'Davomatga'].map(h => <th key={h} className="py-2 pr-3 font-semibold">{h}</th>)}</tr></thead>
										<tbody>{data.faceEvents.map(e => (
											<tr key={e._id} className="border-b border-gray-50 last:border-0"><td className="py-2 pr-3 font-medium">{e.time}</td><td className="py-2 pr-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.direction === 'in' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>{e.direction === 'in' ? 'Kirish' : 'Chiqish'}</span></td><td className="py-2 pr-3 text-gray-600">{e.camera || '—'}</td><td className="py-2 pr-3">{e.similarity === null ? '—' : `${Math.round(e.similarity)}%`}</td><td className="py-2 text-gray-500">{e.recorded ? 'Yozildi' : e.note || '—'}</td></tr>
										))}</tbody>
									</table>
								)}
							</div>
						</div>
					</div>
				</>
			)}
		</section>
	)
}

// Bitta o'quvchi yoki xodim: shaxsiy ma'lumot va tanlangan davr bo'yicha to'liq davomat statistikasi (faqat o'qish)
const MonitorPerson = () => {
	const { kind, id } = useParams()
	const { scoped } = usePanel()
	const navigate = useNavigate()
	const [range, setRange] = useState({ from: shiftDate(todayStr(), -29), to: todayStr() })
	const { data, loading, error } = useMonitorData(`person/${kind}/${id}`, range)
	const p = data?.person, st = data?.stats
	const days = data?.days || []
	const isStudent = kind === 'student'
	const [picked, setPicked] = useState(null)
	const lastDay = [...days].reverse().find(d => d.status !== 'off')?.dateString || null
	const activeDay = picked && days.some(d => d.dateString === picked) ? picked : lastDay

	const arrival = days.filter(d => d.firstIn).map(d => ({ kun: d.dateString.slice(5), Kelish: toMin(d.firstIn) }))
	const download = () => exportXlsx(`${p.fullName}-${range.from}_${range.to}`, [{
		name: 'Davomat',
		rows: days.filter(d => d.status !== 'off').map(d => ({ Sana: d.dateString, 'Hafta kuni': WEEKDAYS[d.weekday], Holat: d.status === 'present' ? (d.late ? 'Kech qolgan' : 'Kelgan') : d.status === 'excused' ? `Sababli: ${d.excuse.label}` : 'Kelmagan', ...(d.excuse ? { Izoh: d.excuse.comment } : {}), Kelgan: d.firstIn || '', Ketgan: d.lastOut || '', Kirishlar: d.entries, 'Jami vaqt': d.totalTime || '' }))
	}])

	return (
		<Page>
			<div className="flex items-center justify-between gap-3 mb-5">
				<button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"><FiArrowLeft /> Orqaga</button>
				{p && <button onClick={download} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700"><FiDownload size={14} /> Excel</button>}
			</div>

			<LoadState loading={loading && !data} error={error || data?.success === false}>
				{p && <>
					<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center gap-5 mb-6">
						<div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white text-2xl font-bold flex items-center justify-center overflow-hidden shrink-0">
							{p.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${p.photo}`} alt="" className="w-full h-full object-cover" onError={e => { e.currentTarget.style.display = 'none' }} /> : initials(p.fullName)}
						</div>
						<div className="min-w-0 flex-1">
							<h1 className="text-2xl font-semibold text-gray-900">{p.fullName}</h1>
							<div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
								<span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">{isStudent ? "O'quvchi" : 'Xodim'}</span>
								{(isStudent ? p.sinf : p.position) && <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{isStudent ? p.sinf : p.position}</span>}
								{p.code && <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-mono text-xs">ID: {p.code}</span>}
								{!p.isActive && <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 font-medium">Faol emas</span>}
							</div>
							{data.school && !scoped && <Link to={`/monitor/schools/${data.school._id}?tab=${isStudent ? 'students' : 'staff'}`} className="inline-block mt-3 text-sm text-blue-600 hover:underline">{data.school.name}{data.school.district ? ` · ${data.school.district}` : ''}</Link>}
						</div>
						<dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
							{p.phone && <div><dt className="text-gray-400 text-xs">{isStudent ? 'Ota-ona telefoni' : 'Telefon'}</dt><dd className="text-gray-800 flex items-center gap-1.5"><FiPhone size={12} />{p.phone}</dd></div>}
							{p.parentName && <div><dt className="text-gray-400 text-xs">Ota-ona</dt><dd className="text-gray-800">{p.parentName}</dd></div>}
							{p.birthday && <div><dt className="text-gray-400 text-xs">Tug'ilgan sana</dt><dd className="text-gray-800">{new Date(p.birthday).toLocaleDateString('uz-UZ')}</dd></div>}
							{p.gender && <div><dt className="text-gray-400 text-xs">Jinsi</dt><dd className="text-gray-800">{p.gender === 'erkak' ? 'Erkak' : 'Ayol'}</dd></div>}
						</dl>
					</section>

					<div className="mb-5"><RangePicker {...range} onChange={setRange} /></div>

					<div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-3">
						<Stat label="Davomat" value={`${pctFmt(st.percent)}`} tone={levelText(st.percent)} />
						<Stat label="O'quv kunlari" value={st.schoolDays} />
						<Stat label="Kelgan" value={st.present} tone="text-green-600" />
						<Stat label={st.excused ? 'Sababsiz kelmagan' : 'Kelmagan'} value={st.absent} tone="text-red-600" />
						{st.excused > 0 && <Stat label="Sababli" value={st.excused} tone="text-sky-600" />}
						<Stat label="Kech qolgan" value={st.late} tone="text-orange-600" />
						<Stat label="O'rtacha kelish" value={st.avgArrival || '—'} />
						<Stat label="Jami soat" value={st.totalHours} />
					</div>

					{st.excused > 0 && (
						<div className="flex flex-wrap items-center gap-2 mb-6 text-sm text-gray-600"><span>Sababli kunlar:</span>{Object.entries(st.excusedByType || {}).map(([t, n]) => <span key={t} className="inline-flex items-center gap-1.5"><ExcuseChip type={t} /> <b className="text-gray-900">{n} kun</b></span>)}<span className="text-xs text-gray-400">· davomat foizi shu kunlarsiz hisoblangan{st.rawPercent !== undefined ? ` (umumiy hisobda ${pctFmt(st.rawPercent)})` : ''}</span></div>
					)}
					{!(st.excused > 0) && <div className="mb-3" />}

					<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
						<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h2 className="font-semibold text-gray-900 mb-4">Kunlar</h2>
							<p className="text-xs text-gray-400 -mt-2 mb-3">Kunni bossangiz, pastda shu kunning tafsiloti ochiladi</p>
							<div className="flex flex-wrap gap-1.5">
								{days.map(d => {
									const tone = d.status === 'present' ? (d.late ? DAY_STYLE.late : DAY_STYLE.present) : DAY_STYLE[d.status]
									return <button key={d.dateString} onClick={() => setPicked(d.dateString)} title={`${d.dateString} · ${WEEKDAYS[d.weekday]}${d.firstIn ? ` · ${d.firstIn}` : ''}${d.excuse ? ` · ${d.excuse.label}` : ''}`} className={`w-9 h-9 rounded-lg text-[11px] font-medium flex items-center justify-center transition hover:scale-110 ${tone} ${activeDay === d.dateString ? 'ring-2 ring-offset-2 ring-blue-600' : ''}`}>{Number(d.dateString.slice(8))}</button>
								})}
							</div>
							<div className="flex flex-wrap gap-4 mt-4 text-xs text-gray-500">
								{[['bg-green-500', 'Kelgan'], ['bg-orange-400', 'Kech qolgan'], ['bg-red-400', 'Kelmagan'], ...(!isStudent ? [['bg-sky-400', 'Sababli']] : []), ['bg-gray-200', 'Dam olish']].map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded ${c}`} />{l}</span>)}
							</div>
						</section>
						<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
							<h2 className="font-semibold text-gray-900 mb-4">Kelish vaqti</h2>
							<div style={{ height: 180 }}>
								<ResponsiveContainer width="100%" height="100%">
									<LineChart data={arrival} margin={{ left: -8, right: 8, top: 4 }}>
										<CartesianGrid strokeDasharray="3 3" vertical={false} />
										<XAxis dataKey="kun" tick={{ fontSize: 11 }} />
										<YAxis domain={['dataMin - 20', 'dataMax + 20']} tickFormatter={fmtMin} tick={{ fontSize: 11 }} width={48} />
										<Tooltip formatter={v => fmtMin(v)} />
										<Line type="monotone" dataKey="Kelish" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
									</LineChart>
								</ResponsiveContainer>
							</div>
						</section>
					</div>

					{activeDay && <DayDetail key={activeDay} kind={kind} id={id} date={activeDay} />}

					<section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
						<div className="overflow-x-auto max-h-[480px]">
							<table className="w-full text-sm">
								<thead className="sticky top-0 bg-white"><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
									{['Sana', 'Kun', 'Holat', 'Kelgan', 'Ketgan', 'Kirishlar', 'Jami vaqt'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
								</tr></thead>
								<tbody>
									{[...days].reverse().filter(d => d.status !== 'off').map(d => (
										<tr key={d.dateString} onClick={() => { setPicked(d.dateString); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-blue-50/40 ${activeDay === d.dateString ? 'bg-blue-50/50' : ''}`}>
											<td className="px-4 py-2.5 whitespace-nowrap">{d.dateString}</td>
											<td className="px-4 py-2.5 text-gray-600">{WEEKDAYS[d.weekday]}</td>
											<td className="px-4 py-2.5">{d.status === 'excused' ? <ExcuseChip type={d.excuse.type} comment={d.excuse.comment} /> : <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${d.status === 'present' ? (d.late ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700') : 'bg-red-50 text-red-700'}`}>{d.status === 'present' ? (d.late ? 'Kech qolgan' : 'Kelgan') : 'Kelmagan'}</span>}</td>
											<td className="px-4 py-2.5">{d.firstIn || '—'}</td><td className="px-4 py-2.5">{d.lastOut || '—'}</td>
											<td className="px-4 py-2.5">{d.entries || '—'}</td><td className="px-4 py-2.5">{d.totalTime || '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				</>}
			</LoadState>
		</Page>
	)
}

export default MonitorPerson
