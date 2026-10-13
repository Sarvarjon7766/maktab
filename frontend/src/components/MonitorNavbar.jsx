import { tx } from '../i18n'
import axios from 'axios'
import { formatUzDate } from '../utils/formatDate'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMapPin, FiMenu, FiSearch, FiUser, FiX } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import { monitorMenuGroups } from './MonitorSidebar'
import MonitorSearch from './MonitorSearch'
import LanguageSwitcher from './LanguageSwitcher'
import PersonPhotoPreview from './PersonPhotoPreview'

// Yon menyuda yo'q, lekin havola orqali ochiladigan sahifalar (uzun prefiks oldin)
const HIDDEN_TITLES = [
	['/monitor/schools', tx('Maktab profili')], ['/monitor/people', tx('Shaxs profili')], ['/monitor/classrooms', tx('Sinfxona tahlili')], ['/monitor/grades', tx('Umumiy statistika')],
	['/monitor/schools-map', tx('Maktablar xaritasi')], ['/monitor/map', tx('Maktablar xaritasi')], ['/monitor/live', tx('Jonli holat')], ['/monitor/ranking', tx('Maktablar reytingi')],
	['/monitor/compare', tx('Maktablarni taqqoslash')], ['/monitor/lists', tx("Ro'yxatlar")], ['/monitor/class-ranking', tx('Sinflar reytingi')], ['/monitor/arrival', tx('Kelish vaqti')],
	['/monitor/classes', tx('Sinflar')], ['/monitor/ai', tx('Aqlli kuzatuv (AI)')], ['/monitor/districts', tx('Tumanlar')]
]
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

const MonitorNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const location = useLocation()
	const [open, setOpen] = useState(false)
	const [searchOpen, setSearchOpen] = useState(false) // faqat tor ekranda: qidiruv alohida qatorda ochiladi
	const [user, setUser] = useState({})
	const [area, setArea] = useState(null)
	const [now, setNow] = useState(new Date())
	const dropdownRef = useRef(null)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, authHeaders()).then(res => { if (res.data?.user) setUser(res.data.user) }).catch(() => { })
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/me`, authHeaders()).then(res => { if (res.data?.success) setArea(res.data) }).catch(() => { })
	}, [])

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30000)
		return () => clearInterval(timer)
	}, [])

	useEffect(() => {
		const handleClickOutside = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false) }
		const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
		document.addEventListener('mousedown', handleClickOutside)
		document.addEventListener('keydown', onKey)
		return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', onKey) }
	}, [])

	// Sahifa almashganda ochiq oynalar yopiladi
	useEffect(() => { setOpen(false); setSearchOpen(false) }, [location.pathname])

	// Joriy sahifa nomi (sidebar menyusidan)
	const current = monitorMenuGroups.flatMap(g => g.items)
		.filter(i => location.pathname === i.path || (i.path !== '/monitor' && location.pathname.startsWith(i.path)))
		.sort((a, b) => b.path.length - a.path.length)[0]
	const title = current?.label || HIDDEN_TITLES.find(([prefix]) => location.pathname === prefix || location.pathname.startsWith(prefix + '/'))?.[1] || tx('Umumiy nazorat')
	const areaText = area?.scoped ? (area.district || area.region) : tx('Barcha hududlar')
	const areaNote = area ? (area.scoped ? (area.level === 'district' ? tx('Tuman monitori') : tx('Viloyat monitori')) : tx('Umumiy monitor')) : ''

	return (
		<header className="bg-white text-slate-800 sticky top-0 z-20 border-b border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
			<div className="flex items-center gap-3 px-4 py-3">
				<div className="flex min-w-0 items-center gap-3 md:w-64 md:shrink-0">
					<button onClick={onToggleSidebar} aria-label={tx("Menyu")} className="p-2 rounded-lg text-slate-700 hover:bg-slate-100"><FiMenu size={22} /></button>
					<div className="leading-tight min-w-0">
						<p className="font-semibold text-slate-900 truncate">{title}</p>
						{!sidebarOpen && <p className="text-xs text-slate-500 truncate">{tx("School Supervision · Umumiy nazorat")}</p>}
					</div>
				</div>

				<div className="hidden flex-1 justify-center md:flex"><MonitorSearch /></div>
				<div className="flex-1 md:hidden" />

				<div className="flex items-center gap-1.5 sm:gap-3">
					<button onClick={() => setSearchOpen(o => !o)} aria-label={tx("Qidirish")} className="rounded-lg p-2.5 text-slate-700 hover:bg-slate-100 md:hidden">{searchOpen ? <FiX size={20} /> : <FiSearch size={20} />}</button>
					<LanguageSwitcher className="hidden sm:block" />
					<div className="hidden lg:block rounded-xl bg-slate-50 px-3.5 py-1.5 text-right leading-tight">
						<p className="text-sm font-semibold text-slate-800">{formatUzDate(now)}</p>
						<p className="text-[11px] text-slate-500">{now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })} · {tx("Toshkent")}</p>
					</div>
					<div className="relative" ref={dropdownRef}>
						<button onClick={() => setOpen(p => !p)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2.5 rounded-xl p-1 hover:bg-slate-100">
							<span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30">
								{user.photo ? <PersonPhotoPreview photo={user.photo} name={user.fullName} size="md" className="!h-10 !w-10 !rounded-xl" /> : <FiUser size={20} />}
							</span>
							<span className="hidden max-w-[150px] pr-1 text-left leading-tight xl:block">
								<span className="block truncate text-sm font-semibold text-slate-800">{user.fullName || tx('Profil')}</span>
								<span className="block truncate text-[11px] text-slate-500">{areaText}</span>
							</span>
						</button>
						{open && (
							<div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-100 bg-white text-gray-800 shadow-xl">
								<div className="flex items-center gap-3 bg-slate-50 px-4 py-4">
									<PersonPhotoPreview photo={user.photo} name={user.fullName} size="md" />
									<div className="min-w-0">
										<p className="truncate font-semibold text-gray-900">{user.fullName}</p>
										<p className="truncate text-sm text-gray-500">{user.position || areaNote}</p>
									</div>
								</div>
								{area && (
									<div className="flex items-center gap-2 border-y border-slate-100 px-4 py-2.5 text-sm">
										<FiMapPin className="shrink-0 text-blue-500" size={15} />
										<span className="min-w-0 flex-1 truncate text-gray-700">{areaText}</span>
										<span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{tx("{{n}} ta maktab", { n: area.schools })}</span>
									</div>
								)}
								<button role="menuitem" onClick={() => { setOpen(false); navigate('/monitor/profile') }} className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50"><FiUser size={16} className="text-gray-500" /> {tx("Profil")}</button>
								<div className="sm:hidden border-t border-slate-100 px-2 py-1"><LanguageSwitcher /></div>
								<button role="menuitem" onClick={() => navigate('/logout')} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-3 text-left text-red-600 hover:bg-red-50"><FiLogOut size={16} /> {tx("Chiqish")}</button>
							</div>
						)}
					</div>
				</div>
			</div>
			{searchOpen && <div className="border-t border-slate-100 px-4 pb-3 pt-2 md:hidden"><MonitorSearch /></div>}
		</header>
	)
}

export default MonitorNavbar
