import { FiActivity, FiBookOpen, FiChevronRight, FiGrid, FiUser, FiUsers, FiVideo } from 'react-icons/fi'
import { Link } from 'react-router-dom'

// Sinf holati omillari (dars holati, davomat, to'lish, faollik, kameralar): belgi, rangli holat,
// chiziqli ko'rsatkich va faollik uchun zonali shkala + mini-grafik
const ICONS = { lesson: FiBookOpen, attendance: FiUsers, density: FiGrid, activity: FiActivity, cameras: FiVideo, teacher: FiUser }
const TONES = {
	good: { text: 'text-green-700', bar: 'bg-green-500', chip: 'bg-green-50 text-green-600' },
	mid: { text: 'text-amber-700', bar: 'bg-amber-500', chip: 'bg-amber-50 text-amber-600' },
	bad: { text: 'text-red-700', bar: 'bg-red-500', chip: 'bg-red-50 text-red-600' },
	unknown: { text: 'text-slate-600', bar: 'bg-slate-400', chip: 'bg-slate-100 text-slate-500' }
}

// Oddiy chiziqli ko'rsatkich; zones berilsa — rangli zonalar ([20, 40] = yashil / sariq / qizil) va marker
const Meter = ({ meter, tone }) => {
	const pct = Math.max(0, Math.min(100, meter.pct))
	if (meter.zones) {
		const [a, b] = meter.zones
		return (
			<div className="relative h-2 rounded-full overflow-hidden flex bg-gray-100" title={`${pct}%`}>
				<div className="bg-green-200" style={{ width: `${a}%` }} />
				<div className="bg-amber-200" style={{ width: `${b - a}%` }} />
				<div className="bg-red-200 flex-1" />
				<span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-slate-700 shadow" style={{ left: `${Math.max(2, Math.min(98, pct))}%` }} />
			</div>
		)
	}
	return (
		<div className="h-2 rounded-full bg-gray-100 overflow-hidden" title={`${pct}%`}>
			<div className={`h-full rounded-full ${meter.over ? 'bg-red-500' : TONES[tone].bar}`} style={{ width: `${pct}%` }} />
		</div>
	)
}

// Mini-grafik: so'nggi qiymatlar (%), ustun balandligi qiymatga qarab, rangi zonaga qarab
const Spark = ({ values }) => {
	if (!values?.length) return null
	const max = Math.max(40, ...values)
	return (
		<div className="flex items-end gap-0.5 h-6 shrink-0" title={`So'nggi o'lchovlar: ${values.join('%, ')}%`}>
			{values.map((v, i) => <span key={i} className={`w-1.5 rounded-sm ${v < 20 ? 'bg-green-400' : v < 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ height: `${Math.max(12, Math.round(v / max * 100))}%` }} />)}
		</div>
	)
}

// links: { omil kaliti: sahifa yo'li } — berilgan omil bosiladigan bo'ladi va tegishli sahifaga olib boradi
const FactorList = ({ factors, compact = false, links = {} }) => (
	<ul className={compact ? 'space-y-3' : 'space-y-3.5'}>
		{factors.map(f => {
			const Icon = ICONS[f.icon] || FiActivity
			const t = TONES[f.status] || TONES.unknown
			const to = links[f.key]
			const Row = to ? Link : 'div'
			return (
				<li key={f.key}>
				<Row {...(to ? { to, title: "Batafsil ko'rish" } : {})} className={`flex items-start gap-3 ${to ? 'group rounded-xl -mx-2 px-2 py-1 hover:bg-slate-50 transition' : ''}`}>
					<span className={`mt-0.5 w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${t.chip}`}><Icon size={15} /></span>
					<div className="min-w-0 flex-1">
						<div className="flex items-baseline justify-between gap-3">
							<span className="text-sm text-gray-600">{f.label}</span>
							<span className={`text-sm font-semibold text-right ${t.text}`}>{f.value}</span>
						</div>
						{(f.meter || f.spark?.length > 1) && (
							<div className="flex items-center gap-3 mt-1.5">
								<div className="flex-1">{f.meter && <Meter meter={f.meter} tone={f.status} />}</div>
								{f.spark?.length > 1 && <Spark values={f.spark} />}
							</div>
						)}
						<p className="text-xs text-gray-400 mt-1 leading-snug">{f.note}</p>
					</div>
					{to && <FiChevronRight className="mt-2 shrink-0 text-slate-300 group-hover:text-blue-500 transition" size={16} />}
				</Row>
				</li>
			)
		})}
	</ul>
)

export default FactorList
