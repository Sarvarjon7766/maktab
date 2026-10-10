import { useMemo, useState } from 'react'
import { FiAlertOctagon, FiAlertTriangle, FiCheckCircle, FiChevronRight, FiClock, FiInfo, FiTrendingDown, FiUsers, FiVideoOff } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { Chips, DateField, Empty, Page, PageHeader, SchoolLink, todayStr, useMonitorData, matchText, usePanel, SearchBox, SelectBox } from './monitorKit'

const SEV = {
	high: { label: 'Jiddiy', bar: 'bg-red-500', chip: 'bg-red-50 text-red-700', icon: <FiAlertOctagon />, tone: 'text-red-600', ring: 'hover:border-red-200' },
	medium: { label: "O'rtacha", bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700', icon: <FiAlertTriangle />, tone: 'text-amber-600', ring: 'hover:border-amber-200' },
	low: { label: 'Past', bar: 'bg-blue-400', chip: 'bg-blue-50 text-blue-700', icon: <FiInfo />, tone: 'text-blue-600', ring: 'hover:border-blue-200' }
}
const TYPE = {
	'no-data': { label: "Ma'lumot yo'q", icon: <FiAlertOctagon /> },
	'low-students': { label: "O'quvchilar", icon: <FiUsers /> },
	'low-staff': { label: 'Xodimlar', icon: <FiUsers /> },
	drop: { label: 'Pasayish', icon: <FiTrendingDown /> },
	cameras: { label: 'Kameralar', icon: <FiVideoOff /> },
	late: { label: 'Kech qolish', icon: <FiClock /> }
}

// Ogohlantirishlar markazi: kartaning istalgan joyini bossangiz, manba ro'yxati/sahifasi ochiladi
const MonitorAlerts = () => {
	const { base, scoped } = usePanel()
	const navigate = useNavigate()
	const [date, setDate] = useState(todayStr())
	const [sev, setSev] = useState('all')
	const { data, loading, error, reload } = useMonitorData('alerts', { date }, { auto: date === todayStr() })
	const [q, setQ] = useState('')
	const [type, setType] = useState('')
	const [school, setSchool] = useState('')
	const schoolOpts = useMemo(() => { const m = new Map(); (data?.alerts || []).forEach(a => a.schoolId && m.set(String(a.schoolId), a.schoolName)); return [{ value: '', label: 'Barcha maktablar' }, ...[...m].map(([value, label]) => ({ value, label })).sort((a, b) => String(a.label).localeCompare(String(b.label)))] }, [data])
	const list = useMemo(() => (data?.alerts || []).filter(a => (sev === 'all' || a.severity === sev) && (!type || a.type === type) && (!school || String(a.schoolId) === school) && matchText(q, a.title, a.schoolName, a.evidence)), [data, sev, q, type, school])
	const c = data?.counts || { high: 0, medium: 0, low: 0 }

	return (
		<Page>
			<PageHeader onReload={reload} loading={loading}><DateField value={date} max={todayStr()} onChange={setDate} /></PageHeader>

			<div className="grid grid-cols-3 gap-4 mb-5">
				{['high', 'medium', 'low'].map(k => (
					<button key={k} onClick={() => setSev(sev === k ? 'all' : k)} className={`text-left bg-white rounded-2xl border shadow-sm p-5 transition hover:shadow-md ${sev === k ? 'border-slate-900 ring-1 ring-slate-900' : 'border-gray-100'}`}>
						<div className={`flex items-center gap-2 text-sm font-medium ${SEV[k].tone}`}>{SEV[k].icon}{SEV[k].label}</div>
						<p className="text-3xl font-bold text-gray-900 mt-2">{c[k]}</p>
					</button>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-3 mb-4">
				<SearchBox value={q} onChange={setQ} placeholder="Ogohlantirish yoki maktab qidirish..." />
				<SelectBox value={type} onChange={setType} searchPlaceholder="Tur qidirish..." options={[{ value: '', label: 'Barcha turlar' }, ...Object.entries(TYPE).map(([value, t]) => ({ value, label: t.label }))]} />
				{!scoped && <SelectBox value={school} onChange={setSchool} searchPlaceholder="Maktab qidirish..." options={schoolOpts} />}
			</div>
			<div className="mb-5"><Chips value={sev} onChange={setSev} options={[{ key: 'all', label: 'Hammasi', count: (data?.alerts || []).length }, ...['high', 'medium', 'low'].map(k => ({ key: k, label: SEV[k].label, count: c[k] }))]} /></div>

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 mb-4">Ma'lumotni yuklab bo'lmadi</div>}
			{loading && !data ? <Empty text="Yuklanmoqda..." /> : list.length === 0 ? (
				<div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 text-center"><FiCheckCircle className="mx-auto text-green-500 mb-3" size={36} /><p className="text-gray-700 font-medium">{(data?.alerts || []).length ? 'Topilmadi' : "Ogohlantirish yo'q"}</p></div>
			) : (
				<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
					{list.map((a, ai) => {
						const s = SEV[a.severity], t = TYPE[a.type] || { label: 'Ogohlantirish', icon: <FiInfo /> }
						return (
							<article key={`${a.id}-${a.type}-${ai}`} role="link" tabIndex={0} onClick={() => navigate(a.link)} onKeyDown={e => { if (e.key === 'Enter') navigate(a.link) }}
								className={`group cursor-pointer bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${s.ring}`}>
								<div className={`w-1.5 shrink-0 ${s.bar}`} />
								<div className="p-5 flex-1 min-w-0 flex items-start gap-4">
									<div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-lg ${s.chip}`}>{t.icon}</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-start justify-between gap-3">
											<p className="font-semibold text-gray-900 leading-snug">{a.title}</p>
											<span className={`px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${s.chip}`}>{s.label}</span>
										</div>
										<p className="text-sm mt-1"><SchoolLink id={a.schoolId} name={a.schoolName} /></p>
										<p className="mt-3 text-sm text-gray-600 leading-relaxed">{a.evidence}</p>
										<p className="mt-3 text-[11px] uppercase tracking-wide text-gray-400">{t.label}</p>
									</div>
									<FiChevronRight className="shrink-0 mt-3 text-gray-300 transition group-hover:text-blue-500 group-hover:translate-x-0.5" size={20} />
								</div>
							</article>
						)
					})}
				</div>
			)}
		</Page>
	)
}

export default MonitorAlerts
