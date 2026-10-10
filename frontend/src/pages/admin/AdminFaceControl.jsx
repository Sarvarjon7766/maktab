import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiActivity, FiLogIn, FiLogOut, FiRefreshCw, FiSearch, FiUsers, FiVideo } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import HikLivePlayer from '../../components/HikLivePlayer'
import { CameraSettings, authHeaders, statusOf } from '../../components/HikCameraList'
import SearchableSelect from '../../components/SearchableSelect'

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())

const ago = (date) => {
	if (!date) return 'hali yo\'q'
	const sec = Math.round((Date.now() - new Date(date).getTime()) / 1000)
	if (sec < 60) return 'hozirgina'
	if (sec < 3600) return `${Math.round(sec / 60)} daqiqa oldin`
	if (sec < 86400) return `${Math.round(sec / 3600)} soat oldin`
	return `${Math.round(sec / 86400)} kun oldin`
}

const timeOf = (d) => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tashkent' })

const Stat = ({ icon, label, value, tone, to }) => {
	const navigate = useNavigate()
	return (
	<div {...(to ? { role: 'button', tabIndex: 0, onClick: () => navigate(to), onKeyDown: e => { if (e.key === 'Enter') navigate(to) } } : {})} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 ${to ? 'cursor-pointer hover:shadow-md transition' : ''}`}>
		<div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${tone}`}>{icon}</div>
		<div><p className="text-2xl font-bold text-gray-900">{value}</p><p className="text-sm text-gray-600">{label}</p></div>
	</div>
	)
}

