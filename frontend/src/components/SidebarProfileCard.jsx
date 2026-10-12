import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiUser } from 'react-icons/fi'
import { Link, useLocation } from 'react-router-dom'
import { uploadUrl } from '../utils/uploadUrl'
import { tx } from '../i18n'

const SidebarProfileCard = ({ collapsed = false, onNavigate }) => {
	const location = useLocation()
	const [user, setUser] = useState(null)
	const token = localStorage.getItem('token')

	useEffect(() => {
		if (!token) return
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, {
			headers: { Authorization: `Bearer ${token}` },
		}).then(res => {
			if (res.data?.success) setUser(res.data.user)
		}).catch(() => {})
	}, [token])

	const basePath = `/${location.pathname.split('/')[1] || ''}`
	const profilePath = `${basePath}/profile`
	const initials = user?.fullName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

	return (
		<div className="px-3 pt-3">
			<Link
				to={profilePath}
				onClick={onNavigate}
				className={`group flex items-center gap-3 rounded-lg p-2.5 border border-white/15 bg-black/10 hover:bg-white/10 transition-colors ${collapsed ? 'justify-center' : ''}`}
			>
				<div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--org-accent)] to-[var(--org-primary)] flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
					{user?.photo
						? <img src={`${uploadUrl(user.photo)}`} alt={user.fullName} className="w-full h-full object-cover" />
						: initials || <FiUser size={16} />
					}
				</div>
				<div className={`min-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 ${collapsed ? 'max-w-0 opacity-0' : 'max-w-[180px] flex-1 opacity-100'}`}>
					<p className="text-sm font-semibold text-white truncate">{user?.fullName || tx("Profil")}</p>
					<p className="text-xs text-white/70 truncate">{user?.position || tx("Mening profilim")}</p>
				</div>
			</Link>
		</div>
	)
}

export default SidebarProfileCard
