import { tx } from '../i18n'
// Sinfda hozir bo'lishi kerak o'quvchilar tarkibi (FaceID ma'lumotlari): ro'yxat ichida kimlar sababli, kimlar kelmagan,
// kimlar ketib qolgan va qanchasi sinfda bo'lishi kerak. Kameradagi son shu bilan solishtiriladi.
const SEGMENTS = [
	['excused', 'Sababli kelmagan', 'bg-blue-400'],
	['absent', 'Kelmagan', 'bg-red-400'],
	['left', 'Maktabdan ketgan', 'bg-amber-400'],
	['expected', "Sinfda bo'lishi kerak", 'bg-green-500']
]

// onClick berilsa kartochka bosiladigan bo'ladi (masalan, sinf o'quvchilari ro'yxatiga o'tish)
const ClassBreakdown = ({ breakdown, cameraCount = null, onClick }) => {
	if (!breakdown || !breakdown.roster) return null
	const total = Math.max(1, breakdown.roster)
	const pupils = cameraCount === null || cameraCount === undefined ? null : Math.max(0, cameraCount - (cameraCount > 0 ? 1 : 0))
	return (
		<div {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => { if (e.key === 'Enter') onClick() } } : {})} className={`rounded-xl border border-gray-100 bg-gray-50/70 p-3 ${onClick ? 'cursor-pointer hover:bg-gray-100/70 transition' : ''}`}>
			<div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
				<p className="text-xs font-semibold text-gray-600">{tx("Kutilgan tarkib · ro'yxatda {{n}} o'quvchi", { n: breakdown.roster })}</p>
				{pupils !== null && <p className="text-xs text-gray-500">{tx("Kamerada:")} <b className="text-gray-800">{pupils}</b> {tx("o'quvchi")} <span className="text-gray-400">{tx("(o'qituvchisiz)")}</span></p>}
			</div>
			<div className="relative flex h-3 rounded-full overflow-hidden bg-gray-200">
				{SEGMENTS.map(([key, , tone]) => (breakdown[key] > 0 ? <div key={key} className={tone} style={{ width: `${breakdown[key] / total * 100}%` }} title={`${breakdown[key]}`} /> : null))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
				{SEGMENTS.map(([key, label, tone]) => (
					<span key={key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600"><span className={`w-2 h-2 rounded-full ${tone}`} />{label}: <b className="text-gray-800">{breakdown[key] ?? 0}</b></span>
				))}
			</div>
			{breakdown.basis === 'roster' && <p className="text-[11px] text-amber-600 mt-1.5">{tx("FaceControl bugun hali hech kimni qayd etmagan: kutilgan son ro'yxat va sababli kelmaganlar bo'yicha taxminiy")}</p>}
		</div>
	)
}

export default ClassBreakdown
