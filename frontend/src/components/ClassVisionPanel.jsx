import { tx } from '../i18n'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiEye, FiEyeOff, FiUsers } from 'react-icons/fi'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { authHeaders } from './HikCameraList'
import PoseChips from './PoseChips'

const ago = (date) => {
	if (!date) return "hali yo'q"
	const sec = Math.round((Date.now() - new Date(date).getTime()) / 1000)
	if (sec < 60) return 'hozirgina'
	const min = Math.round(sec / 60)
	return min < 60 ? `${min} daqiqa oldin` : `${Math.round(min / 60)} soat oldin`
}
const hm = (t) => new Date(t).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })

// Odam sanash kadri: tahlil qilingan (odamlar belgilangan) oxirgi kadr. <img> sarlavha yubora olmagani uchun blob sifatida olinadi
const VisionFrame = ({ cameraId, refreshSec }) => {
	const [src, setSrc] = useState(null)
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		let url = null
		let alive = true
		const load = async () => {
			try {
				const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/vision/frame/${cameraId}`, { ...authHeaders(), responseType: 'blob' })
				if (!alive) return
				const next = URL.createObjectURL(res.data)
				if (url) URL.revokeObjectURL(url)
				url = next
				setSrc(next)
				setFailed(false)
			} catch {
				if (alive) setFailed(true)
			}
		}
		load()
		const timer = setInterval(load, Math.max(15, refreshSec) * 1000)
		return () => { alive = false; clearInterval(timer); if (url) URL.revokeObjectURL(url) }
	}, [cameraId, refreshSec])
	if (failed && !src) return <p className="text-xs text-gray-400 py-6 text-center">{tx("Tahlil kadri hali yo'q")}</p>
	if (!src) return <p className="text-xs text-gray-400 py-6 text-center">{tx("Yuklanmoqda...")}</p>
	return <img src={src} alt={tx("Odamlar belgilangan kadr")} className="w-full rounded-lg border border-gray-100" />
}

// Sinfxonada hozir nechta odam borligi (kameradan, yuz tanilmaydi). `items` — shu sinfning vision kameralari
// onClick berilsa panelning bo'sh joyi bosilganda ishga tushadi (ichidagi tugma bundan mustasno)
const ClassVisionPanel = ({ items, intervalSec, students, came, hourly, onClick }) => {
	const [showFrame, setShowFrame] = useState(false)
	const item = useMemo(() => [...items].sort((a, b) => (b.count ?? -1) - (a.count ?? -1))[0], [items])
	const series = useMemo(() => (item?.series || []).map(p => ({ vaqt: hm(p.t), Odam: p.count })), [item])
	const bars = useMemo(() => (hourly || []).map((x, h) => ({ soat: String(h).padStart(2, '0'), "O'rtacha": x.avg, "Eng ko'p": x.max })).filter((x, h) => h >= 6 && h <= 20), [hourly])
	if (!item) return null

	const noData = item.count === null
	const offline = item.online === false
	return (
		<div onClick={onClick ? e => { if (!e.target.closest('button')) onClick() } : undefined} className={`rounded-xl border border-blue-100 bg-blue-50/40 p-4 ${onClick ? 'cursor-pointer hover:bg-blue-50/70 transition' : ''}`}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-center gap-4">
					<div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shrink-0"><FiUsers size={24} /></div>
					<div>
						<p className="text-xs font-semibold text-gray-500 flex flex-wrap items-center gap-2">{tx("Hozir sinfda (kamera bo'yicha)")}
							{!noData && !item.stale && !offline && (item.count < 3
								? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">{tx("Dars bo'lmayapti")}</span>
								: <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">{tx("Dars bormoqda")}</span>)}
						</p>
						<p className="text-3xl font-bold text-gray-900 leading-tight">{noData ? '—' : item.count}<span className="text-base font-medium text-gray-500"> {tx("odam")}</span></p>
						<p className={`text-xs ${item.stale || offline || item.error ? 'text-amber-600' : 'text-gray-400'}`}>
							{offline ? tx("Kamera offline") : noData ? tx("Hali tahlil qilinmagan") : item.stale ? `Ma'lumot eskirgan · oxirgisi ${ago(item.at)}` : `Yangilandi ${ago(item.at)}`}
						</p>
						{item.error && (noData || item.stale) && <p className="text-xs text-amber-700 bg-amber-50 rounded-md px-2 py-1 mt-1 max-w-md">{tx("Oxirgi urinish muvaffaqiyatsiz")}{item.error.at ? ` (${ago(item.error.at)})` : ''}: {item.error.message}</p>}
					</div>
				</div>
				<div className="text-xs text-gray-500 space-y-1 max-w-xs">
					<p>{tx("Ro'yxatda")} <b className="text-gray-800">{students}</b> {tx("o'quvchi, bugun kelgan")} <b className="text-gray-800">{came}</b></p>
					{item.activity !== null && item.activity !== undefined && item.count > 0 && <p>{tx("Harakat:")} <b className="text-gray-800">{Math.round(item.activity * 100)}%</b> <span className="text-gray-400">{tx("(odamlarning siljigan yoki almashgan ulushi)")}</span></p>}
					{item.pose && item.count > 0 && <div><p className="mb-1 text-gray-500">{tx("Holatlar (hozir):")}</p><PoseChips pose={item.pose} /></div>}
					{item.poseShare && <p>{tx("Oxirgi 15 daqiqada: tik turgan")} <b className="text-gray-800">{item.poseShare.standing ?? 0}%</b> {tx("· boshi egilgan")} <b className="text-gray-800">{item.poseShare.headDown ?? 0}%</b> {tx("· qo'l ko'targan")} <b className="text-gray-800">{item.poseShare.raised ?? 0}%</b></p>}
					<p className="text-gray-400">{tx("Kameradagi son o'qituvchi va mehmonlarni ham o'z ichiga oladi. Taxminiy hisob (±2)")}</p>
				</div>
				<button onClick={() => setShowFrame(v => !v)} disabled={!item.hasFrame} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
					{showFrame ? <FiEyeOff size={14} /> : <FiEye size={14} />} {showFrame ? tx("Kadrni yashirish") : tx("Oxirgi kuzatuv kadri")}
				</button>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
				<div>
					<p className="text-xs font-semibold text-gray-500 mb-2">{tx("Oxirgi soat: sinfdagi odamlar soni")}</p>
					<div style={{ height: 120 }}>
						{series.length < 2 ? <p className="text-xs text-gray-400 pt-10 text-center">{tx("Grafik uchun kamida 2 ta o'lchov kerak")}</p> : (
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={series} margin={{ left: -24, right: 4, top: 4 }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="vaqt" tick={{ fontSize: 10 }} minTickGap={30} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
									<Tooltip /><Area isAnimationActive={false} type="monotone" dataKey="Odam" name={tx("Odam")} stroke="#2563eb" fill="#2563eb" fillOpacity={0.15} />
								</AreaChart>
							</ResponsiveContainer>
						)}
					</div>
				</div>
				<div>
					<p className="text-xs font-semibold text-gray-500 mb-2">{tx("Bugun soatlar bo'yicha: o'rtacha va eng ko'p odam")}</p>
					<div style={{ height: 120 }}>
						{bars.every(b => !b["Eng ko'p"]) ? <p className="text-xs text-gray-400 pt-10 text-center">{tx("Bugun odam aniqlangan o'lchov yo'q")}</p> : (
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={bars} margin={{ left: -24, right: 4, top: 4 }}>
									<CartesianGrid strokeDasharray="3 3" vertical={false} />
									<XAxis dataKey="soat" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
									<Tooltip />
									<Bar isAnimationActive={false} dataKey="O'rtacha" name={tx("O'rtacha")} fill="#2563eb" radius={[3, 3, 0, 0]} />
									<Bar isAnimationActive={false} dataKey="Eng ko'p" name={tx("Eng ko'p")} fill="#93c5fd" radius={[3, 3, 0, 0]} />
								</BarChart>
							</ResponsiveContainer>
						)}
					</div>
				</div>
			</div>

			{showFrame && item.hasFrame && <div className="mt-4 max-w-2xl"><VisionFrame cameraId={item.cameraId} refreshSec={intervalSec} /></div>}
		</div>
	)
}

export default ClassVisionPanel
