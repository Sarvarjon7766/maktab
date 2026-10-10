import BrandLogo from './BrandLogo'
import {
	FaChartBar,
	FaClipboardCheck,
	FaDoorOpen,
	FaFileAlt,
	FaSitemap
} from 'react-icons/fa'
import { FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { tx } from '../i18n'

const LeaderSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()

	const isActive = (path) =>
		location.pathname === path ||
		location.pathname.startsWith(path)

	const menu = [
		{ path: '/leader/analytics',   icon: FaChartBar,       label: tx("Tahlil") },
		{ path: '/leader/reports',     icon: FaFileAlt,        label: tx("Hisobotlar") },
		{ path: '/leader/sinf', icon: FaSitemap,        label: tx("Sinflar") },
		{ path: '/leader/attandance',  icon: FaClipboardCheck, label: tx("Nazorat") },
		{ path: '/leader/entry-exit',  icon: FaDoorOpen,       label: tx("Kirish-Chiqish") },
		{ path: '/leader/comments',    icon: null,              label: tx("Kommentlar") },
	]

	return (
		<aside className="h-full flex flex-col text-white">
			{/* MOBILE HEADER */}
			{onClose && (
				<div className="lg:hidden p-4 border-b border-slate-700 flex justify-between">
					<span className="flex items-center gap-2 font-bold">
						<BrandLogo className="w-8 h-8 shrink-0" /> School Supervision
					</span>
					<button onClick={onClose}><FiX /></button>
				</div>
			)}

			{/* DESKTOP HEADER */}
			{!collapsed && !onClose && (
				<div className="hidden lg:flex p-6 border-b border-slate-700">
					<h1 className="flex items-center gap-3 font-bold text-xl">
						<BrandLogo className="w-12 h-12 shrink-0" />
						School Supervision
					</h1>
				</div>
			)}

			{collapsed && !onClose && (
				<div className="hidden lg:flex h-20 items-center justify-center border-b border-slate-700">
					<BrandLogo className="w-12 h-12" />
				</div>
			)}

			{/* MENU */}
			<nav className="flex-1 p-3 space-y-1">
				{menu.map(({ path, icon: Icon, label }) => (
					<Link
						key={path}
						to={path}
						onClick={onClose}
						className={`group relative flex items-center gap-3 p-3 rounded-lg
              ${isActive(path)
								? 'bg-cyan-600 text-white'
								: 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
					>
						{Icon ? (
							<Icon className="text-xl" />
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
								<path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 1.1-.9 2-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
							</svg>
						)}
						{!collapsed && <span>{label}</span>}
						{collapsed && (
							<span className="absolute left-full ml-3 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
								{label}
							</span>
						)}
					</Link>
				))}
			</nav>

			{/* LOGOUT */}
			<div className="p-3 border-t border-slate-700">
				<button
					onClick={() => navigate('/logout')}
					className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800"
				>
					<FiLogOut />
					{!collapsed && <span>Chiqish</span>}
				</button>
			</div>
		</aside>
	)
}

export default LeaderSidebar

