import { tx } from '../../i18n'
import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiAlertCircle, FiCheck, FiCheckCircle, FiChevronDown, FiLock, FiPlay, FiSave, FiSearch, FiVideo } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import HikLiveModal from '../../components/HikLiveModal'
import SearchableSelect from '../../components/SearchableSelect'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('platformToken') || localStorage.getItem('token')}` } })

const norm = (t) => String(t || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '')
const KIND_ROLES = { monitor: ['monitor'], facecontrol: ['in', 'out'] }
const ROLE_LABEL = { monitor: tx('Oddiy kamera'), in: tx('FaceControl · kirish'), out: tx('FaceControl · chiqish') }
const TABS = [['monitor', '/platform/hik-cameras', tx('Oddiy kameralar'), tx("Sinf, koridor, hovli kabi kuzatuv kameralari")], ['facecontrol', '/platform/hik-facecontrol', tx('FaceControl'), tx('Yuzni taniydigan kirish va chiqish qurilmalari')]]

const dot = (c) => (c.online === true ? 'bg-green-500' : c.online === false ? 'bg-red-500' : 'bg-slate-300')
const statusText = (c) => (c.online === true ? tx('Online') : c.online === false ? tx('Offline') : tx("Noma'lum"))

const groupBy = (list, keyFn) => {
	const map = new Map()
	list.forEach(c => { const k = keyFn(c) || tx('Umumiy'); if (!map.has(k)) map.set(k, []); map.get(k).push(c) })
	return [...map.entries()]
}

const Chip = ({ active, onClick, children, count }) => (
	<button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700'}`}>
		{children}{count !== undefined && <span className={`rounded-full px-1.5 ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>}
	</button>
)

// Hik-Connect kameralarini maktabga biriktirish. Chapda maktablar ro'yxati (nechta kamera biriktirilgani bilan),
// o'ngda kameralar: belgilab "Saqlash" bosiladi. Har tur (oddiy / FaceControl) o'z sahifasida ishlaydi va boshqa turga tegmaydi
const HikAssignment = ({ kind }) => {
	const faceControl = kind === 'facecontrol'
	const kindRoles = KIND_ROLES[kind]
	const [params, setParams] = useSearchParams()
	const schoolId = params.get('school') || ''
	const [accounts, setAccounts] = useState([])
	const [cameras, setCameras] = useState([])
	const [schools, setSchools] = useState([])
	const [selectedIds, setSelectedIds] = useState(new Set())
	const [savedIds, setSavedIds] = useState(new Set())
	const [roles, setRoles] = useState({})
	const [savedRoles, setSavedRoles] = useState({})
	const [accountFilter, setAccountFilter] = useState('')
	const [filter, setFilter] = useState('all')
	const [query, setQuery] = useState('')
	const [schoolQuery, setSchoolQuery] = useState('')
	const [showLocked, setShowLocked] = useState(false)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const [live, setLive] = useState(null)
	const school = schools.find(s => s._id === schoolId) || null

	const load = useCallback(async () => {
		try {
			const [a, c, s] = await Promise.all([api.get('/api/hik/accounts', auth()), api.get('/api/hik/cameras', auth()), api.get('/api/schools/getAll', auth())])
			setAccounts(a.data.accounts || [])
			setCameras(c.data.cameras || [])
			setSchools(s.data.schools || [])
		} catch {
			toast.error("Ma'lumotni yuklab bo'lmadi")
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => { load() }, [load])

	// Tanlov: shu maktabga shu turda biriktirilgan kameralar
	useEffect(() => {
		const mine = cameras.filter(c => c.schoolId === schoolId && kindRoles.includes(c.role || 'monitor'))
		const ids = new Set(mine.map(c => c._id))
		const r = Object.fromEntries(mine.map(c => [c._id, c.role || 'monitor']))
		setSelectedIds(ids); setSavedIds(ids); setRoles(r); setSavedRoles(r)
		setShowLocked(false)
	}, [cameras, schoolId, kind]) // eslint-disable-line react-hooks/exhaustive-deps

	const live0 = useMemo(() => cameras.filter(c => c.inCloud !== false), [cameras])
	const isMine = useCallback((c) => !!c.schoolId && kindRoles.includes(c.role || 'monitor'), [kind]) // eslint-disable-line react-hooks/exhaustive-deps
	const stats = useMemo(() => ({
		free: live0.filter(c => !c.schoolId).length,
		assigned: live0.filter(isMine).length,
		offline: live0.filter(c => c.online === false && (!c.schoolId || isMine(c))).length
	}), [live0, isMine])
	// Har maktabga shu turda nechta kamera biriktirilgani
	const perSchool = useMemo(() => {
		const m = new Map()
		live0.filter(isMine).forEach(c => m.set(c.schoolId, (m.get(c.schoolId) || 0) + 1))
		return m
	}, [live0, isMine])
	const schoolList = useMemo(() => schools.filter(s => !schoolQuery || norm(`${s.name} ${s.district || ''}`).includes(norm(schoolQuery.trim()))), [schools, schoolQuery])

	const matches = (c) => c.inCloud !== false && (!accountFilter || c.accountId === accountFilter) && (!query || norm(`${c.name} ${c.serial} ${c.areaName}`).includes(norm(query.trim())))
	const isFree = (c) => !c.schoolId || (c.schoolId === schoolId && kindRoles.includes(c.role || 'monitor'))
	const passFilter = (c) => (filter === 'free' ? !c.schoolId : filter === 'selected' ? selectedIds.has(c._id) : filter === 'online' ? c.online === true : filter === 'offline' ? c.online === false : true)
	const base = useMemo(() => cameras.filter(c => matches(c) && isFree(c)), [cameras, schoolId, accountFilter, query, kind]) // eslint-disable-line react-hooks/exhaustive-deps
	const free = useMemo(() => base.filter(passFilter), [base, filter, selectedIds]) // eslint-disable-line react-hooks/exhaustive-deps
	const locked = useMemo(() => cameras.filter(c => matches(c) && !isFree(c)), [cameras, schoolId, accountFilter, query, kind]) // eslint-disable-line react-hooks/exhaustive-deps
	// Biriktirilmagan kameralar ko'proq bo'lgan hududlar birinchi chiqadi
	const freeGroups = useMemo(() => groupBy(free, c => c.areaName).sort((a, b) => b[1].filter(c => !c.schoolId).length - a[1].filter(c => !c.schoolId).length), [free])
	const lockedGroups = useMemo(() => groupBy(locked, c => c.schoolName), [locked])
	// maktab tanlanmaganda: biriktirilmagan kameralar hududlar bo'yicha
	const unassignedAreas = useMemo(() => groupBy(live0.filter(c => !c.schoolId), c => c.areaName).sort((a, b) => b[1].length - a[1].length), [live0])

	const toggle = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
	const toggleArea = (list) => setSelectedIds(prev => {
		const n = new Set(prev); const all = list.every(c => n.has(c._id)); list.forEach(c => (all ? n.delete(c._id) : n.add(c._id))); return n
	})
	const roleOf = (id, map) => map[id] || (faceControl ? 'in' : 'monitor')
	const added = [...selectedIds].filter(id => !savedIds.has(id)).length
	const removed = [...savedIds].filter(id => !selectedIds.has(id)).length
	const roleChanged = [...selectedIds].filter(id => savedIds.has(id) && roleOf(id, roles) !== roleOf(id, savedRoles)).length
	const dirty = added + removed + roleChanged > 0

	const save = async () => {
		setSaving(true)
		try {
			const res = await api.put(`/api/hik/schools/${schoolId}/assignment`, { kind, assignments: [...selectedIds].map(id => ({ id, role: roleOf(id, roles) })) }, auth())
			toast.success(faceControl ? tx('Saqlandi: "{{name}}" ga {{n}} ta FaceControl kamera biriktirilgan', { name: school.name, n: res.data.assigned }) : tx('Saqlandi: "{{name}}" ga {{n}} ta sinfxona va zal kamerasi biriktirilgan', { name: school.name, n: res.data.assigned }))
			if (res.data.conflicts?.length) toast.warn(tx("Band bo'lgani uchun o'tkazilmadi: {{list}}", { list: res.data.conflicts.join(', ') }))
			load()
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Saqlashda xatolik'))
		} finally {
			setSaving(false)
		}
	}
	const pickSchool = (id) => {
		if (dirty && !window.confirm(tx("Saqlanmagan o'zgarishlar bor. Baribir boshqa maktabga o'tilsinmi?"))) return
		setParams(id ? { school: id } : {})
	}

	const renderRow = (c, disabled) => {
		const selected = selectedIds.has(c._id)
		return (
			<li key={c._id} onClick={() => !disabled && toggle(c._id)} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${disabled ? 'opacity-70' : `cursor-pointer ${selected ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}`}>
				{disabled ? <FiLock className="shrink-0 text-slate-400" size={15} /> : (
					<span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-transparent'}`}><FiCheck size={13} /></span>
				)}
				<span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot(c)}`} title={statusText(c)} />
				<div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-900">{c.name || c.cameraId}</p><p className="truncate text-xs text-slate-500">{c.serial || '—'} · {c.accountName} · {statusText(c)}</p></div>
				{!disabled && !c.schoolId && !selected && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Biriktirilmagan</span>}
				{!disabled && faceControl && selected && (
					<span onClick={e => e.stopPropagation()} className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 text-xs">
						{[['in', tx('Kirish')], ['out', tx('Chiqish')]].map(([v, l]) => <button key={v} onClick={() => setRoles(prev => ({ ...prev, [c._id]: v }))} className={`px-3 py-1.5 font-medium ${roleOf(c._id, roles) === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>)}
					</span>
				)}
				{disabled && <span className="shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">{c.schoolName} · {ROLE_LABEL[c.role || 'monitor']}</span>}
				<button disabled={c.online !== true || !c.serial} onClick={e => { e.stopPropagation(); setLive({ id: c._id, name: c.name, areaName: c.areaName, schoolName: c.schoolName }) }}
					className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"><FiPlay size={11} /> Jonli</button>
			</li>
		)
	}

	return (
		<div className="space-y-4">
			{/* Sarlavha: nima qilinadi va qanday */}
			<section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
				<ol className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
					{[tx("Chapdan maktabni tanlang"), tx("O'ngda kerakli kameralarni belgilang"), tx("Pastdagi «Saqlash» tugmasini bosing")].map((t, i) => <li key={t} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">{i + 1}</span>{t}</li>)}
				</ol>
					<div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">
						{TABS.map(([k, path, label]) => <Link key={k} to={`${path}${schoolId ? `?school=${schoolId}` : ''}`} className={`rounded-lg px-4 py-2 font-medium ${kind === k ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</Link>)}
					</div>
			</section>

			<div className="grid grid-cols-3 gap-3">
				{[[tx('Biriktirilmagan'), stats.free, tx('hech qaysi maktabda emas'), stats.free ? 'border-l-amber-500' : 'border-l-green-500'], [tx('Biriktirilgan'), stats.assigned, faceControl ? tx('FaceControl qurilmalari') : tx('sinfxona va zal kameralari'), 'border-l-blue-500'], [tx('Offline'), stats.offline, tx('aloqasi yo\'q'), stats.offline ? 'border-l-red-500' : 'border-l-green-500']].map(([l, v, sub, bar]) => (
					<div key={l} className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm ${bar}`}><p className="text-xs font-medium text-slate-500">{l}</p><p className="mt-1 text-2xl font-bold leading-none text-slate-900">{v}</p><p className="mt-1.5 text-xs text-slate-400">{sub}</p></div>
				))}
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
				{/* Maktablar ro'yxati */}
				<aside className="flex max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:sticky lg:top-4">
					<div className="relative border-b border-slate-100 p-3">
						<FiSearch className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
						<input value={schoolQuery} onChange={e => setSchoolQuery(e.target.value)} placeholder={tx('Maktab qidirish ({{n}})', { n: schools.length })} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:bg-white" />
					</div>
					<ul className="flex-1 divide-y divide-slate-50 overflow-y-auto">
						{schoolList.map(s => {
							const n = perSchool.get(s._id) || 0, on = s._id === schoolId
							return (
								<li key={s._id}>
									<button onClick={() => pickSchool(s._id)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
										<span className="min-w-0 flex-1"><span className={`block truncate text-sm ${on ? 'font-semibold text-blue-700' : 'font-medium text-slate-900'}`}>{s.name}</span>{s.district && <span className="block truncate text-xs text-slate-400">{s.district}</span>}</span>
										<span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${n ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'}`} title={n ? `${n} ta biriktirilgan` : 'Hali biriktirilmagan'}>{n}</span>
									</button>
								</li>
							)
						})}
						{!loading && schoolList.length === 0 && <li className="px-4 py-10 text-center text-sm text-slate-500">Maktab topilmadi</li>}
					</ul>
				</aside>

				{/* Kameralar */}
				<section className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
					{!school ? (
						<div className="p-6">
							<div className="mb-5 flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800"><FiAlertCircle className="shrink-0" size={18} />{loading ? 'Yuklanmoqda...' : "Boshlash uchun chapdan maktabni tanlang."}</div>
							{!loading && (
								<>
									<p className="mb-3 text-sm font-semibold text-slate-700">{tx('Hali biriktirilmagan kameralar: {{n}} ta', { n: stats.free })}</p>
									{unassignedAreas.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Hamma kameralar maktablarga biriktirilgan</p> : (
										<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
											{unassignedAreas.map(([area, list]) => <li key={area} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 text-sm"><span className="truncate text-slate-700">{area}</span><span className="ml-3 shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{list.length}</span></li>)}
										</ul>
									)}
								</>
							)}
						</div>
					) : (
						<>
							<div className="space-y-3 border-b border-slate-100 p-4">
								<div className="flex flex-wrap items-center gap-3">
									<p className="text-sm font-semibold text-slate-900">{school.name}</p>
									<span className="text-xs text-slate-400">tanlangan: <b className="text-slate-700">{selectedIds.size}</b></span>
									<div className="ml-auto flex flex-wrap items-center gap-2">
										{accounts.length > 1 && <SearchableSelect variant="outline" icon={false} className="min-w-[160px] max-w-[220px]" searchPlaceholder="Akkaunt qidirish..." value={accountFilter} onChange={setAccountFilter} options={[{ value: '', label: tx('Barcha akkauntlar') }, ...accounts.map(a => ({ value: a._id, label: a.name }))]} />}
										<div className="relative"><FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Kamera, serial yoki hudud" className="w-60 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400" /></div>
									</div>
								</div>
								<div className="flex flex-wrap gap-2">
									<Chip active={filter === 'all'} onClick={() => setFilter('all')} count={base.length}>Hammasi</Chip>
									<Chip active={filter === 'free'} onClick={() => setFilter('free')} count={base.filter(c => !c.schoolId).length}>Biriktirilmagan</Chip>
									<Chip active={filter === 'selected'} onClick={() => setFilter('selected')} count={selectedIds.size}>Shu maktabniki</Chip>
									<Chip active={filter === 'online'} onClick={() => setFilter('online')} count={base.filter(c => c.online === true).length}>Online</Chip>
									<Chip active={filter === 'offline'} onClick={() => setFilter('offline')} count={base.filter(c => c.online === false).length}>Offline</Chip>
								</div>
							</div>

							<div className="space-y-4 p-4">
								{cameras.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Kamera yo'q. Avval "Hik akkauntlari" sahifasida akkaunt qo'shing</p>}
								{cameras.length > 0 && freeGroups.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Bu filtr bo'yicha kamera topilmadi</p>}
								{freeGroups.map(([area, list]) => {
									const allOn = list.every(c => selectedIds.has(c._id)); const someOn = !allOn && list.some(c => selectedIds.has(c._id))
									return (
										<div key={area} className="overflow-hidden rounded-xl border border-slate-100">
											<label className="flex cursor-pointer items-center gap-3 bg-slate-50 px-4 py-2.5">
												<input type="checkbox" checked={allOn} ref={el => { if (el) el.indeterminate = someOn }} onChange={() => toggleArea(list)} className="h-4 w-4" />
												<span className="text-sm font-medium text-slate-800">{area}</span>
												<span className="text-xs text-slate-500">{tx('{{a}}/{{b}} tanlangan', { a: list.filter(c => selectedIds.has(c._id)).length, b: list.length })}</span>
											</label>
											<ul className="divide-y divide-slate-50">{list.map(c => renderRow(c, false))}</ul>
										</div>
									)
								})}

								{lockedGroups.length > 0 && (
									<div>
										<button onClick={() => setShowLocked(v => !v)} className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600">
											<FiLock size={12} /> {tx('Band kameralar ({{n}}): boshqa maktabga yoki boshqa turga biriktirilgan', { n: locked.length })}
											<FiChevronDown className={`ml-auto transition-transform ${showLocked ? 'rotate-180' : ''}`} size={14} />
										</button>
										{showLocked && (
											<div className="mt-3 space-y-3">
												{lockedGroups.map(([name, list]) => (
													<div key={name} className="overflow-hidden rounded-xl border border-purple-100">
														<Link to={`/platform/school-cameras?school=${list[0]?.schoolId || ''}`} className="block bg-purple-50/60 px-4 py-2 text-sm font-medium text-purple-800 hover:bg-purple-100">{name} <span className="text-xs font-normal text-purple-600">· {tx('{{n}} ta', { n: list.length })}</span></Link>
														<ul className="divide-y divide-slate-50">{list.map(c => renderRow(c, true))}</ul>
													</div>
												))}
											</div>
										)}
									</div>
								)}
							</div>

							<div className={`sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t px-4 py-3 ${dirty ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
								<p className="flex items-center gap-2 text-sm text-slate-700">
									{dirty ? <><FiAlertCircle className="text-amber-600" /> {tx('Saqlanmagan:')} {added > 0 && <b className="text-green-700">{tx("+{{n}} qo'shiladi", { n: added })}</b>}{removed > 0 && <b className="text-red-600">{tx('−{{n}} olib tashlanadi', { n: removed })}</b>}{roleChanged > 0 && <b className="text-blue-700">{tx("{{n}} ta yo'nalish o'zgaradi", { n: roleChanged })}</b>}</>
										: <><FiCheckCircle className="text-green-600" /> «{school.name}»ga {savedIds.size} ta {faceControl ? 'FaceControl' : 'oddiy'} kamera biriktirilgan</>}
								</p>
								<div className="flex items-center gap-2">
									{dirty && <button onClick={() => { setSelectedIds(new Set(savedIds)); setRoles(savedRoles) }} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Bekor qilish</button>}
									<button onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FiSave size={14} /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}</button>
								</div>
							</div>
						</>
					)}
				</section>
			</div>

			{live && <HikLiveModal camera={live} tokenKey="platformToken" onClose={() => setLive(null)} />}
		</div>
	)
}

export default HikAssignment
