import { useEffect, useMemo, useRef, useState } from 'react'
import { FiCheck, FiChevronDown, FiSearch } from 'react-icons/fi'
import { FaFilter } from 'react-icons/fa'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')

// Qidiruvli filtr ro'yxati: bosilganda ochiladi, ichida qidiruv maydoni (variantlar ko'p bo'lsa), ↑ ↓ Enter Esc.
// options: [{ value, label }]. Variantlar soni `searchFrom` dan kam bo'lsa qidiruv maydoni ko'rsatilmaydi (masalan holat filtri)
const SearchableSelect = ({ value, onChange, options, searchFrom = 5, searchPlaceholder = 'Qidirish...', className = 'min-w-[150px] max-w-[200px]', icon = true, variant = 'filled', placeholder = '—' }) => {
	const [open, setOpen] = useState(false)
	const [q, setQ] = useState('')
	const [active, setActive] = useState(0)
	const boxRef = useRef(null)
	const inputRef = useRef(null)
	const selected = options.find(o => String(o.value) === String(value))
	const searchable = options.length >= searchFrom

	const list = useMemo(() => {
		const t = norm(q.trim())
		return t ? options.filter(o => norm(o.label).includes(t)) : options
	}, [options, q])

	useEffect(() => {
		const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [])
	useEffect(() => { if (open && searchable) inputRef.current?.focus() }, [open, searchable])
	useEffect(() => { setActive(0) }, [q, open])

	const pick = (o) => { onChange(String(o.value)); setOpen(false); setQ('') }
	const onKey = (e) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, list.length - 1)) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
		else if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]) }
		else if (e.key === 'Escape') { setOpen(false) }
	}

	return (
		<div ref={boxRef} className={`relative ${className}`} onKeyDown={onKey}>
			<button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
				className={`flex w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-gray-800 transition ${variant === 'outline' ? 'border border-gray-200 bg-white py-2.5 hover:border-blue-300' : 'bg-gray-100 py-2 hover:bg-gray-200'} ${open ? 'ring-2 ring-blue-500' : ''}`}>
				{icon && <FaFilter className="shrink-0 text-gray-400" size={13} />}
				<span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
				<FiChevronDown className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} size={14} />
			</button>
			{open && (
				<div className="absolute left-0 z-50 mt-1.5 min-w-full w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
					{searchable && (
						<div className="relative border-b border-gray-100 p-2">
							<FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
							<input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={searchPlaceholder}
								className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm text-black outline-none focus:border-blue-400" />
						</div>
					)}
					<ul role="listbox" className="max-h-64 overflow-y-auto py-1">
						{list.map((o, i) => {
							const on = String(o.value) === String(value)
							return (
								<li key={o.value} role="option" aria-selected={on}>
									<button type="button" onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
										className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${active === i ? 'bg-blue-50' : ''} ${on ? 'font-semibold text-blue-700' : 'text-gray-700'}`}>
										<span className="truncate">{o.label}</span>{on && <FiCheck className="shrink-0" size={14} />}
									</button>
								</li>
							)
						})}
						{list.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">Topilmadi</li>}
					</ul>
				</div>
			)}
		</div>
	)
}

export default SearchableSelect

