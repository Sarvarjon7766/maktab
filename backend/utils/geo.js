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
	const first = geometry.type === 'Polygon' ? geometry.coordinates[0][0] : geometry.coordinates[0][0][0]
	return { lat: first[1], lng: first[0] }
}
// GeoJSON Feature/Geometry'dan geometriya oladi va tekshiradi
function normalizeGeometry(input) {
	const g = input?.type === 'Feature' ? input.geometry : input?.type === 'FeatureCollection' ? input.features?.[0]?.geometry : input
	if (!g || !['Polygon', 'MultiPolygon'].includes(g.type) || !Array.isArray(g.coordinates)) return null
	return g
}
module.exports = { pointInGeometry, bboxOf, centerOf, normalizeGeometry }
