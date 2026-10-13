import axios from 'axios'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiEye, FiHelpCircle, FiRefreshCw, FiSearch, FiUsers, FiVideo, FiX } from 'react-icons/fi'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import { tx } from '../i18n'
import { makeGuard, setVisibleInterval } from '../utils/poll'
import { authHeaders, statusOf } from './HikCameraList'
import HikLiveModal from './HikLiveModal'
import SearchableSelect from './SearchableSelect'

const BASE = () => import.meta.env.VITE_BASE_URL
const HELP_KEY = 'cameraSetupHelpClosed'

const ago = (date) => {
	if (!date) return ''
	const min = Math.round((Date.now() - new Date(date).getTime()) / 60000)
	if (min < 1) return tx('hozirgina')
	if (min < 60) return tx('{{n}} daqiqa oldin', { n: min })
	return tx('{{n}} soat oldin', { n: Math.round(min / 60) })
}

// Kamera turi: sinfxona kamerasi (sinfga biriktirilgan), biriktirilmagan, zal / koridor kamerasi
const kindOf = (c) => (c.role === 'hall' ? 'hall' : c.sinfId ? 'class' : 'unassigned')

const Switch = ({ on, onChange, disabled, label }) => (
	<button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
		className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${on ? 'bg-green-500' : 'bg-gray-300'} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
		<span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
	</button>
)

const Stat = ({ icon, tone, label, value, sub }) => (
	<div className="flex min-w-0 items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
		<div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</div>
		<div className="min-w-0"><p className="truncate text-xs font-medium text-gray-500">{label}</p><p className="text-2xl font-bold leading-tight text-gray-900">{value}</p>{sub && <p className="truncate text-xs text-gray-400">{sub}</p>}</div>
	</div>
)

// Tahlil holati satri: o'chiq / natija kutilmoqda / hozirgi son yoki xato sababi
const AnalysisLine = ({ c, vis }) => {
	if (!c.visionEnabled) return <p className="text-[11px] text-gray-400">{tx("Odam sanash o'chiq")}</p>
	if (c.online === false) return <p className="text-[11px] text-amber-700">{tx('Kamera offline: tahlil to\'xtagan')}</p>
	if (vis && !vis.stale && vis.count !== null) {
		return <p className="text-[11px] text-green-700">{tx('Hozir {{n}} odam', { n: vis.count })} · {ago(vis.at)}{typeof vis.activity === 'number' && vis.count > 0 ? ` · ${tx('harakat')} ${Math.round(vis.activity * 100)}%` : ''}</p>
	}
	if (vis?.error) return <p className="text-[11px] text-amber-700" title={vis.error.message}>{tx('Oxirgi urinish muvaffaqiyatsiz')}: {String(vis.error.message).slice(0, 90)}</p>
	return <p className="text-[11px] text-gray-500">{tx('Natija kutilmoqda (1–2 daqiqa)')}</p>
}

