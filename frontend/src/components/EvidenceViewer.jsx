import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FiChevronLeft, FiChevronRight, FiDownload, FiFilm, FiImage, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import PoseChips from './PoseChips'
import { tx } from '../i18n'

const api = (path, config = {}) => axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/${path}`, { ...config, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Hodisa turlari: yorliq va rang (kamera hodisalari va aqlli kuzatuv lahzalari)
export const EVIDENCE_KINDS = {
	motion: { label: 'Harakat', chip: 'bg-blue-50 text-blue-700' },
	density: { label: 'Odam zichligi', chip: 'bg-amber-50 text-amber-700' },
	people: { label: "Odamlar soni g'ayritabiiy", chip: 'bg-red-50 text-red-700' },
	enter: { label: 'Hududga kirish', chip: 'bg-green-50 text-green-700' },
	exit: { label: 'Hududdan chiqish', chip: 'bg-orange-50 text-orange-700' },
	multi: { label: "Ko'p turdagi obyekt", chip: 'bg-violet-50 text-violet-700' },
	manual: { label: "Qo'lda olingan kadr", chip: 'bg-slate-100 text-slate-700' },
	vision_empty: { label: "Sinf bo'sh qoldi", chip: 'bg-red-50 text-red-700' },
	vision_surge: { label: 'Odamlar keskin oshdi', chip: 'bg-orange-50 text-orange-700' },
	vision_overcrowd: { label: 'Ortiqcha odam', chip: 'bg-violet-50 text-violet-700' },
	vision_restless: { label: 'Sinf notinch', chip: 'bg-amber-50 text-amber-700' },
	vision_commotion: { label: 'Zalda tartibsizlik', chip: 'bg-rose-50 text-rose-700' },
	vision_sample: { label: 'Avtomatik namuna', chip: 'bg-blue-50 text-blue-700' }
}
const kindOf = (k) => EVIDENCE_KINDS[k] || EVIDENCE_KINDS.motion
const timeOf = (d) => new Date(d).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })
const clock = (d) => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Tashkent' })
const LABELS = { oldin: 'Oldin', hodisa: 'Hodisa', keyin: 'Keyin' }

// Bir nechta blob'ni autentifikatsiya bilan olish (ochiq havola emas); komponent yopilganda bo'shatiladi
const useBlob = (path, enabled = true) => {
	const [url, setUrl] = useState(null)
	const [failed, setFailed] = useState(false)
	useEffect(() => {
		setUrl(null); setFailed(false)
		if (!enabled || !path) return
		let gone = false, objectUrl = null
		api(path, { responseType: 'blob' }).then(res => { if (!gone) { objectUrl = URL.createObjectURL(res.data); setUrl(objectUrl) } }).catch(() => { if (!gone) setFailed(true) })
		return () => { gone = true; if (objectUrl) URL.revokeObjectURL(objectUrl) }
	}, [path, enabled])
	return { url, failed }
}

const Thumb = ({ item, onOpen }) => {
	const { url } = useBlob(`events/${item._id}/snapshot`)
	const k = kindOf(item.kind)
	const n = item.images?.length || 0
	return (
		<button onClick={() => onOpen(item)} className="group text-left rounded-xl overflow-hidden border border-gray-100 bg-white hover:shadow-md transition">
			<div className="bg-slate-900 aspect-video flex items-center justify-center overflow-hidden relative">
				{url ? <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" /> : <span className="text-xs text-slate-500">{tx("Yuklanmoqda...")}</span>}
				{(n > 1 || item.hasClip) && (
					<div className="absolute bottom-1.5 right-1.5 flex gap-1">
						{n > 1 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px]"><FiImage size={10} /> {n}</span>}
						{item.hasClip && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px]"><FiFilm size={10} /> {tx("Lavha")}</span>}
					</div>
				)}
			</div>
			<div className="px-3 py-2">
				<span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${k.chip}`}>{k.label}</span>
				{item.detail && <p className="text-xs text-gray-700 mt-1 line-clamp-2">{item.detail}</p>}
				<p className="text-xs text-gray-500 mt-1 truncate">{timeOf(item.time)} · {item.sinf ? `${item.sinf} · ` : ''}{item.camera}</p>
			</div>
		</button>
	)
}

