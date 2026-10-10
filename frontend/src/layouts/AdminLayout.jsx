import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OutletBoundary } from '../components/ErrorBoundary'
import AdminNavbar from '../components/AdminNavbar'
import AdminSidebar from '../components/AdminSidebar'

const AdminLayout = () => {
	const navigate = useNavigate()
	const [sidebarOpen, setSidebarOpen] = useState(true)
	const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)

	useEffect(() => {
		if (!localStorage.getItem('token')) navigate('/')
	}, [navigate])

	useEffect(() => {
		const resize = () => {
			const mobile = window.innerWidth < 1024
			setIsMobile(mobile)
			setSidebarOpen(!mobile)
		}
		resize()
		window.addEventListener('resize', resize)
		return () => window.removeEventListener('resize', resize)
	}, [])

	return (
		<div className="h-screen overflow-hidden bg-gray-100">
			{/* MOBILE SIDEBAR */}
			{isMobile && sidebarOpen && (
				<>
					<div
						className="fixed inset-0 bg-black/40 z-40"
						onClick={() => setSidebarOpen(false)}
					/>
					<aside className="fixed top-0 left-0 z-50 h-full w-64 bg-slate-900">
						<AdminSidebar onClose={() => setSidebarOpen(false)} />
					</aside>
				</>
			)}

			{/* DESKTOP */}
			<div className="flex h-full">
				{!isMobile && (
					<aside
						className={`
              bg-slate-900 transition-all duration-300
              ${sidebarOpen ? 'w-64' : 'w-20'}
            `}
					>
						<AdminSidebar collapsed={!sidebarOpen} />
					</aside>
				)}

				{/* MAIN */}
				<div className="flex-1 flex flex-col min-w-0">
					<AdminNavbar
						sidebarOpen={sidebarOpen}
						onToggleSidebar={() => setSidebarOpen(p => !p)}
					/>

					<main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
						<OutletBoundary />
					</main>
				</div>
			</div>
		</div>
	)
}

export default AdminLayout