const CameraRow = ({ c, sinfs, vis, selected, busy, onSelect, onPatch, onPreview, targetSinf }) => {
	const kind = kindOf(c)
	const st = statusOf(c)
	const isHall = kind === 'hall'
	const [cap, setCap] = useState(c.capacity ?? '')
	useEffect(() => { setCap(c.capacity ?? '') }, [c.capacity])
	const canCount = isHall || kind === 'class'
	const options = useMemo(() => [{ value: '', label: tx('— Sinfni tanlang —') }, ...sinfs.map(s => ({ value: s._id, label: s.name }))], [sinfs])
	const ring = kind === 'unassigned' ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100 bg-white'
	return (
		<div className={`rounded-2xl border ${ring} p-4 shadow-sm transition ${busy ? 'pointer-events-none opacity-60' : ''}`}>
			<div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(220px,1.1fr)_minmax(260px,1.4fr)_minmax(220px,1fr)_auto]">
				{/* 1. Kamera */}
				<div className="flex min-w-0 items-start gap-3">
					<input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer" checked={selected} onChange={e => onSelect(c._id, e.target.checked)} aria-label={tx('Tanlash')} />
					<div className="min-w-0">
						<div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} /><p className="truncate font-semibold text-gray-900">{c.name || c.cameraId}</p></div>
						<p className="truncate text-xs text-gray-500">{[c.areaName, c.serial].filter(Boolean).join(' · ') || '—'}</p>
						<span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${st.chip}`}>{tx(st.text)}</span>
					</div>
				</div>

				{/* 2. Vazifa va sinf */}
				<div className="space-y-2">
					<div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-medium" role="group" aria-label={tx('Kamera vazifasi')}>
						<button type="button" onClick={() => isHall && onPatch(c._id, { role: 'monitor' }, tx('Kamera sinfxona kamerasi qilindi'))} className={`px-3 py-1.5 ${!isHall ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{tx('Sinfxona')}</button>
						<button type="button" onClick={() => !isHall && onPatch(c._id, { role: 'hall' }, tx('Kamera zal kamerasi qilindi'))} className={`px-3 py-1.5 ${isHall ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{tx('Zal / koridor')}</button>
					</div>
					{isHall ? (
						<label className="block text-[11px] text-gray-500">{tx('Zich hisoblanadigan odam soni')}
							<input type="number" min={5} max={5000} value={cap} placeholder={tx('standart')} onChange={e => setCap(e.target.value)}
								onBlur={() => { if (String(cap) !== String(c.capacity ?? '')) onPatch(c._id, { capacity: cap === '' ? null : Number(cap) }, tx('Zichlik chegarasi saqlandi')) }}
								className="mt-1 block w-32 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-black outline-none focus:border-blue-400" />
						</label>
					) : (
						<div>
							<SearchableSelect variant="outline" icon={false} className="w-full" searchPlaceholder={tx('Sinf qidirish...')} value={c.sinfId || ''} onChange={v => onPatch(c._id, { sinfId: v || null }, v ? tx('Kamera sinfga biriktirildi') : tx('Sinfdan ajratildi'))} options={options} />
							{kind === 'unassigned' && <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-700"><FiAlertCircle size={12} /> {tx("Sinf tanlang: shunda AI tahlil o'zi yoqiladi")}</p>}
							{targetSinf && String(c.sinfId || '') !== String(targetSinf._id) && !isHall && <button type="button" onClick={() => onPatch(c._id, { sinfId: targetSinf._id }, tx('Kamera sinfga biriktirildi'))} className="mt-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">{tx('{{name}} ga biriktirish', { name: targetSinf.name })}</button>}
						</div>
					)}
				</div>

				{/* 3. Odam sanash */}
				<div className="space-y-1">
					<label className="flex items-center gap-2 text-sm text-gray-800">
						<Switch on={!!c.visionEnabled} disabled={!canCount} label={tx('Odam sanash va tahlil')} onChange={v => onPatch(c._id, { visionEnabled: v }, v ? tx('Odam sanash yoqildi. Birinchi natija 1–2 daqiqada chiqadi') : tx("Odam sanash o'chirildi"))} />
						{tx('Odam sanash va tahlil')}
					</label>
					<AnalysisLine c={c} vis={vis} />
				</div>

				{/* 4. Ko'rish */}
				<div className="flex lg:justify-end">
					<button type="button" onClick={() => onPreview(c)} disabled={c.online !== true || c.inCloud === false} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"><FiEye size={14} /> {tx("Ko'rish")}</button>
				</div>
			</div>
		</div>
	)
}

const HelpPanel = ({ onClose }) => (
	<div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
		<div className="flex items-start justify-between gap-3">
			<div className="flex items-center gap-2 text-blue-900"><FiHelpCircle /><h2 className="font-semibold">{tx('Kameralar qanday sozlanadi?')}</h2></div>
			<button onClick={onClose} className="rounded p-1 text-blue-700 hover:bg-blue-100" aria-label={tx('Yopish')}><FiX /></button>
		</div>
		<ol className="mt-3 grid gap-3 text-sm text-blue-950 md:grid-cols-3">
			<li className="rounded-xl bg-white/70 p-3"><b>1. {tx('Kamera vazifasini tanlang')}</b><p className="mt-1 text-xs text-blue-900/80">{tx("Sinfxona: dars jarayoni kuzatiladi. Zal / koridor: odamlar zichligi va tartibsizlik belgilari kuzatiladi.")}</p></li>
			<li className="rounded-xl bg-white/70 p-3"><b>2. {tx('Sinfni biriktiring')}</b><p className="mt-1 text-xs text-blue-900/80">{tx("Kamera qaysi sinf o'tadigan xonada turgan bo'lsa, shu sinfni tanlang. Bir sinfga bir nechta kamera biriktirish mumkin.")}</p></li>
			<li className="rounded-xl bg-white/70 p-3"><b>3. {tx('Natijani kuting')}</b><p className="mt-1 text-xs text-blue-900/80">{tx("Sinf biriktirilgach odam sanash o'zi yoqiladi. 1–2 daqiqadan keyin kamera qatorida hozirgi odam soni chiqadi.")}</p></li>
		</ol>
		<p className="mt-3 text-xs text-blue-900/80">{tx("Natijalar «Sinfxonalar nazorati», «Aqlli kuzatuv» va «Hisobotlar» sahifalarida ko'rinadi. Yuz tanilmaydi va shaxs aniqlanmaydi: faqat odam soni va holatlar (tik turgan, boshi egilgan, qo'l ko'targan) sanaladi.")}</p>
	</div>
)

// Hik-Connect bilan shaxslar sinxronizatsiyasi: xodim/o'quvchi qo'shilganda, rasmi yoki ismi o'zgarganda va o'chirilganda bulutga o'zi yuboriladi.
// Bu karta umumiy holatni ko'rsatadi va hali yuborilmaganlarni birdan navbatga qo'yish imkonini beradi
const PersonSyncCard = () => {
	const [st, setSt] = useState(null)
	const [busy, setBusy] = useState(false)
	const [open, setOpen] = useState(false)

	const load = useCallback(async () => {
		try {
			const res = await axios.get(`${BASE()}/api/hik/persons/status`, authHeaders())
			if (res.data.success) setSt(res.data)
		} catch { /* karta ixtiyoriy */ }
	}, [])
	useEffect(() => { load(); const t = setVisibleInterval(load, 15000); return () => clearInterval(t) }, [load])

	const syncAll = async () => {
		setBusy(true)
		try {
			const res = await axios.post(`${BASE()}/api/hik/persons/sync`, {}, authHeaders())
			toast.success(res.data.queued ? tx("{{n}} ta xodim va o'quvchi bulutga yuborish navbatiga qo'yildi", { n: res.data.queued }) : tx("Yuboriladigan yangi shaxs yo'q"))
			await load()
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Xatolik'))
		} finally { setBusy(false) }
	}

	if (!st || !st.enabled) return null
	const total = Math.max(st.eligible, st.mapped)
	const percent = total ? Math.min(100, Math.round((st.mapped / total) * 100)) : 0
	const todo = Math.max(0, st.eligible - st.mapped - st.pendingAdd)
	return (
		<div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="flex items-center gap-2 font-semibold text-gray-900"><FiUsers /> {tx('Hik-Connect: xodim va o\'quvchilar')}</p>
					<p className="mt-1 text-sm text-gray-500">{tx("Yangi xodim yoki o'quvchi qo'shilsa, rasmi yoki ismi o'zgarsa, o'chirilsa — Hik-Connect bulutiga o'zi yuboriladi (yuz aniqlash uchun).")}</p>
				</div>
				<button onClick={syncAll} disabled={busy || !st.connected || (todo === 0 && st.pendingAdd === 0)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FiRefreshCw size={14} className={busy ? 'animate-spin' : ''} /> {todo > 0 ? tx('Hammasini yuborish ({{n}})', { n: todo }) : tx('Hammasi yuborilgan')}</button>
			</div>
			<div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${percent}%` }} /></div>
			<div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
				<span>{tx('Bulutda')}: <b className="text-gray-900">{st.mapped}</b> / {total}</span>
				<span>{tx('Navbatda')}: <b className="text-gray-900">{st.pendingAdd + st.pendingDelete}</b></span>
				<span className={st.failed ? 'text-red-600' : ''}>{tx('Xato')}: <b>{st.failed}</b></span>
				<span className="text-gray-400">{tx("rasmi bor: {{a}} xodim, {{b}} o'quvchi", { a: st.eligibleStaff, b: st.eligibleStudents })}</span>
			</div>
			{!st.connected && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><FiAlertCircle /> {tx("Maktabga Hik-Connect kamerasi biriktirilmagan: shaxslarni yuborib bo'lmaydi.")}</p>}
			{st.connected && !st.accessLevelId && <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"><FiAlertCircle className="mt-0.5 shrink-0" /> {tx("Hik-Connect'da bu maktab uchun kirish huquqi (access level) topilmadi. Shaxslar bulutda yaratiladi, lekin kameralarga tushishi uchun Hik-Connect'da access level yarating va uni qurilmalarga bog'lang.")}</p>}
			{st.errors?.length > 0 && (
				<div className="mt-3">
					<button onClick={() => setOpen(o => !o)} className="text-xs font-medium text-red-600 hover:underline">{open ? tx('Xatolarni yashirish') : tx("Xatolarni ko'rsatish")}</button>
					{open && <ul className="mt-2 space-y-1 text-xs text-gray-600">{st.errors.map((e, i) => <li key={i} className="rounded bg-red-50 px-2 py-1"><b>{e.name}</b>: {e.error}</li>)}</ul>}
				</div>
			)}
		</div>
	)
}

