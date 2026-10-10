import { useCallback, useMemo } from 'react'
import MapView from './MapView'

export const METRICS = {
	student: { label: "O'quvchi davomati", value: s => s.studentPercent, good: true },
	staff: { label: 'Xodim davomati', value: s => s.staffPercent, good: true },
	late: { label: "Kech qolgan o'quvchilar", value: s => (s.studentCame ? Math.round((s.studentLate / s.studentCame) * 1000) / 10 : null), good: false },
	camera: { label: 'Kameralar online', value: s => (s.cameraTotal ? Math.round((s.cameraOnline / s.cameraTotal) * 1000) / 10 : null), good: true },
}
export const NONE = '#94a3b8'
// Davomat holati: 85% va undan yuqori = yashil, 60-85% = sariq, 60% dan past = qizil (kech qolish uchun teskari)
export const colorFor = (v, good) => {
	if (v === null || v === undefined) return NONE
	const score = good ? v : 100 - v
	return score >= 85 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'
}
export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v)}%`)
// tanlangan ko'rsatkichning maktablar bo'yicha o'rtachasi (qiymati borlardan)
// O'quvchi/xodim soniga ko'ra tortilgan o'rtacha (yig'indi kelgan / yig'indi jami): dashboard KPI bilan bir xil ta'rif
const SUMS = { student: s => [s.studentCame, s.studentTotal], staff: s => [s.staffCame, s.staffTotal], late: s => [s.studentLate, s.studentCame], camera: s => [s.cameraOnline, s.cameraTotal] }
const avgOf = (schools, metric) => { let a = 0, b = 0; for (const s of schools) { const [n, d] = SUMS[metric](s); a += n || 0; b += d || 0 } return b ? Math.round((a / b) * 1000) / 10 : null }
const LEGEND = [['#16a34a', "yaxshi (85%+)"], ['#f59e0b', "o'rta (60–85%)"], ['#dc2626', 'past (60% dan kam)'], [NONE, "ma'lumot yo'q"]]

// Maktablar xaritasi paneli: ko'rsatkich tanlash, tuman chegarasi, rangli belgilar (ichida foiz), izoh. Monitor bosh sahifasi va xarita sahifasida umumiy
const SchoolsMapPanel = ({ data, metric, onMetric, selectedId = null, focus = null, height = 520, onOpenSchool, compact = false, bare = false }) => {
	const M = METRICS[metric]
	const schools = useMemo(() => data?.schools || [], [data])

	const markers = useMemo(() => schools.filter(s => s.location).map(s => {
		const v = M.value(s), c = colorFor(v, M.good)
		return {
			id: s._id, lat: s.location.lat, lng: s.location.lng, color: c, value: v === null || v === undefined ? '—' : String(Math.round(v)), frac: v === null || v === undefined ? 0 : Math.max(0, Math.min(100, M.good ? v : 100 - v)) / 100, title: s.name,
			subtitle: [s.district, s.location.address].filter(Boolean).join(' · '),
			rows: [
				{ label: "O'quvchilar", text: `${s.studentCame}/${s.studentTotal} · ${fmtPct(s.studentPercent)}`, pct: s.studentPercent, color: colorFor(s.studentPercent, true) },
				{ label: 'Xodimlar', text: `${s.staffCame}/${s.staffTotal} · ${fmtPct(s.staffPercent)}`, pct: s.staffPercent, color: colorFor(s.staffPercent, true) },
				{ label: 'Kech qolganlar', text: `${s.studentLate} o'quvchi`, pct: null },
				{ label: 'Kameralar online', text: `${s.cameraOnline}/${s.cameraTotal}`, pct: s.cameraTotal ? (s.cameraOnline / s.cameraTotal) * 100 : null, color: colorFor(s.cameraTotal ? (s.cameraOnline / s.cameraTotal) * 100 : null, true) },
			],
			onOpen: onOpenSchool ? () => onOpenSchool(s) : null
		}
	}), [schools, M, onOpenSchool])

	const distPct = useMemo(() => new Map((data?.districts || []).map(d => [d.name.toLowerCase(), d.studentPercent])), [data])
	const geoStyle = useCallback((f) => {
		if (f.properties.isRegion) return { color: '#64748b', weight: 2, fillOpacity: 0, dashArray: '6 4' }
		if (data?.scope?.level === 'district') return { color: '#1d4ed8', weight: 3, fillColor: '#3b82f6', fillOpacity: 0.08 }
		const v = distPct.get(f.properties.name.toLowerCase())
		return { color: '#334155', weight: 1.4, fillColor: colorFor(v ?? null, true), fillOpacity: v === null || v === undefined ? 0.12 : 0.22 }
	}, [distPct, data])

	// Faqat xarita: maktablar o'z joyida (ichida natija, tagida nomi); boshqaruvlar xarita ustida suzib turadi
	if (bare) {
		return (
			<div className="relative h-full w-full">
				{!data ? <div className="h-full w-full animate-pulse bg-slate-200" /> : (
					<>
						<MapView geojson={data.geojson} districtStyle={geoStyle} markers={markers} focus={focus} selectedId={selectedId} lock={!!data.scope?.scoped} labels height="100%" className="!rounded-none !border-0" />
						<div className="pointer-events-none absolute left-14 top-3 z-[400] rounded-xl bg-white/95 px-3.5 py-2 shadow-md ring-1 ring-slate-200"><p className="text-sm font-bold leading-tight text-slate-900">{data.scope?.level === 'region' ? `${data.scope.region} viloyati` : data.scope?.district || 'Barcha tumanlar'}</p><p className="text-xs text-slate-500">{schools.length} maktab · {METRICS[metric].label.toLowerCase()}: <b className="text-slate-800">{fmtPct(avgOf(schools, metric))}</b> (o'rtacha)</p></div>
						<div className="absolute bottom-5 left-1/2 z-[400] flex max-w-[94%] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-white/95 p-1.5 shadow-lg ring-1 ring-slate-200">
							{Object.entries(METRICS).map(([k, m]) => <button key={k} onClick={() => onMetric(k)} className={`rounded-xl px-3.5 py-1.5 text-sm transition ${metric === k ? 'bg-slate-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{m.label}</button>)}
						</div>
						<div className="pointer-events-none absolute bottom-5 left-3 z-[400] hidden flex-col gap-1 rounded-xl bg-white/95 px-3 py-2 text-[11px] text-slate-600 shadow-md ring-1 ring-slate-200 md:flex">{LEGEND.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>)}</div>
						{markers.length === 0 && <p className="absolute left-1/2 top-1/2 z-[400] w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white/95 px-4 py-3 text-center text-sm text-slate-600 shadow-lg">Xaritada maktab yo'q: maktab adminlari «Sozlamalar»da joylashuvni belgilashi kerak.</p>}
					</>
				)}
			</div>
		)
	}

	return (
		<div>
			<div className="mb-3 flex flex-wrap items-center gap-1.5">
				{Object.entries(METRICS).map(([k, m]) => <button key={k} onClick={() => onMetric(k)} className={`rounded-full px-3.5 py-1.5 text-sm transition ${metric === k ? 'bg-slate-900 font-medium text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{m.label}</button>)}
				{!compact && <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-slate-500">{LEGEND.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>)}</span>}
			</div>
			{!data ? <div className="animate-pulse rounded-xl bg-slate-100" style={{ height }} /> : (
				<div className="relative">
					<div className="pointer-events-none absolute left-14 top-3 z-[400] rounded-xl bg-white/95 px-3.5 py-2 shadow-md ring-1 ring-slate-200"><p className="text-sm font-bold leading-tight text-slate-900">{data.scope?.level === 'region' ? `${data.scope.region} viloyati` : data.scope?.district || 'Barcha tumanlar'}</p><p className="text-xs text-slate-500">{schools.length} maktab · {METRICS[metric].label.toLowerCase()}: <b className="text-slate-800">{fmtPct(avgOf(schools, metric))}</b> (o'rtacha)</p></div>
					<MapView geojson={data.geojson} districtStyle={geoStyle} markers={markers} focus={focus} selectedId={selectedId} lock={!!data.scope?.scoped} height={height} />
					{compact && <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap gap-2 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow">{LEGEND.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: c }} />{l.split(' ')[0]}</span>)}</div>}
					{data.scope?.scoped && !data.geojson?.features?.length && <p className="absolute left-3 top-3 z-[400] max-w-xs rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow">{data.scope.district} chegarasi yuklanmagan: xarita maktablar atrofiga ochildi.</p>}
					{markers.length === 0 && <p className="absolute left-1/2 top-1/2 z-[400] w-72 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white/95 px-4 py-3 text-center text-sm text-slate-600 shadow-lg">Xaritada maktab yo'q: maktab adminlari «Sozlamalar»da joylashuvni belgilashi kerak.</p>}
				</div>
			)}
		</div>
	)
}

export default SchoolsMapPanel
