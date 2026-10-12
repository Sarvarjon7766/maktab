import { tx } from '../i18n'
import axios from 'axios'
import { formatUzDate } from '../utils/formatDate'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMenu, FiUser } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import { monitorMenuGroups } from './MonitorSidebar'

const MonitorNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const location = useLocation()
	const [open, setOpen] = useState(false)
	const [user, setUser] = useState({})
	const [now, setNow] = useState(new Date())
	const token = localStorage.getItem('token')
	const dropdownRef = useRef(null)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then(res => {
			if (res.data?.user) setUser(res.data.user)
		}).catch(() => { })
	}, [token])

	useEffect(() => {
		const timer = setInterval(() => setNow(new Date()), 30000)
		return () => clearInterval(timer)
	}, [])

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	// Joriy sahifa nomi (sidebar menyusidan)
	const current = monitorMenuGroups.flatMap(g => g.items)
		.filter(i => location.pathname === i.path || (i.path !== '/monitor' && location.pathname.startsWith(i.path)))
		.sort((a, b) => b.path.length - a.path.length)[0]
	const title = current?.label || (location.pathname.startsWith('/monitor/schools/') ? tx('Maktab profili') : tx('Umumiy nazorat'))

	return (
		<header className="bg-slate-900 text-white sticky top-0 z-20">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-3 min-w-0">
					<button onClick={onToggleSidebar} className="p-2 rounded hover:bg-slate-800"><FiMenu size={22} /></button>
					<div className="leading-tight min-w-0">
						<p className="font-semibold truncate">{title}</p>
						{!sidebarOpen && <p className="text-xs text-slate-400">{tx("School Supervision · Umumiy nazorat")}</p>}
					</div>
				</div>

				<div className="flex items-center gap-3">
					<div className="hidden md:block text-right leading-tight">
						<p className="text-sm font-medium">{formatUzDate(now)}</p>
						<p className="text-xs text-slate-400">{now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}</p>
					</div>
					<div className="relative" ref={dropdownRef}>
						<button onClick={() => setOpen(p => !p)} className="flex items-center gap-2 p-2 rounded hover:bg-slate-800">
							<div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center"><FiUser /></div>
						</button>
						{open && (
							<div className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-lg shadow-lg z-50">
								<div className="px-4 py-3 border-b">
									<p className="font-semibold">{user.fullName}</p>
									<p className="text-sm text-gray-500">{user.position}</p>
								</div>
								<button onClick={() => { setOpen(false); navigate('/monitor/profile') }} className="w-full text-left px-4 py-3 hover:bg-gray-50">
									<FiUser className="inline mr-2" /> {tx("Profil")}
								</button>
								<button onClick={() => navigate('/logout')} className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50">
									<FiLogOut className="inline mr-2" /> {tx("Chiqish")}
								</button>
							</div>
						)}
					</div>
				</div>
			</div>
		</header>
	)
}

export default MonitorNavbar
