import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiBarChart2, FiChevronDown, FiChevronUp, FiFilter, FiSearch, FiUsers } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'
import { uploadUrl } from '../../utils/uploadUrl'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')

const LeaderUsers = () => {
	const token = localStorage.getItem('token')
	const [sinfs, setDepartments] = useState([])
	const [selectedDepartment, setSelectedDepartment] = useState(null)
	const [users, setUsers] = useState([])
	const [filteredUsers, setFilteredUsers] = useState([])
	const [searchTerm, setSearchTerm] = useState('')
	const [isLoading, setIsLoading] = useState(true)
	const [expandedDepartments, setExpandedDepartments] = useState({})

	const fetchDepartments = async () => {
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})
			if (res.data.success) {
				setDepartments(res.data.sinfs)
				const expandedState = {}
				res.data.sinfs.forEach(dept => {
					expandedState[dept._id] = true
				})
				setExpandedDepartments(expandedState)
			}
		} catch {
			toast.error("Server bilan aloqa xatosi")
		}
	}

	const fetchUsers = async () => {
		setIsLoading(true)
		try {
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})
			if (res.data.success) {
				setUsers(res.data.users)
				setFilteredUsers(res.data.users)
			}
		} catch {
			toast.error("Server bilan aloqa xatosi")
		} finally {
			setIsLoading(false)
		}
	}

	useEffect(() => {
		fetchDepartments()
		fetchUsers()
	}, [])

	useEffect(() => {
		filterUsers()
	}, [selectedDepartment, searchTerm, users])

	const filterUsers = () => {
		let result = [...users]
		if (selectedDepartment && selectedDepartment !== 'all') {
			result = result.filter(user =>
				user.sinf && user.sinf._id === selectedDepartment
			)
		}
		if (searchTerm) {
			const term = norm(searchTerm.trim())
			result = result.filter(user =>
				norm(user.fullName).includes(term) ||
				norm(user.position).includes(term))
		}
		setFilteredUsers(result)
	}

	const toggleDepartment = (deptId) => {
		setExpandedDepartments(prev => ({
			...prev,
			[deptId]: !prev[deptId]
		}))
	}

	const getUsersByDepartment = (deptId) => {
		return filteredUsers.filter(user =>
			user.sinf && user.sinf._id === deptId
		)
	}

	return (
		<div className="p-4 md:p-6 bg-slate-50 min-h-full">
			{/* Filter Section */}
			<div className="bg-white rounded-lg shadow-sm p-4 md:p-5 mb-6 border border-gray-200">
				<div className="flex flex-col md:flex-row md:items-center gap-3">
					{/* Search Input */}
					<div className="relative flex-1">
						<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
							<FiSearch className="text-gray-400" />
						</div>
						<input
							type="text"
							placeholder={tx("Ism, familiya yoki lavozim boʻyicha qidirish...")}
							className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 text-gray-700 transition-all duration-200"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
						/>
					</div>

					{/* Department Filter */}
					<div className="flex items-center gap-2 w-full md:w-auto">
						<div className="relative w-full md:w-56">
							<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
								<FiFilter className="text-gray-400" />
							</div>
							<SearchableSelect
								variant="outline"
								icon={false}
								className="w-full md:w-56"
								searchPlaceholder={tx("Sinf qidirish...")}
								value={selectedDepartment || ''}
								onChange={(v) => setSelectedDepartment(v || null)}
								options={[{ value: '', label: tx('Barcha sinflar') }, ...sinfs.map(dept => ({ value: dept._id, label: dept.name }))]}
							/>
						</div>
					</div>
				</div>
			</div>

			{/* Loading State */}
			{isLoading ? (
				<div className="flex justify-center items-center p-12">
					<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
					<span className="ml-3 text-gray-600 font-medium">{tx("Ma'lumotlar yuklanmoqda...")}</span>
				</div>
			) : selectedDepartment ? (
				// Show selected department with its users
				<div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
					<div className="p-4 md:p-5 border-b border-gray-200 bg-gray-50">
						<div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
							<div>
								<h2 className="text-lg md:text-xl font-semibold text-gray-800">
									{sinfs.find(d => d._id === selectedDepartment)?.name || tx("Tanlangan sinf")}
								</h2>
								<p className="text-gray-600 mt-1 text-sm">
									{tx('{{n}} ta xodim', { n: getUsersByDepartment(selectedDepartment).length })}
								</p>
							</div>
							<button
								onClick={() => setSelectedDepartment(null)}
								className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
							>
								{tx("Barcha sinflarni koʻrish")}
							</button>
						</div>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200">
							<thead className="bg-gray-50">
								<tr>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">№</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Rasm")}</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Xodim")}</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Lavozim")}</th>
										<th scope="col" className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Amal")}</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y divide-gray-200">
								{getUsersByDepartment(selectedDepartment).length > 0 ? (
									getUsersByDepartment(selectedDepartment).map((user, index) => (
										<tr key={user._id} className="hover:bg-gray-50 transition-colors">
											<td className="px-5 py-4 text-sm text-gray-500 font-medium">
												{index + 1}
											</td>
											<td className="px-5 py-4">
												<div className="flex-shrink-0 h-14 w-14">
													{user.photo ? (
														<img
															className="h-14 w-14 rounded-full object-cover border border-gray-200"
															src={`${uploadUrl(user.photo)}`}
															alt={user.fullName}
														/>
													) : (
														<div className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 flex items-center justify-center text-blue-600 font-medium border border-gray-200 text-lg">
															{user.fullName.split(' ').map(n => n[0]).join('')}
														</div>
													)}
												</div>
											</td>
											<td className="px-5 py-4">
												<div className="text-sm font-medium text-gray-900">{user.fullName}</div>
												<div className="text-xs text-gray-500">{user.sinf?.name || tx("Sinf mavjud emas")}</div>
											</td>
											<td className="px-5 py-4">
												<div className="text-sm text-gray-900 font-medium">
													{user.position}
												</div>
											</td>
										<td className="px-5 py-4 text-right">
											<Link to={`/leader/users/${user._id}/analytics`} title={tx("Batafsil tahlil")} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
												<FiBarChart2 size={13} /> {tx("Tahlil")}
											</Link>
										</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan="4" className="px-6 py-12 text-center">
											<div className="flex flex-col items-center justify-center">
												<FiUsers className="h-16 w-16 text-gray-300 mb-4" />
												<h3 className="text-lg font-medium text-gray-700">{tx("Xodimlar topilmadi")}</h3>
												<p className="text-gray-500 mt-2 max-w-md text-sm">
													{tx("Ushbu sinfda hozircha xodimlar mavjud emas yoki qidiruv boʻyicha hech narsa topilmadi")}
												</p>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			) : (
				// Show all sinfs with expandable user lists
				<div className="space-y-4">
					{sinfs.map(department => (
						<div key={department._id} className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
							<div
								className="p-4 md:p-5 border-b border-gray-200 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
								onClick={() => toggleDepartment(department._id)}
							>
								<div>
									<h2 className="text-lg md:text-xl font-semibold text-gray-800">
										{department.name}
									</h2>
									<p className="text-gray-600 mt-1 text-sm">
										{tx('{{n}} ta xodim', { n: getUsersByDepartment(department._id).length })}
									</p>
								</div>
								<div className="text-gray-400 hover:text-gray-600 transition-colors">
									{expandedDepartments[department._id] ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
								</div>
							</div>

							{expandedDepartments[department._id] && (
								<div className="overflow-x-auto">
									<table className="min-w-full divide-y divide-gray-200">
										<thead className="bg-gray-50">
											<tr>
												<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">№</th>
												<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Rasm")}</th>
												<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Xodim")}</th>
												<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Lavozim")}</th>
										<th scope="col" className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{tx("Amal")}</th>
											</tr>
										</thead>
										<tbody className="bg-white divide-y divide-gray-200">
											{getUsersByDepartment(department._id).length > 0 ? (
												getUsersByDepartment(department._id).map((user, index) => (
													<tr key={user._id} className="hover:bg-gray-50 transition-colors">
														<td className="px-5 py-4 text-sm text-gray-500 font-medium">
															{index + 1}
														</td>
														<td className="px-5 py-4">
															<div className="flex-shrink-0 h-16 w-16">
																{user.photo ? (
																	<img
																		className="h-14 w-14 rounded-full object-cover border border-gray-200"
																		src={`${uploadUrl(user.photo)}`}
																		alt={user.fullName}
																	/>
																) : (
																	<div className="h-14 w-14 rounded-full bg-gradient-to-r from-blue-100 to-indigo-100 flex items-center justify-center text-blue-600 font-medium border border-gray-200 text-lg">
																		{user.fullName.split(' ').map(n => n[0]).join('')}
																	</div>
																)}
															</div>
														</td>
														<td className="px-5 py-4">
															<div className="text-sm font-medium text-gray-900">{user.fullName}</div>
															<div className="text-xs text-gray-500">{user.sinf?.name || tx("Sinf mavjud emas")}</div>
														</td>
														<td className="px-5 py-4">
															<div className="text-sm text-gray-900 font-medium">
																{user.position}
															</div>
														</td>
										<td className="px-5 py-4 text-right">
											<Link to={`/leader/users/${user._id}/analytics`} title={tx("Batafsil tahlil")} className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors">
												<FiBarChart2 size={13} /> {tx("Tahlil")}
											</Link>
										</td>
													</tr>
												))
											) : (
												<tr>
													<td colSpan="4" className="px-6 py-8 text-center">
														<div className="flex flex-col items-center justify-center">
															<FiUsers className="h-12 w-12 text-gray-300 mb-3" />
															<h3 className="text-base font-medium text-gray-700">{tx("Xodimlar topilmadi")}</h3>
															<p className="text-gray-500 mt-1 text-sm">{tx("Ushbu sinfda hozircha xodimlar mavjud emas")}</p>
														</div>
													</td>
												</tr>
											)}
										</tbody>
									</table>
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	)
}

export default LeaderUsers

