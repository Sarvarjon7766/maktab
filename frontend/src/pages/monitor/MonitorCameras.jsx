import { useMemo, useState } from 'react'
import { FaFolder, FaFolderOpen } from 'react-icons/fa'
import { FiChevronRight, FiMaximize2, FiSearch, FiVideo } from 'react-icons/fi'
import { useSearchParams } from 'react-router-dom'
import HikLiveModal from '../../components/HikLiveModal'
import HikLivePlayer from '../../components/HikLivePlayer'
import { Page, useMonitorData } from './monitorKit'
import { tx } from '../../i18n'

const TYPES = [
	{ key: 'all', label: 'Barcha kameralar', match: () => true },
	{ key: 'monitor', label: 'Oddiy kameralar', match: c => (c.role || 'monitor') === 'monitor' },
	{ key: 'in', label: 'FaceControl — kirish', match: c => c.role === 'in' },
	{ key: 'out', label: 'FaceControl — chiqish', match: c => c.role === 'out' }
]
const ROLE_CHIP = { in: { text: 'Kirish', cls: 'bg-green-500/90 text-white' }, out: { text: 'Chiqish', cls: 'bg-orange-500/90 text-white' } }
const COLS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 xl:grid-cols-3', 4: 'md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' }

const stat = (cameras) => ({ total: cameras.length, online: cameras.filter(c => c.online === true).length })

