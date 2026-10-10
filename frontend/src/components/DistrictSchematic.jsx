import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FiMaximize2, FiMinus, FiPlus, FiRefreshCw, FiX } from 'react-icons/fi'
import { METRICS, NONE, colorFor, fmtPct } from './SchoolsMapPanel'

// Tuman(lar) chegarasi va maktablar joylashuvi: fon xaritasiz, toza SVG chizma (internet kerak emas).
// Bitta tuman: katta poligon. Bir nechta tuman (viloyat): har bir tuman o'z davomat rangida, tashqi kontur qalin chiziq.
// Maktab belgisi: foizni ko'rsatuvchi rangli doira va yoni/tagida nomi; nomlar bir-birining ustiga tushmasligi uchun joylashtiriladi.
// Yaqinlashtirish: sichqoncha g'ildiragi (kichik xaritada Ctrl + g'ildirak), sudrab surish, +/− tugmalari, ikki marta bosish.
// Yaqinlashtirganda belgilar va yozuvlar ekrandagi o'lchamini saqlaydi, shuning uchun ustma-ust tushgan maktablar ajraladi va nomlari ko'rinadi.
// `full` — butun sahifani egallaydi (viloyat monitori xaritasi), boshqaruvlar xarita ustida suzib turadi.
const VB_W = 1000
const PAD = 90
const R = 21
const CIRC = 2 * Math.PI * 15.5
const MAX_ZOOM = 40
const LEGEND = [['#16a34a', 'yaxshi 85%+'], ['#f59e0b', "o'rta 60–85%"], ['#dc2626', 'past <60%'], [NONE, "yo'q"]]

const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const clamp = (v, a, b) => Math.min(Math.max(v, a), b)

