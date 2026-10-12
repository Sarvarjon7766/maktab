import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FaSchool, FaUserGraduate, FaChalkboardTeacher, FaVideo } from 'react-icons/fa'
import { FiMapPin, FiPhone, FiRefreshCw, FiSearch, FiUsers } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import SearchableSelect from '../../components/SearchableSelect'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

const PlatformSchoolControl = () => {
	const [schools, setSchools] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [query, setQuery] = useState('')
	const [status, setStatus] = useState('all')
	const navigate = useNavigate()

	const load = async () => {
		setLoading(true)
		setError(false)
		try {
			const res = await api.get('/api/schools/platform-stats', authHeaders())
			if (res.data.success) setSchools(res.data.schools)
			else setError(true)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => { load() }, [])

	const visibleSchools = useMemo(() => schools.filter(school => {
		const needle = norm(query.trim())
		const matchesQuery = !needle || [school.name, school.code, school.region, school.district].some(value => norm(value).includes(needle))
		return matchesQuery && (status === 'all' || (status === 'active' ? school.isActive : !school.isActive))
	}), [schools, query, status])

	const totals = schools.reduce((acc, school) => {
		const stats = school.stats || {}
		return {
			staff: acc.staff + (stats.staffTotal || 0), students: acc.students + (stats.studentTotal || 0),
			admins: acc.admins + (stats.adminTotal || 0), classes: acc.classes + (stats.classTotal || 0),
			cameras: acc.cameras + (stats.cameraTotal || 0), camerasOnline: acc.camerasOnline + (stats.cameraOnline || 0)
		}
	}, { staff: 0, students: 0, admins: 0, classes: 0, cameras: 0, camerasOnline: 0 })

	return <main className="min-h-full bg-slate-50 p-4 md:p-6">
		<header className="flex justify-end gap-2 mb-6">
			<button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} /> {tx("Yangilash")}</button>
		</header>

		<div className="grid grid-cols-2 xl:grid-cols-6 gap-3 mb-6">
			<TotalCard label={tx("Maktab")} value={schools.length} icon={<FaSchool />} color="blue" />
			<TotalCard label={tx("Admin")} value={totals.admins} icon={<FiUsers />} color="violet" />
			<TotalCard label={tx("Xodim")} value={totals.staff} icon={<FaChalkboardTeacher />} color="indigo" />
			<TotalCard label={tx("O‘quvchi")} value={totals.students} icon={<FaUserGraduate />} color="amber" />
			<TotalCard label={tx("Sinf")} value={totals.classes} icon={<FiUsers />} color="green" />
			<TotalCard label={tx("Kamera online")} value={`${totals.camerasOnline}/${totals.cameras}`} icon={<FaVideo />} color="cyan" />
		</div>

		<section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
			<div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
				<div><h2 className="font-semibold text-slate-900">{tx("Maktablar bo‘yicha to‘liq ko‘rinish")}</h2><p className="text-xs text-slate-500 mt-1">{tx('{{n}} ta maktab ko‘rsatilmoqda · tokenlar xavfsizlik uchun yashirilgan', { n: visibleSchools.length })}</p></div>
				<div className="flex flex-col sm:flex-row gap-2">
					<label className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx("Maktab yoki hudud qidirish")} className="w-full sm:w-64 rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
					<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" value={status} onChange={setStatus} options={[{ value: 'all', label: tx('Barcha holatlar') }, { value: 'active', label: tx('Faol') }, { value: 'inactive', label: tx('To‘xtatilgan') }]} />
				</div>
			</div>
			{error ? <div className="p-10 text-center text-sm text-red-600">{tx("Maktab ma’lumotlarini olishda xatolik yuz berdi.")}</div> : loading ? <div className="p-10 text-center text-sm text-slate-400">{tx("Yuklanmoqda...")}</div> : visibleSchools.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4">
				{visibleSchools.map(school => <SchoolCard key={school._id} school={school} onOpen={() => school.isActive && navigate(`/platform/schools/${school._id}`)} />)}
			</div> : <div className="p-10 text-center text-sm text-slate-500">{tx("Qidiruv bo‘yicha maktab topilmadi.")}</div>}
		</section>
	</main>
}

