import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiSearch, FiUsers } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { useSearchParams } from 'react-router-dom'

const UserUsers = () => {
	const token = localStorage.getItem('token')
	const [users, setUsers] = useState([])
	const [filteredUsers, setFilteredUsers] = useState([])
	const [searchParams] = useSearchParams()
	const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '')
	const [isLoading, setIsLoading] = useState(true)

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
		fetchUsers()
	}, [])

	useEffect(() => {
		filterUsers()
	}, [searchTerm, users])

	const filterUsers = () => {
		let result = [...users]
		if (searchTerm) {
			const term = searchTerm.toLowerCase()
			result = result.filter(user =>
				user.fullName.toLowerCase().includes(term) ||
				user.position.toLowerCase().includes(term))
		}
		setFilteredUsers(result)
	}

	return (
		<div className="p-4 md:p-6 bg-gray-50 min-h-screen">
			{/* Filter Section */}
			<div className="bg-white rounded-lg shadow-sm p-4 md:p-5 mb-6 border border-gray-200">
				<div className="relative flex-1">
					<div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
						<FiSearch className="text-gray-400" />
					</div>
					<input
						type="text"
						placeholder="Ism, familiya yoki lavozim boʻyicha qidirish..."
						className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400 text-gray-700 transition-all duration-200"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
			</div>

			{/* Loading State */}
			{isLoading ? (
				<div className="flex justify-center items-center p-12">
					<div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
					<span className="ml-3 text-gray-600 font-medium">Ma'lumotlar yuklanmoqda...</span>
				</div>
			) : (
				<div className="bg-white rounded-lg shadow-sm overflow-hidden border border-gray-200">
					<div className="p-4 md:p-5 border-b border-gray-200 bg-gray-50">
						<h2 className="text-lg md:text-xl font-semibold text-gray-800">Xodimlar</h2>
						<p className="text-gray-600 mt-1 text-sm">{filteredUsers.length} ta xodim</p>
					</div>

					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200">
							<thead className="bg-gray-50">
								<tr>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">№</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rasm</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Xodim</th>
									<th scope="col" className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lavozim</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y divide-gray-200">
								{filteredUsers.length > 0 ? (
									filteredUsers.map((user, index) => (
										<tr key={user._id} className="hover:bg-gray-50 transition-colors">
											<td className="px-5 py-4 text-sm text-gray-500 font-medium">
												{index + 1}
											</td>
											<td className="px-5 py-4">
												<div className="flex-shrink-0 h-14 w-14">
													{user.photo ? (
														<img
															className="h-14 w-14 rounded-full object-cover border border-gray-200"
															src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`}
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
											</td>
											<td className="px-5 py-4">
												<div className="text-sm text-gray-900 font-medium">
													{user.position}
												</div>
											</td>
										</tr>
									))
								) : (
									<tr>
										<td colSpan="4" className="px-6 py-12 text-center">
											<div className="flex flex-col items-center justify-center">
												<FiUsers className="h-16 w-16 text-gray-300 mb-4" />
												<h3 className="text-lg font-medium text-gray-700">Xodimlar topilmadi</h3>
												<p className="text-gray-500 mt-2 max-w-md text-sm">
													Qidiruv boʻyicha hech narsa topilmadi
												</p>
											</div>
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	)
}

export default UserUsers
