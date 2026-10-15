// Oddiy geografik yordamchilar (GeoJSON: koordinatalar [lng, lat])
const ringContains = (ring, x, y) => {
	let inside = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i], [xj, yj] = ring[j]
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
	}
	return inside
}
// Nuqta Polygon yoki MultiPolygon ichidami (teshiklar hisobga olinadi)
function pointInGeometry(lng, lat, geometry) {
	if (!geometry?.coordinates) return false
	const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : []
	return polys.some(([outer, ...holes]) => outer && ringContains(outer, lng, lat) && !holes.some(h => ringContains(h, lng, lat)))
}
function bboxOf(geometry) {
	let minX = 180, minY = 90, maxX = -180, maxY = -90
	const walk = (c) => { if (typeof c[0] === 'number') { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]) } else c.forEach(walk) }
	walk(geometry.coordinates || [])
	return [minX, minY, maxX, maxY]
}
// Eng katta ko'pburchak bo'yicha taxminiy markaz (bbox markazi, ichida bo'lmasa — birinchi nuqta)
function centerOf(geometry) {
	const [a, b, c, d] = bboxOf(geometry)
	const lng = (a + c) / 2, lat = (b + d) / 2
	if (pointInGeometry(lng, lat, geometry)) return { lat, lng }
	const first = geometry.type === 'Polygon' ? geometry.coordinates?.[0]?.[0] : geometry.coordinates?.[0]?.[0]?.[0]
	return first ? { lat: first[1], lng: first[0] } : { lat: lat, lng: lng }
}
// ---- GeoJSON'ni o'qish va tekshirish (har qanday viloyat/tuman fayli uchun) ----
const MAX_POINTS = Number(process.env.GEO_MAX_POINTS) || 40000 // shundan ko'p nuqta bo'lsa chegara soddalashtiriladi (xarita va baza yengil bo'lsin)
const round6 = (n) => Math.round(n * 1e6) / 1e6 // ~0.1 m aniqlik

// Koordinatalar massivining chuqurligi: nuqta [x,y] = 1, halqa = 2, ko'pburchak (halqalar) = 3, ko'p ko'pburchak = 4
function depthOf(a) {
	let d = 0
	let x = a
	while (Array.isArray(x)) { d++; x = x.find((e) => Array.isArray(e) || typeof e === 'number'); if (x === undefined) break }
	return d
}
// Haqiqiy chuqurlikka qarab ko'pburchaklar ro'yxatiga aylantiradi. Real fayllarda «MultiPolygon» deb yozilgan, lekin koordinatalari Polygon chuqurligida
// (yoki aksincha) bo'lishi tez-tez uchraydi: e'lon qilingan turga emas, tuzilishiga ishonamiz
function coordsToPolygons(c) {
	const d = depthOf(c)
	if (d === 2) return [[c]]
	if (d === 3) return [c]
	if (d === 4) return c.filter(Array.isArray)
	if (d > 4) return c.filter(Array.isArray).flatMap(coordsToPolygons)
	return []
}

// Fayl ichidagi barcha Polygon/MultiPolygon'larni yig'adi: Feature, FeatureCollection (hamma obyektlar), GeometryCollection, oddiy geometriya.
// Qaytaradi { polygons: [ [ring, ring...] ... ], seen: ['Point', ...] } — seen: uchragan turlar (xato xabari uchun)
function collectPolygons(input, out = { polygons: [], seen: new Set() }, depth = 0) {
	if (!input || typeof input !== 'object' || depth > 6) return out
	const t = input.type
	if (t) out.seen.add(t)
	if (t === 'FeatureCollection') (input.features || []).forEach((f) => collectPolygons(f, out, depth + 1))
	else if (t === 'Feature') collectPolygons(input.geometry, out, depth + 1)
	else if (t === 'GeometryCollection') (input.geometries || []).forEach((g) => collectPolygons(g, out, depth + 1))
	else if ((t === 'Polygon' || t === 'MultiPolygon') && Array.isArray(input.coordinates)) out.polygons.push(...coordsToPolygons(input.coordinates))
	return out
}