const TotalCard = ({ label, value, icon, color }) => {
	const palette = { blue: 'bg-blue-50 text-blue-600', violet: 'bg-violet-50 text-violet-600', indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-green-50 text-green-600', cyan: 'bg-cyan-50 text-cyan-600' }
	return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex justify-between items-center"><span className="text-xs text-slate-500">{label}</span><span className={`w-8 h-8 rounded-lg flex items-center justify-center ${palette[color]}`}>{icon}</span></div><p className="mt-2 text-xl font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p></div>
}

const SchoolCard = ({ school, onOpen }) => {
	const stats = school.stats || {}
	const cameraSummary = stats.cameraTotal ? tx('{{on}} online · {{off}} offline · {{unk}} noma’lum', { on: stats.cameraOnline || 0, off: stats.cameraOffline || 0, unk: stats.cameraUnknown || 0 }) : tx('Kamera kiritilmagan')
	const cameraSeen = stats.cameraLastSeenAt ? new Date(stats.cameraLastSeenAt).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : tx('Heartbeat kelmagan')
	const tokenUpdated = school.apiTokenRotatedAt ? new Date(school.apiTokenRotatedAt).toLocaleDateString('uz-UZ') : tx('Ma’lumot yo‘q')
	return <article className="rounded-xl border border-slate-200 bg-white overflow-hidden hover:border-slate-300 transition">
		<div className="flex items-start justify-between gap-3 p-4 border-b border-slate-100"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{school.name}</h3><span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${school.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{school.isActive ? tx("Faol") : tx("To‘xtatilgan")}</span></div><p className="text-xs text-slate-500 mt-1">{tx('Kod: {{code}}', { code: school.code })}</p></div><button onClick={onOpen} disabled={!school.isActive} className="shrink-0 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">{tx("Maktabni ochish")}</button></div>
		<div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-600 border-b border-slate-100"><div className="flex items-center gap-1.5 min-w-0"><FiMapPin className="shrink-0 text-slate-400" /><span className="truncate">{[school.region, school.district].filter(Boolean).join(', ') || tx("Hudud ko‘rsatilmagan")}</span></div><div className="flex items-center gap-1.5 min-w-0"><FiPhone className="shrink-0 text-slate-400" /><span className="truncate">{school.phone || tx("Telefon kiritilmagan")}</span></div></div>
		<div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100"><MiniMetric icon={<FaChalkboardTeacher />} name={tx('Xodim')} value={stats.staffTotal || 0} /><MiniMetric icon={<FaUserGraduate />} name={tx('O‘quvchi')} value={stats.studentTotal || 0} /><MiniMetric icon={<FiUsers />} name={tx('Admin / sinf')} value={`${stats.adminTotal || 0} / ${stats.classTotal || 0}`} /><MiniMetric icon={<FaVideo />} name={tx('Kameralar')} value={`${stats.cameraOnline || 0}/${stats.cameraTotal || 0}`} /></div>
		<div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3"><div><p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{tx("Bugungi davomat")}</p><p className="text-xs text-slate-600">{tx("Xodim")} <b className="text-slate-900">{stats.staffPresent || 0}/{stats.staffTotal || 0}</b> {tx("· O‘quvchi")} <b className="text-slate-900">{stats.studentPresent || 0}/{stats.studentTotal || 0}</b></p></div><div><p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">{tx("Kamera va token holati")}</p><p className="text-xs text-slate-600">{tx("Kamera:")} <b className="text-slate-800">{cameraSummary}</b></p><p className="text-xs text-slate-500 mt-0.5">{tx('Oxirgi heartbeat: {{when}}', { when: cameraSeen })}</p><p className="text-xs text-slate-500 mt-0.5">{tx("Token {{prefix}} · yangilangan {{when}}", { prefix: school.apiTokenPrefix ? `${school.apiTokenPrefix}…` : tx("mavjud emas"), when: tokenUpdated })}</p></div></div>
	</article>
}

const MiniMetric = ({ icon, name, value }) => <div className="px-3 py-3"><div className="flex items-center gap-1.5 text-[11px] text-slate-400">{icon}{name}</div><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>

export default PlatformSchoolControl

