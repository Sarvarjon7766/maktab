import { useEffect, useRef, useState } from 'react'
import { FiCheck, FiChevronDown, FiGlobe } from 'react-icons/fi'
import { LANGS, getLang, setLang } from '../i18n'
import { tx } from '../i18n'

// Til tanlash: UZ · ЎЗ · RU · EN. Tanlanganda sahifa tanlangan tilda qayta yuklanadi
const LanguageSwitcher = ({ compact = false, dark = false, className = '' }) => {
	const [open, setOpen] = useState(false)
	const ref = useRef(null)
	const current = LANGS.find(l => l.code === getLang()) || LANGS[0]

	useEffect(() => {
		const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [])

	return (
		<div ref={ref} className={`relative ${className}`}>
			<button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open} title={tx("Til / Language")}
				className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${dark ? 'text-white/90 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}>
				<FiGlobe size={16} />{!compact && <span>{current.short}</span>}<FiChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
			</button>
			{open && (
				<ul role="listbox" className="absolute right-0 z-[70] mt-2 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 text-slate-800 shadow-xl">
					{LANGS.map(l => (
						<li key={l.code} role="option" aria-selected={l.code === current.code}>
							<button type="button" onClick={() => { setOpen(false); setLang(l.code) }} className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-slate-50 ${l.code === current.code ? 'font-semibold text-blue-700' : ''}`}>
								<span><b className="mr-2 inline-block w-6 text-xs text-slate-400">{l.short}</b>{l.label}</span>
								{l.code === current.code && <FiCheck size={14} />}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}

export default LanguageSwitcher
