import { useCallback, useEffect, useState } from 'react'
import { FiCheck, FiInbox, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import SearchableSelect from '../../../components/SearchableSelect'
import { api, Chip, dt, Empty, errText, Pager } from './ui'

const TYPE = { kasallik: ['Kasallik', 'bg-red-50 text-red-700'], oilaviy: ['Oilaviy sabab', 'bg-blue-50 text-blue-700'], boshqa: ['Boshqa sabab', 'bg-gray-100 text-gray-600'] }
const STATUS = { pending: ['Kutilmoqda', 'bg-amber-50 text-amber-700'], approved: ['Tasdiqlangan', 'bg-green-50 text-green-700'], rejected: ['Rad etilgan', 'bg-gray-100 text-gray-600'] }
const day = (a, b) => (a === b ? a : `${a} — ${b}`)

// "Sabab xabarlari": ota-ona botdagi «kelmadi» xabariga bergan javoblari. Tasdiqlansa o'quvchiga sababli kelmagan kun (excuse) yoziladi
const ReportsTab = ({ onChanged }) => {
	const [f, setF] = useState({ status: 'pending', page: 1 })
	const [data, setData] = useState(null)
	const [busy, setBusy] = useState('')
	const load = useCallback(() => api('get', 'absence-reports', { params: { ...f, limit: 25 } }).then(r => setData(r.data)).catch(() => setData({ reports: [], pages: 1, total: 0, page: 1 })), [f])
	useEffect(() => { load() }, [load])

	const decide = async (r, approve) => {
		if (!approve && !window.confirm(`${r.student} uchun bildirilgan sababni rad etamizmi? Ota-onaga botda xabar boradi.`)) return
		setBusy(r._id)
		try {
			await api('post', `absence-reports/${r._id}/${approve ? 'approve' : 'reject'}`)
			toast.success(approve ? "Sabab tasdiqlandi, o'quvchiga sababli kelmagan kun yozildi" : 'Sabab rad etildi')
			await load(); onChanged?.()
		} catch (e) { toast.error(errText(e)) } finally { setBusy('') }
	}

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<p className="text-sm text-gray-500 max-w-2xl">Farzandi maktabga kelmagan ota-onalar botda sabab bildiradi (kasal, oilaviy yoki boshqa). Tasdiqlasangiz, shu kun o'quvchi uchun sababli kelmagan deb belgilanadi.</p>
				<SearchableSelect variant="outline" icon={false} searchFrom={99} className="w-48" value={f.status} onChange={v => setF({ status: v, page: 1 })} options={[{ value: 'pending', label: 'Kutilayotganlar' }, { value: 'approved', label: 'Tasdiqlanganlar' }, { value: 'rejected', label: 'Rad etilganlar' }, { value: 'all', label: 'Hammasi' }]} />
			</div>
			{!data ? <p className="text-sm text-gray-500">Yuklanmoqda...</p> : data.reports.length === 0 ? (
				<Empty icon={<FiInbox size={22} />} title="Sabab xabarlari yo'q" hint={'«Kelmadi» xabari yoqilgan bo\'lsa ("Xabarlar" bo\'limi), ota-onalar javobi shu yerda paydo bo\'ladi.'} />
			) : (
				<>
					<ul className="space-y-3">
						{data.reports.map(r => {
							const [tl, tc] = TYPE[r.type] || TYPE.boshqa
							const [sl, sc] = STATUS[r.status] || STATUS.pending
							return (
								<li key={r._id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
									<div className="min-w-[220px] flex-1">
										<p className="font-semibold text-gray-900">{r.student}{r.sinf && <span className="font-normal text-gray-400"> · {r.sinf}</span>}</p>
										<p className="text-xs text-gray-500 mt-0.5">{day(r.dateFrom, r.dateTo)} · {r.parent || 'Ota-ona'}{r.phone ? ` · ${r.phone}` : ''} · {dt(r.createdAt)}</p>
										{r.comment && <p className="text-sm text-gray-700 mt-1.5 break-words">«{r.comment}»</p>}
									</div>
									<div className="flex items-center gap-2 flex-wrap">
										<Chip tone={tc}>{tl}</Chip>
										<Chip tone={sc}>{sl}</Chip>
										{r.status === 'pending' && (
											<>
												<button disabled={busy === r._id} onClick={() => decide(r, false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"><FiX size={14} /> Rad etish</button>
												<button disabled={busy === r._id} onClick={() => decide(r, true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"><FiCheck size={14} /> Tasdiqlash</button>
											</>
										)}
									</div>
								</li>
							)
						})}
					</ul>
					<Pager {...data} set={(p) => setF(x => ({ ...x, page: p }))} />
				</>
			)}
		</div>
	)
}

export default ReportsTab
