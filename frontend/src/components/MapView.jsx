import { tx } from '../i18n'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'

// Leaflet xaritasi (OpenStreetMap). Tuman chegaralari (GeoJSON), maktab belgilari va joylashuvni tanlash rejimi.
// Internet bo'lmasa fon xarita yuklanmaydi, lekin chegaralar va belgilar baribir ko'rinadi.
// Props:
//  geojson   — FeatureCollection (tuman chegaralari); feature.properties.{name,isRegion}
//  markers   — [{ id, lat, lng, color, radius, title, subtitle, onClick }]
//  districtStyle(feature) -> { color, fillColor, fillOpacity, weight } (ixtiyoriy)
//  onDistrictClick(feature)
//  pick      — { lat, lng } | null — tanlangan nuqta; onPick(lat, lng) bilan xaritani bosib o'zgartiriladi
//  focus     — { lat, lng, zoom } — xaritani shu nuqtaga olib boradi
const UZ = [41.3, 64.6]
// Tanlangan nuqta belgisi: tashqi rasm fayllariga bog'liq emas (internet/bundler muammolarida ham ko'rinadi)
const pinIcon = L.divIcon({
	className: '',
	html: '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M17 1C8.7 1 2 7.5 2 15.6 2 26.5 17 43 17 43s15-16.500 15-27.400C32 7.500 25.300 1 17 1z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="17" cy="15.500" r="5.500" fill="#fff"/></svg>',
	iconSize: [34, 44],
	iconAnchor: [17, 43],
	popupAnchor: [0, -40]
})
const colorOf = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 55% 55%)` }

// Maktab belgilari uchun uslublar (bir marta qo'shiladi)
if (typeof document !== 'undefined' && !document.getElementById('sm-map-style')) {
	const st = document.createElement('style')
	st.id = 'sm-map-style'
	st.textContent = `
