import BrandLogo from './BrandLogo'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMenu, FiUser } from 'react-icons/fi'
import { useLocation, useNavigate } from 'react-router-dom'
import { uploadUrl } from '../utils/uploadUrl'
import { tx } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'

const UserNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const TITLES = [['/viewer/entry-exit', 'Kirdi-chiqdi'], ['/viewer/people', 'Davomat'], ['/viewer/grades', 'Sinf statistikasi'], ['/viewer/late', 'Kech qolganlar'], ['/viewer/risk', 'Xavf guruhi'], ['/viewer/profile', 'Profil']]
	const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] || 'Bosh sahifa'
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
		<header className="bg-white text-slate-800 sticky top-0 z-20 border-b border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-3">
					<button onClick={onToggleSidebar} className="p-2 rounded-lg text-slate-700 hover:bg-slate-100">
						<FiMenu size={22} />
					</button>
					<div className="hidden lg:flex items-center gap-3 min-w-0">
						<span className="h-6 w-1 rounded-full bg-blue-500" />
						<p className="truncate text-lg font-semibold tracking-tight text-slate-900 max-w-[320px]">{title}</p>
					</div>
					{!sidebarOpen && (
						<span className="lg:hidden flex items-center gap-2 font-bold transition-opacity">
							<BrandLogo className="w-7 h-7 shrink-0" /> {tx("School Supervision")} <span className="text-slate-500 font-normal">{tx("· Nazoratchi")}</span>
						</span>
					)}
				</div>

				<div className="flex items-center gap-2">
					<LanguageSwitcher className="hidden sm:block" />
					<div className="relative" ref={dropdownRef}>
					<button
						onClick={() => setOpen(prev => !prev)}
						className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100"
					>
						<div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-sm shadow-blue-500/30 flex items-center justify-center overflow-hidden overflow-hidden">
							{user?.photo ? (
								<img
									src={`${uploadUrl(user.photo)}`}
									alt={user.fullName}
									className="w-full h-full object-cover"
								/>
							) : (
								<FiUser />
							)}
						</div>
					</button>

					{open && (
						<div className="absolute right-0 mt-2 w-56 bg-white text-gray-800 rounded-lg shadow-lg z-50">
							<div className="px-4 py-3 border-b">
								<p className="font-semibold">{user.fullName}</p>
								<p className="text-sm text-gray-500">{user.position}</p>
							</div>
							<button
								onClick={() => { navigate('/viewer/profile'); setOpen(false) }}
								className="w-full text-left px-4 py-3 text-gray-700 hover:bg-gray-50"
							>
								<FiUser className="inline mr-2" />
								{tx("Profil")}
							</button>
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
			</div>
		</header>
	)
}

export default UserNavbar
