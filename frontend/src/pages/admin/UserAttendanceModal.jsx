import axios from 'axios'
import useSchoolBase from '../../components/useSchoolBase'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiArrowRight, FiCalendar, FiDownload, FiX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import * as XLSX from 'xlsx-js-style'

const pad = n => String(n).padStart(2, '0')
const toLocalStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DAYS = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan']
const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const fmt = (iso) => { if (!iso) return '—'; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const fmtDate = (ds) => { if (!ds) return ''; const d = new Date(ds + 'T00:00:00'); return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${DAYS[d.getDay()]}` }
// Backend `hoursWorked` kunning har bir kirish/chiqish sessiyasi alohida yig'ilib hisoblangan (tushlik/tanaffus "ishlagan"ga kirmaydi)
const workDuration = (h) => { if (!h) return '—'; const m = Math.round(h * 60); return `${Math.floor(m / 60)} s ${pad(m % 60)} d` }
const stateOf = (r) => (!r.arrivalTime ? 'absent' : r.status === 'tashqarida' ? 'out' : r.status === 'ishda' ? 'inside' : 'came')
const BADGE = {
	inside: ['Ishda', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
	came: ['Kelgan', 'bg-emerald-50 text-emerald-700 ring-emerald-200'],
	out: ['Tashqarida', 'bg-sky-50 text-sky-700 ring-sky-200'],
	absent: ['Kelmadi', 'bg-rose-50 text-rose-700 ring-rose-200'],
}
const monthStart = (back = 0) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - back, 1) }
const PRESETS = [
	['7 kun', () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 6); return [toLocalStr(f), toLocalStr(t)] }],
	['30 kun', () => { const t = new Date(); const f = new Date(); f.setDate(t.getDate() - 29); return [toLocalStr(f), toLocalStr(t)] }],
	['Shu oy', () => [toLocalStr(monthStart()), toLocalStr(new Date())]],
	["O'tgan oy", () => [toLocalStr(monthStart(1)), toLocalStr(new Date(new Date().getFullYear(), new Date().getMonth(), 0))]],
]

// Xodimning davomat tarixi: davr tanlanganda o'zi yangilanadi; holat bo'yicha filtr, Excelga yuklash, to'liq tahlilga o'tish
const UserAttendanceModal = ({ userId, onClose }) => {
	const token = localStorage.getItem('token')
	const roleBase = useSchoolBase().replace(/^\//, '')
	const [loading, setLoading] = useState(true)
	const [user, setUser] = useState(null)
	const [history, setHistory] = useState([])
	const [stats, setStats] = useState({ totalDays: 0, presentDays: 0, absentDays: 0, averageHours: '0.0' })
	const [from, setFrom] = useState(toLocalStr(monthStart()))
	const [to, setTo] = useState(toLocalStr(new Date()))
	const [filter, setFilter] = useState('all')
	// Tez-tez o'zgartirilsa eski javob yangisini bosib ketmasligi uchun faqat eng oxirgi so'rov qabul qilinadi
	const seq = useRef(0)

	const load = useCallback(async () => {
		const mine = ++seq.current
		try {
			setLoading(true)
			const headers = { Authorization: `Bearer ${token}` }
			const base = import.meta.env.VITE_BASE_URL
			const [u, h] = await Promise.all([
				axios.get(`${base}/api/user/getById/${userId}`, { headers }),
				axios.get(`${base}/api/user/attandance/${userId}`, { params: { from, to }, headers }),
			])
			if (mine !== seq.current) return
			if (u.data.success) setUser(u.data.user)
			if (h.data.success) {
				setHistory(h.data.attendanceHistory || [])
				setStats(h.data.stats || { totalDays: 0, presentDays: 0, absentDays: 0, averageHours: '0.0' })
			}
		} catch {
			if (mine === seq.current) toast.error("Ma'lumotlarni yuklashda xato yuz berdi")
		} finally {
			if (mine === seq.current) setLoading(false)
		}
	}, [userId, from, to, token])

	useEffect(() => {
		if (from > to) return
		const t = setTimeout(load, 250) // sana yozilayotganda har bosishda so'rov ketmasin
		return () => clearTimeout(t)
	}, [load, from, to])

	useEffect(() => {
		const onKey = (e) => { if (e.key === 'Escape') onClose() }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const counts = useMemo(() => {
		const c = { all: history.length, came: 0, absent: 0 }
		history.forEach(r => { if (r.arrivalTime) c.came++; else c.absent++ })
		return c
	}, [history])
	const rows = useMemo(() => history.filter(r => filter === 'all' || (filter === 'came' ? !!r.arrivalTime : !r.arrivalTime)), [history, filter])
	const percent = stats.totalDays ? Math.round(stats.presentDays / stats.totalDays * 100) : null
	const invalid = from > to

	const exportToExcel = () => {
		if (!rows.length) return toast.info("Eksport uchun ma'lumot yo'q")
		const header = ['Sana', 'Holat', 'Kirish', 'Chiqish', 'Ish vaqti']
		const data = rows.map(r => [fmtDate(r.dateString), BADGE[stateOf(r)][0], fmt(r.arrivalTime), fmt(r.departureTime), workDuration(r.hoursWorked)])
		const ws = XLSX.utils.aoa_to_sheet([[`${user?.fullName || 'Xodim'}: davomat ${from} — ${to}`], [], header, ...data])
		ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }]
		ws['A1'].s = { font: { bold: true, sz: 14 } }
		header.forEach((_, c) => { const ref = XLSX.utils.encode_cell({ r: 2, c }); if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '0F172A' } }, alignment: { horizontal: 'center' } } })
		ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 }]
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Davomat')
		XLSX.writeFile(wb, `${user?.fullName || 'Xodim'}_davomat_${from}_${to}.xlsx`)
		toast.success('Excel yuklandi')
	}

	if (!userId) return null
	const tab = (k, l, n) => <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1.5 text-sm transition ${filter === k ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{l} <span className="opacity-60">{n}</span></button>
	const date = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-black outline-none focus:border-blue-400'

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
			<div onClick={e => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
				<div className="flex items-center gap-4 border-b border-slate-100 px-5 py-4">
					<span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-lg font-semibold text-slate-600">
						{user?.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`} alt="" className="h-full w-full object-cover" /> : user?.fullName?.charAt(0)?.toUpperCase()}
					</span>
					<div className="min-w-0 flex-1">
						<h3 className="truncate text-lg font-semibold text-slate-900">{user?.fullName || 'Yuklanmoqda...'}</h3>
						<p className="truncate text-sm text-slate-500">{[user?.position, user?.sinf?.name].filter(Boolean).join(' · ') || 'Davomat tarixi'}</p>
					</div>
					<Link to={`/${roleBase}/users/${userId}/analytics`} onClick={onClose} className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 sm:inline-flex">Batafsil tahlil <FiArrowRight size={14} /></Link>
					<button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Yopish"><FiX size={18} /></button>
				</div>

				<div className="space-y-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
					<div className="flex flex-wrap items-center gap-2">
						{PRESETS.map(([l, fn]) => <button key={l} onClick={() => { const [f, t] = fn(); setFrom(f); setTo(t) }} className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100">{l}</button>)}
						<span className="mx-1 hidden h-5 w-px bg-slate-200 sm:block" />
						<input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={date} />
						<span className="text-slate-400">—</span>
						<input type="date" value={to} min={from} max={toLocalStr(new Date())} onChange={e => e.target.value && setTo(e.target.value)} className={date} />
						<button onClick={exportToExcel} disabled={!rows.length} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 disabled:opacity-50"><FiDownload size={14} /> Excel</button>
					</div>
					{invalid && <p className="text-xs text-rose-600">Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas</p>}
				</div>

				<div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
					{[
						['Davomat', percent === null ? '—' : `${percent}%`, percent === null ? 'text-slate-400' : percent >= 85 ? 'text-emerald-600' : percent >= 60 ? 'text-amber-600' : 'text-rose-600', `${stats.presentDays} / ${stats.totalDays} kun`],
						['Kelgan kunlar', stats.presentDays, 'text-emerald-600', ''],
						['Kelmagan kunlar', stats.absentDays, stats.absentDays ? 'text-rose-600' : 'text-slate-900', ''],
						["O'rtacha ish vaqti", `${stats.averageHours} soat`, 'text-slate-900', 'kuniga'],
					].map(([l, v, tone, sub]) => (
						<div key={l} className="rounded-2xl border border-slate-200 bg-white p-3.5"><p className="text-xs text-slate-500">{l}</p><p className={`mt-1 text-xl font-bold leading-none ${tone}`}>{loading ? '…' : v}</p>{sub && <p className="mt-1.5 text-[11px] text-slate-400">{sub}</p>}</div>
					))}
				</div>

				<div className="flex flex-wrap gap-1.5 px-5 pb-3">{tab('all', 'Hammasi', counts.all)}{tab('came', 'Kelgan', counts.came)}{tab('absent', 'Kelmagan', counts.absent)}</div>

				<div className="min-h-[160px] flex-1 overflow-y-auto border-t border-slate-100">
					{loading ? (
						<div className="space-y-px">{[0, 1, 2, 3].map(i => <div key={i} className="h-12 animate-pulse bg-slate-50" />)}</div>
					) : rows.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-14 text-center text-slate-400">
							<FiCalendar size={40} className="mb-3" />
							<p className="font-medium text-slate-600">{history.length ? "Bu filtr bo'yicha yozuv yo'q" : 'Davomat tarixi mavjud emas'}</p>
							<p className="mt-1 text-sm">{history.length ? "Boshqa holatni tanlang" : "Tanlangan davr uchun yozuvlar topilmadi"}</p>
						</div>
					) : (
						<table className="min-w-full">
							<thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
								<tr><th className="px-5 py-2.5">Sana</th><th className="px-3 py-2.5">Holat</th><th className="px-3 py-2.5">Kirish</th><th className="px-3 py-2.5">Chiqish</th><th className="px-5 py-2.5 text-right">Ish vaqti</th></tr>
							</thead>
							<tbody className="divide-y divide-slate-100">
								{rows.map((r, i) => {
									const [label, cls] = BADGE[stateOf(r)]
									return (
										<tr key={r._id || i} className="hover:bg-slate-50">
											<td className="whitespace-nowrap px-5 py-3 text-sm font-medium text-slate-800">{fmtDate(r.dateString)}</td>
											<td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>{label}</span></td>
											<td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">{fmt(r.arrivalTime)}</td>
											<td className="whitespace-nowrap px-3 py-3 font-mono text-sm text-slate-700">{fmt(r.departureTime)}</td>
											<td className="whitespace-nowrap px-5 py-3 text-right text-sm text-slate-700">{workDuration(r.hoursWorked)}</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	)
}

export default UserAttendanceModal