.sm-icon{background:none!important;border:none!important}
.sm-pin{position:absolute;left:-23px;top:-23px;width:46px;height:46px;border-radius:50%;background:var(--c);border:3px solid #fff;box-shadow:0 4px 10px rgba(15,23,42,.38);display:flex;align-items:center;justify-content:center;transition:transform .15s,box-shadow .15s;cursor:pointer}.sm-pin::before{content:'';position:absolute;inset:4px;border-radius:50%;background:conic-gradient(#fff calc(var(--f,100) * 1%),rgba(255,255,255,.28) 0);-webkit-mask:radial-gradient(circle,transparent 62%,#000 64%);mask:radial-gradient(circle,transparent 62%,#000 64%)}.sm-pin span{position:relative;font:800 12px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3)}
.sm-pin:hover,.sm-sel .sm-pin{transform:scale(1.22);box-shadow:0 5px 14px rgba(15,23,42,.5)}
.sm-sel .sm-pin::after{content:'';position:absolute;inset:-9px;border-radius:50%;border:2px solid var(--c);opacity:.55;animation:sm-pulse 1.6s ease-out infinite}
@keyframes sm-pulse{0%{transform:scale(.75);opacity:.7}100%{transform:scale(1.35);opacity:0}}
.sm-label{position:absolute;left:0;top:28px;transform:translateX(-50%);white-space:nowrap;max-width:190px;overflow:hidden;text-overflow:ellipsis;background:rgba(255,255,255,.95);padding:2px 7px;border-radius:7px;font:600 11px system-ui,sans-serif;color:#0f172a;box-shadow:0 1px 4px rgba(15,23,42,.3);display:none;pointer-events:none}
.sm-labels .sm-label,.sm-sel .sm-label{display:block}
.sm-card{min-width:220px;font:13px system-ui,sans-serif;color:#0f172a}
.sm-card h4{margin:0;font-size:14px;font-weight:700}
.sm-card .sub{margin:2px 0 8px;font-size:12px;color:#64748b}
.sm-row{margin-top:7px}.sm-row .t{display:flex;justify-content:space-between;font-size:12px;color:#475569}.sm-row .t b{color:#0f172a}
.sm-bar{height:5px;border-radius:99px;background:#e2e8f0;margin-top:3px;overflow:hidden}.sm-bar i{display:block;height:100%;border-radius:99px}
.sm-btn{margin-top:10px;width:100%;border:0;border-radius:8px;background:#0f172a;color:#fff;padding:7px 10px;font:600 12px system-ui,sans-serif;cursor:pointer}.sm-btn:hover{background:#1e293b}.sm-gmap{display:block;width:100%;text-align:center;margin-top:6px;font:500 11px system-ui,sans-serif;color:#2563eb;text-decoration:none}.sm-gmap:hover{text-decoration:underline}
`
	document.head.appendChild(st)
}

// Maktab belgisi: rangli doira ichida ko'rsatkich (masalan "92%"), tagida maktab nomi (yaqinlashganda)
const pinIconFor = (mk, selected) => {
	const wrap = document.createElement('div')
	wrap.className = selected ? 'sm-sel' : ''
	wrap.style.cssText = 'position:relative;width:0;height:0'
	const pin = document.createElement('div'); pin.className = 'sm-pin'; pin.style.setProperty('--c', mk.color || '#2563eb'); pin.style.setProperty('--f', String(Math.round((mk.frac ?? 1) * 100)))
	const num = document.createElement('span'); num.textContent = mk.value ?? ''; pin.appendChild(num)
	const label = document.createElement('div'); label.className = 'sm-label'; label.textContent = mk.title
	wrap.appendChild(pin); wrap.appendChild(label)
	return L.divIcon({ html: wrap, className: 'sm-icon', iconSize: [0, 0] })
}

// Popup karta: sarlavha, tuman, ko'rsatkichlar (progress chiziq bilan), "Batafsil" tugmasi
const cardNode = (mk) => {
	const box = document.createElement('div'); box.className = 'sm-card'
	const h = document.createElement('h4'); h.textContent = mk.title; box.appendChild(h)
	if (mk.subtitle) { const p = document.createElement('div'); p.className = 'sub'; p.textContent = mk.subtitle; box.appendChild(p) }
	for (const r of mk.rows || []) {
		const row = document.createElement('div'); row.className = 'sm-row'
		const t = document.createElement('div'); t.className = 't'
		const a = document.createElement('span'); a.textContent = r.label; const b = document.createElement('b'); b.textContent = r.text; t.appendChild(a); t.appendChild(b); row.appendChild(t)
		if (r.pct !== null && r.pct !== undefined) { const bar = document.createElement('div'); bar.className = 'sm-bar'; const i = document.createElement('i'); i.style.width = `${Math.min(100, r.pct)}%`; i.style.background = r.color || '#2563eb'; bar.appendChild(i); row.appendChild(bar) }
		box.appendChild(row)
	}
	if (mk.onOpen) { const btn = document.createElement('button'); btn.className = 'sm-btn'; btn.type = 'button'; btn.textContent = mk.openLabel || 'Batafsil'; btn.onclick = () => mk.onOpen(mk); box.appendChild(btn) }
	// Google Maps'da shu nuqtani ochish (yangi oynada)
	if (Number.isFinite(mk.lat) && Number.isFinite(mk.lng)) {
		const a = document.createElement('a'); a.className = 'sm-gmap'; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.href = `https://www.google.com/maps?q=${mk.lat},${mk.lng}`
		a.appendChild(document.createTextNode("Google Maps'da ochish")); box.appendChild(a)
	}
	return box
}

// Leaflet tooltip matnni HTML sifatida talqin qiladi — matn tuguni orqali XSS'ni oldini olamiz
const textNode = (text) => { const d = document.createElement('div'); d.textContent = String(text ?? ''); return d }

const popupNode = (title, subtitle) => {
	const box = document.createElement('div')
	const b = document.createElement('b'); b.textContent = title; box.appendChild(b)
	if (subtitle) { const p = document.createElement('div'); p.style.cssText = 'margin-top:2px;font-size:12px;color:#475569;white-space:pre-line'; p.textContent = subtitle; box.appendChild(p) }
	return box
}

// lock: xarita faqat berilgan tuman(lar) atrofida ochiladi, tashqarisi xiralashadi va uzoqqa siljib/kichraytirib bo'lmaydi
const maskLayer = (geojson) => {
	const world = [[-85, -180], [-85, 180], [85, 180], [85, -180]]
	const holes = []
	for (const f of geojson.features) {
		if (f.properties?.isRegion) continue
		const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates
		for (const p of polys) holes.push(p[0].map(([lng, lat]) => [lat, lng]))
	}
	return L.polygon([world, ...holes], { stroke: false, fillColor: '#0f172a', fillOpacity: 0.38, interactive: false })
}

const MapView = ({ geojson, markers = [], districtStyle, onDistrictClick, pick = null, onPick, focus = null, height = 420, className = '', lock = false, selectedId = null, labels = false }) => {
	const el = useRef(null)
	const map = useRef(null)
	const layers = useRef({ geo: null, markers: null, pick: null, mask: null, bounds: null, refs: new Map() })
	const cb = useRef({})
	cb.current = { onPick, onDistrictClick, labels }
	const fitted = useRef('')

	useEffect(() => {
		const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true }).setView(UZ, 6)
		L.control.zoom({ position: 'topleft', zoomInTitle: tx('Yaqinlashtirish'), zoomOutTitle: tx('Uzoqlashtirish') }).addTo(m)
		// Kalit talab qilmaydigan manbalar: OpenStreetMap (asosiy), Esri och kulrang (yengil fon), Esri sputnik
		const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
		const light = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16, maxZoom: 19, attribution: 'Tiles &copy; Esri' })
		const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles &copy; Esri' })
		const layersCtl = L.control.layers({ [tx("Ko'cha")]: osm, [tx('Och fon')]: light, [tx('Sputnik')]: sat }, null, { position: 'topright', collapsed: true }).addTo(m)
		const lt = layersCtl.getContainer()?.querySelector('.leaflet-control-layers-toggle'); if (lt) { lt.title = tx('Qatlamlar'); lt.setAttribute('aria-label', tx('Qatlamlar')) }
		layers.current.markers = L.layerGroup().addTo(m)
		m.on('click', (e) => { if (cb.current.onPick) cb.current.onPick(e.latlng.lat, e.latlng.lng) })
		map.current = m
		const syncLabels = () => m.getContainer().classList.toggle('sm-labels', cb.current.labels || m.getZoom() >= 12)
		m.on('zoomend', syncLabels); syncLabels()
		// "Tumanga qaytish" tugmasi
		const Home = L.Control.extend({ options: { position: 'topleft' }, onAdd() {
			const b = L.DomUtil.create('a', 'leaflet-bar leaflet-control')
			b.href = '#'; b.title = 'Tumanga qaytish'; b.innerHTML = '&#8962;'
			b.style.cssText = 'width:30px;height:30px;line-height:30px;text-align:center;font-size:18px;background:#fff;color:#334155;display:block;text-decoration:none'
			L.DomEvent.on(b, 'click', (e) => { L.DomEvent.stop(e); if (layers.current.bounds) m.fitBounds(layers.current.bounds, { padding: [20, 20] }) })
			return b
		} })
		new Home().addTo(m)
		const t = setTimeout(() => { m.invalidateSize(); if (layers.current.bounds) m.fitBounds(layers.current.bounds, { padding: [20, 20] }) }, 200)
		return () => { clearTimeout(t); m.remove(); map.current = null }
	}, [])

	// tuman chegaralari
	useEffect(() => {
		const m = map.current
		if (!m) return
		if (layers.current.geo) { layers.current.geo.remove(); layers.current.geo = null }
		if (layers.current.mask) { layers.current.mask.remove(); layers.current.mask = null }
		if (!geojson?.features?.length) return
		const layer = L.geoJSON(geojson, {
			style: (f) => (districtStyle ? districtStyle(f) : f.properties.isRegion
				? { color: '#64748b', weight: 2, fillOpacity: 0, dashArray: '6 4' }
				: { color: '#334155', weight: 1.2, fillColor: colorOf(f.properties.name), fillOpacity: 0.28 }),
			onEachFeature: (f, l) => {
				if (f.properties.isRegion) { l.options.interactive = false; return }
				l.bindTooltip(textNode(f.properties.name), { sticky: true })
				l.on('click', (e) => { if (cb.current.onDistrictClick) { L.DomEvent.stopPropagation(e); cb.current.onDistrictClick(f) } })
			}
		}).addTo(m)
		layer.bringToBack()
		layers.current.geo = layer
		if (lock) { layers.current.mask = maskLayer(geojson).addTo(m); layers.current.mask.bringToBack() }
		const scoped = L.geoJSON({ ...geojson, features: geojson.features.filter(f => !f.properties.isRegion) })
		const bounds = scoped.getBounds().isValid() ? scoped.getBounds() : layer.getBounds()
		layers.current.bounds = bounds
		const sig = geojson.features.map(f => f.properties.id).join(',')
		if (fitted.current !== sig) {
			fitted.current = sig
			if (bounds.isValid()) {
				m.fitBounds(bounds, { padding: [20, 20] })
				if (lock) { const wide = bounds.pad(0.35); m.setMaxBounds(wide); m.setMinZoom(Math.max(m.getBoundsZoom(wide) , 5)) }
			}
		}
	}, [geojson, districtStyle, lock])

	// maktab belgilari
	useEffect(() => {
		const group = layers.current.markers
		if (!group) return
		group.clearLayers()
		layers.current.refs = new Map()
		markers.forEach((mk) => {
			let c
			if (mk.value !== undefined) {
				c = L.marker([mk.lat, mk.lng], { icon: pinIconFor(mk, mk.id === selectedId), riseOnHover: true, zIndexOffset: mk.id === selectedId ? 1000 : 0 })
				c.bindPopup(() => cardNode(mk), { closeButton: true, offset: [0, -14], maxWidth: 280 })
			} else {
				c = L.circleMarker([mk.lat, mk.lng], { radius: mk.radius || 9, color: '#fff', weight: 2, fillColor: mk.color || '#2563eb', fillOpacity: 0.95 })
				c.bindPopup(popupNode(mk.title, mk.subtitle)); c.bindTooltip(textNode(mk.title))
			}
			if (mk.onClick) c.on('click', () => mk.onClick(mk))
			group.addLayer(c)
			layers.current.refs.set(mk.id, c)
		})
		// tuman chegarasi yo'q bo'lsa, xarita maktablar atrofiga yaqinlashadi
		if (lock && !geojson?.features?.length && markers.length && fitted.current !== 'markers') {
			fitted.current = 'markers'
			const bb = L.latLngBounds(markers.map(mk => [mk.lat, mk.lng]))
			layers.current.bounds = bb.pad(0.4)
			map.current?.fitBounds(bb.pad(0.4), { maxZoom: 14 })
		}
	}, [markers, lock, geojson, selectedId])

	// tanlangan maktabning popupini ochish
	useEffect(() => {
		if (!selectedId) return
		const c = layers.current.refs.get(selectedId)
		if (c?.openPopup) setTimeout(() => c.openPopup(), 350)
	}, [selectedId, markers])

	// tanlangan nuqta
	useEffect(() => {
		const m = map.current
		if (!m) return
		if (layers.current.pick) { layers.current.pick.remove(); layers.current.pick = null }
		if (pick?.lat != null && pick?.lng != null) {
			layers.current.pick = L.marker([pick.lat, pick.lng], { icon: pinIcon }).addTo(m)
		}
	}, [pick?.lat, pick?.lng])

	useEffect(() => { map.current?.getContainer().classList.toggle('sm-labels', !!labels || (map.current?.getZoom() ?? 0) >= 12) }, [labels])

	useEffect(() => {
		if (focus && map.current) map.current.setView([focus.lat, focus.lng], focus.zoom || 15)
	}, [focus])

	return <div ref={el} style={{ height }} className={`z-0 w-full overflow-hidden rounded-xl border border-slate-200 ${pick !== null || onPick ? 'cursor-crosshair' : ''} ${className}`} />
}

export default MapView