// FaceControl: yuz aniqlash (kirish/chiqish) kameralari, jonli oqim va hodisalar lentasi
const AdminFaceControl = () => {
	const navigate = useNavigate()
	const [data, setData] = useState(null)
	const [sinfs, setSinfs] = useState([])
	const [date, setDate] = useState(today())
	const [error, setError] = useState(false)
	const [loading, setLoading] = useState(true)
	const [q, setQ] = useState('')
	const [dir, setDir] = useState('all')

	const load = useCallback(async () => {
		try {
			const [fc, s] = await Promise.all([
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/facecontrol`, { ...authHeaders(), params: { date } }),
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, authHeaders()).catch(() => ({ data: { sinfs: [] } }))
			])
			setData(fc.data)
			setSinfs(s.data.sinfs || [])
			setError(false)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}, [date])

	useEffect(() => {
		setLoading(true)
		load()
		if (date !== today()) return
		const timer = setInterval(load, 5000)
		return () => clearInterval(timer)
	}, [load, date])

	const setAuto = async (camera, value) => {
		try {
			await axios.put(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras/${camera._id}`, { autoAttendance: value }, authHeaders())
			toast.success(value ? "Avto-davomat yoqildi: aniqlangan shaxs davomatga yoziladi" : "Avto-davomat o'chirildi")
			load()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Xatolik')
		}
	}

	const cameras = data?.cameras || []
	const ins = cameras.filter(c => c.role === 'in')
	const outs = cameras.filter(c => c.role === 'out')
	const t = data?.totals || {}
	const events = useMemo(() => {
		const term = norm(q.trim())
		return (data?.events || []).filter(e => (dir === 'all' || e.direction === dir) && (!term || norm(`${e.personName || ''} ${e.humanName || ''} ${e.humanId || ''} ${e.camera || ''} ${e.sinf || ''}`).includes(term)))
	}, [data, q, dir])

	// Oddiy funksiyalar (komponent emas): har 5 soniyalik yangilanishda jonli oqim qayta boshlanmasligi uchun
	const renderCamera = (c) => {
		const st = statusOf(c)
		const canPlay = c.online === true && c.inCloud !== false && !!c.serial
		return (
			<div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
				{canPlay ? <div className="overflow-hidden rounded-t-2xl"><HikLivePlayer cameraId={c._id} lazy /></div> : (
					<div className="flex flex-col items-center justify-center gap-2 rounded-t-2xl bg-slate-900 text-slate-400 text-sm" style={{ aspectRatio: '16 / 9' }}>
						<FiVideo size={26} /><span>{c.online === false ? 'Kamera offline' : "Holat noma'lum"}</span>
					</div>
				)}
				<div className="p-4 space-y-3">
					<div className="flex items-center justify-between gap-2">
						<div className="min-w-0 cursor-pointer" onClick={() => navigate('../camera')}><p className="font-medium text-gray-900 truncate hover:text-blue-600">{c.name}</p><p className="text-xs text-gray-500 truncate">{c.sinf?.name ? `${c.sinf.name} · ` : ''}{c.serial}</p></div>
						<span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${st.chip}`}>{st.text}</span>
					</div>
					<div className="grid grid-cols-3 gap-2 text-center">
						{[['Hodisa', c.today.events], ['Shaxs', c.today.people], ['Topilgan', c.today.matched]].map(([l, v]) => (
							<div key={l} className="rounded-lg bg-gray-50 py-1.5"><p className="text-base font-bold text-gray-900">{v}</p><p className="text-[11px] text-gray-500">{l}</p></div>
						))}
					</div>
					<p className="text-xs text-gray-400">Oxirgi aniqlash: {ago(c.lastEventAt)}</p>
					<label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
						<input type="checkbox" className="mt-0.5" checked={!!c.autoAttendance} onChange={e => setAuto(c, e.target.checked)} />
						<span>Avto-davomat: aniqlangan o'quvchi/xodim kirish-chiqishga o'zi yoziladi</span>
					</label>
					<CameraSettings camera={c} sinfs={sinfs} onSaved={load} />
				</div>
			</div>
		)
	}

	const renderSection = ({ title, icon, list, tone }) => (
		<section>
			<div className="flex items-center gap-2 mb-3"><span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}>{icon}</span><h2 className="font-semibold text-gray-900">{title}</h2><span className="text-sm text-gray-500">· {list.length} ta</span></div>
			{list.length === 0 ? <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 p-6 text-center">Kamera yo'q. Tizim egasi kameraga FaceControl vazifasini bergach, shu yerda ko'rinadi</p>
				: <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">{list.map(c => <div key={c._id}>{renderCamera(c)}</div>)}</div>}
		</section>
	)

	return (
		<div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6 space-y-6">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex items-center gap-2">
					<input type="date" value={date} max={today()} onChange={e => e.target.value && setDate(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black" />
					<button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> Yangilash</button>
				</div>
			</div>

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Ma'lumotni yuklab bo'lmadi</div>}
			{data?.poller?.lastError && <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">Hik-Connect hodisalarini olishda xatolik: {data.poller.lastError}</div>}

			<div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
				<Stat icon={<FiLogIn />} tone="bg-green-50 text-green-600" to="../students" label="Kirgan o'quvchilar" value={t.studentsIn ?? 0} />
				<Stat icon={<FiLogOut />} tone="bg-orange-50 text-orange-600" to="../students" label="Chiqqan o'quvchilar" value={t.studentsOut ?? 0} />
				<Stat icon={<FiUsers />} tone="bg-violet-50 text-violet-600" to="../attandance" label="Xodimlar (kirgan / chiqqan)" value={`${t.staffIn ?? 0} / ${t.staffOut ?? 0}`} />
				<Stat icon={<FiActivity />} tone="bg-blue-50 text-blue-600" to="../entry-exit" label="Jami aniqlashlar" value={t.events ?? 0} />
			</div>

			{renderSection({ title: "Kirish kameralari", icon: <FiLogIn />, tone: "bg-green-50 text-green-600", list: ins })}
			{renderSection({ title: "Chiqish kameralari", icon: <FiLogOut />, tone: "bg-orange-50 text-orange-600", list: outs })}

			<section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
				<div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
					<h2 className="font-semibold text-gray-900">Aniqlashlar lentasi</h2>
					<p className="text-xs text-gray-500">{date === today() ? "Har 5 soniyada yangilanadi" : date}{data?.poller?.lastPollAt ? ` · Hik'dan oxirgi so'rov: ${ago(data.poller.lastPollAt)}` : ''}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-3">
					<div className="relative min-w-[200px] max-w-sm flex-1">
						<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder="Shaxs, ID, kamera yoki sinf bo'yicha qidirish" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
					</div>
					<SearchableSelect variant="outline" icon={false} className="min-w-[140px] max-w-[200px]" value={dir} onChange={setDir} options={[{ value: 'all', label: 'Barcha yo\'nalish' }, { value: 'in', label: 'Kirish' }, { value: 'out', label: 'Chiqish' }]} />
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
							{['Vaqt', "Yo'nalish", 'Kamera', 'Shaxs', 'Sinf', "O'xshashlik", 'Davomat'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}
						</tr></thead>
						<tbody>
							{events.map(e => (
								<tr key={e._id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
									<td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{timeOf(e.time)}</td>
									<td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.direction === 'in' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>{e.direction === 'in' ? 'Kirish' : 'Chiqish'}</span></td>
									<td className="px-4 py-2.5 text-gray-600">{e.camera}</td>
									<td className="px-4 py-2.5">
										{e.personName ? <><p className="font-medium text-gray-900">{e.personName}</p><p className="text-xs text-gray-500">{e.personType === 'student' ? "O'quvchi" : 'Xodim'} · {e.humanId}</p></>
											: <><p className="text-gray-500">{e.humanName || "Noma'lum"}</p><p className="text-xs text-amber-600">ID: {e.humanId || '—'} — bazada topilmadi</p></>}
									</td>
									<td className="px-4 py-2.5 text-gray-600">{e.sinf || '—'}</td>
									<td className="px-4 py-2.5 text-gray-700">{e.similarity != null ? `${Math.round(e.similarity * 100)}%` : '—'}</td>
									<td className="px-4 py-2.5">{e.recorded ? <span className="text-green-600 text-xs font-medium">Yozildi</span> : <span className="text-xs text-gray-500">{e.note || 'Yozilmagan'}</span>}</td>
								</tr>
							))}
							{data && events.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">{data.events.length ? "Qidiruv bo'yicha hodisa topilmadi" : "Bu kunda aniqlash hodisalari yo'q"}</td></tr>}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}

export default AdminFaceControl
