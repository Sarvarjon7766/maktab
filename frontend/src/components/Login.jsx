import FaceIdMark from "./FaceIdMark"
import axios from "axios"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "react-toastify"
import "react-toastify/dist/ReactToastify.css"
import { useOrg } from "../context/OrgContext"
import BrandLogo from "./BrandLogo"
import { clearSession } from "../api/sessionCleanup"
import { resetMonitorLevel } from "../pages/monitor/monitorLevel"

const Login = () => {
	const org = useOrg()
	const { refresh: refreshOrg } = org
	const [formData, setFormData] = useState({ username: "", password: "" })
	const [isLoading, setIsLoading] = useState(false)
	const [isCheckingToken, setIsCheckingToken] = useState(true)
	const navigate = useNavigate()

	// Desktop ilova (FaceControldesk) ichida ishlayotgan bo'lsak, `window.electronAPI`
	// preload orqali mavjud bo'ladi — shu orqali tokenni ilova qayta ochilganda
	// tiklaymiz va saqlaymiz (brauzerda oddiy localStorage yetarli)
	const isDesktop = typeof window !== "undefined" && !!window.electronAPI

	const verifyToken = async (token) => {
		try {
			const res = await axios.get(
				`${import.meta.env.VITE_BASE_URL}/api/user/verify-token`,
				{ headers: { Authorization: `Bearer ${token}` } }
			)
			if (!res.data?.success) return { ok: false }
			return { ok: true, role: res.data.user?.role }
		} catch {
			return { ok: false }
		}
	}

	const redirectBasedOnRole = (role) => {
		const routes = {
			admin: "/admin",
			viewer: "/viewer",
			leader: "/leader",
			user: "/user",
			superadmin: "/platform",
			monitor: "/monitor",
		}
		navigate(routes[role] || "/", { replace: true })
	}

	useEffect(() => {
		// Logout'dan keyin (yoki birinchi ochilishda) platforma brendiga
		// qaytarish — Logout.jsx localStorage'ni tozalab shu sahifaga
		// qaytaradi, lekin OrgProvider App'ning tepasida bir marta
		// o'rnatilgani uchun o'zi qayta so'ramaydi
		refreshOrg()
		const check = async () => {
			// Superadmin maktab ichida bo'lsa `token` maktab tokeniga almashgan —
			// tekshirish va yangilash barqaror platformToken orqali bajariladi
			let token = localStorage.getItem("platformToken") || localStorage.getItem("token")

			// Brauzerda token topilmasa, desktop ilovada oldin saqlangan
			// tokenni tiklashga harakat qilamiz
			if (!token && isDesktop) {
				token = await window.electronAPI.getToken()
			}
			if (!token) return setIsCheckingToken(false)

			const { ok, role } = await verifyToken(token)
			if (ok && role) {
				localStorage.setItem("token", token)
				localStorage.setItem("content-type", role)
				// superadmin uchun barqaror nusxa — /platform/schools/:id ichiga
				// "kirilganda" `token` vaqtincha o'sha maktab tokeniga almashtiriladi,
				// bu esa asl (platforma) tokenini har doim tiklab olish manbai
				if (role === "superadmin") localStorage.setItem("platformToken", token)
				redirectBasedOnRole(role)
			} else {
				await clearSession()
				setIsCheckingToken(false)
			}
		}
		check()
	}, [])

	const handleChange = (e) =>
		setFormData((p) => ({ ...p, [e.target.name]: e.target.value }))

	const handleSubmit = async (e) => {
		e.preventDefault()
		if (!formData.username || !formData.password)
			return toast.error("Barcha maydonlarni to‘ldiring")

		setIsLoading(true)
		try {
			const res = await axios.post(
				`${import.meta.env.VITE_BASE_URL}/api/user/auth`,
				formData
			)

			if (!res.data?.success) throw new Error()

			resetMonitorLevel()
			localStorage.setItem("token", res.data.token)
			localStorage.setItem("content-type", res.data.role)
			if (res.data.role === "superadmin") localStorage.setItem("platformToken", res.data.token)
			if (isDesktop) window.electronAPI.saveToken(res.data.token)

			toast.success("Muvaffaqiyatli kirish")
			redirectBasedOnRole(res.data.role)
		} catch {
			toast.error("Login yoki parol noto‘g‘ri")
		} finally {
			setIsLoading(false)
		}
	}

	if (isCheckingToken)
		return (
			<div className="min-h-screen flex items-center justify-center bg-slate-100">
				<div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
			</div>
		)

	return (
		<div className="min-h-screen grid md:grid-cols-2 bg-slate-100">
			{/* LEFT PANEL */}
			<div className="hidden md:flex relative bg-gradient-to-br from-blue-800 to-blue-950 text-white px-16 overflow-hidden">
				<div className="absolute -right-24 -top-24 w-96 h-96 rounded-full bg-white/5" />
				<div className="absolute -left-16 bottom-0 w-72 h-72 rounded-full bg-white/5" />

				<div className="relative z-10 flex flex-col justify-center max-w-lg">
					<div className="flex items-center gap-3 mb-6">
						<BrandLogo className="w-11 h-11" />
						<span className="text-xl font-semibold tracking-tight">{org.isPlatform ? "School Supervision" : org.orgName}</span>
					</div>

					<h1 className="text-4xl font-bold mb-4">
						{org.isPlatform ? "Maktablar uchun yuz-nazorat tizimi" : org.orgName}
					</h1>

					<p className="text-blue-200 text-lg">
						Davomatni nazorat qilish va tahlil qilish uchun yagona platforma
					</p>

					<div className="mt-10 space-y-3 text-blue-100">
						{["Avtomatlashtirilgan yuz aniqlash nazorati", "Davomatni aniq hisoblash", "Xavfsiz va yopiq tizim"].map(text => (
							<div key={text} className="flex items-center gap-3">
								<span className="shrink-0 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
									<svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</span>
								<span>{text}</span>
							</div>
						))}
					</div>

					{/* CONTACT */}
					{(org.phone || org.region) && (
						<div className="absolute bottom-10 left-16 right-16 border-t border-blue-500/30 pt-6">
							{org.phone && (
								<>
									<p className="text-blue-300 text-sm mb-1">Aloqa uchun</p>
									<p className="text-white font-semibold text-xl tracking-wide">
										{org.phone}
									</p>
								</>
							)}
							{org.region && (
								<p className="text-blue-200 text-xs leading-relaxed mt-2">
									{org.region} <br />
									<span className="font-medium">{org.itCenter}</span>
								</p>
							)}
						</div>
					)}
				</div>
			</div>

			{/* RIGHT PANEL */}
			<div className="flex items-center justify-center px-6">
				<div className="w-full max-w-md bg-white/80 backdrop-blur-xl border border-white/40 shadow-2xl rounded-2xl p-8">
					<div className="text-center mb-8">
						<FaceIdMark className="w-16 h-16 mx-auto mb-4" />
						<h2 className="text-2xl font-bold text-slate-800">
							Tizimga kirish
						</h2>
						<p className="text-slate-500 text-sm mt-1">
							{org.isPlatform ? "Login va parolingizni kiriting" : `${org.orgName} xodimlari uchun`}
						</p>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="relative">
							<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
								<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
									<circle cx="12" cy="8" r="4" />
									<path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
								</svg>
							</span>
							<input
								name="username"
								value={formData.username}
								onChange={handleChange}
								placeholder="Foydalanuvchi nomi"
								autoComplete="username"
								className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-black placeholder-slate-400
								focus:ring-2 focus:ring-blue-500 focus:border-blue-600 outline-none transition"
							/>
						</div>

						<div className="relative">
							<span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
								<svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
									<rect x="3" y="11" width="18" height="11" rx="2" />
									<path d="M7 11V7a5 5 0 0 1 10 0v4" />
								</svg>
							</span>
							<input
								type="password"
								name="password"
								value={formData.password}
								onChange={handleChange}
								placeholder="Parol"
								autoComplete="current-password"
								className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-300 text-black placeholder-slate-400
								focus:ring-2 focus:ring-blue-500 focus:border-blue-600 outline-none transition"
							/>
						</div>

						<button
							disabled={isLoading}
							className="w-full py-3 rounded-xl font-medium text-white
              bg-gradient-to-r from-blue-700 to-blue-600
              hover:from-blue-800 hover:to-blue-700
              transition-all duration-200
              hover:scale-[1.02] active:scale-[0.98]
              shadow-lg"
						>
							{isLoading ? "Kirish..." : "Kirish"}
						</button>
					</form>

					{/* MOBILE CONTACT */}
					{(org.phone || org.region) && (
						<div className="mt-8 pt-6 border-t border-slate-200 text-center md:hidden space-y-2">
							{org.phone && (
								<>
									<p className="text-slate-600 text-sm">Aloqa uchun</p>
									<p className="text-blue-700 font-semibold text-lg">
										{org.phone}
									</p>
								</>
							)}
							{org.region && (
								<p className="text-slate-500 text-xs leading-relaxed">
									{org.region} <br />
									<span className="font-medium">{org.itCenter}</span>
								</p>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default Login

