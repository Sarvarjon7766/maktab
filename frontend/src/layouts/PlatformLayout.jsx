import { useEffect, useState } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { OutletBoundary } from '../components/ErrorBoundary'
import PlatformNavbar from '../components/PlatformNavbar'
import PlatformSidebar from '../components/PlatformSidebar'

const PlatformLayout = () => {
	const navigate = useNavigate()
	const inSchool = useMatch('/platform/schools/:schoolId/*')
	const [sidebarOpen, setSidebarOpen] = useState(true)
	const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)

	useEffect(() => {
		if (!localStorage.getItem('token')) navigate('/')
	}, [navigate])

	// `token` faqat /platform/schools/:id/* ichida (PlatformSchoolShell
	// tomonidan) vaqtincha o'sha maktabning taqlid tokeniga almashtiriladi.
	// PlatformSchoolShell'ning "chiqishda tiklash" effekti FAQAT React
	// client-side navigatsiyada ishlaydi — qattiq sahifa yangilash (F5)
	// yoki to'g'ridan-to'g'ri URL orqali /platform'ning boshqa bo'limiga
	// o'tishda unmount tsikli chaqirilmasligi mumkin.
	//
	// DIQQAT: bu ATAYLAB useEffect emas, render paytida bevosita ishga
	// tushadi — React effektlarni FARZAND komponentdan (masalan Audit
	// jurnali sahifasining o'zi ma'lumot so'ragan effekti) OLDIN emas,
	// KEYIN chaqiradi (bottom-up tartib), shuning uchun useEffect'da
	// qilinsa farzand allaqachon eski (almashtirilgan) token bilan so'rov
	// yuborib ulgurgan bo'lardi. Render paytida esa bu ANIQ farzand
	// render qilinishidan OLDIN bajariladi — musobaqa (race) yo'q
	if (!inSchool) {
		const platformToken = localStorage.getItem('platformToken')
		if (platformToken && localStorage.getItem('token') !== platformToken) {
			localStorage.setItem('token', platformToken)
		}
	}

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
						<PlatformSidebar collapsed={false} onClose={() => setSidebarOpen(false)} />
					</aside>
				</>
			)}

			<div className="flex h-full">
				{!isMobile && (
					<aside className={`bg-[#0b1325] transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}>
						<PlatformSidebar collapsed={!sidebarOpen} />
					</aside>
				)}

				<div className="flex-1 flex flex-col min-w-0">
					<PlatformNavbar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(p => !p)} />
					<main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
						<OutletBoundary />
					</main>
				</div>
			</div>
		</div>
	)
}

export default PlatformLayout