// Kamera sozlamalari: maktabga biriktirilgan kameralarni sinfga biriktirish, vazifasini belgilash va odam sanashni yoqish.
// Tushunarli ko'rsatmalar, holat xulosasi, qidiruv/filtr va ommaviy biriktirish bilan
const CameraSetup = () => {
	const [cameras, setCameras] = useState([])
	const [sinfs, setSinfs] = useState([])
	const [vision, setVision] = useState({})
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [q, setQ] = useState('')
	const [params] = useSearchParams()
	const targetId = params.get('sinf') // sinfxonalar sahifasidan "Kamera biriktirish" bosilganda
	const [filter, setFilter] = useState(targetId ? 'unassigned' : 'all')
	const [selected, setSelected] = useState(() => new Set())
	const [busy, setBusy] = useState(() => new Set())
	const [bulkSinf, setBulkSinf] = useState(targetId || '')
	const [preview, setPreview] = useState(null)
	const [helpOpen, setHelpOpen] = useState(() => { try { return localStorage.getItem(HELP_KEY) !== '1' } catch { return true } })
	const guard = useRef(makeGuard()).current

	const load = useCallback(async () => {
		const id = guard.next()
		try {
			const [c, s, v] = await Promise.all([
				axios.get(`${BASE()}/api/hik/my-cameras`, authHeaders()),
				axios.get(`${BASE()}/api/sinf/getAll`, authHeaders()).catch(() => ({ data: { sinfs: [] } })),
				axios.get(`${BASE()}/api/hik/vision/live`, authHeaders()).catch(() => ({ data: { items: [] } }))
			])
			if (!guard.ok(id)) return
			setCameras(c.data.cameras || [])
			setSinfs([...(s.data.sinfs || [])].sort((a, b) => String(a.name).localeCompare(String(b.name), 'uz', { numeric: true })))
			setVision(Object.fromEntries((v.data.items || []).map(i => [String(i.cameraId), i])))
			setError(false)
		} catch {
			if (guard.ok(id)) setError(true)
		} finally {
			if (guard.ok(id)) setLoading(false)
		}
	}, [guard])

	useEffect(() => {
		load()
		const t = setVisibleInterval(load, 30000)
		return () => clearInterval(t)
	}, [load])

	const targetSinf = useMemo(() => sinfs.find(x => String(x._id) === String(targetId)) || null, [sinfs, targetId])
	const mine = useMemo(() => cameras.filter(c => ['monitor', 'hall'].includes(c.role || 'monitor') && c.inCloud !== false), [cameras])
	const faceControl = cameras.filter(c => !['monitor', 'hall'].includes(c.role || 'monitor')).length
	const stats = useMemo(() => {
		const kinds = mine.map(kindOf)
		const withCam = new Set(mine.filter(c => c.sinfId).map(c => String(c.sinfId)))
		return {
			total: mine.length, online: mine.filter(c => c.online === true).length, offline: mine.filter(c => c.online === false).length,
			unassigned: kinds.filter(k => k === 'unassigned').length, hall: kinds.filter(k => k === 'hall').length, cls: kinds.filter(k => k === 'class').length,
			counting: mine.filter(c => c.visionEnabled).length,
			working: mine.filter(c => c.visionEnabled && vision[String(c._id)] && !vision[String(c._id)].stale).length,
			withCam, noCamClasses: sinfs.filter(s => !withCam.has(String(s._id)))
		}
	}, [mine, sinfs, vision])

	const rows = useMemo(() => {
		const needle = q.trim().toLowerCase()
		return mine.filter(c => {
			const k = kindOf(c)
			if (filter === 'unassigned' && k !== 'unassigned') return false
			if (filter === 'class' && k !== 'class') return false
			if (filter === 'hall' && k !== 'hall') return false
			if (filter === 'offline' && c.online !== false) return false
			if (!needle) return true
			const sinfName = sinfs.find(s => String(s._id) === String(c.sinfId))?.name || ''
			return [c.name, c.serial, c.areaName, sinfName].some(v => String(v || '').toLowerCase().includes(needle))
		}).sort((a, b) => ((kindOf(a) === 'unassigned') ? 0 : 1) - ((kindOf(b) === 'unassigned') ? 0 : 1) || String(a.name || '').localeCompare(String(b.name || ''), 'uz', { numeric: true }))
	}, [mine, filter, q, sinfs])

	const mark = (ids, on) => setBusy(prev => { const n = new Set(prev); ids.forEach(i => (on ? n.add(i) : n.delete(i))); return n })
	const patch = async (id, body, okMsg) => {
		mark([id], true)
		try {
			await axios.put(`${BASE()}/api/hik/my-cameras/${id}`, body, authHeaders())
			if (okMsg) toast.success(okMsg)
			await load()
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Saqlashda xatolik'))
		} finally {
			mark([id], false)
		}
	}
	const bulk = async (body, okMsg) => {
		const ids = [...selected]
		if (!ids.length) return
		mark(ids, true)
		try {
			const res = await axios.put(`${BASE()}/api/hik/my-cameras-bulk`, { ids, ...body }, authHeaders())
			if (res.data.failed?.length) toast.warn(tx('{{a}} ta kamera saqlandi, {{b}} tasida xatolik', { a: res.data.done, b: res.data.failed.length }))
			else toast.success(okMsg)
			setSelected(new Set())
			await load()
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Saqlashda xatolik'))
		} finally {
			mark(ids, false)
		}
	}

	const onSelect = (id, on) => setSelected(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })
	const allSelected = rows.length > 0 && rows.every(c => selected.has(c._id))
	const closeHelp = () => { setHelpOpen(false); try { localStorage.setItem(HELP_KEY, '1') } catch { /* ixtiyoriy */ } }

	const FILTERS = [['all', tx('Hammasi'), stats.total], ['unassigned', tx('Biriktirilmagan'), stats.unassigned], ['class', tx('Sinfxona'), stats.cls], ['hall', tx('Zal / koridor'), stats.hall], ['offline', tx('Offline'), stats.offline]]

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-start justify-end gap-3">
				<div className="flex items-center gap-2">
					{!helpOpen && <button onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><FiHelpCircle size={14} /> {tx("Yordam")}</button>}
					<button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} size={14} /> {tx('Yangilash')}</button>
				</div>
			</div>

			{targetSinf && (
				<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
					<span>{tx('{{name}} sinfi uchun kamera tanlang: kamera qatoridagi «{{name}} ga biriktirish» tugmasini bosing.', { name: targetSinf.name })}</span>
					<button onClick={() => setFilter('all')} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-blue-900 shadow-sm hover:bg-blue-100">{tx("Hamma kameralarni ko'rsatish")}</button>
				</div>
			)}

			{helpOpen && <HelpPanel onClose={closeHelp} />}

			<PersonSyncCard />

			{error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Hik-Connect kameralarini yuklab bo'lmadi")}</div>}

			{!loading && !error && stats.total === 0 && (
				<div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">{cameras.length === 0 ? tx("Hozircha biriktirilgan Hik-Connect kamerasi yo'q. Kameralarni maktabga tizim egasi biriktiradi.") : tx("Hamma kameralar FaceControl kamerasi — ular FaceControl sahifasida")}</div>
			)}

			{stats.total > 0 && (
				<>
					<div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
						<Stat icon={<FiVideo />} tone="bg-blue-50 text-blue-600" label={tx('Kameralar')} value={stats.total} sub={tx('{{a}}/{{b}} online', { a: stats.online, b: stats.total })} />
						<Stat icon={<FiCheckCircle />} tone="bg-green-50 text-green-600" label={tx('Sinfga biriktirilgan')} value={`${stats.cls}/${stats.cls + stats.unassigned}`} sub={stats.unassigned ? tx('{{n}} ta biriktirilmagan', { n: stats.unassigned }) : tx('hammasi biriktirilgan')} />
						<Stat icon={<FiEye />} tone="bg-indigo-50 text-indigo-600" label={tx('Tahlil ishlayapti')} value={`${stats.working}/${stats.counting}`} sub={tx('odam sanash yoqilgan kameralar')} />
						<Stat icon={<FiAlertCircle />} tone={stats.noCamClasses.length ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'} label={tx('Kamerasiz sinflar')} value={`${stats.noCamClasses.length}/${sinfs.length}`} sub={stats.noCamClasses.length ? tx('kamera biriktirilmagan sinflar bor') : tx('hamma sinfda kamera bor')} />
					</div>

					{sinfs.length > 0 && (
						<div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
							<p className="mb-2 text-sm font-semibold text-gray-800">{tx('Sinflar qamrovi')} <span className="font-normal text-gray-400">· {tx("yashil: kamera bor, kulrang: kamera yo'q")}</span></p>
							<div className="flex flex-wrap gap-1.5">
								{sinfs.map(s => {
									const has = stats.withCam.has(String(s._id))
									return <span key={s._id} className={`rounded-full px-2.5 py-1 text-xs font-medium ${has ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.name}</span>
								})}
							</div>
						</div>
					)}

					{stats.unassigned > 0 && filter !== 'unassigned' && (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
							<span className="flex items-center gap-2"><FiAlertCircle /> {tx("{{n}} ta kamera hali sinfga biriktirilmagan: ular uchun tahlil ishlamaydi", { n: stats.unassigned })}</span>
							<button onClick={() => setFilter('unassigned')} className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-100">{tx("Ko'rsatish")}</button>
						</div>
					)}

					<div className="flex flex-wrap items-center gap-2">
						<label className="relative min-w-[220px] flex-1 sm:max-w-xs"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
							<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx('Kamera, joy yoki sinf bo\'yicha qidirish')} className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
						{FILTERS.map(([k, label, n]) => (
							<button key={k} onClick={() => setFilter(k)} className={`rounded-xl border px-3 py-2 text-sm transition ${filter === k ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}>{label} <span className="opacity-70">· {n}</span></button>
						))}
						<label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-gray-600"><input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={e => setSelected(e.target.checked ? new Set(rows.map(c => c._id)) : new Set())} /> {tx('Hammasini tanlash')}</label>
					</div>

					{selected.size > 0 && (
						<div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 shadow-md">
							<span className="text-sm font-semibold text-blue-900">{tx('Tanlangan: {{n}}', { n: selected.size })}</span>
							<div className="min-w-[180px]"><SearchableSelect variant="outline" icon={false} className="w-full" searchPlaceholder={tx('Sinf qidirish...')} value={bulkSinf} onChange={setBulkSinf} options={[{ value: '', label: tx('— Sinfni tanlang —') }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} /></div>
							<button disabled={!bulkSinf} onClick={() => bulk({ sinfId: bulkSinf }, tx('Tanlangan kameralar sinfga biriktirildi'))} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{tx('Sinfga biriktirish')}</button>
							<button onClick={() => bulk({ visionEnabled: true }, tx('Odam sanash yoqildi'))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-100">{tx('Sanashni yoqish')}</button>
							<button onClick={() => bulk({ visionEnabled: false }, tx("Odam sanash o'chirildi"))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-100">{tx("Sanashni o'chirish")}</button>
							<button onClick={() => bulk({ sinfId: null }, tx('Sinfdan ajratildi'))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-100">{tx('Sinfdan ajratish')}</button>
							<button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-blue-700 hover:underline">{tx('Bekor qilish')}</button>
						</div>
					)}

					{loading && !cameras.length ? <p className="py-10 text-center text-sm text-gray-400">{tx('Yuklanmoqda...')}</p>
						: rows.length === 0 ? <p className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">{tx('Kamera topilmadi')}</p>
							: <div className="space-y-3">{rows.map(c => (
								<CameraRow key={c._id} c={c} sinfs={sinfs} vis={vision[String(c._id)]} selected={selected.has(c._id)} busy={busy.has(c._id)} onSelect={onSelect} onPatch={patch} onPreview={setPreview} targetSinf={targetSinf} />
							))}</div>}

					{faceControl > 0 && <p className="text-xs text-gray-500">{tx("{{n}} ta FaceControl kamerasi alohida sahifada", { n: faceControl })}</p>}
				</>
			)}

			{preview && <HikLiveModal camera={{ id: preview._id, name: preview.name || preview.cameraId, areaName: preview.areaName }} onClose={() => setPreview(null)} />}
		</div>
	)
}

export default CameraSetup