// Muhim hodisa qatori: kichik kadr, sarlavha, tafsilot va "Ko'rish" (ro'yxat ko'rinishi, kadrlar to'plami o'rniga)
const Row = ({ item, onOpen }) => {
	const { url } = useBlob(`events/${item._id}/snapshot`)
	const k = kindOf(item.kind)
	const n = item.images?.length || 0
	return (
		<button onClick={() => onOpen(item)} className="group w-full text-left flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-3 hover:shadow-md hover:border-gray-200 transition">
			<div className="w-32 shrink-0 aspect-video rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
				{url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-500">...</span>}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${k.chip}`}>{item.title || k.label}</span>
					{item.sinf && <span className="text-xs font-semibold text-gray-700">{item.sinf}</span>}
				</div>
				{item.detail && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.detail}</p>}
				<PoseChips pose={item.pose} className="mt-1" />
				<p className="text-xs text-gray-400 mt-1">{timeOf(item.time)} · {item.camera}{n > 1 ? ` · ${n} rasm` : ''}{item.hasClip ? tx(" · lavha bor") : ''}</p>
			</div>
			<span className="hidden sm:inline-flex shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 group-hover:bg-gray-50">{tx("Ko'rish")}</span>
		</button>
	)
}

// Ochilgan lahza: asosiy kadr, oldin/hodisa/keyin lentasi va qisqa lavha (hammasi autentifikatsiya bilan)
const Lightbox = ({ item, onClose, sinfLink, pos, total, onPrev, onNext }) => {
	const touch = useRef(null)
	const [mode, setMode] = useState('frame') // frame | clip
	const [pick, setPick] = useState(null) // lentadan tanlangan rasm indeksi
	const main = useBlob(`events/${item._id}/snapshot`)
	const clip = useBlob(`events/${item._id}/clip`, mode === 'clip' && item.hasClip)
	const [urls, setUrls] = useState({})
	const images = item.images || []

	useEffect(() => {
		setUrls({})
		if (images.length < 2) return
		let gone = false
		const made = []
		images.forEach((_, i) => {
			api(`events/${item._id}/frame/${i}`, { responseType: 'blob' }).then(res => {
				if (gone) return
				const u = URL.createObjectURL(res.data)
				made.push(u)
				setUrls(prev => ({ ...prev, [i]: u }))
			}).catch(() => { })
		})
		return () => { gone = true; made.forEach(u => URL.revokeObjectURL(u)) }
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [item._id])

	useEffect(() => {
		const onKey = (e) => {
			if (e.key === 'Escape') onClose()
			else if (e.key === 'ArrowLeft' && onPrev) onPrev()
			else if (e.key === 'ArrowRight' && onNext) onNext()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose, onPrev, onNext])

	const shown = mode === 'clip' && clip.url ? clip.url : (pick !== null && urls[pick]) || main.url
	const isClip = mode === 'clip' && !!clip.url
	const k = kindOf(item.kind)
	return (
		<div className="fixed inset-0 z-[90] bg-black/80 flex items-start md:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
			<div className="max-w-5xl w-full" onClick={e => e.stopPropagation()}>
				<div className="flex items-start justify-between gap-3 text-white mb-3">
					<div className="min-w-0">
						<p className="font-medium">{item.title || k.label}{total > 1 && <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-xs font-normal text-slate-200">{pos} / {total}</span>}</p>
						<p className="text-sm text-slate-300">{timeOf(item.time)} · {item.sinf ? `${item.sinf} · ` : ''}{item.camera}{item.count !== null && item.count !== undefined ? ` · ${item.count} odam` : ''}</p>
						{item.detail && <p className="text-sm text-slate-200 mt-1">{item.detail}</p>}
						<PoseChips pose={item.pose} className="mt-1.5" />
						{sinfLink && item.sinfId && <Link to={sinfLink(item)} onClick={onClose} className="inline-block mt-2 text-sm font-medium text-cyan-300 hover:underline">{tx("{{sinf}} sinf sahifasiga o'tish →", { sinf: item.sinf })}</Link>}
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{shown && <a href={shown} download={`kuzatuv-${item._id}${isClip ? '.webp' : '.jpg'}`} title={tx("Yuklab olish")} className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20"><FiDownload /></a>}
						<button onClick={onClose} title={tx("Yopish (Esc)")} className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20"><FiX /></button>
					</div>
				</div>

				{item.hasClip && (
					<div className="flex gap-2 mb-3">
						{[['frame', 'Lahza rasmi'], ['clip', 'Qisqa lavha']].map(([key, label]) => (
							<button key={key} onClick={() => setMode(key)} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${mode === key ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>{key === 'frame' ? <FiImage size={14} /> : <FiFilm size={14} />} {label}</button>
						))}
					</div>
				)}

				<div className="relative rounded-xl bg-black flex items-center justify-center" style={{ minHeight: 200 }}
						onTouchStart={e => { touch.current = e.touches[0].clientX }}
						onTouchEnd={e => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; touch.current = null; if (Math.abs(dx) > 60) (dx < 0 ? onNext : onPrev)?.() }}>
					{onPrev && <button onClick={onPrev} title={tx("Oldingisi (←)")} aria-label={tx("Oldingisi")} className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white hover:bg-black/80"><FiChevronLeft size={22} /></button>}
					{onNext && <button onClick={onNext} title={tx("Keyingisi (→)")} aria-label={tx("Keyingisi")} className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/55 p-2.5 text-white hover:bg-black/80"><FiChevronRight size={22} /></button>}
					{shown ? <img src={shown} alt="" className="w-full max-h-[75vh] object-contain rounded-xl" /> : <p className="text-sm text-slate-400 py-16">{(mode === 'clip' ? clip.failed : main.failed) ? tx("Yuklab bo'lmadi") : tx("Yuklanmoqda...")}</p>}
				</div>

				{images.length > 1 && (
					<div className="mt-3">
						<p className="text-xs text-slate-400 mb-2">{tx("Lahza rasmlari ({{count}}): hodisadan oldin, hodisa lahzasi va keyin", { count: images.length })}</p>
						<div className="flex gap-2 overflow-x-auto pb-1">
							{images.map((im, i) => {
								const active = mode === 'frame' && (pick === i || (pick === null && im.label === 'hodisa'))
								return (
									<button key={i} onClick={() => { setMode('frame'); setPick(i) }} className={`shrink-0 w-36 text-left rounded-lg overflow-hidden border-2 ${active ? 'border-blue-400' : 'border-transparent opacity-80 hover:opacity-100'}`}>
										<div className="bg-slate-800 aspect-video flex items-center justify-center">{urls[i] ? <img src={urls[i]} alt="" className="w-full h-full object-cover" /> : <span className="text-[10px] text-slate-500">...</span>}</div>
										<div className="bg-slate-900 px-2 py-1 text-[11px] text-slate-300"><span className="font-semibold text-white">{LABELS[im.label] || im.label}</span> · {clock(im.t)} · {tx("{{n}} odam", { n: im.count })}</div>
									</button>
								)
							})}
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

// Kuzatuv lahzalari to'plami: kartochkalar va ochiladigan ko'ruvchi. `items` — { _id, kind, time, camera, sinf, title, detail, count, hasClip, images }
export const EvidenceGallery = ({ items, empty = "Hozircha saqlangan lahza yo'q", cols = 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6', variant = 'grid', sinfLink = null }) => {
	const [open, setOpen] = useState(null)
	const idx = open && items ? items.findIndex(g => g._id === open._id) : -1
	const go = useCallback((d) => setOpen(cur => { const i = items?.findIndex(g => g._id === cur?._id) ?? -1; return i < 0 ? cur : items[(i + d + items.length) % items.length] }), [items])
	const prev = useCallback(() => go(-1), [go])
	const next = useCallback(() => go(1), [go])
	if (!items?.length) return <p className="text-sm text-gray-500 py-8 text-center">{empty}</p>
	return (
		<>
			{variant === 'list'
				? <div className="space-y-2">{items.map(g => <Row key={g._id} item={g} onOpen={setOpen} />)}</div>
				: <div className={`grid ${cols} gap-3`}>{items.map(g => <Thumb key={g._id} item={g} onOpen={setOpen} />)}</div>}
			{open && <Lightbox key={open._id} item={open} onClose={() => setOpen(null)} sinfLink={sinfLink} pos={idx + 1} total={items.length} onPrev={items.length > 1 ? prev : null} onNext={items.length > 1 ? next : null} />}
		</>
	)
}

export default EvidenceGallery
