import axios from 'axios'
import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertCircle, FiCheck, FiCheckCircle, FiRefreshCw, FiTrash2, FiUsers, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import PersonPhotoPreview from '../../components/PersonPhotoPreview'
import SearchableSelect from '../../components/SearchableSelect'
import { tx } from '../../i18n'
import { setVisibleInterval } from '../../utils/poll'

const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())
const hhmm = (d) => new Date(d).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })
const FAIL = { no_file: "Rasm fayli yo'q", no_face: "Yuz topilmadi", small_face: "Yuz kichik", no_photo: "Rasmi yo'q", error: 'Xato' }

const Stat = ({ label, value, note, tone = 'text-gray-900' }) => (
	<div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">{label}</p><p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>{note && <p className="mt-0.5 text-xs text-gray-400">{note}</p>}</div>
)

// Yuz tanish: o'quvchi suratlaridan yuz bazasini yaratish, sinflar bo'yicha qamrov, sinfxona kameralaridan "ko'rindi" dalillari va ularni tekshirish.
// DIQQAT: bu davomat emas — tanilmagan o'quvchi kelmagan degani emas (orqadagi yuzlar kichik).
const AdminFaces = () => {
	const [st, setSt] = useState(null)
	const [error, setError] = useState(false)
	const [busy, setBusy] = useState(false)
	const [sinf, setSinf] = useState('')
	const [date, setDate] = useState(today())
	const [rows, setRows] = useState([])
	const [staffRows, setStaffRows] = useState([])

	const load = useCallback(async () => {
		try {
			const r = await axios.get(`${BASE}/api/hik/faces/status`, auth())
			if (r.data.success) { setSt(r.data); setError(false) } else setError(true)
		} catch { setError(true) }
	}, [])
	const loadPresence = useCallback(async () => {
		try {
			const r = await axios.get(`${BASE}/api/hik/faces/presence`, { ...auth(), params: { sinfId: sinf || undefined, date } })
			if (r.data.success) setRows(r.data.rows)
		} catch { setRows([]) }
		try {
			const r2 = await axios.get(`${BASE}/api/hik/faces/staff-presence`, { ...auth(), params: { date } })
			if (r2.data.success) setStaffRows(r2.data.rows)
		} catch { setStaffRows([]) }
	}, [sinf, date])
	useEffect(() => { load(); const t = setVisibleInterval(load, 8000); return () => clearInterval(t) }, [load])
	useEffect(() => { loadPresence(); const t = setVisibleInterval(loadPresence, 30000); return () => clearInterval(t) }, [loadPresence])

	const enroll = async (force = false) => {
		setBusy(true)
		try { await axios.post(`${BASE}/api/hik/faces/enroll`, { force }, auth()); toast.info(tx("Yuz bazasi yaratilmoqda, bir necha daqiqa olishi mumkin")); await load() } catch (e) { toast.error(tx(e.response?.data?.message || 'Xatolik')) } finally { setBusy(false) }
	}
	const purge = async () => {
		if (!window.confirm(tx("Hamma yuz izlari, qo'shimcha yuz suratlari va «ko'rindi» yozuvlari o'chiriladi. Davom etasizmi?"))) return
		try { await axios.delete(`${BASE}/api/hik/faces`, auth()); toast.success(tx("Yuz ma'lumotlari o'chirildi")); await load(); await loadPresence() } catch (e) { toast.error(tx(e.response?.data?.message || 'Xatolik')) }
	}
	const verdict = async (row, v) => {
		const next = row.verdict === v ? null : v
		try { await axios.put(`${BASE}/api/hik/faces/presence/${row._id}/verdict`, { verdict: next }, auth()); await Promise.all([loadPresence(), load()]) } catch { toast.error(tx('Xatolik')) }
	}

	const sinfOptions = useMemo(() => [{ value: '', label: 'Barcha sinflar' }, ...(st?.classes || []).map(c => ({ value: c.sinfId, label: c.name }))], [st])

	if (error && !st) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi")}</div></div>
	if (!st) return <div className="space-y-3 p-6">{[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-white" />)}</div>

	const job = st.job
	const pct = job?.total ? Math.round((job.done / job.total) * 100) : 0
	const acc = st.accuracy
	return (
		<div className="space-y-5 p-4 md:p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold text-gray-900">{tx("Yuz tanish")}</h1>
					<p className="max-w-3xl text-sm text-gray-500">{tx("Sinfxona kameralari kadrlaridan o'quvchilar yuzi tanilib, «ko'rindi» dalili saqlanadi. Bu davomat emas: orqadagi kichik yuzlar tanilmasligi mumkin, tanilmagan o'quvchi kelmagan hisoblanmaydi.")}</p>
				</div>
				<Link to="live" className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">{tx("Jonli sinov")} →</Link>
				<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${st.enabled ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
					{st.enabled ? <FiCheckCircle /> : <FiAlertCircle />} {st.enabled ? tx("Yoqilgan") : tx("O'chiq (tizim egasi yoqadi)")}
				</span>
			</div>

			<Link to="live" className="block rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-900 shadow-sm hover:bg-blue-100">
				<p className="text-base font-semibold">{tx("Jonli sinov →")}</p>
				<p className="mt-0.5 text-sm text-blue-800">{tx("Kameraning jonli videosi, odamlar soni va yuz tanish natijasi real vaqtda — bitta sahifada")}</p>
			</Link>

			<div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
				<Stat label={tx("O'quvchilar")} value={st.students} />
				<Stat label={tx("Asosiy rasmi bor")} value={st.withPhoto} />
				<Stat label={tx("Yuz izi olingan")} value={st.enrolledStudents} note={st.students ? `${Math.round((st.enrolledStudents / st.students) * 100)}%` : ''} tone={st.enrolledStudents ? 'text-blue-700' : 'text-gray-900'} />
				<Stat label={tx("Jami izlar")} value={st.templates} note={tx("o'quvchiga o'rtacha {{n}}", { n: st.enrolledStudents ? (st.templates / st.enrolledStudents).toFixed(1) : 0 })} />
				<Stat label={tx("Xodimlar (yuz izi bor)")} value={`${st.staff?.enrolled || 0}/${st.staff?.total || 0}`} note={tx("rasmi bor: {{n}}", { n: st.staff?.withPhoto || 0 })} />
				<Stat label={tx("Aniqlik (tekshirilgan)")} value={acc.percent === null ? '—' : `${acc.percent}%`} note={tx("{{a}} to'g'ri / {{b}} xato", { a: acc.correct, b: acc.wrong })} tone={acc.percent === null ? 'text-gray-900' : acc.percent >= 90 ? 'text-green-700' : acc.percent >= 75 ? 'text-amber-600' : 'text-red-600'} />
			</div>

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div><h2 className="font-semibold text-gray-900">{tx("Yuz bazasi")}</h2><p className="text-sm text-gray-500">{tx("Asosiy suratlardan yuz izlari olinadi. Aniqlik uchun har o'quvchiga 3–5 ta qo'shimcha rasm yuklang (O'quvchini tahrirlash oynasida). Kamera orqali tanilgan yuzlar izlarni o'zi to'ldiradi.")}</p></div>
					<div className="flex flex-wrap gap-2">
						<button onClick={() => enroll(false)} disabled={busy || job?.running} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FiUsers size={14} /> {tx("Suratlardan baza yaratish")}</button>
						<button onClick={() => enroll(true)} disabled={busy || job?.running} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw size={14} /> {tx("Qaytadan olish")}</button>
						<button onClick={purge} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"><FiTrash2 size={14} /> {tx("Hammasini o'chirish")}</button>
					</div>
				</div>
				{job && (
					<div className="mt-4">
						<div className="mb-1.5 flex justify-between text-xs text-gray-500"><span>{job.running ? tx("Bajarilmoqda...") : tx("Tugadi")} · {job.done}/{job.total}</span><span>{tx("olindi: {{a}}, o'tkazildi: {{b}}", { a: job.enrolled, b: job.skipped })}</span></div>
						<div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} /></div>
						{Object.entries(job.failed || {}).filter(([, n]) => n > 0).length > 0 && <p className="mt-2 text-xs text-amber-700">{tx("Olinmadi")}: {Object.entries(job.failed).filter(([, n]) => n > 0).map(([k, n]) => `${tx(FAIL[k] || k)} — ${n}`).join(' · ')}</p>}
					</div>
				)}
			</section>

			<div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
				<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
					<h2 className="mb-3 font-semibold text-gray-900">{tx("Sinflar bo'yicha qamrov")}</h2>
					<div className="max-h-[360px] overflow-y-auto">
						<table className="w-full text-sm">
							<thead><tr className="text-left text-xs uppercase text-gray-400"><th className="py-2">{tx("Sinf")}</th><th>{tx("O'quvchi")}</th><th>{tx("Yuz izi bor")}</th><th>{tx("3+ rasm")}</th></tr></thead>
							<tbody>{st.classes.map(c => {
								const p = c.students ? Math.round((c.enrolled / c.students) * 100) : 0
								return <tr key={c.sinfId} className="border-t border-gray-50"><td className="py-2 font-medium text-gray-900">{c.name}</td><td>{c.students}</td>
									<td className="w-40"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-full rounded-full ${p >= 90 ? 'bg-green-500' : p >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${p}%` }} /></div><span className="w-12 text-right text-xs text-gray-500">{c.enrolled}/{c.students}</span></div></td>
									<td className="text-gray-600">{c.rich}</td></tr>
							})}</tbody>
						</table>
					</div>
				</section>

				<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
					<h2 className="mb-3 font-semibold text-gray-900">{tx("Kameralar (oxirgi tahlil)")}</h2>
					{st.cameras.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">{tx("Sinfga biriktirilgan kamera yo'q")}</p> : (
						<ul className="space-y-2">{st.cameras.map(c => (
							<li key={c._id} className="rounded-xl border border-gray-100 p-3 text-sm">
								<div className="flex items-center justify-between gap-2"><span className="font-medium text-gray-900">{c.name}</span><span className="text-xs text-gray-500">{c.sinf}</span></div>
								<div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
									<span className={`rounded-full px-2 py-0.5 ${c.gate ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-600'}`}>{c.gate ? tx("Darvoza: chiqdi yozadi") : c.direction === 'off' ? tx("Yozmaydi") : tx("Maktab hududida: kirdi yozadi")}</span>
									{c.teacher?.state === 'present' && <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">{tx("O'qituvchi bor")}: {c.teacher.people.filter(p => p.teacher).map(p => p.name).join(', ')}</span>}
									{c.teacher?.state === 'staff' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{tx("Xodim bor")}: {c.teacher.people.map(p => p.name).join(', ')}</span>}
									{c.teacher?.state === 'absent' && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700" title={tx("Xonada odamlar bor, lekin oxirgi 15 daqiqada xodim yuzi ko'rinmadi")}>{tx("O'qituvchi ko'rinmadi")}</span>}
									{c.teacher?.state === 'unknown' && <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">{tx("O'qituvchi: noma'lum")}</span>}
								</div>
								{c.last ? <p className="mt-1 text-xs text-gray-500">{hhmm(c.last.at)} · {tx("yuzlar: {{a}}, tanildi: {{b}}", { a: c.last.faces, b: c.last.matched })}{c.last.learned ? ` · ${tx("o'rganildi: {{n}}", { n: c.last.learned })}` : ''}{c.last.room && ` · ${tx('xona')}: ${c.last.room.source === 'inferred' ? tx("kadrdan aniqlandi") : tx("biriktirilgan sinf")}`}</p> : <p className="mt-1 text-xs text-gray-400">{tx("Hali tahlil qilinmagan")}</p>}
							</li>
						))}</ul>
					)}
				</section>
			</div>

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
					<div><h2 className="font-semibold text-gray-900">{tx("Kamerada ko'ringanlar")}</h2><p className="text-sm text-gray-500">{tx("To'g'ri (✓) yoki xato (✗) deb belgilang: bu aniqlikni o'lchaydi, xato belgilanganda shu o'quvchining kameradan o'rganilgan izlari tozalanadi.")}</p></div>
					<div className="flex flex-wrap items-center gap-2">
						<input type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} className="h-10 rounded-lg border border-gray-200 px-3 text-sm text-black" />
						<SearchableSelect variant="outline" icon={false} searchFrom={8} className="min-w-[160px]" value={sinf} onChange={setSinf} options={sinfOptions} />
					</div>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase text-gray-400"><th className="py-2">{tx("O'quvchi")}</th><th>{tx("Sinf")}</th><th>{tx("Kamera / xona")}</th><th>{tx("Vaqt")}</th><th>{tx("Kadr")}</th><th>{tx("O'xshashlik")}</th><th>{tx("Holat")}</th><th className="text-right">{tx("Tekshiruv")}</th></tr></thead>
						<tbody>
							{rows.map(r => (
								<tr key={r._id} className="border-t border-gray-50">
									<td className="py-2"><span className="flex items-center gap-2.5"><PersonPhotoPreview photo={r.photo} name={r.fullName} size="sm" /><span className="font-medium text-gray-900">{r.fullName}</span></span></td>
									<td className="text-gray-600">{r.sinf}</td>
									<td className="text-gray-600">{r.camera}{r.room && r.room !== r.sinf && <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700" title={tx("Xona boshqa sinf deb aniqlangan")}>{r.room}</span>}</td>
									<td className="whitespace-nowrap text-gray-600">{hhmm(r.firstSeen)} – {hhmm(r.lastSeen)}</td>
									<td className="text-gray-600">{r.hits}</td>
									<td className="text-gray-600">{r.score} <span className="text-xs text-gray-400">({r.size}px)</span></td>
									<td>{r.attendanceAt && <span className={`mr-1 rounded-full px-2 py-0.5 text-xs font-medium ${r.attendanceAction === 'out' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`} title={tx("Yuz orqali davomatga yozilgan")}>{r.attendanceAction === 'out' ? tx("Chiqdi") : tx("Kirdi")} {hhmm(r.attendanceAt)}</span>}<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'confirmed' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{r.status === 'confirmed' ? tx("Tasdiqlangan") : tx("Taxminiy")}</span></td>
									<td className="whitespace-nowrap text-right">
										<button onClick={() => verdict(r, 'ok')} title={tx("To'g'ri")} className={`mr-1 rounded-lg border p-1.5 ${r.verdict === 'ok' ? 'border-green-500 bg-green-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-green-50 hover:text-green-600'}`}><FiCheck size={14} /></button>
										<button onClick={() => verdict(r, 'wrong')} title={tx("Xato")} className={`rounded-lg border p-1.5 ${r.verdict === 'wrong' ? 'border-red-500 bg-red-500 text-white' : 'border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600'}`}><FiX size={14} /></button>
									</td>
								</tr>
							))}
							{rows.length === 0 && <tr><td colSpan={8} className="py-12 text-center text-gray-500">{tx("Bu kunda yuz orqali ko'ringan o'quvchi yo'q")}</td></tr>}
						</tbody>
					</table>
				</div>
			</section>

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<h2 className="font-semibold text-gray-900">{tx("Xodimlar (kamerada ko'ringanlar)")}</h2>
				<p className="mb-3 text-sm text-gray-500">{tx("Xodimning yuz izi bo'lishi uchun xodim kartasiga rasm yuklang (xodim ID raqami bo'lishi shart). Sinfxonada o'qituvchi bor-yo'qligi shundan aniqlanadi.")}</p>
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead><tr className="text-left text-xs uppercase text-gray-400"><th className="py-2">{tx("Xodim")}</th><th>{tx("Lavozim")}</th><th>{tx("Kamera / xona")}</th><th>{tx("Vaqt")}</th><th>{tx("Kadr")}</th><th>{tx("O'xshashlik")}</th><th>{tx("Davomat")}</th></tr></thead>
						<tbody>
							{staffRows.map(r => (
								<tr key={r._id} className="border-t border-gray-50">
									<td className="py-2"><span className="flex items-center gap-2.5"><PersonPhotoPreview photo={r.photo} name={r.fullName} size="sm" /><span className="font-medium text-gray-900">{r.fullName}</span></span></td>
									<td className="text-gray-600">{r.position}</td>
									<td className="text-gray-600">{r.camera}{r.sinf && <span className="ml-1 text-xs text-gray-400">{r.sinf}</span>}</td>
									<td className="whitespace-nowrap text-gray-600">{hhmm(r.firstSeen)} – {hhmm(r.lastSeen)}</td>
									<td className="text-gray-600">{r.hits}</td>
									<td className="text-gray-600">{r.score}</td>
									<td>{r.attendanceAt ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.attendanceAction === 'out' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-blue-700'}`}>{r.attendanceAction === 'out' ? tx("Chiqdi") : tx("Kirdi")} {hhmm(r.attendanceAt)}</span> : <span className="text-xs text-gray-400">—</span>}</td>
								</tr>
							))}
							{staffRows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">{tx("Bu kunda yuz orqali ko'ringan xodim yo'q")}</td></tr>}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	)
}

export default AdminFaces
