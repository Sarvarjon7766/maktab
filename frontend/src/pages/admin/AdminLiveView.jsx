import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FaFolder, FaFolderOpen, FaThLarge } from 'react-icons/fa'
import { FiChevronRight, FiMaximize2, FiSearch, FiVideo } from 'react-icons/fi'
import { useSearchParams } from 'react-router-dom'
import HikLiveModal from '../../components/HikLiveModal'
import HikLivePlayer from '../../components/HikLivePlayer'
import { authHeaders } from '../../components/HikCameraList'
import { useOrg } from '../../context/OrgContext'

const COLS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' }
const GENERAL = '_general'
const ALL = '_all'
const stat = (list) => ({ total: list.length, online: list.filter(c => c.online === true).length })
const dot = (st) => (st.online ? 'bg-green-500' : st.total ? 'bg-red-400' : 'bg-gray-300')

// Jonli kuzatuv: faqat ko'rish uchun. Papkalar — sinfxonalar (va umumiy kameralar). Papkani ochsangiz,
// undagi kameralar avtomatik jonli oqim bilan ko'rinadi. Sozlash alohida «Kamera sozlamalari» sahifasida
const AdminLiveView = () => {
	const org = useOrg()
	const [params, setParams] = useSearchParams()
	const folder = params.get('folder') || ''
	const [cameras, setCameras] = useState([])
	const [sinfs, setSinfs] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [query, setQuery] = useState('')
	const [expand, setExpand] = useState(null)
	const [cols, setCols] = useState(() => { try { return Number(localStorage.getItem('schoolCamCols')) || 3 } catch { return 3 } })

	const load = useCallback(async () => {
		try {
			const [c, s] = await Promise.all([
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras`, authHeaders()),
				axios.get(`${import.meta.env.VITE_BASE_URL}/api/sinf/getAll`, authHeaders()).catch(() => ({ data: { sinfs: [] } })),
			])
			setCameras((c.data.cameras || []).filter(x => (x.role || 'monitor') === 'monitor'))
			setSinfs(s.data.sinfs || [])
			setError(false)
		} catch { setError(true) } finally { setLoading(false) }
	}, [])
	useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])

	const sinfName = useMemo(() => new Map(sinfs.map(s => [String(s._id), s.name])), [sinfs])
	// Papkalar: har bir sinfxona + umumiy kameralar (faqat kamerasi borlari)
	const folders = useMemo(() => {
		const map = new Map()
		cameras.forEach(c => { const k = c.sinfId ? String(c.sinfId) : GENERAL; if (!map.has(k)) map.set(k, []); map.get(k).push(c) })
		return [...map.entries()]
			.map(([id, list]) => ({ id, name: id === GENERAL ? 'Umumiy kameralar' : (sinfName.get(id) || 'Sinfxona'), cameras: list }))
			.sort((a, b) => (a.id === GENERAL) - (b.id === GENERAL) || a.name.localeCompare(b.name, undefined, { numeric: true }))
	}, [cameras, sinfName])

	const current = useMemo(() => (folder === ALL ? { id: ALL, name: 'Hamma kameralar', cameras } : folders.find(f => f.id === folder) || null), [folder, cameras, folders])
	const shown = folders.filter(f => !query || f.name.toLowerCase().includes(query.toLowerCase()))
	const list = useMemo(() => (current ? [...current.cameras].sort((a, b) => (b.online === true) - (a.online === true) || (a.name || '').localeCompare(b.name || '')) : []), [current])
	const open = (id) => setParams(id ? { folder: id } : {})
	const setColsSaved = (n) => { setCols(n); try { localStorage.setItem('schoolCamCols', String(n)) } catch { /* ixtiyoriy */ } }
	const all = stat(cameras)

	// Oddiy funksiya (komponent emas): yangilanganda jonli oqim qayta boshlanib ketmasligi uchun
	const renderTile = (c) => {
		const live = c.online === true && c.inCloud !== false && !!c.serial
		const name = c.name || c.cameraId
		return (
			<div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
				<div className="relative">
					{live ? <HikLivePlayer cameraId={c._id} lazy /> : (
						<div className="flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400 text-sm" style={{ aspectRatio: '16 / 9' }}>
							<FiVideo size={26} /><span>{c.inCloud === false ? "Bulutda yo'q" : c.online === false ? 'Kamera offline' : "Holat noma'lum"}</span>
						</div>
					)}
					{live && <button onClick={() => setExpand({ id: c._id, name, areaName: '', schoolName: org.orgName })} title="Kattalashtirish" className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"><FiMaximize2 size={13} /></button>}
				</div>
				<div className="flex items-center justify-between gap-2 px-3 py-2.5">
					<div className="min-w-0"><p className="text-sm font-semibold truncate text-gray-900">{name}</p>{folder === ALL && <p className="text-xs text-gray-400 truncate">{c.sinfId ? sinfName.get(String(c.sinfId)) || 'Sinfxona' : 'Umumiy kamera'}</p>}</div>
					<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.online === true ? 'bg-green-500' : c.online === false ? 'bg-red-500' : 'bg-gray-300'}`} title={c.online === true ? 'Online' : c.online === false ? 'Offline' : "Noma'lum"} />
				</div>
			</div>
		)
	}

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-4">
			<div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
				<aside className="bg-white rounded-2xl border border-gray-100 shadow-sm lg:sticky lg:top-4">
					<div className="p-3 border-b border-gray-100 relative">
						<FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Sinfxona qidirish" className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400" />
					</div>
					<ul className="max-h-[60vh] lg:max-h-[calc(100vh-230px)] overflow-y-auto py-1">
						<li><button onClick={() => open(ALL)} className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 ${folder === ALL ? 'font-semibold text-blue-700 bg-blue-50/60' : 'text-gray-700'}`}><FaThLarge className="text-blue-500 shrink-0" /> Hamma kameralar <span className="ml-auto text-xs text-gray-400">{all.total}</span></button></li>
						<li><button onClick={() => open('')} className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 ${!folder ? 'font-semibold text-blue-700 bg-blue-50/60' : 'text-gray-700'}`}><FaFolder className="text-amber-400 shrink-0" /> Papkalar <span className="ml-auto text-xs text-gray-400">{all.total}</span></button></li>
						{loading && <li className="px-4 py-6 text-sm text-gray-500">Yuklanmoqda...</li>}
						{shown.map(f => {
							const st = stat(f.cameras); const active = f.id === folder
							return (
								<li key={f.id}><button onClick={() => open(f.id)} className={`w-full flex items-center gap-2.5 pl-8 pr-4 py-2 text-sm hover:bg-gray-50 ${active ? 'font-semibold text-blue-700 bg-blue-50/60' : 'text-gray-700'}`}>
									{active ? <FaFolderOpen className="text-amber-500 shrink-0" /> : <FaFolder className="text-amber-400 shrink-0" />}
									<span className="truncate text-left">{f.name}</span>
									<span className="ml-auto flex items-center gap-1.5 shrink-0"><span className={`w-2 h-2 rounded-full ${dot(st)}`} /><span className="text-xs text-gray-400">{st.total}</span></span>
								</button></li>
							)
						})}
					</ul>
				</aside>

				<div className="min-w-0">
					<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
						<nav className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
							<button onClick={() => open('')} className={current ? 'hover:text-blue-600' : 'font-semibold text-gray-900'}>Papkalar</button>
							{current && <><FiChevronRight size={14} /><span className="font-semibold text-gray-900 truncate">{current.name}</span></>}
						</nav>
						<div className="flex items-center gap-3">
							<span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-sm text-gray-700"><span className={`w-2 h-2 rounded-full ${(current ? stat(list) : all).online ? 'bg-green-500' : 'bg-gray-300'}`} />{(current ? stat(list) : all).online}/{(current ? list : cameras).length} online</span>
							{current && <div className="hidden md:inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">{[2, 3, 4].map(n => <button key={n} onClick={() => setColsSaved(n)} className={`px-3 py-1.5 ${cols === n ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{n}</button>)}</div>}
						</div>
					</div>

					{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 mb-4">Kameralarni yuklab bo'lmadi</div>}

					{!current ? (
						<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
							{cameras.length > 0 && !query && <button onClick={() => open(ALL)} className="group text-left bg-gradient-to-br from-blue-600 to-cyan-500 text-white rounded-2xl shadow-sm p-5 hover:shadow-md transition"><FaThLarge size={40} className="opacity-90" /><p className="font-medium mt-3">Hamma kameralar</p><p className="text-xs text-white/80 mt-1">{all.total} kamera · {all.online} online · bir vaqtda</p></button>}
							{shown.map(f => {
								const st = stat(f.cameras)
								return (
									<button key={f.id} onClick={() => open(f.id)} className="group text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-amber-200 transition">
										<FaFolder className="text-amber-400 group-hover:text-amber-500 transition" size={44} />
										<p className="font-medium text-gray-900 mt-3 truncate">{f.name}</p>
										<p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dot(st)}`} />{st.total} kamera · {st.online} online</p>
									</button>
								)
							})}
							{!loading && shown.length === 0 && <p className="col-span-full text-center text-gray-500 py-12">{cameras.length === 0 ? "Maktabga hali kamera biriktirilmagan" : 'Papka topilmadi'}</p>}
						</div>
					) : (
						// key=papka: papka almashganda oldingi oqimlar yopilib, yangilari ochiladi
						<div key={current.id} className={`grid grid-cols-1 gap-4 ${COLS[cols]}`}>{list.map(c => <div key={c._id}>{renderTile(c)}</div>)}</div>
					)}
				</div>
			</div>
			{expand && <HikLiveModal camera={expand} onClose={() => setExpand(null)} />}
		</div>
	)
}

export default AdminLiveView
