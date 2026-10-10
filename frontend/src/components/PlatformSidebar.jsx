import BrandLogo from './BrandLogo'
import axios from 'axios'
import { useEffect, useState } from 'react'
import {
	FaTelegramPlane,
	FaChartBar,
	FaCloud,
	FaClipboardCheck,
	FaCogs,
	FaDoorOpen,
	FaFileAlt,
	FaHistory,
	FaHome,
	FaSchool,
	FaSitemap,
	FaSlidersH,
	FaUserCog,
	FaUserGraduate,
	FaUsers,
	FaUserShield,
	FaVideo,
	FaUserCheck,
	FaChalkboard,
	FaLayerGroup,
	FaBell,
	FaClock,
	FaUserSlash,
	FaChartLine,
	FaUmbrellaBeach
} from 'react-icons/fa'
import { FiArrowLeft, FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { tx } from '../i18n'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })

const PlatformSidebar = ({ collapsed = false, onClose }) => {
	const navigate = useNavigate()
	const location = useLocation()
	const schoolMatch = useMatch('/platform/schools/:schoolId/*')
	const schoolId = schoolMatch?.params?.schoolId
	const [schoolName, setSchoolName] = useState('')

	// Maktab ichiga "kirilganda" nom ko'rsatish uchun — ATAYLAB `platformToken`
	// bilan (superadmin-only endpoint), chunki `token` shu payt allaqachon
	// o'sha maktabning taqlid (impersonation) tokeniga almashtirilgan bo'ladi
	useEffect(() => {
		if (!schoolId) { setSchoolName(''); return }
		const platformToken = localStorage.getItem('platformToken')
		api.get(`/api/schools/${schoolId}`, { headers: { Authorization: `Bearer ${platformToken}` } })
			.then(res => { if (res.data.success) setSchoolName(res.data.school.name) })
			.catch(() => { })
	}, [schoolId])

	const isActive = (path) =>
		location.pathname === path ||
		(path !== '/platform' && path !== `/platform/schools/${schoolId}` && location.pathname.startsWith(path))

	const platformMenuGroups = [
		{
			label: tx('Platforma'),
			items: [
				{ path: '/platform', icon: FaHome, label: tx('Bosh sahifa') },
				{ path: '/platform/schools', icon: FaSchool, label: tx('Maktablar') },
			],
		},
		{
			label: tx('Nazorat'),
			items: [
				{ path: '/platform/audit-log', icon: FaHistory, label: tx('Audit jurnali') },
			],
		},
		{
			label: tx('Tizim'),
			items: [
				{ path: '/platform/branding', icon: FaSlidersH, label: tx('Platforma sozlamalari') },
			],
		},
	]

	// Maktab ichidagi menyu — UserAdminSidebar'dagi bilan bir xil bo'limlar,
	// faqat /platform/schools/:schoolId prefiksi bilan — superadmin o'sha
	// maktabning admini nima qila olsa, XUDDI SHUNI shu yerning o'zida qila oladi
	const base = `/platform/schools/${schoolId}`
	const schoolMenuGroups = [
		{
			label: tx('Asosiy'),
			items: [
				{ path: base, icon: FaHome, label: tx("Bosh sahifa") },
				{ path: `${base}/analytics`, icon: FaChartBar, label: tx('Tahlil') },
				{ path: `${base}/reports`, icon: FaFileAlt, label: tx('Hisobotlar') },
				{ path: `${base}/users`, icon: FaUsers, label: tx('Xodimlar') },
				{ path: `${base}/students`, icon: FaUserGraduate, label: tx("O'quvchilar") },
				{ path: `${base}/attandance`, icon: FaClipboardCheck, label: tx('Nazorat') },
				{ path: `${base}/camera`, icon: FaVideo, label: tx('Kameralar') },
				{ path: `${base}/facecontrol`, icon: FaUserCheck, label: tx('FaceControl') },
				{ path: `${base}/classrooms`, icon: FaChalkboard, label: tx('Sinfxonalar') },
			],
		},
		{
			label: tx('Statistika'),
			items: [
				{ path: `${base}/grades`, icon: FaLayerGroup, label: tx('Umumiy statistika') },
				{ path: `${base}/alerts`, icon: FaBell, label: tx('Ogohlantirishlar') },
				{ path: `${base}/late`, icon: FaClock, label: tx('Kech qolganlar') },
				{ path: `${base}/leaves`, icon: FaUmbrellaBeach, label: tx('Sababli kelmaganlar') },
				{ path: `${base}/risk`, icon: FaUserSlash, label: tx('Xavf guruhi') },
				{ path: `${base}/trend`, icon: FaChartLine, label: tx('Kunlik dinamika') },
			],
		},
		{
			label: tx("Qo'shimcha"),
			items: [
				{ path: `${base}/sinf`, icon: FaSitemap, label: tx("Sinflar") },
				{ path: `${base}/regulation`, icon: FaUserCog, label: tx('Xodimlarni tartiblash') },
				{ path: `${base}/admin`, icon: FaUserShield, label: tx('Admin') },
				{ path: `${base}/entry-exit`, icon: FaDoorOpen, label: tx('Kirish–Chiqish') },
				{ path: `${base}/comments`, icon: null, label: tx('Kommentlar') },
				{ path: `${base}/settings`, icon: FaCogs, label: tx('Sozlamalar') },
			],
		},
	]

	const menuGroups = schoolId ? schoolMenuGroups : platformMenuGroups

	return (
		<div className="h-full flex flex-col text-white">
			<div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
				<div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'justify-center w-full' : ''}`}>
					<BrandLogo className="w-12 h-12 shrink-0" />
					{!collapsed && (
						<div className="leading-tight overflow-hidden">
							<p className="font-bold truncate">{schoolId ? (schoolName || '...') : 'School Supervision'}</p>
							<p className="text-xs text-slate-400 truncate">{schoolId ? 'Maktab ichida' : 'Platforma boshqaruvi'}</p>
						</div>
					)}
				</div>
				{onClose && (
					<button onClick={onClose} className="lg:hidden text-slate-300 hover:text-white">
						<FiX size={20} />
					</button>
				)}
			</div>

			{schoolId && !collapsed && (
				<Link
					to="/platform/schools"
					onClick={onClose}
					className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-400 hover:text-white border-b border-slate-700"
				>
					<FiArrowLeft size={13} />
					Maktablarga qaytish
				</Link>
			)}

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
									className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive(item.path) ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'
										} ${collapsed ? 'justify-center' : ''}`}
									title={collapsed ? item.label : undefined}
								>
									{item.icon ? (
										<item.icon size={18} />
									) : (
										<svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
											<path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 1.1-.9 2-2 2H7l-4 4V6a2 2 0 012-2h14a2 2 0 012 2v10z" />
										</svg>
									)}
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
					title={collapsed ? "Chiqish" : undefined}
				>
					<FiLogOut size={18} />
					{!collapsed && "Chiqish"}
				</button>
			</div>
		</div>
	)
}

export default PlatformSidebar

