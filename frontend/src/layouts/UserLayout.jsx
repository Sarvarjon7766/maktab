import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { OutletBoundary } from '../components/ErrorBoundary'
import UserNavbar from '../components/UserNavbar'
import UserSidebar from '../components/UserSidebar'

const UserLayout = () => {
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
			{isMobile && sidebarOpen && (
				<>
					<div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSidebarOpen(false)} />
					<aside className="fixed top-0 left-0 z-50 h-full w-64 bg-[#0b1325]">
						<UserSidebar collapsed={false} onClose={() => setSidebarOpen(false)} />
					</aside>
				</>
			)}

			<div className="flex h-full">
				{!isMobile && (
					<aside className={`bg-[#0b1325] transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
						<UserSidebar collapsed={!sidebarOpen} />
					</aside>
				)}

				<div className="flex-1 flex flex-col min-w-0">
					<UserNavbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(p => !p)} />
					<main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
						<div className="mx-auto p-4 md:p-6">
							<OutletBoundary />
						</div>
					</main>
				</div>
			</div>
		</div>
	)
}

export default UserLayout