const DistrictSchematic = ({ data, metric, onMetric, onOpenSchool, maxHeight = 520, full: fullProp = false }) => {
	const M = METRICS[metric]
	const [hover, setHover] = useState(null)
	const [hoverD, setHoverD] = useState(null)
	const [expanded, setExpanded] = useState(false)
	const [view, setView] = useState({ x: 0, y: 0, w: VB_W })
	const [hint, setHint] = useState(false)
	const svgRef = useRef(null)
	const drag = useRef(null)
	const moved = useRef(false)
	const raf = useRef(0)
	const viewRef = useRef(view)
	viewRef.current = view
	const full = fullProp || expanded

	const geo = useMemo(() => {
		const features = (data?.geojson?.features || []).filter(f => !f.properties.isRegion && f.geometry)
		const schools = (data?.schools || []).filter(s => s.location)
		const pts = []
		const walk = (c) => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk))
		features.forEach(f => walk(f.geometry.coordinates))
		schools.forEach(s => pts.push([s.location.lng, s.location.lat]))
		if (!pts.length) return null
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
		pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) })
		const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)         // kenglik bo'yicha tuzatish: shakl cho'zilib ketmasin
		const w = Math.max((maxX - minX) * k, 1e-4), h = Math.max(maxY - minY, 1e-4)
		const scale = (VB_W - PAD * 2) / w
		const VB_H = Math.min(Math.max(h * scale + PAD * 2, 340), 1000)
		const s2 = Math.min(scale, (VB_H - PAD * 2) / h)
		const ox = (VB_W - w * s2) / 2, oy = (VB_H - h * s2) / 2
		const px = (lng) => ox + (lng - minX) * k * s2
		const py = (lat) => oy + (maxY - lat) * s2
		const path = (g) => polysOf(g).map(poly => poly.map(ring => `M${ring.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L')}Z`).join('')).join('')
		return { features: features.map(f => ({ ...f, d: path(f.geometry) })), px, py, VB_H }
	}, [data])

	const VB_H = geo?.VB_H || 600
	const viewH = view.w * (VB_H / VB_W)
	const k = VB_W / view.w            // yaqinlashtirish darajasi (1 = to'liq ko'rinish)
	const f = 1 / k                    // belgi/yozuvlar uchun teskari masshtab

	const bound = useCallback((v) => {
		const w = clamp(v.w, VB_W / MAX_ZOOM, VB_W), h = w * (VB_H / VB_W)
		return { w, x: clamp(v.x, -w * 0.3, VB_W - w * 0.7), y: clamp(v.y, -h * 0.3, VB_H - h * 0.7) }
	}, [VB_H])
	const animateTo = useCallback((to) => {
		cancelAnimationFrame(raf.current)
		const from = viewRef.current, t0 = performance.now()
		const step = (now) => {
			const p = Math.min(1, (now - t0) / 220), e = 1 - Math.pow(1 - p, 3)
			setView(bound({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e }))
			if (p < 1) raf.current = requestAnimationFrame(step)
		}
		raf.current = requestAnimationFrame(step)
	}, [bound])
	// (cx, cy) nuqta ekranda joyida qoladigan qilib yaqinlashtiradi
	const targetAt = useCallback((cx, cy, factor) => {
		const cur = viewRef.current
		const w = clamp(cur.w / factor, VB_W / MAX_ZOOM, VB_W), r = w / cur.w
		return bound({ w, x: cx - (cx - cur.x) * r, y: cy - (cy - cur.y) * r })
	}, [bound])
	const zoomCenter = (factor) => animateTo(targetAt(view.x + view.w / 2, view.y + viewH / 2, factor))
	const toVb = (clientX, clientY) => {
		const m = svgRef.current?.getScreenCTM()
		if (!m) return { x: view.x + view.w / 2, y: view.y + viewH / 2 }
		const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse())
		return { x: p.x, y: p.y }
	}
	const toVbRef = useRef(toVb)
	toVbRef.current = toVb

	// yangi ma'lumot (tuman almashdi) bo'lsa to'liq ko'rinishga qaytadi
	useEffect(() => { setView({ x: 0, y: 0, w: VB_W }) }, [geo])
	useEffect(() => () => cancelAnimationFrame(raf.current), [])
	useEffect(() => {
		if (!expanded) return undefined
		const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
		window.addEventListener('keydown', onKey)
		const prev = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
	}, [expanded])

	// g'ildirak: katta xaritada oddiy, kichik (sahifa ichidagi) xaritada Ctrl bilan; aks holda sahifa aylanadi
	useEffect(() => {
		const svg = svgRef.current
		if (!svg) return undefined
		let t
		const onWheel = (e) => {
			if (!full && !e.ctrlKey && !e.metaKey) { setHint(true); clearTimeout(t); t = setTimeout(() => setHint(false), 1400); return }
			e.preventDefault()
			cancelAnimationFrame(raf.current)
			const p = toVbRef.current(e.clientX, e.clientY)
			setView(targetAt(p.x, p.y, Math.exp(-e.deltaY * 0.0022)))
		}
		svg.addEventListener('wheel', onWheel, { passive: false })
		return () => { svg.removeEventListener('wheel', onWheel); clearTimeout(t) }
	}, [geo, full, targetAt])

	const onPointerDown = (e) => {
		if (e.button !== 0) return
		cancelAnimationFrame(raf.current)
		moved.current = false
		drag.current = { x: e.clientX, y: e.clientY, view, pid: e.pointerId, captured: false }
	}
	const onPointerMove = (e) => {
		const d = drag.current
		if (!d) return
		const dx = e.clientX - d.x, dy = e.clientY - d.y
		if (!moved.current && Math.hypot(dx, dy) < 5) return
		if (!moved.current) { moved.current = true; setHover(null) }
		if (!d.captured) { try { svgRef.current.setPointerCapture(d.pid); d.captured = true } catch { /* ahamiyatsiz */ } }
		const s = svgRef.current.getScreenCTM()?.a || 1
		setView(bound({ w: d.view.w, x: d.view.x - dx / s, y: d.view.y - dy / s }))
	}
	const onPointerUp = () => { drag.current = null; setTimeout(() => { moved.current = false }, 0) }
	const onDouble = (e) => { const p = toVb(e.clientX, e.clientY); animateTo(targetAt(p.x, p.y, 2.2)) }

	const schools = useMemo(() => data?.schools || [], [data])
	const located = useMemo(() => schools.filter(s => s.location), [schools])
	const missing = schools.filter(s => !s.location)
	const single = data?.scope?.level === 'district' || (geo?.features.length || 0) <= 1
	const distInfo = useMemo(() => new Map((data?.districts || []).map(d => [d.name.toLowerCase(), d])), [data])

	// Belgilar va nomlar joylashuvi (nomlar bir-birini va belgilarni bosmasligi uchun 4 tomondan birini tanlaydi).
	// O'lchamlar ekran pikselida; xarita koordinatasiga yaqinlashtirish darajasi bo'yicha o'tkaziladi, shuning uchun yaqinlashtirganda ko'proq nom sig'adi
	const kq = Math.pow(2, Math.round(Math.log2(k) * 3) / 3)
	const placed = useMemo(() => {
		if (!geo) return []
		const items = located.map(s => ({ s, x: geo.px(s.location.lng), y: geo.py(s.location.lat) }))
		const r = (R + 3) / kq
		const boxes = items.map(i => ({ x: i.x - r, y: i.y - r, w: r * 2, h: r * 2 }))
		const labels = []
		items.forEach(it => {
			const text = it.s.name.length > 24 ? `${it.s.name.slice(0, 23)}…` : it.s.name
			const w = text.length * 6.7 + 18, h = 22
			const spots = [[-w / 2, R + 8], [-w / 2, -R - 8 - h], [R + 8, -h / 2], [-R - 8 - w, -h / 2]]
			for (const [dx, dy] of spots) {
				const b = { x: it.x + dx / kq, y: it.y + dy / kq, w: w / kq, h: h / kq }
				if (b.x < -40 || b.y < -40 || b.x + b.w > VB_W + 40 || b.y + b.h > geo.VB_H + 40) continue
				if (boxes.some(o => hit(b, o)) || labels.some(o => hit(b, o))) continue
				labels.push(b); it.label = { x: dx, y: dy, w, h, text }
				break
			}
		})
		return items
	}, [geo, located, kq])

	const avgStudent = (() => { const t = located.reduce((a, s) => a + s.studentTotal, 0); const c = located.reduce((a, s) => a + s.studentCame, 0); return t ? (c / t) * 100 : null })()
	const title = data?.scope?.level === 'region' ? `${data.scope.region} viloyati` : data?.scope?.district || (single ? geo?.features[0]?.properties.name : 'Barcha tumanlar')

	// ko'rinish oynasidagi belgilar (qolganlari chizilmaydi: ko'p maktabda tez ishlaydi)
	const margin = 70 / k
	const shown = placed.filter(i => i.x > view.x - margin && i.x < view.x + view.w + margin && i.y > view.y - margin && i.y < view.y + viewH + margin)
	const light = shown.length > 250

	const chips = (
		<div className={`flex flex-wrap items-center gap-1.5 ${full ? 'absolute bottom-5 left-1/2 z-10 max-w-[94%] -translate-x-1/2 justify-center rounded-2xl bg-white/95 p-1.5 shadow-lg ring-1 ring-slate-200' : 'mb-3'}`}>
			{Object.entries(METRICS).map(([key, m]) => <button key={key} onClick={() => onMetric(key)} className={`px-3.5 py-1.5 text-sm transition ${full ? 'rounded-xl' : 'rounded-full'} ${metric === key ? 'bg-blue-600 font-medium text-white shadow-sm' : full ? 'text-slate-600 hover:bg-slate-100' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'}`}>{m.label}</button>)}
		</div>
	)
	const ctl = 'flex h-9 w-9 items-center justify-center text-slate-600 transition hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40'
	const sw = (n, min = 0.3) => n * Math.max(f, min)

	return (
		<div className={expanded ? 'fixed inset-0 z-[60] bg-slate-50' : full ? 'relative h-full w-full' : ''}>
			{!full && chips}

			{!data ? <div className="animate-pulse rounded-2xl bg-slate-100" style={{ height: full ? '100%' : 380 }} /> : !geo ? (
				<div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-14 text-center">
					<p className="font-medium text-slate-700">Tuman chegarasi va maktab joylashuvi hali yo'q</p>
					<p className="mt-1 max-w-md text-sm text-slate-500">Tuman chegarasini tizim egasi «Tumanlar» bo'limidan yuklaydi, maktab joylashuvini esa maktab admini «Sozlamalar»da belgilaydi.</p>
				</div>
			) : (
				<div className={`relative overflow-hidden ${full ? 'h-full w-full' : 'rounded-2xl ring-1 ring-slate-200'}`} style={{ background: 'radial-gradient(120% 90% at 30% 10%, #f8fafc 0%, #eef2ff 55%, #e0ecff 100%)' }}>
					<style>{'@keyframes dsRise{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}@keyframes dsPulse{0%{transform:scale(.8);opacity:.55}100%{transform:scale(1.9);opacity:0}}.ds-pin{transform-box:fill-box;transform-origin:center;animation:dsRise .45s ease-out both}.ds-pulse{transform-box:fill-box;transform-origin:center;animation:dsPulse 2s ease-out infinite}.ds-d{transition:fill-opacity .18s,stroke .18s}'}</style>

					<div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl bg-white/90 px-3.5 py-2.5 shadow-sm ring-1 ring-slate-200 backdrop-blur">
						<p className="text-sm font-bold leading-tight text-slate-900">{title}</p>
						<p className="mt-0.5 text-xs text-slate-500">{schools.length} maktab · o'quvchi davomati <b className="text-slate-800">{fmtPct(avgStudent)}</b>{missing.length > 0 && <span className="text-amber-600"> · {missing.length} tasi joylashuvsiz</span>}</p>
					</div>
					<div className="pointer-events-none absolute right-3 top-3 z-10 hidden flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-white/90 px-3 py-2 text-[11px] text-slate-600 shadow-sm ring-1 ring-slate-200 backdrop-blur sm:flex">
						{LEGEND.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>)}
					</div>

					{/* yaqinlashtirish boshqaruvi */}
					<div className="absolute right-3 top-16 z-10 flex flex-col overflow-hidden rounded-xl bg-white/95 shadow-md ring-1 ring-slate-200">
						<button onClick={() => zoomCenter(1.8)} disabled={k >= MAX_ZOOM - 0.01} title="Yaqinlashtirish" aria-label="Yaqinlashtirish" className={ctl}><FiPlus size={17} /></button>
						<button onClick={() => zoomCenter(1 / 1.8)} disabled={k <= 1.001} title="Uzoqlashtirish" aria-label="Uzoqlashtirish" className={`${ctl} border-t border-slate-100`}><FiMinus size={17} /></button>
						<button onClick={() => animateTo({ x: 0, y: 0, w: VB_W })} disabled={k <= 1.001} title="To'liq ko'rinish" aria-label="To'liq ko'rinish" className={`${ctl} border-t border-slate-100`}><FiRefreshCw size={15} /></button>
						{!fullProp && <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Yopish (Esc)' : 'Butun ekranga'} aria-label="Butun ekran" className={`${ctl} border-t border-slate-100`}>{expanded ? <FiX size={16} /> : <FiMaximize2 size={15} />}</button>}
					</div>
					{k > 1.05 && <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-lg bg-white/90 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">×{k.toFixed(1)}</div>}
					{hint && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto w-fit -translate-y-1/2 rounded-xl bg-slate-800/85 px-4 py-2 text-sm text-white shadow-lg">Yaqinlashtirish uchun Ctrl + g'ildirak, yoki +/− tugmalari</div>}
					{full && chips}

					<svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${viewH}`} className="mx-auto block w-full select-none" style={{ ...(full ? { height: '100%' } : { maxHeight }), touchAction: 'none', cursor: 'grab' }} role="img" aria-label="Tuman chegarasi va maktablar"
						onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDouble}>
						<defs>
							<linearGradient id="dsFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="55%" stopColor="#dbeafe" /><stop offset="100%" stopColor="#bfdbfe" /></linearGradient>
							<linearGradient id="dsBase" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#eef4ff" /></linearGradient>
							<pattern id="dsHatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="14" stroke="#93c5fd" strokeWidth="1.2" opacity="0.32" /></pattern>
							<pattern id="dsDots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.3" fill="#cbd5e1" /></pattern>
							<filter id="dsShadow" x="-15%" y="-15%" width="130%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="11" floodColor="#1e3a8a" floodOpacity="0.26" /></filter>
							<filter id="dsPin" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#0f172a" floodOpacity="0.38" /></filter>
						</defs>
						<rect x={-VB_W} y={-VB_W} width={VB_W * 3} height={VB_W * 3} fill="url(#dsDots)" opacity="0.7" />

						{/* 1) tashqi kontur: qalin ko'k chiziq va yumshoq nur (ichki chegaralar qoplamalar ostida qoladi) */}
						<g filter={k < 6 ? 'url(#dsShadow)' : undefined}>
							{geo.features.map(ft => <path key={`o${ft.properties.id}`} d={ft.d} fill="#fff" stroke="#3b82f6" strokeWidth={sw(22, 0.35)} strokeOpacity="0.1" strokeLinejoin="round" />)}
							{geo.features.map(ft => <path key={`b${ft.properties.id}`} d={ft.d} fill="#fff" stroke="#1d4ed8" strokeWidth={sw(single ? 7 : 9)} strokeLinejoin="round" />)}
						</g>

						{/* 2) tumanlar: oq asos + davomat rangi, oq ichki chegaralar */}
						{geo.features.map(ft => {
							const info = distInfo.get(ft.properties.name.toLowerCase())
							const v = info?.studentPercent
							const tint = single ? null : colorFor(v ?? null, true)
							const on = hoverD === ft.properties.id
							return (
								<g key={ft.properties.id} onMouseEnter={() => !single && !drag.current && setHoverD(ft.properties.id)} onMouseLeave={() => setHoverD(null)}>
									<path d={ft.d} fill={single ? 'url(#dsFill)' : 'url(#dsBase)'} fillRule="evenodd" />
									{tint && <path d={ft.d} className="ds-d" fill={tint} fillOpacity={on ? 0.5 : 0.26} fillRule="evenodd" />}
									<path d={ft.d} fill="url(#dsHatch)" fillRule="evenodd" pointerEvents="none" />
									<path d={ft.d} fill="none" stroke="#fff" strokeWidth={sw(single ? 5 : 3)} strokeLinejoin="round" pointerEvents="none" />
									{!single && on && <path d={ft.d} fill="none" stroke="#1d4ed8" strokeWidth={sw(3)} strokeLinejoin="round" pointerEvents="none" />}
									<title>{ft.properties.name}{info ? ` · davomat ${fmtPct(info.studentPercent)} · ${info.schools} maktab` : ''}</title>
								</g>
							)
						})}

						{/* tuman nomlari (oq hoshiya bilan); o'lchami ekranda o'zgarmaydi */}
						{!single && geo.features.map(ft => ft.properties.center && (
							<text key={`t${ft.properties.id}`} x={geo.px(ft.properties.center.lng)} y={geo.py(ft.properties.center.lat)} textAnchor="middle" className="pointer-events-none" style={{ font: `${hoverD === ft.properties.id ? 800 : 700} ${(full ? 17 : 14) * f}px system-ui,sans-serif`, fill: '#334155', paintOrder: 'stroke', stroke: '#fff', strokeWidth: 4 * f, strokeLinejoin: 'round', opacity: 0.9 }}>{ft.properties.name}</text>
						))}

						{/* maktab belgilari: ekran o'lchamida (1/k masshtab), tumanlarning ustida */}
						{shown.map(({ s, x, y, label }, i) => {
							const v = M.value(s), c = colorFor(v, M.good)
							const on = hover?._id === s._id
							const dim = hover && !on
							const frac = v === null || v === undefined ? 0 : Math.max(0, Math.min(100, M.good ? v : 100 - v)) / 100
							return (
								<g key={s._id} transform={`translate(${x},${y}) scale(${f})`} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .15s' }}>
									{label && (
										<g className="pointer-events-none">
											<rect x={label.x} y={label.y} width={label.w} height={label.h} rx="8" fill="#fff" stroke={on ? c : '#e2e8f0'} strokeWidth={on ? 1.6 : 1} opacity="0.96" />
											<text x={label.x + label.w / 2} y={label.y + label.h / 2 + 4.2} textAnchor="middle" style={{ font: '600 12px system-ui,sans-serif', fill: '#0f172a' }}>{label.text}</text>
										</g>
									)}
									<g onMouseEnter={() => !drag.current && setHover({ ...s, x, y })} onMouseLeave={() => setHover(null)} onClick={() => { if (!moved.current) onOpenSchool?.(s) }} style={{ cursor: onOpenSchool ? 'pointer' : 'default' }}>
										<g className={i < 60 ? 'ds-pin' : undefined} style={i < 60 ? { animationDelay: `${i * 40}ms` } : undefined}>
											{c === '#dc2626' && !light && <circle r={R} fill={c} className="ds-pulse" />}
											<circle r={on ? R + 4 : R} fill={c} stroke="#fff" strokeWidth="3.5" filter={light ? undefined : 'url(#dsPin)'} />
											<circle r="15.5" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="3" transform={on ? 'scale(1.18)' : undefined} />
											<circle r="15.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${CIRC * frac} ${CIRC}`} transform={`rotate(-90) ${on ? 'scale(1.18)' : ''}`} />
											<text textAnchor="middle" dy="4.4" className="pointer-events-none" style={{ font: '800 12px system-ui,sans-serif', fill: '#fff' }}>{v === null || v === undefined ? '—' : Math.round(v)}</text>
										</g>
									</g>
								</g>
							)
						})}

						<g transform={`translate(${view.x + view.w - 46 * f},${view.y + viewH - 52 * f}) scale(${f})`} className="pointer-events-none" opacity="0.7">
							<circle r="20" fill="#fff" stroke="#cbd5e1" />
							<path d="M0 -13 L5.5 5 L0 1.5 L-5.5 5 Z" fill="#1d4ed8" />
							<text y="17" textAnchor="middle" style={{ font: '700 9px system-ui,sans-serif', fill: '#475569' }}>N</text>
						</g>
					</svg>

					{hover && (
						<div className="pointer-events-none absolute z-20 w-60 rounded-2xl bg-white p-3.5 text-xs shadow-2xl ring-1 ring-slate-200" style={{ left: `${clamp(((hover.x - view.x) / view.w) * 100, 14, 86)}%`, top: `${((hover.y - view.y) / viewH) * 100}%`, transform: `translate(-50%, ${(hover.y - view.y) / viewH > 0.5 ? 'calc(-100% - 40px)' : '40px'})` }}>
							<p className="text-sm font-bold leading-snug text-slate-900">{hover.name}</p>
							{hover.district && <p className="text-slate-400">{hover.district}</p>}
							{[["O'quvchilar", hover.studentPercent, `${hover.studentCame}/${hover.studentTotal}`], ['Xodimlar', hover.staffPercent, `${hover.staffCame}/${hover.staffTotal}`]].map(([l, p, t]) => (
								<div key={l} className="mt-2"><p className="flex justify-between text-slate-500"><span>{l}</span><b className="text-slate-800">{t} · {fmtPct(p)}</b></p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${p || 0}%`, background: colorFor(p, true) }} /></div></div>
							))}
							<p className="mt-2 flex justify-between text-slate-500"><span>Kech qolganlar</span><b className="text-slate-800">{hover.studentLate} o'quvchi</b></p>
							<p className="mt-1 flex justify-between text-slate-500"><span>Kameralar</span><b className="text-slate-800">{hover.cameraOnline}/{hover.cameraTotal} online</b></p>
							{onOpenSchool && <p className="mt-2 text-center text-[11px] font-medium text-blue-600">Bossangiz maktab sahifasi ochiladi</p>}
						</div>
					)}
				</div>
			)}

			{!full && missing.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{missing.length} ta maktab chizmada yo'q (joylashuvi belgilanmagan): {missing.slice(0, 4).map(s => s.name).join(', ')}{missing.length > 4 ? ` va yana ${missing.length - 4} ta` : ''}. Maktab admini «Sozlamalar»da belgilaydi.</p>}
		</div>
	)
}

export default DistrictSchematic
