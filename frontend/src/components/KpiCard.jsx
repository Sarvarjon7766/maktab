// Butun admin panelda takrorlanadigan statistika-kartochka: ikon-nishon,
// "qiymat / jami" formati, "Jarayon" progress-bar. AdminHome.jsx va
// UserAttandance.jsx bir xil uslubda ishlatadi — bittasi o'zgarsa,
// ikkalasi ham izchil qoladi.
import { useNavigate } from 'react-router-dom'

const TONE_STYLES = {
	good:     { badge: 'bg-green-500', bar: 'bg-green-500', text: 'text-green-600', ring: 'ring-green-200 border-green-400' },
	rose:     { badge: 'bg-rose-500',  bar: 'bg-rose-500',  text: 'text-rose-600',  ring: 'ring-rose-200 border-rose-400' },
	warning:  { badge: 'bg-amber-500', bar: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-200 border-amber-400' },
	critical: { badge: 'bg-red-500',   bar: 'bg-red-500',   text: 'text-red-600',   ring: 'ring-red-200 border-red-400' },
	blue:     { badge: 'bg-blue-500',  bar: 'bg-blue-500',  text: 'text-blue-600',  ring: 'ring-blue-200 border-blue-400' },
}

const KpiCard = ({ icon, label, value, total, tone = 'blue', onClick, to, active = false, compact = false }) => {
	const navigate = useNavigate()
	const t = TONE_STYLES[tone] || TONE_STYLES.blue
	const hasTotal = total !== undefined && total !== null
	const pct = hasTotal && total > 0 ? Math.round((value / total) * 100) : 0
	const interactive = typeof onClick === 'function' || !!to
	// `to` berilsa kartochka klaviatura bilan ham ishlaydi (Enter/Space), aks holda eski onClick xatti-harakati
	const handle = () => { if (typeof onClick === 'function') onClick(); else if (to) navigate(to) }
	const a11y = interactive ? { role: 'button', tabIndex: 0, onClick: handle, onKeyDown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); handle() } } } : {}

	// Ixcham variant: bitta qatorda ikon+label+qiymat+foiz, progress-bar
	// yo'q. Balandlik muhim bo'lgan joylarda (masalan h-screen ichida,
	// pastda jadval/ro'yxat uchun joy qoldirish kerak bo'lganda) ishlatiladi.
	if (compact) {
		return (
			<div
				{...a11y}
				className={`bg-white rounded-xl border shadow-sm p-2.5 sm:p-3 transition-all
					${interactive ? 'cursor-pointer hover:shadow-md' : ''}
					${active ? `ring-2 ${t.ring}` : 'border-gray-100'}`}
			>
				<div className="flex items-center gap-2 sm:gap-2.5">
					<div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white shrink-0 ${t.badge}`}>
						{icon}
					</div>
					<div className="min-w-0 flex-1">
						<p className="text-[11px] sm:text-xs font-medium text-gray-500 truncate leading-tight">{label}</p>
						<p className="text-base sm:text-lg font-bold text-gray-900 leading-tight truncate">
							{value}
							{hasTotal && <span className="text-xs font-normal text-gray-400"> / {total}</span>}
						</p>
					</div>
					{hasTotal && (
						<span className={`text-xs font-semibold shrink-0 ${t.text}`}>{pct}%</span>
					)}
				</div>
			</div>
		)
	}

	return (
		<div
			{...a11y}
			className={`bg-white rounded-2xl border shadow-sm p-4 sm:p-5 transition-all
				${interactive ? 'cursor-pointer hover:shadow-md' : ''}
				${active ? `ring-2 ${t.ring}` : 'border-gray-100'}`}
		>
			<div className="flex items-start justify-between mb-3 sm:mb-4">
				<p className="text-xs sm:text-sm font-medium text-gray-500 truncate">{label}</p>
				<div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white shrink-0 ${t.badge}`}>
					{icon}
				</div>
			</div>
			<p className="text-2xl sm:text-3xl font-semibold text-gray-900 leading-none">
				{value}
				{hasTotal && <span className="text-base sm:text-lg font-normal text-gray-400"> / {total}</span>}
			</p>
			{hasTotal && (
				<>
					<div className="flex items-center justify-between mt-3 sm:mt-4 mb-1.5 text-xs">
						<span className="text-gray-400">Jarayon</span>
						<span className="font-medium text-gray-600">{pct}%</span>
					</div>
					<div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
						<div className={`h-full rounded-full ${t.bar}`} style={{ width: `${pct}%` }} />
					</div>
				</>
			)}
		</div>
	)
}

export default KpiCard

