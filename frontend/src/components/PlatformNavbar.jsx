import BrandLogo from './BrandLogo'
import { tx } from '../i18n'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMenu, FiUser } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import { schoolPageTitle } from '../utils/schoolPages'

// Sahifa nomi (sahifalarning o'zida alohida sarlavha yo'q, shuning uchun shu yerda ko'rsatiladi)
const TITLES = [['/platform/school-control', 'Maktablar nazorati'], ['/platform/school-cameras', 'Maktab kameralari'], ['/platform/hik-accounts', 'Hik akkauntlari'], ['/platform/hik-cameras', "Oddiy kameralarni bog'lash"], ['/platform/hik-facecontrol', "FaceControl kameralarni bog'lash"], ['/platform/region-monitors', 'Viloyat monitorlari'], ['/platform/monitors', 'Tuman monitorlari'], ['/platform/districts', 'Tumanlar'], ['/platform/map', 'Maktablar xaritasi'], ['/platform/audit-log', 'Audit jurnali'], ['/platform/branding', 'Platforma sozlamalari'], ['/platform/telegram', 'Telegram bot'], ['/platform/grades', 'Sinf darajalari'], ['/platform/statistics', 'Statistika'], ['/platform/schools', 'Maktablar']]
const platformTitle = (pathname) => {
	const m = /^\/platform\/schools\/([^/]+)/.exec(pathname)
	if (m) return pathname === `/platform/schools/${m[1]}` ? tx('Maktab') : schoolPageTitle(`/platform/schools/${m[1]}`, pathname)
	return TITLES.find(([p]) => pathname === p || pathname.startsWith(`${p}/`))?.[1] || 'Bosh sahifa'
}

const PlatformNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const [open, setOpen] = useState(false)
	const [user, setUser] = useState({})
	const token = localStorage.getItem('token')
	const dropdownRef = useRef(null)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then(res => {
			if (res.data?.user) setUser(res.data.user)
		})
	}, [token])

	useEffect(() => {
		const handleClickOutside = (e) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
				setOpen(false)
			}
		}
		document.addEventListener('mousedown', handleClickOutside)
		return () => document.removeEventListener('mousedown', handleClickOutside)
	}, [])

	return (
		<header className="bg-slate-900 text-white sticky top-0 z-20">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-3">
					<button onClick={onToggleSidebar} className="p-2 rounded hover:bg-slate-800">
						<FiMenu size={22} />
					</button>
					<div className="hidden lg:flex items-center gap-3 min-w-0">
						<span className="h-6 w-1 rounded-full bg-cyan-400" />
						<p className="truncate text-lg font-semibold tracking-tight text-white max-w-[320px]">{platformTitle(pathname)}</p>
					</div>
					{!sidebarOpen && (
						<span className="font-bold transition-opacity">
							<BrandLogo className="w-7 h-7 shrink-0" /> {tx("School Supervision")} <span className="text-slate-400 font-normal">{tx("· Platforma")}</span>
						</span>
					)}
				</div>

				<div className="relative" ref={dropdownRef}>
					<button
						onClick={() => setOpen(prev => !prev)}
						className="flex items-center gap-2 p-2 rounded hover:bg-slate-800"
					>
						<div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center">
							<FiUser />
						</div>
					</button>

					{open && (
						<div className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-lg shadow-lg z-50">
							<div className="px-4 py-3 border-b">
								<p className="font-semibold">{user.fullName}</p>
								<p className="text-sm text-gray-500">{user.position}</p>
							</div>
							<button
								onClick={() => navigate('/logout')}
								className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50"
							>
								<FiLogOut className="inline mr-2" />
								{tx("Chiqish")}
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	)
}

export default PlatformNavbar

