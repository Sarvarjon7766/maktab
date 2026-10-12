import axios from 'axios'
import useSchoolBase from '../../components/useSchoolBase'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiBarChart2, FiChevronDown, FiChevronRight, FiDownload, FiRefreshCw, FiSearch, FiUsers, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import SearchableSelect from '../../components/SearchableSelect'
import TabelExportPanel from '../../components/TabelExportPanel'
import { typeColor, typeLabel } from '../../components/GlobalCommentModal'
import UserAttendanceModal from './UserAttendanceModal'
import { setVisibleInterval } from '../../utils/poll'
import { uploadUrl } from '../../utils/uploadUrl'
import { tx } from '../../i18n'
dayjs.extend(utc)
dayjs.extend(timezone)

const STATUS = {
	ishda: { label: 'Ishda', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', order: 1 },
	tashqarida: { label: 'Tashqarida', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 ring-sky-200', order: 2 },
	kelmagan: { label: 'Kelmagan', dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 ring-rose-200', order: 0 },
}
const statusOf = (u) => (u.attendanceStatus === 'ishda' || u.attendanceStatus === 'tashqarida' ? u.attendanceStatus : 'kelmagan')
const hhmm = (iso) => { if (!iso) return null; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
// Maktabda necha soat bo'lgani: birinchi kirishdan oxirgi chiqishgacha (hali ichkarida bo'lsa, hozirgacha)
const spent = (u) => {
	if (!u.firstCheckInTime) return null
	const from = new Date(u.firstCheckInTime).getTime()
	const out = u.lastCheckOutTime ? new Date(u.lastCheckOutTime).getTime() : 0
	const to = u.attendanceStatus === 'ishda' || out < from ? Date.now() : out
	const m = Math.max(0, Math.round((to - from) / 60000))
	return m < 1 ? null : m >= 60 ? `${Math.floor(m / 60)} s ${m % 60} d` : `${m} d`
}

const Avatar = ({ user, status }) => (
	<span className="relative shrink-0">
		<span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-200 to-slate-300 font-semibold text-slate-600">
			{user.photo ? <img src={`${uploadUrl(user.photo)}`} alt="" className="h-full w-full object-cover" /> : user.fullName?.charAt(0)?.toUpperCase()}
		</span>
		<span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${STATUS[status].dot}`} />
	</span>
)

// Yuqoridagi katta ko'rsatkich kartasi: bosilsa shu holat bo'yicha filtrlanadi
const Stat = ({ active, onClick, label, value, hint, color, pct }) => (
	<button onClick={onClick} className={`group relative overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${active ? 'border-slate-900 ring-2 ring-slate-900/10' : 'border-slate-200'}`}>
		<span className={`absolute inset-x-0 top-0 h-1 ${color}`} />
		<p className="text-xs font-medium text-slate-500">{label}</p>
		<p className="mt-1.5 text-3xl font-bold leading-none text-slate-900">{value}</p>
		<p className="mt-2 text-xs text-slate-400">{hint}</p>
		{pct !== undefined && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>}
	</button>
)

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const SORTS = [['name', "Ism bo'yicha"], ['status', 'Avval kelmaganlar'], ['time', 'Kirish vaqti']]

// Xodimlar nazorati: bugungi holat, kim ishda/tashqarida/kelmagan, bo'lim bo'yicha yoki umumiy ro'yxat
const AdminAttendance = () => {
	const token = localStorage.getItem('token')
	const roleBase = useSchoolBase().replace(/^\//, '')
	const [groups, setGroups] = useState([])
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)
	const [updatedAt, setUpdatedAt] = useState(null)
	const [q, setQ] = useState('')
	const [filter, setFilter] = useState('all')
	const [sort, setSort] = useState('status')
	const group = false // xodimlar bo'limlarga bo'linmaydi: bitta umumiy ro'yxat
	const [closed, setClosed] = useState(() => new Set())
	const [exportOpen, setExportOpen] = useState(false)
	const [selectedUserId, setSelectedUserId] = useState(null)
	const [commentMap, setCommentMap] = useState({})

	const load = useCallback(async (silent = false) => {
		const headers = { Authorization: `Bearer ${token}` }
		const base = import.meta.env.VITE_BASE_URL
		try {
			if (!silent) setLoading(true)
			const [deptRes, usersRes, cmRes] = await Promise.all([
				axios.get(`${base}/api/sinf/getAll`, { headers }),
				axios.get(`${base}/api/user/getAll`, { headers }),
				axios.get(`${base}/api/comment/map?date=${dayjs().tz('Asia/Tashkent').format('YYYY-MM-DD')}`, { headers }).catch(() => null),
			])
			if (deptRes.data.success && usersRes.data.success) {
				const users = usersRes.data.users
				const list = deptRes.data.sinfs.map(d => ({ _id: d._id, name: d.name, users: users.filter(u => u.sinf?._id === d._id) }))
				const rest = users.filter(u => !u.sinf)
				if (rest.length) list.push({ _id: 'no-sinf', name: 'Sinfsiz xodimlar', users: rest })
				setGroups(list)
				setUpdatedAt(new Date())
			}
			if (cmRes?.data?.success) setCommentMap(cmRes.data.data)
		} catch { toast.error("Ma'lumotlarni yuklashda xato yuz berdi") } finally { setLoading(false); setRefreshing(false) }
	}, [token])

	useEffect(() => {
		load()
		const t = setVisibleInterval(() => load(true), 30000) // jim yangilanadi, ro'yxat miltillamaydi
		return () => clearInterval(t)
	}, [load])

	const all = useMemo(() => groups.flatMap(g => g.users.map(u => ({ ...u, _group: g.name }))), [groups])
	const counts = useMemo(() => {
		const c = { all: all.length, ishda: 0, tashqarida: 0, kelmagan: 0 }
		all.forEach(u => { c[statusOf(u)]++ })
		return c
	}, [all])
	const came = counts.ishda + counts.tashqarida
	const pct = counts.all ? Math.round(came / counts.all * 100) : 0

	const visible = useMemo(() => {
		const term = norm(q.trim())
		const byName = (a, b) => (a.fullName || '').localeCompare(b.fullName || '')
		const t = (u) => (u.firstCheckInTime ? new Date(u.firstCheckInTime).getTime() : Infinity)
		const cmp = sort === 'name' ? byName : sort === 'time' ? (a, b) => (t(a) === t(b) ? 0 : t(a) < t(b) ? -1 : 1) : (a, b) => STATUS[statusOf(a)].order - STATUS[statusOf(b)].order || byName(a, b)
		return all.filter(u => (filter === 'all' || statusOf(u) === filter) && (!term || norm(`${u.fullName} ${u.position || ''} ${u.username || ''}`).includes(term))).sort(cmp)
	}, [all, q, filter, sort])

	const sections = useMemo(() => {
		if (!group) return [{ _id: 'all', name: 'Barcha xodimlar', users: visible }]
		const map = new Map()
		visible.forEach(u => { if (!map.has(u._group)) map.set(u._group, []); map.get(u._group).push(u) })
		return [...map.entries()].map(([name, users]) => ({ _id: name, name, users }))
	}, [visible, group])

	const toggle = (id) => setClosed(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })
	const filtered = q || filter !== 'all'

	// Oddiy funksiya (komponent emas): har yangilanishda rasmlar qayta yuklanib miltillamasligi uchun
	const renderRow = (u) => {
		const st = statusOf(u), s = STATUS[st]
		const c = commentMap[u._id]
		const first = hhmm(u.firstCheckInTime), last = hhmm(u.lastCheckOutTime), dur = spent(u)
		return (
			<li key={u._id} onClick={() => setSelectedUserId(u._id)} className="group flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
				<Avatar user={u} status={st} />
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-semibold text-slate-900 group-hover:text-blue-600">{u.fullName}</p>
					<p className="truncate text-xs text-slate-500">{u.position || tx("Lavozim ko'rsatilmagan")}</p>
					{c && <span className={`mt-1 inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${typeColor(c.type)}`}>{typeLabel(c.type)}: {c.comment}</span>}
				</div>
				<div className="hidden shrink-0 text-right sm:block">
					{first ? (
						<>
							<p className="text-sm font-semibold text-slate-800">{first}{last && st === 'tashqarida' ? <span className="font-normal text-slate-400"> – {last}</span> : ''}</p>
							<p className="text-xs text-slate-400">{dur ? `Maktabda ${dur}` : tx("Kirdi")}</p>
						</>
					) : <p className="text-xs text-slate-300">{tx("Hali kirmagan")}</p>}
				</div>
				<span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${s.pill}`}>{s.label}</span>
				<Link to={`/${roleBase}/users/${u._id}/analytics`} onClick={e => e.stopPropagation()} title={tx("Batafsil tahlil")} className="rounded-lg p-2 text-slate-300 transition hover:bg-blue-50 hover:text-blue-600"><FiBarChart2 size={16} /></Link>
			</li>
		)
	}

	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6">
			<div className="space-y-5">
				<div className="flex flex-wrap items-center justify-end gap-3">
					{updatedAt && <p className="text-xs text-slate-500">{tx("Yangilandi {{time}}", { time: hhmm(updatedAt) })}</p>}
					<div className="flex gap-2">
						<button onClick={() => setExportOpen(v => !v)} className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${exportOpen ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><FiDownload size={15} /> {tx("Tabel yuklash")}</button>
						<button onClick={() => { setRefreshing(true); load(true) }} title={tx("Yangilash")} className="rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50"><FiRefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></button>
					</div>
				</div>

				{exportOpen && <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><TabelExportPanel sinfs={groups.filter(d => d._id !== 'no-sinf')} /></div>}

				<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<Stat active={filter === 'all'} onClick={() => setFilter('all')} label={tx("Bugun kelganlar")} value={`${pct}%`} hint={`${came} / ${counts.all} xodim`} color="bg-blue-500" pct={pct} />
					<Stat active={filter === 'ishda'} onClick={() => setFilter(f => (f === 'ishda' ? 'all' : 'ishda'))} label={tx("Hozir ishda")} value={counts.ishda} hint={tx("Maktab ichida")} color="bg-emerald-500" />
					<Stat active={filter === 'tashqarida'} onClick={() => setFilter(f => (f === 'tashqarida' ? 'all' : 'tashqarida'))} label={tx("Tashqarida")} value={counts.tashqarida} hint={tx("Kelib, chiqib ketgan")} color="bg-sky-500" />
					<Stat active={filter === 'kelmagan'} onClick={() => setFilter(f => (f === 'kelmagan' ? 'all' : 'kelmagan'))} label={tx("Kelmagan")} value={counts.kelmagan} hint={tx("Hali kirish qayd etilmagan")} color="bg-rose-500" />
				</div>

				<div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-sm backdrop-blur">
					<div className="relative min-w-[200px] flex-1">
						<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
						<input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Ism, lavozim yoki login bo'yicha qidirish")} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm text-black outline-none focus:border-blue-400 focus:bg-white" />
						{q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"><FiX size={14} /></button>}
					</div>
					<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" value={sort} onChange={setSort} options={SORTS.map(([value, label]) => ({ value, label }))} />
				</div>

				{loading ? (
					<div className="space-y-3">{[0, 1, 2].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-100 bg-white" />)}</div>
				) : sections.every(s => s.users.length === 0) ? (
					<div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
						<span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400"><FiUsers size={24} /></span>
						<p className="mt-3 font-semibold text-slate-800">{filtered ? tx("Bu tanlov bo'yicha xodim topilmadi") : tx("Hali xodim qo'shilmagan")}</p>
						<p className="mt-1 text-sm text-slate-500">{filtered ? tx("Qidiruv yoki filtrni o'zgartirib ko'ring") : tx("Xodimlar sahifasidan xodim qo'shing")}</p>
						{filtered && <button onClick={() => { setQ(''); setFilter('all') }} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">{tx("Filtrni tozalash")}</button>}
					</div>
				) : (
					<div className="space-y-4">
						{sections.map(sec => {
							const total = sec.users.length, ok = sec.users.filter(u => statusOf(u) !== 'kelmagan').length, p = total ? Math.round(ok / total * 100) : 0
							const isClosed = group && closed.has(sec._id)
							return (
								<section key={sec._id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
									{group && (
										<button onClick={() => toggle(sec._id)} className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 sm:px-5">
											{isClosed ? <FiChevronRight className="text-slate-400" /> : <FiChevronDown className="text-slate-400" />}
											<span className="font-semibold text-slate-900">{sec.name}</span>
											<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{total}</span>
											<span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
												<span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block"><span className={`block h-full rounded-full ${p >= 80 ? 'bg-emerald-500' : p >= 50 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ width: `${p}%` }} /></span>
												{tx("{{ok}}/{{total}} kelgan", { ok, total })}
											</span>
										</button>
									)}
									{!isClosed && <ul className="divide-y divide-slate-100">{sec.users.map(renderRow)}</ul>}
								</section>
							)
						})}
					</div>
				)}
			</div>

			{selectedUserId && <UserAttendanceModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />}
		</div>
	)
}

export default AdminAttendance