// Douglas–Peucker (iterativ): halqa nuqtalarini tolerance (daraja) bo'yicha siyraklashtiradi
function simplifyRing(ring, tol) {
	if (ring.length <= 5) return ring
	const keep = new Uint8Array(ring.length)
	keep[0] = keep[ring.length - 1] = 1
	const stack = [[0, ring.length - 1]]
	const sq = tol * tol
	while (stack.length) {
		const [a, b] = stack.pop()
		let maxD = 0, idx = -1
		const [ax, ay] = ring[a], [bx, by] = ring[b]
		const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
		for (let k = a + 1; k < b; k++) {
			const [px, py] = ring[k]
			let d
			if (len2 === 0) d = (px - ax) ** 2 + (py - ay) ** 2
			else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)); d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2 }
			if (d > maxD) { maxD = d; idx = k }
		}
		if (maxD > sq && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]) }
	}
	const out = ring.filter((_, k) => keep[k])
	return out.length >= 4 ? out : ring
}

// Geometriyani tekshirib, tozalab qaytaradi: { geometry } yoki { error }. Barcha obyektlar bitta MultiPolygon bo'lib birlashadi,
// balandlik (3-koordinata) olib tashlanadi, koordinatalar 6 xonagacha yaxlitlanadi, juda katta bo'lsa soddalashtiriladi
function parseGeometry(input) {
	if (!input || typeof input !== 'object') return { error: "Fayl GeoJSON obyekti bo'lishi kerak" }
	const { polygons, seen } = collectPolygons(input)
	if (!polygons.length) {
		const kinds = [...seen].filter((k) => !['FeatureCollection', 'Feature', 'GeometryCollection'].includes(k))
		return { error: `GeoJSON ichida Polygon yoki MultiPolygon topilmadi${kinds.length ? ` (faylda: ${kinds.join(', ')})` : ''}. Chegara ko'pburchak bo'lishi kerak` }
	}
	const cleanPolys = []
	let points = 0
	for (const poly of polygons) {
		if (!Array.isArray(poly)) continue
		const rings = []
		for (const raw of poly) {
			if (!Array.isArray(raw)) continue
			const ring = []
			for (const pos of raw) {
				if (!Array.isArray(pos) || pos.length < 2) continue
				const x = Number(pos[0]), y = Number(pos[1])
				if (!Number.isFinite(x) || !Number.isFinite(y)) continue
				if (Math.abs(x) > 180 || Math.abs(y) > 90) return { error: "Koordinatalar WGS84 (uzunlik/kenglik, EPSG:4326) bo'lishi kerak. Fayldagi qiymatlar boshqa proyeksiyada (metr) ko'rinadi: QGIS/mapshaper'da EPSG:4326 ga o'tkazing" }
				const p = [round6(x), round6(y)]
				const last = ring[ring.length - 1]
				if (!last || last[0] !== p[0] || last[1] !== p[1]) ring.push(p)
			}
			if (ring.length >= 3) {
				const f = ring[0], l = ring[ring.length - 1]
				if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]]) // halqani yopamiz
			}
			if (ring.length >= 4) rings.push(ring)
		}
		if (rings.length) { cleanPolys.push(rings); points += rings.reduce((a, r) => a + r.length, 0) }
	}
	if (!cleanPolys.length) return { error: "Chegarada yaroqli ko'pburchak yo'q (har bir halqada kamida 3 ta nuqta bo'lishi kerak)" }
	let result = cleanPolys
	let simplified = false
	if (points > MAX_POINTS) {
		// tolerance'ni ikki baravar oshirib, nuqtalar soni chegaradan pastga tushguncha soddalashtiramiz
		let tol = 0.00001
		for (let step = 0; step < 12; step++) {
			result = cleanPolys.map((rings) => rings.map((r) => simplifyRing(r, tol)))
			points = result.reduce((a, rings) => a + rings.reduce((b, r) => b + r.length, 0), 0)
			if (points <= MAX_POINTS) break
			tol *= 2
		}
		simplified = true
	}
	const geometry = result.length === 1 ? { type: 'Polygon', coordinates: result[0] } : { type: 'MultiPolygon', coordinates: result }
	return { geometry, points, simplified, parts: result.length }
}

// Eski nom (null qaytaradi, xatoda)
function normalizeGeometry(input) {
	const r = parseGeometry(input)
	return r.geometry || null
}
module.exports = { pointInGeometry, bboxOf, centerOf, normalizeGeometry, parseGeometry }
