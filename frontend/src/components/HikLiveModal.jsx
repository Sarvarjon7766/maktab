import { useState } from 'react'
import { FiX } from 'react-icons/fi'
import HikLivePlayer from './HikLivePlayer'

// Bitta kamerani katta oynada ko'rsatadi (tizim egasi va monitor sahifalarida).
// `tokenKey` — localStorage'dagi qaysi token bilan so'rov yuborilishi
const HikLiveModal = ({ camera, onClose, tokenKey = 'token' }) => {
	const [status, setStatus] = useState('loading')

	return (
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
			<div className="w-full max-w-5xl rounded-2xl bg-slate-900 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
				<div className="flex items-center justify-between px-5 py-3 border-b border-white/10 text-white">
					<div className="min-w-0">
						<p className="font-semibold truncate">{camera.name || 'Kamera'}</p>
						<p className="text-xs text-slate-400 truncate">{[camera.areaName, camera.schoolName].filter(Boolean).join(' · ') || 'Hik-Connect'}</p>
					</div>
					<div className="flex items-center gap-3">
						<span className="inline-flex items-center gap-2 text-xs">
							<span className={`w-2 h-2 rounded-full ${status === 'live' ? 'bg-red-500 animate-pulse' : status === 'error' ? 'bg-amber-400' : 'bg-slate-500'}`} />
							{status === 'live' ? 'LIVE' : status === 'error' ? 'Xato' : 'Ulanmoqda...'}
						</span>
						<button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><FiX size={20} /></button>
					</div>
				</div>
				<HikLivePlayer cameraId={camera.id} tokenKey={tokenKey} onStatus={setStatus} />
			</div>
		</div>
	)
}

export default HikLiveModal
