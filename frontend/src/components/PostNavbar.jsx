import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiLogOut, FiMenu, FiUser } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { tx } from '../i18n'

const PostNavbar = ({ onToggleSidebar, sidebarOpen }) => {
	const navigate = useNavigate()
	const [open, setOpen] = useState(false)
	const [user, setUser] = useState({})
	const token = localStorage.getItem('token')
	const ref = useRef(null)

	useEffect(() => {
		axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getUser`, {
			headers: { Authorization: `Bearer ${token}` }
		}).then(res => setUser(res.data?.user || {}))
	}, [token])

	useEffect(() => {
		const close = (e) => {
			if (ref.current && !ref.current.contains(e.target)) setOpen(false)
		}
		document.addEventListener('mousedown', close)
		return () => document.removeEventListener('mousedown', close)
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

					{!sidebarOpen && (
						<span className="font-bold">
							{tx("FACE")}<span className="text-cyan-300">{tx("ID")}</span>
						</span>
					)}
				</div>

				{/* RIGHT */}
				<div className="relative" ref={ref}>
					<button
						onClick={() => setOpen(p => !p)}
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
									navigate('/post/profile')
									setOpen(false)
								}}
								className="w-full text-left px-4 py-3 hover:bg-gray-100"
							>
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
		</header>
	)
}

export default PostNavbar

