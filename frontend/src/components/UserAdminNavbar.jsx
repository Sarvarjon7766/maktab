import { useSchoolPageTitle } from './schoolPageTitle'
import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMenu, FiUser } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'

const UserAdminNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const pageTitle = useSchoolPageTitle('/user')
	const org = useOrg()
	const [open, setOpen] = useState(false)
	const [user, setUser] = useState({})
	const token = localStorage.getItem('token')
	const dropdownRef = useRef(null)

	// ===== FETCH USER =====
	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then(res => {
			if (res.data?.user) setUser(res.data.user)
		})
	}, [token])

	// ===== CLOSE DROPDOWN ON OUTSIDE CLICK =====
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

				{/* LEFT */}
				<div className="flex items-center gap-3">
					<button
						onClick={onToggleSidebar}
						className="p-2 rounded hover:bg-slate-800"
					>
						<FiMenu size={22} />
					</button>

					<div className="hidden lg:flex items-center gap-3 min-w-0">
						<span className="h-6 w-1 rounded-full bg-cyan-400" />
						<p className="truncate text-lg font-semibold tracking-tight text-white max-w-[320px]">{pageTitle}</p>
					</div>

					{/* Maktab nomi faqat sidebar yopiq bo‘lsa ko‘rinadi */}
					{!sidebarOpen && (
						<span className="font-bold transition-opacity truncate max-w-[200px]">
							{org.orgName}
						</span>
					)}
				</div>

				{/* RIGHT */}
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
								onClick={() => {
									navigate('/user/profile')
									setOpen(false)
								}}
								className="w-full text-left px-4 py-3 hover:bg-gray-100"
							>
								Profil
							</button>

							<button
								onClick={() => navigate('/logout')}
								className="w-full text-left px-4 py-3 text-red-600 hover:bg-red-50"
							>
								<FiLogOut className="inline mr-2" />
								Chiqish
							</button>
						</div>
					)}
				</div>

			</div>
		</header>
	)
}

export default UserAdminNavbar

