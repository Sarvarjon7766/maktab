import { useCallback, useEffect, useState } from 'react'
import { FiBell, FiPlus, FiSend, FiTrash2, FiUsers, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from '../../../components/SearchableSelect'
import { api, Chip, dt, Empty, errText, initials, Modal, Pager, STATE, StudentPicker, Toggle, VIA } from './ui'
import { tx } from '../../../i18n'

// Farzand qo'shish oynasi: ro'yxatdagi ota-onaga yana bir farzandni biriktirish (aka-uka, telefon mos kelmaganda)
const AddChildModal = ({ parent, onClose, onDone }) => {
	const [picked, setPicked] = useState(null)
	const [busy, setBusy] = useState(false)
	const exclude = parent.children.map(c => String(c.studentId))
	const save = async () => {
		setBusy(true)
		try { await api('post', `parents/${parent.chatId}/children`, { data: { studentId: picked._id } }); toast.success(`${picked.fullName} biriktirildi`); onDone(); onClose() } catch (e) { toast.error(errText(e)) } finally { setBusy(false) }
	}
	return (
		<Modal title={`${parent.name}: farzand qo'shish`} onClose={onClose}>
			<p className="text-sm text-gray-500 mb-3">{tx("Qaysi o'quvchi shu ota-onaning farzandi? Biriktirilgach ota-onaga botda xabar boradi va u farzandining kirish-chiqishini ham ko'ra boshlaydi.")}</p>
			<StudentPicker exclude={exclude} selected={new Set(picked ? [String(picked._id)] : [])} onToggle={s => setPicked(p => (p && String(p._id) === String(s._id) ? null : s))} />
			{picked && <p className="mt-3 text-sm text-gray-800">{tx("Tanlandi:")} <b>{picked.fullName}</b> <span className="text-gray-400">· {picked.sinf}</span></p>}
			<div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{tx("Bekor qilish")}</button><button disabled={!picked || busy} onClick={save} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50">{tx("Biriktirish")}</button></div>
		</Modal>
	)
}

// "Ota-onalar" bo'limi: bitta ota-ona = bitta karta; farzandlari chip bo'lib, xabar sozlamalari hamma farzandiga birdaniga
const ParentsTab = ({ sinfs, onChanged }) => {
	const [f, setF] = useState({ sinfId: '', q: '', status: '', page: 1 })
	const [data, setData] = useState(null)
	const [adding, setAdding] = useState(null)
	const load = useCallback(() => api('get', 'parents', { params: { ...f, limit: 12 } }).then(r => setData(r.data)).catch(() => setData({ parents: [], pages: 1, total: 0 })), [f])
	useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])
	const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); await load(); onChanged() } catch (e) { toast.error(errText(e)) } }
	const set = (patch) => setF(x => ({ ...x, ...patch, page: 1 }))

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap gap-2">
				<input value={f.q} onChange={e => set({ q: e.target.value })} placeholder={tx("Ota-ona, telefon yoki farzand ismi")} className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-black w-72 max-w-full" />
				<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" searchPlaceholder={tx("Sinf qidirish...")} value={f.sinfId} onChange={v => set({ sinfId: v })} options={[{ value: '', label: 'Barcha sinflar' }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} />
				<SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[260px]" value={f.status} onChange={v => set({ status: v })} options={[{ value: '', label: 'Barcha holatlar' }, { value: 'active', label: 'Faol' }, { value: 'blocked', label: 'Botni bloklagan' }, { value: 'paused', label: "Xabarni to'xtatgan" }, { value: 'inactive', label: 'Faolsizlantirilgan' }]} />
			</div>

			{!data ? <p className="text-sm text-gray-500">{tx("Yuklanmoqda...")}</p> : data.parents.length === 0 ? (
				<Empty icon={<FiUsers size={22} />} title={f.q || f.sinfId || f.status ? tx("Bu tanlov bo'yicha ota-ona topilmadi") : tx("Hali birorta ota-ona ro'yxatdan o'tmagan")} hint={f.q || f.sinfId || f.status ? '' : tx("«Ulash» bo'limidagi havolani ota-onalarga yuboring: ular ro'yxatdan o'tgach shu yerda ko'rinadi.")} />
			) : (
				<>
					<ul className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
						{data.parents.map(p => {
							const [sl, sc] = STATE[p.state]
							return (
								<li key={p.chatId} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
									<div className="flex items-start justify-between gap-3">
										<div className="flex items-center gap-3 min-w-0">
											<span className="w-10 h-10 rounded-full bg-sky-100 text-sky-700 font-semibold text-sm flex items-center justify-center shrink-0">{initials(p.name)}</span>
											<div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{p.name}</p><p className="text-xs text-gray-400 truncate">{p.username ? `@${p.username}` : tx("Telegram")}{p.phone ? ` · ${p.phone}` : ''}</p></div>
										</div>
										<Chip tone={sc}>{sl}</Chip>
									</div>

									<div className="mt-3">
										<p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{tx("Farzandlari")}</p>
										<div className="flex flex-wrap gap-1.5">
											{p.children.map(c => (
												<span key={String(c.linkId)} className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-gray-100 text-xs text-gray-800">
													{c.name}{c.sinf && <span className="text-gray-400">· {c.sinf}</span>}
													<button title={tx("Shu farzanddan ajratish")} onClick={() => { if (window.confirm(`${p.name} ni ${c.name} dan ajratamizmi?`)) run(() => api('delete', `guardians/${c.linkId}`), 'Ajratildi') }} className="w-4 h-4 rounded-full hover:bg-red-100 hover:text-red-600 text-gray-400 flex items-center justify-center"><FiX size={11} /></button>
												</span>
											))}
											<button onClick={() => setAdding(p)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-gray-300 text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600"><FiPlus size={12} /> {tx("Farzand qo'shish")}</button>
										</div>
									</div>

									<div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-50">
										<div className="flex flex-wrap items-center gap-x-5 gap-y-1">
											<Toggle small checked={p.notifyIn} onChange={v => run(() => api('put', `parents/${p.chatId}`, { data: { notifyIn: v } }))} label={tx("Kirdi xabari")} />
											<Toggle small checked={p.notifyOut} onChange={v => run(() => api('put', `parents/${p.chatId}`, { data: { notifyOut: v } }))} label={tx("Chiqdi xabari")} />
										</div>
										<div className="flex items-center gap-1.5">
											<button title={tx("Sinov xabari yuborish")} onClick={() => run(() => api('post', `parents/${p.chatId}/test`), 'Sinov xabari yuborildi')} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-700 hover:bg-gray-50"><FiSend size={12} /> {tx("Sinov")}</button>
											<button title={p.state === 'inactive' ? tx("Qayta faollashtirish") : tx("Xabarlarni to'xtatish")} onClick={() => run(() => api('put', `parents/${p.chatId}`, { data: { active: p.state === 'inactive' } }), p.state === 'inactive' ? 'Faollashtirildi' : 'Faolsizlantirildi')} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs hover:bg-gray-50 ${p.state === 'inactive' ? 'text-gray-500' : 'text-green-700'}`}><FiBell size={12} /> {p.state === 'inactive' ? tx("Yoqish") : tx("To'xtatish")}</button>
											<button title={tx("Ro'yxatdan butunlay chiqarish")} onClick={() => { if (window.confirm(`${p.name} barcha farzandlaridan ajratilsinmi? Xabar olishni to'xtatadi.`)) run(() => api('delete', `parents/${p.chatId}`), "Ota-ona ro'yxatdan chiqarildi") }} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600"><FiTrash2 size={13} /></button>
										</div>
									</div>
									<p className="text-[11px] text-gray-400 mt-2">{(p.via || []).map(v => (VIA[v] || VIA.invite)[0]).join(', ')} · {tx("oxirgi xabar: {{date}}", { date: dt(p.lastSentAt) })}</p>
								</li>
							)
						})}
					</ul>
					<Pager {...data} set={(pg) => setF(x => ({ ...x, page: pg }))} />
				</>
			)}
			{adding && <AddChildModal parent={adding} onClose={() => setAdding(null)} onDone={() => { load(); onChanged() }} />}
		</div>
	)
}

export default ParentsTab
