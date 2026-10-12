import { useState } from 'react'
import { uploadUrl } from '../utils/uploadUrl'

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-12 w-12 text-sm', lg: 'h-20 w-20 text-xl' }

// Shaxs rasmi (doira): `photo` — uploads ichidagi fayl nomi yoki to'liq manzil, `src` — tayyor manzil.
// Rasm bo'lmasa yoki yuklanmasa ismning bosh harfi ko'rsatiladi
const PersonPhotoPreview = ({ photo, src, name = '', alt, size = 'md', className = '' }) => {
	const [broken, setBroken] = useState(false)
	const url = src || (photo ? (/^(https?:|blob:|data:)/.test(photo) ? photo : `${uploadUrl(String(photo).replace(/^\/?uploads\//, ''))}`) : null)
	const box = `${SIZES[size] || SIZES.md} ${className}`
	return (
		<span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 font-semibold text-slate-600 ${box}`}>
			{url && !broken ? <img src={url} alt={alt ?? name} loading="lazy" onError={() => setBroken(true)} className="h-full w-full object-cover" /> : (String(name).trim().charAt(0).toUpperCase() || '?')}
		</span>
	)
}

export default PersonPhotoPreview
