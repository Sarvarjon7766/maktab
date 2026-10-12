import SidebarProfileCard from './SidebarProfileCard'
import {
	FaTelegramPlane,
	FaRobot,
	FaChartBar,
	FaClipboardCheck,
	FaDoorOpen,
	FaFileAlt,
	FaHome,
	FaSitemap,
	FaUserCog,
	FaUserGraduate,
	FaUsers,
	FaVideo,
	FaUserCheck,
	FaChalkboard,
	FaTachometerAlt,
	FaLayerGroup,
	FaBell,
	FaClock,
	FaUserSlash,
	FaChartLine,
	FaUmbrellaBeach
} from 'react-icons/fa'
import { FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import BrandLogo from './BrandLogo'
import { tx } from '../i18n'

const AdminSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()

	const isActive = (path) =>
		location.pathname === path ||
		(path !== '/admin' && location.pathname.startsWith(path))

	const menuGroups = [
		{
			label: 'Asosiy',
			items: [
				{ path: '/admin', icon: FaHome, label: "Bosh sahifa" },
				{ path: '/admin/analytics', icon: FaChartBar, label: "Tahlil" },
				{ path: '/admin/reports', icon: FaFileAlt, label: "Hisobotlar" },
				{ path: '/admin/users', icon: FaUsers, label: "Xodimlar" },
				{ path: '/admin/students', icon: FaUserGraduate, label: "O'quvchilar" },
				{ path: '/admin/attandance', icon: FaClipboardCheck, label: "Nazorat" },
				{ path: '/admin/camera', icon: FaVideo, label: "Kameralar" },
				{ path: '/admin/facecontrol', icon: FaUserCheck, label: "FaceControl" },
				{ path: '/admin/nazorat', icon: FaTachometerAlt, label: "Sinfxonalar nazorati" },
				{ path: '/admin/classrooms', icon: FaChalkboard, label: "Sinfxonalar" },
				{ path: '/admin/kuzatuv', icon: FaRobot, label: "Aqlli kuzatuv" },
				{ path: '/admin/parents', icon: FaTelegramPlane, label: "Ota-onalar boti" },
			],
		},
		{
			label: 'Statistika',
			items: [
				{ path: `/admin/grades`, icon: FaLayerGroup, label: 'Umumiy statistika' },
				{ path: `/admin/alerts`, icon: FaBell, label: 'Ogohlantirishlar' },
				{ path: `/admin/late`, icon: FaClock, label: 'Kech qolganlar' },
				{ path: `/admin/leaves`, icon: FaUmbrellaBeach, label: 'Sababli kelmaganlar' },
				{ path: `/admin/risk`, icon: FaUserSlash, label: 'Xavf guruhi' },
				{ path: `/admin/trend`, icon: FaChartLine, label: 'Kunlik dinamika' },
			],
		},
		{
			label: "Qo‘shimcha",
			items: [
				{ path: '/admin/sinf', icon: FaSitemap, label: "Sinflar" },
				{ path: '/admin/regulation', icon: FaUserCog, label: "Tartiblash" },
				{ path: '/admin/entry-exit', icon: FaDoorOpen, label: "Kirish–Chiqish" },
				{ path: '/admin/comments', icon: null, label: "Kommentlar" },
			],
		},
	]

	return (
		<aside className="h-full flex flex-col bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white">
			{/* MOBILE HEADER */}
			{onClose && (
				<div className="lg:hidden p-4 border-b border-slate-700 flex justify-between">
					<span className="flex items-center gap-2 font-bold"><BrandLogo className="w-8 h-8 shrink-0" />{tx("School Supervision")}</span>
					<button onClick={onClose}><FiX /></button>
				</div>
			)}

			{/* DESKTOP HEADER */}
			{!collapsed && !onClose && (
				<div className="hidden lg:flex p-6 border-b border-slate-700">
					<h1 className="flex items-center gap-3 font-bold text-xl">
						<BrandLogo className="w-12 h-12 shrink-0" />
						{tx("School Supervision")}
					</h1>
				</div>
			)}

			<SidebarProfileCard collapsed={collapsed} onNavigate={onClose} />

			{/* MENU */}
			<nav className="flex-1 p-3 space-y-4">
				{menuGroups.map((group) => (
					<div key={group.label}>
						<p className={`px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50 overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'max-h-0 opacity-0 mb-0' : 'max-h-4 opacity-100 mb-1.5'}`}>
							{group.label}
						</p>
						<div className="space-y-1">
							{group.items.map(({ path, icon: Icon, label }) => (
								<Link
									key={path}
									to={path}
									onClick={onClose}
									className={`group relative flex items-center gap-3 p-3 rounded-lg
                    ${isActive(path)
											? 'bg-white/15 text-white'
											: 'text-white/70 hover:bg-white/10 hover:text-white'}`}
								>
									{Icon ? (
										<Icon className="text-xl shrink-0" />
									) : (
										<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 1.1-.9 2-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
										</svg>
									)}
									<span className={`truncate transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>
										{label}
									</span>
									{collapsed && (
										<span className="absolute left-full ml-3 bg-black text-white text-xs px-2 py-1 rounded
                      opacity-0 group-hover:opacity-100 whitespace-nowrap">
											{label}
										</span>
									)}
								</Link>
							))}
						</div>
					</div>
				))}
			</nav>

			{/* LOGOUT */}
			<div className="p-3 border-t border-white/15">
				<button
					onClick={() => navigate('/logout')}
					className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-red-600"
				>
					<FiLogOut className="shrink-0" />
					<span className={`truncate transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] opacity-100'}`}>
						{tx("Chiqish")}
					</span>
				</button>
			</div>
		</aside>
	)
}

export default AdminSidebar
