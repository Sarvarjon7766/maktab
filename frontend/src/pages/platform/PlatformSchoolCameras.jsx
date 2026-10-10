import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useMemo, useState } from 'react'
import { FiLink2, FiPlay, FiSearch, FiVideo, FiX } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import HikLiveModal from '../../components/HikLiveModal'
import { ListPager, usePaged } from '../../components/ListPager'
import SearchableSelect from '../../components/SearchableSelect'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })

const ROLE_LABEL = { monitor: tx('Oddiy'), in: tx('FaceControl — kirish'), out: tx('FaceControl — chiqish') }
const ROLE_CHIP = { monitor: 'bg-blue-50 text-blue-700', in: 'bg-emerald-50 text-emerald-700', out: 'bg-orange-50 text-orange-700' }
const roleOf = (c) => c.role || 'monitor'
const statusOf = (c) => (c.online === true ? { text: tx('Online'), chip: 'bg-green-50 text-green-700' } : c.online === false ? { text: tx('Offline'), chip: 'bg-red-50 text-red-700' } : { text: tx("Noma'lum"), chip: 'bg-gray-100 text-gray-600' })
const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const NONE = '__none'

const Chip = ({ label, value, active, onClick, tone = 'text-gray-900' }) => (
	<button onClick={onClick} className={`rounded-xl border px-4 py-2 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
		<p className={`text-lg font-bold leading-tight ${tone}`}>{value}</p><p className="text-xs text-gray-500">{label}</p>
	</button>
)

// Tizim egasi uchun: maktablarga biriktirilgan kameralar maktab, tur (oddiy / FaceControl kirish-chiqish), akkaunt va holat bo'yicha ajratilgan ko'rinishda
const PlatformSchoolCameras = () => {
	const [cameras, setCameras] = useState([])
	const [schools, setSchools] = useState([])
	const [accounts, setAccounts] = useState([])
	const [loading, setLoading] = useState(true)
	const [params] = useSearchParams()
	const [view, setView] = useState(params.get('view') === 'cameras' || params.get('school') || params.get('status') || params.get('type') ? 'cameras' : 'schools')
	const [school, setSchool] = useState(params.get('school') || '')
	const [type, setType] = useState(['monitor', 'facecontrol', 'in', 'out'].includes(params.get('type')) ? params.get('type') : '')
	const [status, setStatus] = useState(['online', 'offline'].includes(params.get('status')) ? params.get('status') : '')
	const [account, setAccount] = useState(params.get('account') || '')
	const [query, setQuery] = useState('')
	const [live, setLive] = useState(null)
	const [picked, setPicked] = useState(new Set())
	const [confirm, setConfirm] = useState(null) // { ids, text }
	const [busy, setBusy] = useState(false)

	useEffect(() => {
		Promise.all([api.get('/api/hik/cameras', auth()), api.get('/api/schools/getAll', auth()), api.get('/api/hik/accounts', auth())])
			.then(([c, s, a]) => { setCameras((c.data.cameras || []).filter(x => x.inCloud !== false)); setSchools(s.data.schools || []); setAccounts(a.data.accounts || []) })
			.catch(() => toast.error("Kameralarni yuklab bo'lmadi"))
			.finally(() => setLoading(false))
	}, [])

	const base = useMemo(() => cameras.filter(c => (!account || c.accountId === account) && (!query || norm(`${c.name} ${c.serial} ${c.areaName} ${c.schoolName}`).includes(norm(query)))), [cameras, account, query])
	const matches = (c) => (!type || roleOf(c) === type || (type === 'facecontrol' && roleOf(c) !== 'monitor'))
		&& (!status || (status === 'online' ? c.online === true : c.online !== true))
	const inSchool = (c) => (school === NONE ? !c.schoolId : !school || c.schoolId === school)
	const list = useMemo(() => base.filter(c => matches(c) && inSchool(c)), [base, type, status, school]) // eslint-disable-line react-hooks/exhaustive-deps
	const assigned = base.filter(c => c.schoolId)

	const perSchool = useMemo(() => {
		const map = new Map()
		for (const s of schools) map.set(s._id, { _id: s._id, name: s.name, regular: 0, fcIn: 0, fcOut: 0, online: 0, offline: 0 })
		for (const c of base.filter(matches)) {
			const r = map.get(c.schoolId); if (!r) continue
			if (roleOf(c) === 'monitor') r.regular++; else if (roleOf(c) === 'in') r.fcIn++; else r.fcOut++
			if (c.online === true) r.online++; else r.offline++
		}
		return [...map.values()].filter(r => r.regular + r.fcIn + r.fcOut > 0 || (!type && !status && !query && !account)).sort((a, b) => a.name.localeCompare(b.name, 'uz'))
	}, [schools, base, type, status]) // eslint-disable-line react-hooks/exhaustive-deps

	const pagedSchools = usePaged(perSchool, 50)
	const pagedCams = usePaged(list, 50)
	const toggle = (id) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
	const pageAssigned = pagedCams.items.filter(c => c.schoolId)
	const allOnPage = pageAssigned.length > 0 && pageAssigned.every(c => picked.has(c._id))
	const togglePage = () => setPicked(prev => { const n = new Set(prev); pageAssigned.forEach(c => (allOnPage ? n.delete(c._id) : n.add(c._id))); return n })
	const detach = async () => {
		setBusy(true)
		try {
			const res = await api.post('/api/hik/cameras/detach', { ids: confirm.ids }, auth())
			const gone = new Set(confirm.ids)
			setCameras(prev => prev.map(c => (gone.has(c._id) ? { ...c, schoolId: null, schoolName: null, role: 'monitor', sinfId: null } : c)))
			setPicked(new Set())
			toast.success(tx('{{n}} ta kamera maktabdan ajratildi', { n: res.data.detached }))
			setConfirm(null)
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Ajratishda xatolik'))
		} finally {
			setBusy(false)
		}
	}
	const open = (id) => { setSchool(id); setView('cameras') }
	const schoolOptions = [{ value: '', label: tx('Barcha maktablar') }, { value: NONE, label: tx('Biriktirilmagan') }, ...schools.map(s => ({ value: s._id, label: s.name }))]
	const typeOptions = [{ value: '', label: tx('Barcha turlar') }, { value: 'monitor', label: tx('Oddiy kamera') }, { value: 'facecontrol', label: tx('FaceControl (hammasi)') }, { value: 'in', label: tx('FaceControl — kirish') }, { value: 'out', label: tx('FaceControl — chiqish') }]
	const statusOptions = [{ value: '', label: tx('Barcha holatlar') }, { value: 'online', label: tx('Online') }, { value: 'offline', label: 'Offline / noma\'lum' }]
	const accountOptions = [{ value: '', label: tx('Barcha akkauntlar') }, ...accounts.map(a => ({ value: a._id, label: a.name }))]
	const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50'
	const num = 'px-4 py-3 text-sm text-right tabular-nums'

	return (
		<div className="p-4 md:p-6 space-y-5">
			<div className="flex flex-wrap gap-3">
				<Chip label="Biriktirilgan" value={assigned.length} active={school === '' && view === 'schools'} onClick={() => { setSchool(''); setType(''); setView('schools') }} />
				<Chip label="Oddiy kamera" value={assigned.filter(c => roleOf(c) === 'monitor').length} active={type === 'monitor'} tone="text-blue-700" onClick={() => setType(type === 'monitor' ? '' : 'monitor')} />
				<Chip label="FaceControl" value={assigned.filter(c => roleOf(c) !== 'monitor').length} active={type === 'facecontrol'} tone="text-emerald-700" onClick={() => setType(type === 'facecontrol' ? '' : 'facecontrol')} />
				<Chip label="Online" value={assigned.filter(c => c.online === true).length} active={status === 'online'} tone="text-green-700" onClick={() => setStatus(status === 'online' ? '' : 'online')} />
				<Chip label="Offline" value={assigned.filter(c => c.online !== true).length} active={status === 'offline'} tone="text-red-700" onClick={() => setStatus(status === 'offline' ? '' : 'offline')} />
				<Chip label="Biriktirilmagan" value={base.filter(c => !c.schoolId).length} active={school === NONE} tone="text-amber-700" onClick={() => open(school === NONE ? '' : NONE)} />
			</div>

			<section className="bg-white rounded-2xl border border-gray-100 shadow-sm">
				<div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
					<div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
						{[['schools', tx('Maktablar kesimi')], ['cameras', tx('Kameralar')]].map(([k, t]) => (
							<button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-md text-sm ${view === k ? 'bg-white shadow-sm text-blue-700 font-medium' : 'text-gray-600'}`}>{t}</button>
						))}
					</div>
					<SearchableSelect value={school} onChange={setSchool} options={schoolOptions} className="min-w-[210px] max-w-[260px]" />
					<SearchableSelect value={type} onChange={setType} options={typeOptions} className="min-w-[190px] max-w-[230px]" />
					<SearchableSelect value={status} onChange={setStatus} options={statusOptions} className="min-w-[150px] max-w-[200px]" />
					{accounts.length > 1 && <SearchableSelect value={account} onChange={setAccount} options={accountOptions} className="min-w-[170px] max-w-[220px]" />}
					<div className="relative flex-1 min-w-[200px]">
						<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
						<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kamera, serial, hudud yoki maktab" className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm text-black outline-none focus:border-blue-400 bg-white" />
					</div>
					<Link to="/platform/hik-cameras" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Biriktirish</Link>
				</div>

				{view === 'cameras' && picked.size > 0 && (
					<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-sm">
						<span className="text-blue-900">{tx('{{n}} ta kamera tanlandi', { n: picked.size })}</span>
						<div className="flex gap-2">
							<button onClick={() => setPicked(new Set())} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">Bekor qilish</button>
							<button onClick={() => setConfirm({ ids: [...picked], text: tx('{{n}} ta kamera biriktirilgan maktab(lar)idan ajratiladi.', { n: picked.size }) })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700"><FiLink2 size={13} /> Maktabdan ajratish</button>
						</div>
					</div>
				)}
				{loading ? <p className="p-10 text-center text-sm text-gray-500">Yuklanmoqda...</p> : view === 'schools' ? (
					<>
						<div className="overflow-x-auto">
							<table className="min-w-full">
								<thead><tr><th className={th}>Maktab</th><th className={`${th} text-right`}>Oddiy</th><th className={`${th} text-right`}>Kirish</th><th className={`${th} text-right`}>Chiqish</th><th className={`${th} text-right`}>Online</th><th className={`${th} text-right`}>Offline</th></tr></thead>
								<tbody className="divide-y divide-gray-100">
									{pagedSchools.items.map(r => (
										<tr key={r._id} onClick={() => open(r._id)} className="cursor-pointer hover:bg-gray-50/70">
											<td className="px-4 py-3 text-sm font-medium text-gray-900">{r.name}</td>
											<td className={`${num} text-blue-700`}>{r.regular}</td><td className={`${num} text-emerald-700`}>{r.fcIn}</td><td className={`${num} text-orange-700`}>{r.fcOut}</td>
											<td className={`${num} text-green-700`}>{r.online}</td><td className={`${num} ${r.offline ? 'text-red-700 font-medium' : 'text-gray-400'}`}>{r.offline}</td>
										</tr>
									))}
									{perSchool.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm text-gray-500">Mos maktab topilmadi</td></tr>}
								</tbody>
							</table>
						</div>
						<ListPager {...pagedSchools} className="border-t border-gray-100" />
					</>
				) : (
					<>
						<div className="overflow-x-auto">
							<table className="min-w-full">
								<thead><tr><th className={`${th} w-10`}><input type="checkbox" checked={allOnPage} onChange={togglePage} disabled={!pageAssigned.length} className="w-4 h-4" aria-label="Sahifadagilarni tanlash" /></th><th className={th}>Maktab</th><th className={th}>Kamera</th><th className={th}>Hudud</th><th className={th}>Tur</th><th className={th}>Akkaunt</th><th className={th}>Holat</th><th className={th} /></tr></thead>
								<tbody className="divide-y divide-gray-100">
									{pagedCams.items.map(c => {
										const st = statusOf(c)
										return (
											<tr key={c._id} className={picked.has(c._id) ? 'bg-blue-50/50' : 'hover:bg-gray-50/70'}>
												<td className="px-4 py-2.5">{c.schoolId && <input type="checkbox" checked={picked.has(c._id)} onChange={() => toggle(c._id)} className="w-4 h-4" />}</td>
												<td className="px-4 py-2.5 text-sm">{c.schoolId ? <button onClick={() => setSchool(c.schoolId)} className="text-blue-700 hover:underline text-left">{c.schoolName}</button> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Biriktirilmagan</span>}</td>
												<td className="px-4 py-2.5 text-sm"><p className="font-medium text-gray-900 flex items-center gap-1.5"><FiVideo size={13} className="text-gray-400" />{c.name || c.cameraId}</p><p className="text-xs text-gray-500">{c.serial || '—'}</p></td>
												<td className="px-4 py-2.5 text-sm text-gray-600">{c.areaName || '—'}</td>
												<td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_CHIP[roleOf(c)]}`}>{ROLE_LABEL[roleOf(c)]}</span></td>
												<td className="px-4 py-2.5 text-sm text-gray-600">{c.accountName}</td>
												<td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.chip}`}>{st.text}</span></td>
												<td className="px-4 py-2.5 text-right whitespace-nowrap">{c.schoolId && <button onClick={() => setConfirm({ ids: [c._id], text: tx('"{{cam}}" kamerasi "{{school}}" maktabidan ajratiladi.', { cam: c.name || c.cameraId, school: c.schoolName }) })} className="inline-flex items-center gap-1 px-2.5 py-1.5 mr-2 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50"><FiLink2 size={11} /> Ajratish</button>}<button disabled={c.online !== true || !c.serial} onClick={() => setLive({ id: c._id, name: c.name, areaName: c.areaName, schoolName: c.schoolName })} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"><FiPlay size={11} /> Jonli</button></td>
											</tr>
										)
									})}
									{list.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-sm text-gray-500">Mos kamera topilmadi</td></tr>}
								</tbody>
							</table>
						</div>
						<ListPager {...pagedCams} className="border-t border-gray-100" />
					</>
				)}
			</section>
			{confirm && (
				<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setConfirm(null)}>
					<div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
						<div className="flex items-start justify-between gap-3">
							<h3 className="text-base font-semibold text-gray-900">Kamerani maktabdan ajratish</h3>
							<button onClick={() => setConfirm(null)} disabled={busy} className="text-gray-400 hover:text-gray-600"><FiX size={18} /></button>
						</div>
						<p className="mt-3 text-sm text-gray-600">{confirm.text}</p>
						<p className="mt-2 text-xs text-gray-500">Kamera Hik akkauntida qoladi va qayta biriktirilishi mumkin. Maktabdagi sinf bog'lanishi va avtomatik davomat o'chadi, eski hodisalar saqlanadi.</p>
						<div className="mt-5 flex justify-end gap-2">
							<button onClick={() => setConfirm(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Bekor qilish</button>
							<button onClick={detach} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-60">{busy ? 'Ajratilmoqda...' : 'Ajratish'}</button>
						</div>
					</div>
				</div>
			)}
			{live && <HikLiveModal camera={live} tokenKey="platformToken" onClose={() => setLive(null)} />}
		</div>
	)
}

export default PlatformSchoolCameras
