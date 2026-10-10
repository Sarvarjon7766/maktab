import { useEffect, useState } from 'react'
import { FiMessageSquare } from 'react-icons/fi'
import SearchableSelect from '../../../components/SearchableSelect'
import { api, Chip, dt, Empty, Pager, Toggle } from './ui'

const KIND = { in: ['Kirdi', 'bg-green-50 text-green-700'], out: ['Chiqdi', 'bg-orange-50 text-orange-700'], test: ['Sinov', 'bg-slate-100 text-slate-600'], absent: ['Kelmadi', 'bg-red-50 text-red-700'], digest: ['Haftalik xulosa', 'bg-violet-50 text-violet-700'], held: ['Jamlangan', 'bg-sky-50 text-sky-700'] }

// Oxirgi 7 kunda yuborilgan / bloklangan / xato xabarlar
const DeliveryCard = ({ delivery }) => {
	if (!delivery) return null
	const max = Math.max(1, ...delivery.days.map(d => d.sent + d.blocked + d.failed))
	return (
		<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
			<h3 className="font-semibold text-gray-900">Yetkazish holati (oxirgi 7 kun)</h3>
			<div className="mt-3 flex flex-wrap gap-3">
				{[['Yuborilgan', delivery.sent, 'text-green-600'], ['Botni bloklagan', delivery.blocked, delivery.blocked ? 'text-amber-600' : 'text-gray-900'], ['Xato', delivery.failed, delivery.failed ? 'text-red-600' : 'text-gray-900']].map(([l, v, c]) => (
					<div key={l} className="rounded-xl bg-gray-50 px-4 py-3 min-w-[130px] flex-1"><p className="text-xs text-gray-500">{l}</p><p className={`text-2xl font-bold leading-tight ${c}`}>{v}</p></div>
				))}
			</div>
			<div className="mt-4 flex items-end gap-2 h-20" aria-label="Kunlar bo'yicha yuborilgan xabarlar">
				{delivery.days.map(d => (
					<div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${d.date}: ${d.sent} yuborilgan, ${d.blocked} bloklangan, ${d.failed} xato`}>
						<div className="w-full max-w-[28px] rounded-t bg-blue-500/80" style={{ height: `${Math.max(2, Math.round(d.sent / max * 100))}%` }} />
						<span className="text-[10px] text-gray-400">{d.date.slice(5)}</span>
					</div>
				))}
			</div>
		</section>
	)
}

// "Xabarlar" bo'limi: xabar sozlamalari va yuborilgan/yuborilmagan xabarlar jurnali
const MessagesTab = ({ settings, counts, delivery, onSetting }) => {
	const [f, setF] = useState({ status: '', page: 1 })
	const [data, setData] = useState(null)
	useEffect(() => { api('get', 'log', { params: { ...f, limit: 25 } }).then(r => setData(r.data)).catch(() => setData({ items: [], pages: 1, total: 0 })) }, [f])
	const off = !settings.enabled
	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<h3 className="font-semibold text-gray-900">Qaysi xabarlar yuborilsin</h3>
				<p className="text-sm text-gray-500 mt-0.5 mb-4">Sozlama butun maktab uchun. Har bir ota-ona uchun alohida «Ota-onalar» bo'limida o'zgartirish mumkin.</p>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div className="space-y-3">
						<Toggle checked={settings.enabled} onChange={v => onSetting({ enabled: v })} label={<span className="font-medium">Ota-onalarga xabar yuborilsin</span>} />
						<div className={`pl-1 space-y-3 ${off ? 'opacity-50' : ''}`}>
							<div><Toggle checked={settings.notifyIn} disabled={off} onChange={v => onSetting({ notifyIn: v })} label="Farzandi maktabga kirganda" /></div>
							<div><Toggle checked={settings.notifyOut} disabled={off} onChange={v => onSetting({ notifyOut: v })} label="Farzandi maktabdan chiqqanda" /></div>
						</div>
					</div>
					<label className="text-sm text-gray-700 block">
						Takroriy skanlarni kamaytirish
						<div className={`mt-1 ${off ? 'pointer-events-none opacity-50' : ''}`}><SearchableSelect variant="outline" icon={false} searchFrom={99} className="w-full max-w-xs" value={String(settings.minGapMinutes)} onChange={v => onSetting({ minGapMinutes: Number(v) })} options={[0, 1, 3, 5, 10, 15].map(m => ({ value: String(m), label: m ? `${m} daqiqa ichida bir marta` : 'Har skanda xabar yuborilsin' }))} /></div>
						<span className="block text-xs text-gray-400 mt-1">Bola eshikda bir necha marta o'tib qolsa, ota-onaga ortiqcha xabar bormasligi uchun.</span>
					</label>
				</div>

				<div className={`mt-5 pt-5 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-4 ${off ? 'opacity-50 pointer-events-none' : ''}`}>
					<label className="text-sm text-gray-700 block">
						Kechikish imkoniyati
						<div className="mt-1"><SearchableSelect variant="outline" icon={false} searchFrom={99} className="w-full max-w-xs" value={String(settings.lateGraceMinutes ?? 0)} onChange={v => onSetting({ lateGraceMinutes: Number(v) })} options={[0, 5, 10, 15, 20, 30].map(m => ({ value: String(m), label: m ? `${m} daqiqagacha kechikish hisoblanmasin` : "Darhol hisoblansin (dars boshlanishidan)" }))} /></div>
						<span className="block text-xs text-gray-400 mt-1">Kirish xabariga «N daqiqa kechikdi» qo'shiladi (sozlamalardagi ish boshlanish vaqtiga nisbatan).</span>
					</label>
					<div className="space-y-2">
						<Toggle checked={!!settings.weeklyDigest} onChange={v => onSetting({ weeklyDigest: v })} label={<span className="font-medium">Haftalik xulosa</span>} />
						<p className="text-xs text-gray-400">Har yakshanba soat 19:00 da ota-onaga haftalik davomat xulosasi yuboriladi.</p>
					</div>
					<div className="space-y-2 md:col-span-2">
						<Toggle checked={!!settings.absentAlertEnabled} onChange={v => onSetting({ absentAlertEnabled: v })} label={<span className="font-medium">Farzandi kelmaganda xabar</span>} />
						<div className={`flex flex-wrap items-center gap-3 ${settings.absentAlertEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
							<label className="text-sm text-gray-700 inline-flex items-center gap-2">Soat
								<input type="time" value={settings.absentAlertTime || '10:00'} onChange={e => e.target.value && onSetting({ absentAlertTime: e.target.value })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-black" />
							</label>
							<span className="text-xs text-gray-400">Shu vaqtgacha kirish qayd etilmagan va sababi kiritilmagan o'quvchilarning ota-onasiga kuniga bir marta yuboriladi. Maktabda umuman davomat bo'lmagan kunlarda (bayram, kamera uzilishi) yuborilmaydi.</span>
						</div>
					</div>
				</div>
			</section>

			<DeliveryCard delivery={delivery} />

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-center justify-between gap-3 mb-4">
					<div><h3 className="font-semibold text-gray-900">Xabarlar jurnali</h3><p className="text-xs text-gray-500 mt-0.5">Bugun: <b className="text-gray-700">{counts.sentToday}</b> ta yuborilgan, <b className={counts.failedToday ? 'text-red-600' : 'text-gray-700'}>{counts.failedToday}</b> ta xato · jurnal 30 kun saqlanadi</p></div>
					<div className="flex gap-2">{[['', 'Hammasi'], ['sent', 'Yuborilgan'], ['blocked', 'Bloklangan'], ['failed', 'Xato']].map(([k, l]) => <button key={k} onClick={() => setF({ status: k, page: 1 })} className={`px-3.5 py-1.5 rounded-lg text-sm ${f.status === k ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>)}</div>
				</div>
				{!data ? <p className="text-sm text-gray-500">Yuklanmoqda...</p> : data.items.length === 0 ? <Empty icon={<FiMessageSquare size={22} />} title="Hali xabar yuborilmagan" hint="Ota-onalar ulangach, farzandlari maktabga kirsa yoki chiqsa, xabarlar shu yerda ko'rinadi." /> : (
					<>
						<div className="overflow-x-auto rounded-xl border border-gray-100">
							<table className="w-full text-sm">
								<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50">{['Vaqt', "O'quvchi", 'Ota-ona', 'Xabar', 'Natija'].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
								<tbody>
									{data.items.map(i => { const [kl, kc] = KIND[i.kind] || KIND.test; return (
										<tr key={i._id} className="border-t border-gray-50">
											<td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{dt(i.createdAt)}</td>
											<td className="px-4 py-2.5 text-gray-900">{i.student}</td>
											<td className="px-4 py-2.5 text-gray-600">{i.guardian || '—'}</td>
											<td className="px-4 py-2.5"><Chip tone={kc}>{kl}</Chip></td>
											<td className="px-4 py-2.5">{i.status === 'sent' ? <span className="text-green-600 text-xs font-medium">Yuborildi</span> : i.status === 'blocked' ? <span className="text-amber-600 text-xs font-medium">Bloklangan: {i.error || '—'}</span> : i.status === 'skipped' ? <span className="text-gray-500 text-xs font-medium">O'tkazib yuborildi: {i.error || '—'}</span> : <span className="text-red-600 text-xs font-medium">Xato: {i.error || '—'}</span>}</td>
										</tr>
									) })}
								</tbody>
							</table>
						</div>
						<Pager {...data} set={(p) => setF(x => ({ ...x, page: p }))} />
					</>
				)}
			</section>
		</div>
	)
}

export default MessagesTab