// Kameralar (Real): maktablar papka kabi. Papkani ochsangiz, shu maktab kameralari avtomatik jonli oqim bilan
// ko'rinadi; boshqa maktabga o'tsangiz, avvalgisi yopilib yangisi ochiladi
const MonitorCameras = () => {
	const [params, setParams] = useSearchParams()
	const schoolId = params.get('school') || ''
	const type = TYPES.some(t => t.key === params.get('type')) ? params.get('type') : 'all'
	const [query, setQuery] = useState('')
	const [expand, setExpand] = useState(null)
	const [cols, setCols] = useState(() => { try { return Number(localStorage.getItem('monitorCamCols')) || 3 } catch { return 3 } })
	const { data, loading, error } = useMonitorData('cameras', {}, { auto: true })

	// Faqat oddiy kameralar; FaceControl (kirish/chiqish) bu sahifada ko'rsatilmaydi
	const schools = useMemo(() => (data?.schools || []).map(s => ({ ...s, cameras: s.cameras.filter(c => (c.role || 'monitor') === 'monitor') })), [data])
	const school = schools.find(s => s._id === schoolId) || null
	const open = (id, t = 'all') => setParams(id ? (t === 'all' ? { school: id } : { school: id, type: t }) : {})
	const setColsSaved = (n) => { setCols(n); try { localStorage.setItem('monitorCamCols', String(n)) } catch { /* saqlab bo'lmasa ham ishlayveradi */ } }

	const shownSchools = schools.filter(s => !query || `${s.name} ${s.region || ''} ${s.district || ''}`.toLowerCase().includes(query.toLowerCase()))
	const typeDef = TYPES.find(t => t.key === type)
	const cameras = useMemo(() => (school ? school.cameras.filter(typeDef.match).sort((a, b) => (b.online === true) - (a.online === true) || a.name.localeCompare(b.name)) : []), [school, typeDef])

	// Oddiy funksiya (komponent emas): har yangilanishda qayta yaratilib, jonli oqimni qayta boshlab yubormasligi uchun
	const renderTile = (c) => {
		const live = c.source === 'hikconnect' && c.online === true && !!c.serial
		const chip = ROLE_CHIP[c.role]
		const label = c.sinf || (chip ? chip.text : 'Sinfga biriktirilmagan')
		return (
			<div className="rounded-xl border border-gray-100 overflow-hidden bg-white shadow-sm">
				<div className="relative">
					{live ? <HikLivePlayer cameraId={c.hikId} lazy /> : (
						<div className="flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400 text-sm" style={{ aspectRatio: '16 / 9' }}>
							<FiVideo size={26} /><span>{c.source !== 'hikconnect' ? tx("Lokal kamera") : c.online === false ? tx("Kamera offline") : tx("Holat noma'lum")}</span>
						</div>
					)}
					<div className="absolute top-2 left-2 flex gap-1.5 pointer-events-none">
						{chip && <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${chip.cls}`}>{chip.text}</span>}
					</div>
					{live && <button onClick={() => setExpand({ id: c.hikId, name: label, areaName: '', schoolName: school.name })} title={tx("Kattalashtirish")} className="absolute top-2 right-2 p-1.5 rounded-md bg-black/60 text-white hover:bg-black/80"><FiMaximize2 size={13} /></button>}
				</div>
				<div className="flex items-center justify-between gap-2 px-3 py-2.5">
					<p className={`text-sm font-semibold truncate ${c.sinf ? 'text-gray-900' : 'text-gray-400'}`}>{label}</p>
					<span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.online === true ? 'bg-green-500' : c.online === false ? 'bg-red-500' : 'bg-gray-300'}`} title={c.online === true ? tx("Online") : c.online === false ? tx("Offline") : tx("Noma'lum")} />
				</div>
			</div>
		)
	}

	return (
		<Page>
			<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4 items-start">
				{/* Papkalar daraxti */}
				<aside className="bg-white rounded-2xl border border-gray-100 shadow-sm lg:sticky lg:top-4">
					<div className="p-3 border-b border-gray-100 relative">
						<FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder={tx("Maktab qidirish")} className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400" />
					</div>
					<ul className="max-h-[calc(100vh-190px)] overflow-y-auto py-1">
						<li>
							<button onClick={() => open('')} className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm hover:bg-gray-50 ${!schoolId ? 'font-semibold text-blue-700 bg-blue-50/60' : 'text-gray-700'}`}>
								<FaFolder className="text-amber-400 shrink-0" /> {tx("Maktablar")} <span className="ml-auto text-xs text-gray-400">{schools.length}</span>
							</button>
						</li>
						{loading && !data && <li className="px-4 py-6 text-sm text-gray-500">{tx("Yuklanmoqda...")}</li>}
						{shownSchools.map(s => {
							const st = stat(s.cameras)
							const active = s._id === schoolId
							return (
								<li key={s._id}>
									<button onClick={() => open(s._id)} className={`w-full flex items-center gap-2.5 pl-8 pr-4 py-2 text-sm hover:bg-gray-50 ${active ? 'font-semibold text-blue-700 bg-blue-50/60' : 'text-gray-700'}`}>
										{active ? <FaFolderOpen className="text-amber-500 shrink-0" /> : <FaFolder className="text-amber-400 shrink-0" />}
										<span className="truncate text-left">{s.name}</span>
										<span className="ml-auto flex items-center gap-1.5 shrink-0"><span className={`w-2 h-2 rounded-full ${st.online ? 'bg-green-500' : st.total ? 'bg-red-400' : 'bg-gray-300'}`} /><span className="text-xs text-gray-400">{st.total}</span></span>
									</button>
								</li>
							)
						})}
					</ul>
				</aside>

				{/* Tanlangan papka mazmuni */}
				<div className="min-w-0">
					<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
						<nav className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
							<button onClick={() => open('')} className="hover:text-blue-600">{tx("Maktablar")}</button>
							{school && <><FiChevronRight size={14} /><button onClick={() => open(school._id)} className={`truncate ${type === 'all' ? 'font-semibold text-gray-900' : 'hover:text-blue-600'}`}>{school.name}</button></>}
							{school && type !== 'all' && <><FiChevronRight size={14} /><span className="font-semibold text-gray-900 truncate">{typeDef.label}</span></>}
						</nav>
						{school && (
							<div className="flex items-center gap-3">
								<span className="inline-flex items-center gap-2 rounded-full bg-white border border-gray-200 px-3 py-1 text-sm text-gray-700"><span className={`w-2 h-2 rounded-full ${stat(cameras).online ? 'bg-green-500' : 'bg-gray-300'}`} />{tx("{{online}}/{{total}} online", { online: stat(cameras).online, total: cameras.length })}</span>
								<div className="hidden md:inline-flex rounded-lg border border-gray-200 bg-white overflow-hidden text-sm">
									{[2, 3, 4].map(n => <button key={n} onClick={() => setColsSaved(n)} className={`px-3 py-1.5 ${cols === n ? 'bg-slate-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{n}</button>)}
								</div>
							</div>
						)}
					</div>

					{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700 mb-4">{tx("Ma'lumotni yuklab bo'lmadi")}</div>}

					{!school ? (
						<div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
							{shownSchools.map(s => {
								const st = stat(s.cameras)
								return (
									<button key={s._id} onClick={() => open(s._id)} className="group text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-amber-200 transition">
										<FaFolder className="text-amber-400 group-hover:text-amber-500 transition" size={44} />
										<p className="font-medium text-gray-900 mt-3 truncate">{s.name}</p>
										<p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${st.online ? 'bg-green-500' : st.total ? 'bg-red-400' : 'bg-gray-300'}`} />{st.total ? tx("{{total}} kamera · {{online}} online", { total: st.total, online: st.online }) : tx("Kamera yo'q")}</p>
									</button>
								)
							})}
							{!loading && shownSchools.length === 0 && <p className="col-span-full text-center text-gray-500 py-12">{tx("Maktab topilmadi")}</p>}
						</div>
					) : cameras.length === 0 ? (
						<div className="bg-white rounded-2xl border border-dashed border-gray-200 p-14 text-center text-gray-500"><FaFolderOpen className="mx-auto text-gray-300 mb-3" size={40} />{tx("Bu papkada kamera yo'q")}</div>
					) : (
						// key=maktab+tur: papka almashganda oldingi oqimlar yopiladi, yangilari avtomatik ochiladi
						<div key={`${school._id}-${type}`} className={`grid grid-cols-1 gap-4 ${COLS[cols]}`}>
							{cameras.map(c => <div key={c._id}>{renderTile(c)}</div>)}
						</div>
					)}
				</div>
			</div>

			{expand && <HikLiveModal camera={expand} onClose={() => setExpand(null)} />}
		</Page>
	)
}

export default MonitorCameras

