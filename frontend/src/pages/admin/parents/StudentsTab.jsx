import { useCallback, useEffect, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiChevronRight, FiLink, FiSend, FiTrash2 } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import SearchableSelect from '../../../components/SearchableSelect'
import { api, Chip, copyText, dt, Drawer, Empty, errText, LinkBox, Pager, STATE, Toggle, VIA } from './ui'
import { tx } from '../../../i18n'

// Bitta farzand paneli: maktab kartasidagi ota-ona ma'lumoti, ulangan ota-onalar va yangi ota-ona uchun havola
const StudentDrawer = ({ student, onClose, onChanged }) => {
	const [list, setList] = useState(null)
	const [invite, setInvite] = useState(null)
	const [busy, setBusy] = useState(false)
	const load = useCallback(() => api('get', 'guardians', { params: { studentId: student._id, limit: 50 } }).then(r => setList(r.data.guardians || [])).catch(() => setList([])), [student._id])
	useEffect(() => { load() }, [load])

	const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); await load(); onChanged() } catch (e) { toast.error(errText(e)) } }
	const makeInvite = async () => {
		setBusy(true)
		try { const r = await api('post', 'invite/student', { data: { studentId: student._id } }); setInvite(r.data.invite) } catch (e) { toast.error(errText(e, "Havola yaratib bo'lmadi")) } finally { setBusy(false) }
	}
	const text = invite ? `Assalomu alaykum! ${student.fullName} maktabga kirsa yoki chiqsa, sizga Telegram orqali xabar keladi. Ro'yxatdan o'tish uchun havolani bosing: ${invite.url}` : ''

	return (
		<Drawer title={student.fullName} subtitle={`${student.sinf || 'Sinf yo\'q'} · ota-onalarni ulash va boshqarish`} onClose={onClose}>
			<section className="rounded-xl bg-gray-50 p-4">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{tx("Maktab kartasidagi ma'lumot")}</p>
				<p className="text-sm text-gray-800">{tx("Ota-ona:")} <b>{student.parentName || '—'}</b></p>
				<p className="text-sm text-gray-800 mt-0.5">{tx("Telefon:")} {student.hasPhone ? <b>{student.parentPhone}</b> : <span className="text-red-600 font-medium">{tx("kiritilmagan")}</span>}</p>
				{!student.hasPhone && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">{tx("Telefon raqami yo'qligi sababli umumiy havola bu o'quvchini o'zi topa olmaydi. Pastdagi «Shu farzand uchun havola» orqali ulang yoki")} <Link to="../students" className="underline font-medium">{tx("O'quvchilar")}</Link> {tx("sahifasida raqamni kiriting.")}</p>}
			</section>

			<section>
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{tx("Ulangan ota-onalar")} {list ? `(${list.length})` : ''}</p>
				{!list ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : list.length === 0 ? (
					<p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">{tx("Hali birorta ota-ona ulanmagan")}</p>
				) : (
					<ul className="space-y-3">
						{list.map(g => {
							const state = !g.active ? 'inactive' : g.blocked ? 'blocked' : g.paused ? 'paused' : 'active'
							const [vl, vc] = VIA[g.via] || VIA.invite
							const [sl, sc] = STATE[state]
							return (
								<li key={g._id} className="rounded-xl border border-gray-100 p-3">
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0"><p className="font-medium text-gray-900 truncate">{g.name}</p><p className="text-xs text-gray-400">{g.username ? `@${g.username}` : ''}{g.phone ? ` · ${g.phone}` : ''}</p></div>
										<div className="flex gap-1 shrink-0">
											<button title={tx("Sinov xabari")} onClick={() => run(() => api('post', `guardians/${g._id}/test`), 'Sinov xabari yuborildi')} className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"><FiSend size={13} /></button>
											<button title={tx("Ro'yxatdan chiqarish")} onClick={() => { if (window.confirm(`${g.name} ni ${student.fullName} dan ajratamizmi?`)) run(() => api('delete', `guardians/${g._id}`), "Ota-ona ajratildi") }} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600"><FiTrash2 size={13} /></button>
										</div>
									</div>
									<div className="flex flex-wrap gap-1.5 mt-2"><Chip tone={vc}>{vl}</Chip><Chip tone={sc}>{sl}</Chip></div>
									<div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
										<Toggle small checked={g.notifyIn} onChange={v => run(() => api('put', `guardians/${g._id}`, { data: { notifyIn: v } }))} label={tx("Kirdi xabari")} />
										<Toggle small checked={g.notifyOut} onChange={v => run(() => api('put', `guardians/${g._id}`, { data: { notifyOut: v } }))} label={tx("Chiqdi xabari")} />
									</div>
									<p className="text-[11px] text-gray-400 mt-2">{tx("Oxirgi xabar: {{date}}", { date: dt(g.lastSentAt) })}</p>
								</li>
							)
						})}
					</ul>
				)}
			</section>

			<section>
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{tx("Yangi ota-ona qo'shish")}</p>
				{!invite ? (
					<div className="space-y-2">
						<button onClick={makeInvite} disabled={busy} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"><FiLink size={14} /> {busy ? tx("Yaratilmoqda...") : tx("Shu farzand uchun havola yaratish")}</button>
						<p className="text-xs text-gray-500">{tx("Havola faqat {{name}} ga bog'lanadi: ota-ona bossa, telefon raqami so'ralmasdan darrov ulanadi. 7 kun amal qiladi, 3 tagacha ota-ona (ota, ona...) foydalana oladi.", { name: student.fullName })}</p>
					</div>
				) : (
					<div className="space-y-3">
						<LinkBox compact invite={invite} hint={`${invite.maxUses} tagacha ota-ona, 7 kun amal qiladi.`} />
						<button onClick={() => copyText(text, 'Xabar matni nusxalandi')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{tx("Ota-onaga yuboriladigan matnni nusxalash")}</button>
					</div>
				)}
			</section>
		</Drawer>
	)
}

const SEGMENTS = [['', 'Hammasi'], ['no', 'Ulanmagan'], ['yes', 'Ulangan']]

// "Farzandlar" bo'limi: qaysi o'quvchining ota-onasi ulangan/ulanmagan; bosilganda panel ochiladi
const StudentsTab = ({ sinfs, preset, onChanged }) => {
	const [f, setF] = useState({ sinfId: '', q: '', covered: '', phone: '', page: 1, ...preset })
	const [data, setData] = useState(null)
	const [open, setOpen] = useState(null)
	useEffect(() => { setF(x => ({ ...x, sinfId: '', q: '', covered: '', phone: '', page: 1, ...preset })) }, [preset])
	const load = useCallback(() => api('get', 'students', { params: { ...f, limit: 25 } }).then(r => setData(r.data)).catch(() => setData({ students: [], pages: 1, total: 0 })), [f])
	useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
	const set = (patch) => setF(x => ({ ...x, ...patch, page: 1 }))
	const filtered = f.sinfId || f.q || f.covered || f.phone

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-2">
				<div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">{SEGMENTS.map(([k, l]) => <button key={k} onClick={() => set({ covered: k })} className={`px-3.5 py-1.5 rounded-md text-sm transition ${f.covered === k ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900'}`}>{l}</button>)}</div>
				<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" searchPlaceholder={tx("Sinf qidirish...")} value={f.sinfId} onChange={v => set({ sinfId: v })} options={[{ value: '', label: 'Barcha sinflar' }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} />
				<input value={f.q} onChange={e => set({ q: e.target.value })} placeholder={tx("O'quvchi ismi")} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black w-48" />
				<label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer"><input type="checkbox" checked={f.phone === 'no'} onChange={e => set({ phone: e.target.checked ? 'no' : '' })} /> {tx("Telefoni kiritilmaganlar")}</label>
				{filtered && <button onClick={() => set({ sinfId: '', q: '', covered: '', phone: '' })} className="text-sm text-blue-600 hover:underline">{tx("Filtrni tozalash")}</button>}
			</div>

			{!data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : data.students.length === 0 ? (
				<Empty icon={<FiCheckCircle size={22} />} title={filtered ? tx("Bu tanlov bo'yicha o'quvchi yo'q") : tx("Maktabda hali o'quvchi yo'q")} hint={filtered ? tx("Filtrni o'zgartirib ko'ring.") : tx("Avval O'quvchilar sahifasidan o'quvchilarni qo'shing: shundan keyin ota-onalarni ulash mumkin.")} />
			) : (
				<>
					<div className="overflow-x-auto rounded-xl border border-gray-100">
						<table className="w-full text-sm">
							<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50">{["O'quvchi", "Maktab kartasidagi ota-ona", 'Ota-onalari (Telegram)', ''].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
							<tbody>
								{data.students.map(s => (
									<tr key={s._id} onClick={() => setOpen(s)} className="border-t border-gray-50 hover:bg-blue-50/40 cursor-pointer">
										<td className="px-4 py-3"><p className="font-medium text-gray-900">{s.fullName}</p><p className="text-xs text-gray-400">{s.sinf || '—'}</p></td>
										<td className="px-4 py-3">{s.hasPhone ? <><p className="text-gray-800">{s.parentPhone}</p><p className="text-xs text-gray-400">{s.parentName || ''}</p></> : <span className="inline-flex items-center gap-1 text-xs text-red-600"><FiAlertCircle size={13} /> {tx("Telefon kiritilmagan")}</span>}</td>
										<td className="px-4 py-3">{s.guardians ? <Chip tone="bg-green-50 text-green-700">✓ {tx("{{n}} ta ulangan", { n: s.guardians })}</Chip> : <Chip tone="bg-amber-50 text-amber-700">{tx("Ulanmagan")}</Chip>}</td>
										<td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">{tx("Boshqarish")} <FiChevronRight size={14} /></span></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<Pager {...data} set={(p) => setF(x => ({ ...x, page: p }))} />
				</>
			)}
			{open && <StudentDrawer student={open} onClose={() => setOpen(null)} onChanged={() => { load(); onChanged() }} />}
		</div>
	)
}

export default StudentsTab
