import { tx } from '../i18n'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiVideo } from 'react-icons/fi'
import { toast } from 'react-toastify'
import HikLivePlayer from './HikLivePlayer'
import SearchableSelect from './SearchableSelect'

export const statusOf = (c) => (c.inCloud === false ? { text: "Bulutda yo'q", dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700' }
	: c.online === true ? { text: 'Online', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' }
		: c.online === false ? { text: 'Offline', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700' }
			: { text: "Noma'lum", dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-600' })

export const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Hik kamerasining sozlamasi: qaysi sinfga tegishli (ixtiyoriy). Vazifasini (oddiy / FaceControl
// kirish / chiqish) tizim egasi belgilaydi
export const CameraSettings = ({ camera, sinfs, onSaved }) => {
	const [saving, setSaving] = useState(false)
	const save = async (sinfId) => {
		setSaving(true)
		try {
			await axios.put(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras/${camera._id}`, { sinfId }, authHeaders())
			toast.success(sinfId ? 'Kamera sinfga biriktirildi' : 'Sinfdan ajratildi')
			onSaved()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Saqlashda xatolik')
		} finally {
			setSaving(false)
		}
	}
	const toggleVision = async (value) => {
		setSaving(true)
		try {
			await axios.put(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras/${camera._id}`, { visionEnabled: value }, authHeaders())
			toast.success(value ? "Odam sanash yoqildi. Birinchi natija 1–2 daqiqada chiqadi" : "Odam sanash o'chirildi")
			onSaved()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Saqlashda xatolik')
		} finally {
			setSaving(false)
		}
	}
	return (
		<div className="space-y-2">
		<div className={saving ? 'pointer-events-none opacity-60' : ''}><span className="text-[11px] text-gray-500">Sinfxona (ixtiyoriy)</span>
					<SearchableSelect variant="outline" icon={false} className="mt-1 w-full" searchPlaceholder="Sinf qidirish..." value={camera.sinfId || ''} onChange={v => save(v || null)}
						options={[{ value: '', label: 'Umumiy kamera' }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} />
				</div>
		{camera.sinfId && (camera.role || 'monitor') === 'monitor' && (
			<label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
				<input type="checkbox" className="mt-0.5" disabled={saving} checked={!!camera.visionEnabled} onChange={e => toggleVision(e.target.checked)} />
				<span>Sinfdagi odamlar sonini sanash <span className="text-gray-400">(yuz tanilmaydi, faqat son; kadr har daqiqada olinadi)</span></span>
			</label>
		)}
		</div>
	)
}

// Kameralar sahifasi: maktabga biriktirilgan Hik kameralari (oddiy kuzatuv). Jonli oqimlar
// o'zi boshlanadi. FaceControl deb belgilanganlar alohida FaceControl sahifasida ko'rinadi
const HikCameraList = () => {
	const [cameras, setCameras] = useState([])
	const [sinfs, setSinfs] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)

	const load = useCallback(async () => {
		try {
			const [c, s] = await Promise.all([
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras`, authHeaders()),
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, authHeaders()).catch(() => ({ data: { sinfs: [] } }))
			])
			setCameras(c.data.cameras || [])
			setSinfs(s.data.sinfs || [])
			setError(false)
		} catch {
			setError(true)
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		load()
		const timer = setInterval(load, 60000)
		return () => clearInterval(timer)
	}, [load])

	const regular = useMemo(() => cameras.filter(c => (c.role || 'monitor') === 'monitor'), [cameras])
	const faceControl = cameras.length - regular.length
	const online = regular.filter(c => c.online === true).length
	const groups = useMemo(() => {
		const map = new Map()
		regular.forEach(c => { const k = c.areaName || 'Umumiy'; if (!map.has(k)) map.set(k, []); map.get(k).push(c) })
		return [...map.entries()]
	}, [regular])

	return (
		<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mt-6">
			<div className="flex flex-wrap items-center justify-end gap-2 mb-5">
				{faceControl > 0 && <span className="text-xs text-gray-500">{faceControl} ta FaceControl kamerasi alohida sahifada</span>}
				{regular.length > 0 && (
					<span className="inline-flex items-center gap-2 rounded-full bg-gray-50 border border-gray-100 px-3 py-1 text-sm text-gray-700">
						<span className={`w-2 h-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-300'}`} /> {tx("{{a}}/{{b}} online", { a: online, b: regular.length })}
					</span>
				)}
			</div>

			{loading ? <p className="text-sm text-gray-500">Yuklanmoqda...</p>
				: error ? <p className="text-sm text-red-600">Hik-Connect kameralarini yuklab bo'lmadi</p>
					: regular.length === 0 ? <p className="text-sm text-gray-500">{cameras.length === 0 ? "Hozircha biriktirilgan Hik-Connect kamerasi yo'q" : "Hamma kameralar FaceControl kamerasi — ular FaceControl sahifasida"}</p>
						: groups.map(([area, list]) => (
							<div key={area} className="mb-5 last:mb-0">
								<p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{area} · {list.length}</p>
								<div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
									{list.map(c => {
										const st = statusOf(c)
										const canPlay = c.online === true && c.inCloud !== false && !!c.serial
										return (
											<div key={c._id} className="rounded-xl border border-gray-100 bg-white hover:shadow-md transition">
																							{canPlay ? <div className="overflow-hidden rounded-t-xl"><HikLivePlayer cameraId={c._id} lazy /></div> : (
																								<div className="flex flex-col items-center rounded-t-xl justify-center gap-2 bg-slate-900 text-slate-400 text-sm" style={{ aspectRatio: '16 / 9' }}>
														<FiVideo size={26} />
														<span>{c.inCloud === false ? "Bulutda yo'q" : c.online === false ? 'Kamera offline' : "Holat noma'lum"}</span>
													</div>
												)}
												<div className="px-4 pt-3 pb-4 space-y-3">
													<div className="flex items-center justify-between gap-2">
														<div className="flex items-center gap-2 min-w-0">
															<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
															<div className="min-w-0"><p className="font-medium text-gray-900 truncate">{c.name || c.cameraId}</p><p className="text-xs text-gray-500 truncate">{c.serial || '—'}</p></div>
														</div>
														<span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${st.chip}`}>{st.text}</span>
													</div>
													<CameraSettings camera={c} sinfs={sinfs} onSaved={load} />
												</div>
											</div>
										)
									})}
								</div>
							</div>
						))}
		</section>
	)
}

export default HikCameraList

