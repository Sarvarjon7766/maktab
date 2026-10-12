import { useCallback, useEffect, useState } from 'react'
import { FiAlertTriangle, FiArrowRight, FiCheckCircle, FiInbox, FiRefreshCw, FiUsers } from 'react-icons/fi'
import { FaTelegramPlane } from 'react-icons/fa'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import MessagesTab from './parents/MessagesTab'
import ParentsTab from './parents/ParentsTab'
import ReportsTab from './parents/ReportsTab'
import RequestsTab from './parents/RequestsTab'
import ShareTab from './parents/ShareTab'
import StudentsTab from './parents/StudentsTab'
import { api, sinfApi } from './parents/ui'
import { tx } from '../../i18n'

// Qamrov halqasi: nechta o'quvchining kamida bitta ota-onasi Telegramga ulangan
const Ring = ({ pct }) => {
	const r = 34, c = 2 * Math.PI * r
	return (
		<svg viewBox="0 0 84 84" className="w-24 h-24 shrink-0" role="img" aria-label={`Qamrov ${pct}%`}>
			<circle cx="42" cy="42" r={r} fill="none" stroke="#e5e7eb" strokeWidth="9" />
			<circle cx="42" cy="42" r={r} fill="none" stroke={pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444'} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${pct / 100 * c} ${c}`} transform="rotate(-90 42 42)" />
			<text x="42" y="46" textAnchor="middle" fontSize="19" fontWeight="700" fill="#111827">{pct}%</text>
		</svg>
	)
}

const Mini = ({ label, value, hint, tone = 'text-gray-900', onClick }) => (
	<div {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => { if (e.key === 'Enter') onClick() } } : {})} className={`rounded-xl bg-gray-50 px-4 py-3 min-w-[130px] flex-1 ${onClick ? 'cursor-pointer hover:bg-gray-100 transition' : ''}`}><p className="text-xs text-gray-500">{label}</p><p className={`text-2xl font-bold leading-tight ${tone}`}>{value}</p>{hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}</div>
)

