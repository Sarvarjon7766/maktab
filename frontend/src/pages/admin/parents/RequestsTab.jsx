import { useCallback, useEffect, useState } from 'react'
import { FiCheck, FiInbox, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { api, Chip, dt, Empty, errText, initials, StudentPicker } from './ui'
import { tx } from '../../../i18n'

// Bitta so'rov kartasi: tavsiya etilgan farzandlar + qidiruv orqali boshqa farzandlarni belgilab, birdaniga biriktirish
const RequestCard = ({ r, onDone }) => {
	const [picked, setPicked] = useState(() => new Map()) // id -> { fullName, sinf }
	const [busy, setBusy] = useState(false)
	const toggle = (s) => setPicked(m => { const n = new Map(m); const k = String(s._id ?? s.studentId); if (n.has(k)) n.delete(k); else n.set(k, { fullName: s.fullName, sinf: s.sinf }); return n })
	const approve = async () => {
		setBusy(true)
		try { const res = await api('post', `requests/${r._id}/approve`, { data: { studentIds: [...picked.keys()] } }); toast.success(`${res.data.linked} ta farzandga biriktirildi`); onDone() } catch (e) { toast.error(errText(e)) } finally { setBusy(false) }
	}
	const reject = async () => {
		if (!window.confirm(`${r.name} so'rovini rad etamizmi? Unga botda xabar boradi.`)) return
		try { await api('post', `requests/${r._id}/reject`); toast.success("So'rov rad etildi"); onDone() } catch (e) { toast.error(errText(e)) }
	}
	const selectedKeys = new Set(picked.keys())
	return (
		<li className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex items-center gap-3"><span className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 font-semibold text-sm flex items-center justify-center">{initials(r.name)}</span><div><p className="font-semibold text-gray-900">{r.name}{r.username && <span className="font-normal text-gray-400"> @{r.username}</span>}</p><p className="text-xs text-gray-500">{r.phone || tx("Telefon yo'q")} · {dt(r.createdAt)}</p></div></div>
				<Chip tone="bg-amber-50 text-amber-800">{r.kind === 'disabled' ? tx("Admin o'chirgan ulanishga qayta ulanmoqchi") : tx("Raqam maktab ro'yxatidan topilmadi")}</Chip>
			</div>

			{r.suggestions.length > 0 && (
				<div className="mt-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{tx("Tavsiya etilgan farzandlar")}</p>
					<div className="flex flex-wrap gap-2">
						{r.suggestions.map(s => {
							const on = picked.has(String(s.studentId))
							return <button key={String(s.studentId)} onClick={() => toggle(s)} className={`text-left px-3 py-2 rounded-xl border text-sm transition ${on ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}><span className="font-medium text-gray-900">{on ? '✓ ' : ''}{s.fullName}</span> <span className="text-gray-400">· {s.sinf}</span><span className="block text-[11px] text-gray-500">{s.reason}</span></button>
						})}
					</div>
				</div>
			)}

			<div className="mt-4">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{r.suggestions.length ? tx("Boshqa farzandni qidirish") : tx("Qaysi o'quvchining ota-onasi?")}</p>
				<StudentPicker selected={selectedKeys} onToggle={toggle} />
			</div>

			{picked.size > 0 && (
				<div className="mt-3 flex flex-wrap gap-1.5">
					{[...picked.entries()].map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-blue-50 text-xs text-blue-900">{v.fullName} <span className="text-blue-400">· {v.sinf}</span><button onClick={() => toggle({ _id: k })} className="w-4 h-4 rounded-full hover:bg-blue-100 flex items-center justify-center"><FiX size={11} /></button></span>)}
				</div>
			)}

			<div className="mt-4 flex flex-wrap gap-2 justify-end">
				<button onClick={reject} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><FiX size={14} /> {tx("Rad etish")}</button>
				<button disabled={!picked.size || busy} onClick={approve} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"><FiCheck size={14} /> {picked.size ? `${picked.size} ta farzandga biriktirish` : tx("Farzandni tanlang")}</button>
			</div>
		</li>
	)
}

// "So'rovlar" bo'limi: telefon raqami o'quvchi kartasidagi raqam bilan mos kelmagan ota-onalar
const RequestsTab = ({ onChanged }) => {
	const [rows, setRows] = useState(null)
	const load = useCallback(() => api('get', 'requests').then(r => setRows(r.data.requests)).catch(() => setRows([])), [])
	useEffect(() => { load() }, [load])
	return (
		<div className="space-y-4">
			<p className="text-sm text-gray-500">{tx("Botda ro'yxatdan o'tmoqchi bo'lgan, lekin telefon raqami maktab ro'yxatidan topilmagan ota-onalar. Kim ekanini aniqlab, farzandiga (bir nechtasiga ham) biriktiring yoki rad eting.")}</p>
			{!rows ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : rows.length === 0 ? <Empty icon={<FiInbox size={22} />} title={tx("Kutilayotgan so'rov yo'q")} hint={tx("Hamma ota-onalar ko'rib chiqilgan. Raqami mos kelmagan yangi ota-ona bo'lsa, shu yerda paydo bo'ladi.")} /> : (
				<ul className="space-y-3">{rows.map(r => <RequestCard key={r._id} r={r} onDone={() => { load(); onChanged() }} />)}</ul>
			)}
		</div>
	)
}

export default RequestsTab
