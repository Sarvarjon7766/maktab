import { tx } from '../i18n'
import { POSE_ITEMS } from '../utils/vision'

// Holatlar soni chiplari. `pose` — { seated, standing, backTurned, sideTurned, headDown, raised }; hammasi nol/yo'q bo'lsa hech narsa chiqmaydi
const PoseChips = ({ pose, only = null, className = '' }) => {
	if (!pose) return null
	const items = POSE_ITEMS.filter(([k]) => (!only || only.includes(k)) && Number(pose[k]) > 0)
	if (!items.length) return null
	return (
		<div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
			{items.map(([k, label, tone]) => <span key={k} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>{tx(label)}: {pose[k]}</span>)}
			<span className="text-[10px] text-gray-400">{tx('taxminiy')}</span>
		</div>
	)
}

export default PoseChips