// Ota-onalar boti: ota-onalarni Telegram orqali ro'yxatga olish, farzandlariga biriktirish va nazorat qilish.
// FaceID bo'yicha o'quvchi maktabga kirsa/chiqsa, ulangan ota-onalarga avtomatik xabar boradi
const AdminParents = () => {
	const [params, setParams] = useSearchParams()
	const [ov, setOv] = useState(null)
	const [coverage, setCoverage] = useState([])
	const [sinfs, setSinfs] = useState([])
	const [preset, setPreset] = useState({})
	const tab = params.get('tab') || 'share'
	const setTab = (t) => { const n = new URLSearchParams(params); n.set('tab', t); setParams(n, { replace: true }) }

	const load = useCallback(async () => {
		try { setOv((await api('get', 'overview')).data) } catch { setOv({ error: true }) }
		try { setCoverage((await api('get', 'coverage')).data.classes || []) } catch { /* qamrov ixtiyoriy */ }
	}, [])
	useEffect(() => { load() }, [load])
	useEffect(() => { sinfApi().then(r => setSinfs(r.data.sinfs || [])).catch(() => {}) }, [])

	const setSetting = async (patch) => {
		setOv(o => ({ ...o, settings: { ...o.settings, ...patch } }))
		try { await api('put', 'settings', { data: patch }) } catch (e) { toast.error(e?.response?.data?.message || 'Saqlanmadi'); load() }
	}
	const goStudents = (filters) => { setPreset({ ...filters }); setTab('students') }

	if (!ov) return <div className="p-6 text-sm text-gray-500">{tx("Yuklanmoqda...")}</div>
	if (ov.error) return <div className="p-6"><div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{tx("Ma'lumotni yuklab bo'lmadi. Sahifani yangilab ko'ring.")}</div></div>

	const c = ov.counts
	const pct = c.students ? Math.round(c.coveredStudents / c.students * 100) : 0
	const uncovered = Math.max(0, c.students - c.coveredStudents)

	// Hozir eng muhim vazifa
	let todo
	if (!ov.bot.ready) todo = { tone: 'amber', icon: <FiAlertTriangle size={20} />, title: 'Telegram bot hali ulanmagan', text: "Bot tizim administratori tomonidan ulangach, ro'yxatga olish havolasi va QR kod shu sahifada paydo bo'ladi. Shunga qadar ota-onalar ro'yxatdan o'ta olmaydi va xabar yuborilmaydi." }
	else if (c.pending > 0) todo = { tone: 'amber', icon: <FiInbox size={20} />, title: `${c.pending} ta ota-ona so'rovi tasdiqlashingizni kutmoqda`, text: "Telefon raqami maktab ro'yxatidan topilmagan ota-onalar. Kim ekanini aniqlab, farzandiga biriktiring.", action: ["So'rovlarni ko'rish", () => setTab('requests')] }
	else if (c.guardians === 0) todo = { tone: 'blue', icon: <FaTelegramPlane size={20} />, title: 'Boshlash uchun ota-onalarga havola yuboring', text: "«Ulash» bo'limida tayyor xabar va QR kod bor: uni ota-onalar guruhiga yuboring. Ota-onalar ro'yxatdan o'tgach, shu yerda ko'rinadi.", action: ['Havolani ochish', () => setTab('share')] }
	else if (uncovered > 0) todo = { tone: 'blue', icon: <FiUsers size={20} />, title: `${uncovered} ta o'quvchining ota-onasi hali ulanmagan`, text: "Ularning ota-onalariga havolani yuboring yoki farzand uchun alohida havola yarating.", action: ["Ulanmaganlarni ko'rsatish", () => goStudents({ covered: 'no' })] }
	else todo = { tone: 'green', icon: <FiCheckCircle size={20} />, title: "Hamma o'quvchilarning ota-onasi ulangan", text: "Farzandlari maktabga kirsa yoki chiqsa, ota-onalarga avtomatik xabar boradi." }
	const TONE = { amber: 'border-amber-200 bg-amber-50 text-amber-900', blue: 'border-sky-200 bg-sky-50 text-sky-900', green: 'border-green-200 bg-green-50 text-green-900' }

	const tabs = [['share', 'Ulash'], ['students', 'Farzandlar'], ['parents', `Ota-onalar${c.guardians ? ` (${c.guardians})` : ''}`], ['requests', "So'rovlar", c.pending], ['reports', 'Sabab xabarlari', c.reports], ['messages', 'Xabarlar']]

	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6 space-y-5">
			<div className="flex flex-wrap items-center justify-end gap-3">
				<div className="flex items-center gap-2">
					<span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${ov.bot.ready ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}><span className={`w-2 h-2 rounded-full ${ov.bot.ready ? 'bg-green-500' : 'bg-amber-500'}`} />{ov.bot.ready ? `Bot ulangan: @${ov.bot.username}` : tx("Bot ulanmagan")}</span>
					<button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw size={14} /> {tx("Yangilash")}</button>
				</div>
			</div>

			<div className={`rounded-2xl border p-4 md:p-5 flex flex-wrap items-center gap-4 ${TONE[todo.tone]}`}>
				<span className="shrink-0">{todo.icon}</span>
				<div className="min-w-[200px] flex-1 basis-56"><p className="font-semibold">{todo.title}</p><p className="text-sm opacity-90 mt-0.5">{todo.text}</p></div>
				{todo.action && <button onClick={todo.action[1]} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/80 hover:bg-white border border-black/10 text-sm font-medium shrink-0">{todo.action[0]} <FiArrowRight size={14} /></button>}
			</div>

			<section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-wrap items-center gap-6">
				<div role="button" tabIndex={0} onClick={() => setTab('students')} onKeyDown={e => { if (e.key === 'Enter') setTab('students') }} className="flex items-center gap-4 cursor-pointer rounded-xl hover:bg-gray-50 transition"><Ring pct={pct} /><div><p className="text-xs text-gray-500">{tx("Ota-onasi ulangan o'quvchilar")}</p><p className="text-2xl font-bold text-gray-900">{c.coveredStudents} <span className="text-base font-medium text-gray-400">/ {c.students}</span></p></div></div>
				<div className="flex flex-wrap gap-3 flex-1 min-w-[260px]">
					<Mini label={tx("Ulangan ota-onalar")} value={c.guardians} onClick={() => setTab('parents')} />
					<Mini onClick={() => setTab('messages')} label={tx("Bugun yuborilgan xabarlar")} value={c.sentToday} hint={c.failedToday ? `${c.failedToday} ta xato` : tx("Xatosiz")} tone={c.failedToday ? 'text-gray-900' : 'text-gray-900'} />
					<Mini onClick={() => setTab('requests')} label={tx("Tasdiqlash kutilmoqda")} value={c.pending} hint={c.pending ? tx("«So'rovlar» bo'limida") : tx("Yo'q")} tone={c.pending ? 'text-amber-600' : 'text-gray-900'} />
				</div>
			</section>

			<nav className="flex gap-1.5 overflow-x-auto pb-1" aria-label={tx("Bo'limlar")}>
				{tabs.map(([k, l, badge]) => (
					<button key={k} onClick={() => setTab(k)} className={`px-4 py-2.5 rounded-xl text-sm font-medium border whitespace-nowrap transition inline-flex items-center gap-2 ${tab === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}>
						{l}{badge > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] flex items-center justify-center">{badge}</span>}
					</button>
				))}
			</nav>

			<div>
				{tab === 'share' && <ShareTab ov={ov} coverage={coverage} onChanged={load} goStudents={goStudents} />}
				{tab === 'students' && <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><StudentsTab sinfs={sinfs} preset={preset} onChanged={load} /></section>}
				{tab === 'parents' && <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><ParentsTab sinfs={sinfs} onChanged={load} /></section>}
				{tab === 'requests' && <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><RequestsTab onChanged={load} /></section>}
				{tab === 'reports' && <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5"><ReportsTab onChanged={load} /></section>}
				{tab === 'messages' && <MessagesTab settings={ov.settings} counts={c} delivery={ov.delivery} onSetting={setSetting} />}
			</div>
		</div>
	)
}

export default AdminParents
