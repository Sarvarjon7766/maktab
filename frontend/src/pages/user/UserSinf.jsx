import axios from 'axios'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FiChevronRight, FiSearch, FiUser, FiUsers } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'

const UserSinf = () => {
	const navigate = useNavigate()
	const token = localStorage.getItem('token')
	const [sinfs, setSinfs] = useState([])
	const [users, setUsers] = useState([])
	const [isLoading, setIsLoading] = useState(false)
	const [searchTerm, setSearchTerm] = useState('')

	// Barcha sinflarni olish
	const fetchSinfs = async () => {
		setIsLoading(true)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data.success) {
				setSinfs(res.data.sinfs)
			} else {
				toast.error(res.data.message)
			}
		} catch {
			toast.error("Server bilan aloqa xatosi")
		} finally {
			setIsLoading(false)
		}
	}

	const fetchUsers = async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, {
				headers: { Authorization: `Bearer ${token}` },
			})
			if (res.data.success) {
				setUsers(res.data.users)
			}
		} catch {
			toast.error("Server bilan aloqa xatosi")
		}
	}

	useEffect(() => {
		fetchSinfs()
		fetchUsers()
	}, [])

	// Sinflarni filtrlash
	const filteredSinfs = sinfs.filter(sinf =>
		sinf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
		(sinf.description && sinf.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
		(sinf.head && sinf.head.fullName.toLowerCase().includes(searchTerm.toLowerCase())))

	return (
		<div className="min-h-full bg-gray-50 p-3 md:p-4 lg:p-6">
			<div className="w-full">
				{/* Header Section */}
				<div className="mb-6">
					<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
						<div>
						</div>

						{/* Search Bar */}
						<div className="w-full sm:w-auto">
							<div className="relative">
								<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
									<FiSearch className="text-gray-400" />
								</div>
								<input
									type="text"
									placeholder={tx("Sinf qidirish...")}
									className="block w-full sm:w-64 pl-10 pr-4 text-sm text-black py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
									value={searchTerm}
									onChange={(e) => setSearchTerm(e.target.value)}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Main Content */}
				{isLoading ? (
					<div className="flex justify-center py-20">
						<motion.div
							animate={{ rotate: 360 }}
							transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
							className="h-12 w-12 rounded-full border-4 border-t-blue-500 border-r-blue-300 border-b-blue-100 border-l-transparent"
						/>
					</div>
				) : filteredSinfs.length === 0 ? (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8 text-center"
					>
						<div className="mx-auto h-16 w-16 md:h-20 md:w-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
							<FiUsers className="text-blue-500 text-xl md:text-2xl" />
						</div>
						<h3 className="text-lg font-medium text-gray-800 mb-2">
							{searchTerm ? tx("Natija topilmadi") : tx("Sinflar mavjud emas")}
						</h3>
						<p className="text-gray-500 text-sm max-w-md mx-auto">
							{searchTerm
								? `"${searchTerm}" bo'yicha hech qanday sinf topilmadi`
								: tx("Hozircha tizimda birorta ham sinf mavjud emas")}
						</p>
					</motion.div>
				) : (
					<>
						{/* Desktop Table - Hidden on mobile */}
						<div className="hidden lg:block">
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
							>
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-gray-200">
										<thead className="bg-gray-50">
											<tr>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
													{tx("Sinf nomi")}
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
													{tx("Xodimlar soni")}
												</th>
												<th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
													{tx("Sinf rahbari")}
												</th>
												<th className="px-4 py-3 w-10"></th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{filteredSinfs.map((sinf) => (
												<motion.tr
													key={sinf._id}
													onClick={() => navigate(`${sinf._id}`)}
													whileHover={{ backgroundColor: "#f9fafb" }}
													className="transition-colors cursor-pointer"
												>
													<td className="px-4 py-3">
														<div className="flex items-center">
															<div className="text-sm font-medium text-gray-900">
																{sinf.name}
															</div>
														</div>
													</td>

													<td className="px-4 py-3">
														<span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
															{tx("{{n}} ta", { n: users.filter((u) => u.sinf?._id === sinf._id).length })}
														</span>
													</td>

													<td className="px-4 py-3">
														{sinf.head ? (
															<div className="flex items-center">
																<div className="flex-shrink-0 h-9 w-9 rounded-full bg-purple-100 flex items-center justify-center mr-2 overflow-hidden">
																	{sinf.head.photo ? (
																		<img
																			src={`${uploadUrl(sinf.head.photo)}`}
																			alt={sinf.head.fullName}
																			className="h-full w-full object-cover"
																		/>
																	) : (
																		<FiUser className="text-purple-500" />
																	)}
																</div>
																<div>
																	<div className="text-sm font-medium text-gray-900">
																		{sinf.head.fullName}
																	</div>
																	<div className="text-xs text-gray-500">{tx("Sinf rahbari")}</div>
																</div>
															</div>
														) : (
															<span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
																{tx("Tayinlanmagan")}
															</span>
														)}
													</td>
																							<td className="px-4 py-3">
												<FiChevronRight className="text-gray-300" />
											</td>
										</motion.tr>
											))}
										</tbody>
									</table>
								</div>
							</motion.div>
						</div>

						{/* Mobile Cards - Shown on mobile and tablet */}
						<div className="lg:hidden space-y-4">
							{filteredSinfs.map((sinf) => (
								<motion.div
									key={sinf._id}
									onClick={() => navigate(`${sinf._id}`)}
									initial={{ opacity: 0, y: 20 }}
									animate={{ opacity: 1, y: 0 }}
									whileHover={{ scale: 1.01 }}
									className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 cursor-pointer"
								>
									<div className="flex items-start justify-between mb-3">
										<div className="flex items-start">
											<div className="flex-shrink-0 h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-3">
												{sinf.name.charAt(0)}
											</div>
											<div>
												<h3 className="text-sm font-semibold text-gray-900">{sinf.name}</h3>
												<div className="flex items-center mt-1">
													<span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
														{tx("{{n}} xodim", { n: users.filter((u) => u.sinf?._id === sinf._id).length })}
													</span>
												</div>
											</div>
										</div>
										<FiChevronRight className="text-gray-400 text-lg" />
									</div>

									<div className="space-y-3">
										<div>
											<p className="text-xs text-gray-500 mb-1">{tx("Tavsifi")}</p>
											<p className="text-sm text-gray-700 line-clamp-2">
												{sinf.description || tx("Tavsif mavjud emas")}
											</p>
										</div>

										<div>
											<p className="text-xs text-gray-500 mb-1">{tx("Sinf rahbari")}</p>
											{sinf.head ? (
												<div className="flex items-center">
													<div className="flex-shrink-0 h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center mr-2 overflow-hidden">
														{sinf.head.photo ? (
															<img
																src={`${uploadUrl(sinf.head.photo)}`}
																alt={sinf.head.fullName}
																className="h-full w-full object-cover"
															/>
														) : (
															<FiUser className="text-purple-500 text-sm" />
														)}
													</div>
													<div>
														<div className="text-sm font-medium text-gray-900">
															{sinf.head.fullName}
														</div>
													</div>
												</div>
											) : (
												<span className="px-2 py-1 inline-flex text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
													{tx("Tayinlanmagan")}
												</span>
											)}
										</div>
									</div>
								</motion.div>
							))}
						</div>
					</>
				)}


			</div>
		</div>
	)
}

export default UserSinf
