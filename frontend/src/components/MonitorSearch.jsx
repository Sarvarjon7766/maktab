import axios from 'axios'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FiCornerDownLeft, FiGrid, FiLayers, FiSearch, FiUser, FiUsers } from 'react-icons/fi'
import { FaSchool } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import PersonPhotoPreview from './PersonPhotoPreview'
import { monitorMenuGroups } from './MonitorSidebar'
import { tx } from '../i18n'

const PAGES = monitorMenuGroups.flatMap(g => g.items)
const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')

// Butun tizim bo'yicha qidiruv: sahifalar, maktab, sinf, o'quvchi, xodim. Klaviatura: ↑ ↓ Enter Esc, "/" — qidiruvga o'tish
const MonitorSearch = ({ dark = false }) => {
	const navigate = useNavigate()
	const [q, setQ] = useState('')
	const [open, setOpen] = useState(false)
	const [res, setRes] = useState(null)
	const [loading, setLoading] = useState(false)
	const [active, setActive] = useState(0)
	const boxRef = useRef(null)
	const inputRef = useRef(null)

	useEffect(() => {
		const text = q.trim()
		if (text.length < 2) { setRes(null); setLoading(false); return }
		setLoading(true)
		let stale = false
		const t = setTimeout(async () => {
			try {
				const r = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/search`, { params: { q: text }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
				if (!stale) setRes(r.data)
			} catch { if (!stale) setRes(null) } finally { if (!stale) setLoading(false) }
		}, 250)
		return () => { stale = true; clearTimeout(t) }
	}, [q])

	useEffect(() => {
		const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
		const slash = (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) { e.preventDefault(); inputRef.current?.focus() } }
		document.addEventListener('mousedown', close)
		document.addEventListener('keydown', slash)
		return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', slash) }
	}, [])

	const go = (path) => { setOpen(false); setQ(''); setRes(null); inputRef.current?.blur(); navigate(path) }

	const groups = useMemo(() => {
		const text = norm(q.trim())
		if (text.length < 2) return []
		const pages = PAGES.filter(p => norm(p.label).includes(text)).slice(0, 4).map(p => ({ key: p.path, title: p.label, sub: 'Sahifa', path: p.path }))
		const list = [
			{ title: 'Sahifalar', icon: <FiGrid size={11} />, items: pages },
			{ title: 'Maktablar', icon: <FaSchool size={11} />, items: (res?.schools || []).map(s => ({ key: s._id, title: s.name, sub: [s.region, s.district].filter(Boolean).join(', '), path: `/monitor/schools/${s._id}` })) },
			{ title: 'Sinflar', icon: <FiLayers size={11} />, items: (res?.classes || []).map(c => ({ key: c._id, title: `${c.name} sinf`, sub: c.schoolName, path: `/monitor/classrooms/${c.schoolId}/${c._id}` })) },
			{ title: "O'quvchilar", icon: <FiUser size={11} />, items: (res?.students || []).map(x => ({ key: x._id, title: x.fullName, photo: x.photo, sub: [x.sinf, x.schoolName, x.studentIdNumber && `ID ${x.studentIdNumber}`].filter(Boolean).join(' · '), path: `/monitor/people/student/${x._id}` })) },
			{ title: 'Xodimlar', icon: <FiUsers size={11} />, items: (res?.staff || []).map(x => ({ key: x._id, title: x.fullName, photo: x.photo, sub: [x.position, x.schoolName].filter(Boolean).join(' · '), path: `/monitor/people/staff/${x._id}` })) }
		]
		return list.filter(g => g.items.length)
	}, [q, res])

	const flat = groups.flatMap(g => g.items)
	useEffect(() => { setActive(0) }, [q, res])

	const onKey = (e) => {
		if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(i => Math.min(i + 1, flat.length - 1)) }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
		else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active].path) }
		else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
	}

	const showBox = open && q.trim().length >= 2
	const empty = showBox && !loading && flat.length === 0
	let index = -1

	return (
		<div className="relative w-full max-w-md" ref={boxRef}>
			<FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
			<input ref={inputRef} value={q} onFocus={() => setOpen(true)} onKeyDown={onKey} onChange={e => { setQ(e.target.value); setOpen(true) }} placeholder={tx("Maktab, sinf, o'quvchi yoki xodim qidirish")}
				className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none transition ${dark ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-400 focus:border-blue-400' : 'bg-slate-100/80 border-transparent text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-400 focus:ring-4 focus:ring-blue-100'}`} />
			{!q && <kbd className={`absolute right-3 top-1/2 -translate-y-1/2 hidden md:inline-block rounded border px-1.5 text-[10px] ${dark ? 'border-slate-600 bg-slate-700 text-slate-300' : 'border-slate-200 bg-white text-slate-400'}`}>/</kbd>}
			{showBox && (
				<div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 max-h-[70vh] overflow-y-auto z-50 py-1">
					{loading && flat.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{tx("Qidirilmoqda...")}</p>}
					{empty && <p className="px-4 py-3 text-sm text-gray-500">{tx('"{{q}}" bo\'yicha hech narsa topilmadi. Ism, ID, maktab yoki sinf ("5-A") yozib ko\'ring.', { q: q.trim() })}</p>}
					{groups.map(g => (
						<div key={g.title} className="py-1">
							<p className="px-4 py-1.5 text-[11px] uppercase tracking-wide text-gray-400 font-semibold flex items-center gap-1.5">{g.icon}{g.title}</p>
							{g.items.map(it => {
								index += 1
								const i = index
								return (
									<div key={`${g.title}-${it.key}`} onMouseEnter={() => setActive(i)} className={`flex items-center gap-2 px-3 py-1 ${active === i ? 'bg-blue-50' : ''}`}>
										{(g.title === "O'quvchilar" || g.title === 'Xodimlar') && <PersonPhotoPreview photo={it.photo} name={it.title} size="sm" />}
										<button onClick={() => go(it.path)} className="min-w-0 flex-1 py-1 text-left">
											<span className="block truncate text-sm font-medium text-gray-900">{it.title}</span>
											{it.sub && <span className="block truncate text-xs text-gray-500">{it.sub}</span>}
										</button>
										{active === i && <FiCornerDownLeft className="shrink-0 text-blue-400" size={14} />}
									</div>
								)
							})}
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default MonitorSearch
