import { tx } from '../i18n'
import { FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'
import BrandLogo from './BrandLogo'
import { schoolMenuGroups } from './schoolMenu'

const UserAdminSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()
	const org = useOrg()
	const subtitle = [org.district, org.region].filter(Boolean).join(', ') || tx('Boshqaruv paneli')

	const isActive = (path) =>
		location.pathname === path ||
		(path !== '/user' && location.pathname.startsWith(path))

	const menuGroups = schoolMenuGroups('/user')

	return (
		<aside className="h-full flex flex-col text-white bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900">
			{/* ===== MOBILE HEADER ===== */}
			{onClose && (
				<div className="lg:hidden p-4 border-b border-white/10 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<BrandLogo className="w-12 h-12 shrink-0" />
						<div className="min-w-0">
							<h1 className="font-bold text-white truncate">
								{org.orgName}
							</h1>
							<p className="text-xs text-slate-400 truncate">{subtitle}</p>
						</div>
					</div>

					<button onClick={onClose} className="p-2 text-slate-300 hover:text-white">
						<FiX size={20} />
					</button>
				</div>
			)}

			{/* ===== DESKTOP HEADER ===== */}
			{!collapsed && !onClose && (
				<div className="hidden lg:flex p-5 border-b border-white/10 items-center gap-3">
					<BrandLogo className="w-12 h-12 shrink-0" />
					<div className="min-w-0">
						<h1 className="text-xl font-bold truncate">
							{org.orgName}
						</h1>
						<p className="text-xs text-slate-400 truncate">{subtitle}</p>
					</div>
				</div>
			)}

			{/* ===== ICON ONLY HEADER ===== */}
			{collapsed && !onClose && (
				<div className="hidden lg:flex h-20 items-center justify-center border-b border-white/10">
					<BrandLogo className="w-12 h-12" />
				</div>
			)}

			{/* ===== MENU ===== */}
			<nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 py-5 space-y-6">
				{menuGroups.map((group) => (
					<div key={group.label}>
						{!collapsed && (
							<p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
								{group.label}
							</p>
						)}
						<div className="space-y-1.5">
							{group.items.map(({ path, icon: Icon, label }) => (
								<Link
									key={path}
									to={path}
									onClick={onClose}
									className={`
									group relative flex items-center gap-3 rounded-xl p-3 transition-all
                    ${isActive(path)
										? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-blue-950/30'
											: 'text-slate-300 hover:bg-white/[0.07] hover:text-white'}
                  `}
								>
									{Icon ? (
										<Icon className="text-xl shrink-0" />
									) : (
										<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 1.1-.9 2-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
										</svg>
									)}

									{!collapsed && (
										<span className="font-medium text-sm">{label}</span>
									)}

									{collapsed && (
										<span className="
                      absolute left-full ml-3 whitespace-nowrap
                      bg-gray-900 text-white text-xs px-2 py-1 rounded
                      opacity-0 group-hover:opacity-100 transition
                      pointer-events-none z-50
                    ">
											{label}
										</span>
									)}
								</Link>
							))}
						</div>
					</div>
				))}
			</nav>

			{/* ===== LOGOUT ===== */}
			<div className="p-3 border-t border-white/10">
				<button
					onClick={() => navigate('/logout')}
					className="w-full flex items-center gap-3 p-3 rounded-xl
									 text-slate-300 hover:bg-red-500/10 hover:text-red-300 transition"
				>
					<FiLogOut className="text-xl" />
					{!collapsed && <span className="font-medium">{tx("Chiqish")}</span>}
				</button>
			</div>
		</aside>
	)
}

export default UserAdminSidebar

