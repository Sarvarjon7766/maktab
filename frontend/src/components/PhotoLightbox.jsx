import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'

// Rasmni bosganda to'liq ekranda ochadi (Esc yoki fonni bosish bilan yopiladi)
const PhotoLightbox = ({ src, alt = '', className = '', fallback = null }) => {
	const [open, setOpen] = useState(false)
	const [broken, setBroken] = useState(false)
	useEffect(() => {
		if (!open) return
		const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open])
	if (!src || broken) return fallback
	return (
		<>
			<img src={src} alt={alt} className={`${className} cursor-zoom-in`} onClick={() => setOpen(true)} onError={() => setBroken(true)} />
			{open && createPortal(
				<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
					<button type="button" onClick={() => setOpen(false)} aria-label="Yopish" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><FiX size={22} /></button>
					<img src={src} alt={alt} onClick={e => e.stopPropagation()} className="max-h-[92vh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
				</div>,
				document.body
			)}
		</>
	)
}

export default PhotoLightbox
