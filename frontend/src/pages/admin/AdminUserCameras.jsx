import axios from "axios"
import { Camera, Search } from "lucide-react"
import { useEffect, useState } from "react"

export default function AdminUserCameras() {
	/* ================= STATE ================= */
	const [cameras, setCameras] = useState([])
	const [loading, setLoading] = useState(true)
	const [searchTerm, setSearchTerm] = useState("")

	const BASE_URL = import.meta.env.VITE_BASE_URL
	const token = localStorage.getItem("token")

	/* ================= FILTERED CAMERAS ================= */
	const filteredCameras = cameras.filter(camera =>
		camera.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
		camera.serialNo?.toLowerCase().includes(searchTerm.toLowerCase())
	)

	/* ================= GET ALL CAMERAS ================= */
	const getCameras = async (silent = false) => {
		try {
			if (!silent) setLoading(true)
			const res = await axios.get(
				`${BASE_URL}/api/camera/getAll`,
				{
					headers: { Authorization: `Bearer ${token}` }
				}
			)
			setCameras(res.data.cameras || [])
		} catch (err) {
			console.error("Kameralarni yuklashda xatolik:", err)
		} finally {
			if (!silent) setLoading(false)
		}
	}

	useEffect(() => {
		getCameras()
		// HikConnect heartbeat ~60s'da yangilanadi, shuning uchun (skeletonsiz) shunga mos poll qilamiz
		const interval = setInterval(() => getCameras(true), 30000)
		return () => clearInterval(interval)
	}, [])


	/* ================= LOADING SKELETON ================= */
	const LoadingSkeleton = () => (
		<div className="space-y-3">
			{[1, 2, 3].map((i) => (
				<div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl animate-pulse">
					<div className="flex items-center gap-4">
						<div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
						<div className="space-y-2">
							<div className="w-32 h-4 bg-gray-200 rounded"></div>
							<div className="w-24 h-3 bg-gray-200 rounded"></div>
						</div>
					</div>
				</div>
			))}
		</div>
	)

	/* ================= NO CAMERAS MESSAGE ================= */
	const NoCamerasMessage = () => (
		<div className="text-center py-16">
			<div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full mb-4">
				<Camera className="text-gray-400" size={32} />
			</div>
			<h3 className="text-xl font-semibold text-gray-700 mb-2">
				Qurilmalar topilmadi
			</h3>
			<p className="text-gray-500">
				Hozircha hech qanday qurilma mavjud emas
			</p>
		</div>
	)

	/* ================= NO SEARCH RESULTS ================= */
	const NoSearchResults = () => (
		<div className="text-center py-12">
			<Search className="mx-auto text-gray-400 mb-3" size={40} />
			<h3 className="text-lg font-semibold text-gray-700 mb-2">
				Natija topilmadi
			</h3>
			<p className="text-gray-500">
				"{searchTerm}" so'rovi bo'yicha qurilma topilmadi
			</p>
		</div>
	)

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
			<div className="mx-auto">
				<div className="p-6 mb-8">
					<div className="mb-6">
						<div className="relative">
							<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
							<input
								type="text"
								placeholder="Qurilma nomi yoki serial raqami bo'yicha qidirish..."
								className="w-full pl-12 pr-4 text-black py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
							/>
						</div>
					</div>

					<div className="rounded-xl">
						{loading ? (
							<LoadingSkeleton />
						) : cameras.length === 0 ? (
							<NoCamerasMessage />
						) : filteredCameras.length === 0 ? (
							<NoSearchResults />
						) : (
							<div className="grid gap-3">
								{filteredCameras.map((cam) => (
									<div
										key={cam._id}
										className="group flex items-center justify-between p-5 border border-gray-100 rounded-xl shadow-sm hover:border-blue-200 hover:shadow-md transition-all duration-300"
									>
										<div className="flex items-center gap-4">
											<div className="relative">
												<div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
													<Camera className="text-white" size={22} />
												</div>
												<div
													className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white ${
														cam.online === true ? "bg-green-500" : cam.online === false ? "bg-red-500" : "bg-gray-300"
													}`}
													title={
														cam.online === true
															? "Onlayn"
															: cam.online === false
															? `Oflayn${cam.lastStatusError ? `: ${cam.lastStatusError}` : ""}`
															: "Holat noma'lum"
													}
												/>
											</div>
											<div>
												<div className="flex items-center gap-2">
													<h3 className="font-semibold text-black text-lg">
														{cam.name}
													</h3>
												</div>
												<div className="flex flex-wrap items-center gap-2 mt-1">
													{cam.post !== null && cam.post !== undefined && (
														<span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-lg text-xs">
															Post: {cam.post}
														</span>
													)}
													{cam.direction && (
														<span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
															cam.direction === "in" ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
														}`}>
															{cam.direction === "in" ? "Kirish" : "Chiqish"}
														</span>
													)}
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

				</div>
			</div>
		</div>
	)
}

