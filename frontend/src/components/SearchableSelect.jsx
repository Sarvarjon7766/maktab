import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FiCheck, FiChevronDown, FiSearch } from 'react-icons/fi'
import { FaFilter } from 'react-icons/fa'
import { tx } from '../i18n'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')

const MIN_W = 256 // ro'yxat eng kamida shuncha keng (tugma tor bo'lsa ham variantlar sig'sin)
const LIST_H = 256 // variantlar ro'yxatining eng katta balandligi (max-h-64)
const GAP = 6
const Z = 2000 // modal oynalar (z-[100]) va navbarlardan ham yuqorida

// Qidiruvli filtr ro'yxati: bosilganda ochiladi, ichida qidiruv maydoni (variantlar ko'p bo'lsa), ↑ ↓ Enter Esc.
// options: [{ value, label }]. Variantlar soni `searchFrom` dan kam bo'lsa qidiruv maydoni ko'rsatilmaydi (masalan holat filtri)
//
// Ochiladigan ro'yxat sahifa ustida (portal, position: fixed) chiziladi: ota-elementlarda overflow-hidden/clip yoki past z-index
// bo'lsa ham kesilmaydi va jadval sarlavhasi (sticky) ostida qolmaydi. Pastda joy yetmasa tepaga ochiladi.
const SearchableSelect = ({ value, onChange, options, searchFrom = 5, searchPlaceholder = 'Qidirish...', className = 'min-w-[150px] max-w-[200px]', icon = true, variant = 'filled', placeholder = '—' }) => {
	const [open, setOpen] = useState(false)
	const [q, setQ] = useState('')
	const [active, setActive] = useState(0)
	const [pos, setPos] = useState(null)
	const boxRef = useRef(null)
	const btnRef = useRef(null)
	const popRef = useRef(null)
	const inputRef = useRef(null)
	const selected = options.find(o => String(o.value) === String(value))
	const searchable = options.length >= searchFrom

	const list = useMemo(() => {
		const t = norm(q.trim())
		return t ? options.filter(o => norm(o.label).includes(t)) : options
	}, [options, q])

	// Tugma o'lchamiga qarab ro'yxat o'rnini hisoblaydi
	const place = useCallback(() => {
		const el = btnRef.current
		if (!el) return
		const r = el.getBoundingClientRect()
		const vw = window.innerWidth, vh = window.innerHeight
		const width = Math.min(Math.max(r.width, MIN_W), vw - 16)
		const left = Math.max(8, Math.min(r.left, vw - width - 8))
		const need = Math.min(LIST_H + (searchable ? 58 : 0) + 8, 380)
		const below = vh - r.bottom - GAP - 8
		const above = r.top - GAP - 8
		const up = below < need && above > below
		const room = Math.max(120, up ? above : below)
		setPos({ left, width, minWidth: r.width, maxH: Math.min(room, 420), ...(up ? { bottom: vh - r.top + GAP } : { top: r.bottom + GAP }) })
	}, [searchable])

	useLayoutEffect(() => { if (open) place() }, [open, place, list.length])
	useEffect(() => {
		if (!open) return
		const reflow = () => place()
		window.addEventListener('resize', reflow)
		window.addEventListener('scroll', reflow, true) // ichki aylantiriladigan bloklar ham
		return () => { window.removeEventListener('resize', reflow); window.removeEventListener('scroll', reflow, true) }
	}, [open, place])

	useEffect(() => {
		const close = (e) => {
			if (boxRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
			setOpen(false)
		}
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
	}, [])
	useEffect(() => { if (open && searchable) inputRef.current?.focus() }, [open, searchable, pos !== null]) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(() => { setActive(0) }, [q, open])

	const pick = (o) => { onChange(String(o.value)); setOpen(false); setQ('') }
	const onKey = (e) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, list.length - 1)) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
		else if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]) }
		else if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() }
	}

	return (
		<div ref={boxRef} className={`relative ${className}`} onKeyDown={onKey}>
			<button ref={btnRef} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
				className={`flex w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-gray-800 transition ${variant === 'outline' ? 'border border-gray-200 bg-white py-2.5 hover:border-blue-300' : 'bg-gray-100 py-2 hover:bg-gray-200'} ${open ? 'ring-2 ring-blue-500' : ''}`}>
				{icon && <FaFilter className="shrink-0 text-gray-400" size={13} />}
				<span className="min-w-0 flex-1 truncate">{selected?.label ?? placeholder}</span>
				<FiChevronDown className={`shrink-0 text-gray-400 transition ${open ? 'rotate-180' : ''}`} size={14} />
			</button>
			{open && pos && createPortal(
				<div ref={popRef} style={{ position: 'fixed', zIndex: Z, left: pos.left, width: pos.width, minWidth: pos.minWidth, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
					className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl">
					{searchable && (
						<div className="relative shrink-0 border-b border-gray-100 p-2">
							<FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
							<input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={tx(searchPlaceholder)}
								className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm text-black outline-none focus:border-blue-400" />
						</div>
					)}
					<ul role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1" style={{ maxHeight: LIST_H }}>
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
						{list.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">{tx("Topilmadi")}</li>}
					</ul>
				</div>,
				document.body
			)}
		</div>
	)
}

export default SearchableSelect
