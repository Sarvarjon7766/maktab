import axios from 'axios'
import { useEffect, useState } from 'react'
import { FaSchool } from 'react-icons/fa'
import { FiCheckCircle, FiXCircle } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { tx } from '../../i18n'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })

const StatCard = ({ icon, label, value, tone }) => (
	<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
		<div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tone}`}>
			{icon}
		</div>
		<div>
			<p className="text-2xl font-bold text-gray-900">{value}</p>
			<p className="text-sm text-gray-500">{label}</p>
		</div>
	</div>
)

const PlatformHome = () => {
	const [schools, setSchools] = useState([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		api.get('/api/schools/getAll', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
			.then(res => { if (res.data.success) setSchools(res.data.schools) })
			.finally(() => setLoading(false))
	}, [])

	const active = schools.filter(s => s.isActive).length

	return (
		<div className="p-4 md:p-6">

			{!loading && (
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
					<StatCard icon={<FaSchool size={22} className="text-blue-600" />} label={tx("Jami maktablar")} value={schools.length} tone="bg-blue-50" />
					<StatCard icon={<FiCheckCircle size={22} className="text-green-600" />} label={tx("Faol maktablar")} value={active} tone="bg-green-50" />
					<StatCard icon={<FiXCircle size={22} className="text-red-600" />} label={tx("To'xtatilgan")} value={schools.length - active} tone="bg-red-50" />
				</div>
			)}

			<Link
				to="/platform/schools"
				className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-medium shadow-sm"
			>
				<FaSchool size={18} /> {tx("Maktablarni boshqarish")}
			</Link>
		</div>
	)
}

export default PlatformHome

