import axios from 'axios'
import { useEffect, useState } from 'react'
import {
	FaBell,
	FaBolt,
	FaChalkboardTeacher,
	FaChartLine,
	FaChartPie,
	FaClock,
	FaFileExcel,
	FaHeartbeat,
	FaLayerGroup,
	FaHome,
	FaSchool,
	FaUser,
	FaUserGraduate,
	FaUmbrellaBeach,
	FaUserSlash,
	FaVideo
} from 'react-icons/fa'
import { FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { tx } from '../i18n'

export const monitorMenuGroups = [
	{
		label: tx('Asosiy'),
		items: [
			{ path: '/monitor', icon: FaHome, label: tx('Bosh sahifa') },
			{ path: '/monitor/schools', icon: FaSchool, label: tx('Maktablar') },
			{ path: '/monitor/grades', icon: FaLayerGroup, label: tx('Umumiy statistika') },
			{ path: '/monitor/alerts', icon: FaBell, label: tx('Ogohlantirishlar') },
		],
	},
	{
		label: tx('Maktab ichida'),
		items: [
			{ path: '/monitor/staff', icon: FaChalkboardTeacher, label: tx('Xodimlar') },
			{ path: '/monitor/classrooms', icon: FaChartPie, label: tx('Sinfxonalar') },
			{ path: '/monitor/students', icon: FaUserGraduate, label: tx("O'quvchilar") },
		],
	},
	{
		label: tx('Kameralar'),
		items: [
			{ path: '/monitor/cameras', icon: FaVideo, label: tx('Kameralar (Real)') },
			{ path: '/monitor/camera-health', icon: FaHeartbeat, label: tx('Kamera holati') },
			{ path: '/monitor/camera-events', icon: FaBolt, label: tx('Kamera hodisalari') },
		],
	},
	{
		label: tx('Qo\'shimcha'),
		items: [
			{ path: '/monitor/late', icon: FaClock, label: tx('Kech qolganlar') },
			{ path: '/monitor/leaves', icon: FaUmbrellaBeach, label: tx('Sababli kelmaganlar') },
			{ path: '/monitor/risk', icon: FaUserSlash, label: tx('Xavf guruhi') },
			{ path: '/monitor/trend', icon: FaChartLine, label: tx('Kunlik dinamika') },
			{ path: '/monitor/reports', icon: FaFileExcel, label: tx('Hisobotlar (Excel)') },
			{ path: '/monitor/profile', icon: FaUser, label: tx('Profil') },
		],
	},
]

const MonitorSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()
	// Monitorning hududi: qaysi tuman maktablarini ko'rishi
	const [area, setArea] = useState(null)
	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/monitor/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(r => setArea(r.data)).catch(() => { })
	}, [])

	const isActive = (path) =>
		location.pathname === path || (path !== '/monitor' && location.pathname.startsWith(path))

	return (
		<div className="h-full flex flex-col text-white bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
			<div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
				<div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
					<BrandLogo className="w-12 h-12 shrink-0" />
					{!collapsed && (
						<div className="leading-tight overflow-hidden">
							<p className="font-bold truncate">School Supervision</p>
							<p className="text-[11px] text-cyan-300/80 truncate" title={area?.scoped ? `${area.region}, ${area.district}` : undefined}>{area?.scoped ? tx('{{district}} nazorati', { district: area.district }) : 'Umumiy nazorat'}</p>
						</div>
					)}
				</div>
				{onClose && (
					<button onClick={onClose} className="lg:hidden text-slate-300 hover:text-white"><FiX size={20} /></button>
				)}
			</div>

			<nav className="flex-1 overflow-y-auto py-5 px-3 space-y-7">
				{monitorMenuGroups.map(group => (
					<div key={group.label}>
						{!collapsed && <p className="px-3 mb-2.5 text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">{group.label}</p>}
						<div className="space-y-1.5">
							{group.items.map(item => (
								<Link
									key={item.path}
									to={item.path}
									onClick={onClose}
									className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${isActive(item.path) ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-blue-950/30' : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'} ${collapsed ? 'justify-center' : ''}`}
									title={collapsed ? item.label : undefined}
								>
									<item.icon size={18} className="shrink-0" />
									{!collapsed && <span className="truncate">{item.label}</span>}
								</Link>
							))}
						</div>
					</div>
				))}
			</nav>

			<div className="p-3 border-t border-white/10">
				<button
					onClick={() => navigate('/logout')}
					className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-red-500/10 hover:text-red-300 transition-colors ${collapsed ? 'justify-center' : ''}`}
					title={collapsed ? 'Chiqish' : undefined}
				>
					<FiLogOut size={18} />
					{!collapsed && 'Chiqish'}
				</button>
			</div>
		</div>
	)
}

export default MonitorSidebar

