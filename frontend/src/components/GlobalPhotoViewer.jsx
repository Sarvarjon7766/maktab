import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiX } from 'react-icons/fi'
import { tx } from '../i18n'

// Butun ilova bo'yicha rasmni kattalashtirish: `data-zoomable` belgisi qo'yilgan <img> bosilsa to'liq ekranda ochiladi
// (Esc yoki fonni bosish bilan yopiladi). Alohida `PhotoLightbox` ishlatadigan joylarga ta'sir qilmaydi.
const GlobalPhotoViewer = () => {
	const [src, setSrc] = useState(null)

	useEffect(() => {
		const onClick = (e) => {
			const img = e.target instanceof Element ? e.target.closest('img[data-zoomable]') : null
			if (img && img.src) setSrc(img.src)
		}
		const onKey = (e) => { if (e.key === 'Escape') setSrc(null) }
		document.addEventListener('click', onClick)
		window.addEventListener('keydown', onKey)
		return () => { document.removeEventListener('click', onClick); window.removeEventListener('keydown', onKey) }
	}, [])

	if (!src) return null
	return createPortal(
		<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" onClick={() => setSrc(null)}>
			<button type="button" onClick={() => setSrc(null)} aria-label={tx("Yopish")} className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"><FiX size={22} /></button>
			<img src={src} alt="" onClick={e => e.stopPropagation()} className="max-h-[92vh] max-w-[94vw] rounded-xl object-contain shadow-2xl" />
		</div>,
		document.body
	)
}

export default GlobalPhotoViewer
