import axios from 'axios'
import { useEffect, useState } from 'react'
import { FaChalkboardTeacher, FaClipboardCheck, FaClock, FaHome, FaUserCheck, FaUserSlash } from 'react-icons/fa'
import { FiLogOut, FiUser, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { tx } from '../i18n'

// O'qituvchi (viewer) menyusi. Sinf rahbari bo'lsa, "Sinfim" bo'limi qo'shiladi (sinf statistikasi, kech qolganlar, xavf guruhi)
const UserSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()
	const [me, setMe] = useState(null)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/viewer-stats/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(res => setMe(res.data)).catch(() => { })
	}, [])

	const isActive = (path) => location.pathname === path || (path !== '/viewer' && location.pathname.startsWith(path))
	const classes = me?.classes || []
	// bitta sinf bo'lsa, to'g'ridan-to'g'ri sinf sahifasiga; bir nechta bo'lsa, sinflar ro'yxatiga
	const classPath = classes.length === 1 ? `/viewer/grades/${classes[0].grade}/${classes[0]._id}` : '/viewer/grades'

	const menuGroups = [
		{
			label: tx('Asosiy'),
			items: [
				{ path: '/viewer', icon: FaHome, label: tx('Bosh sahifa') },
				{ path: '/viewer/entry-exit', icon: FaClipboardCheck, label: tx('Kirdi-chiqdi') },
				...(me?.userId ? [{ path: '/viewer/people/staff/me', icon: FaUserCheck, label: tx('Mening davomatim') }] : []),
				{ path: '/viewer/profile', icon: FiUser, label: tx('Profil') },
			],
		},
		...(classes.length ? [{
			label: classes.length === 1 ? tx('Sinfim · {{name}}', { name: classes[0].name }) : tx('Sinflarim'),
			items: [
				{ path: classPath, icon: FaChalkboardTeacher, label: tx('Sinf statistikasi') },
				{ path: '/viewer/late', icon: FaClock, label: tx('Kech qolganlar') },
				{ path: '/viewer/risk', icon: FaUserSlash, label: tx('Xavf guruhi') },
			],
		}] : []),
	]

	return (
		<div className="h-full flex flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
			<div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
				<div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
					<BrandLogo className="w-12 h-12 shrink-0" />
					{!collapsed && (
						<div className="leading-tight">
							<p className="font-bold">{tx("School Supervision")}</p>
							<p className="text-xs text-slate-400">{tx("O'qituvchi paneli")}</p>
						</div>
					)}
				</div>
				{onClose && (
					<button onClick={onClose} className="lg:hidden text-slate-300 hover:text-white">
						<FiX size={20} />
					</button>
				)}
			</div>

			<nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
				{menuGroups.map(group => (
					<div key={group.label}>
						{!collapsed && (
							<p className="px-3 mb-2 text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{group.label}</p>
						)}
						<div className="space-y-1">
							{group.items.map(item => (
								<Link
									key={item.path}
									to={item.path}
									onClick={onClose}
									className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive(item.path) ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-950/20' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'} ${collapsed ? 'justify-center' : ''}`}
									title={collapsed ? item.label : undefined}
								>
									<item.icon size={18} />
									{!collapsed && item.label}
								</Link>
							))}
						</div>
					</div>
				))}
			</nav>

			<div className="p-2 border-t border-slate-700">
				<button
					onClick={() => navigate('/logout')}
					className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors ${collapsed ? 'justify-center' : ''}`}
					title={collapsed ? tx("Chiqish") : undefined}
				>
					<FiLogOut size={18} />
					{!collapsed && tx("Chiqish")}
				</button>
			</div>
		</div>
	)
}

export default UserSidebar
