const test = require('node:test')
const assert = require('node:assert')
const geo = require('../utils/geo')

const square = (x, y, s = 1) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]

test('parseGeometry: bitta Feature Polygon bo\'lib qoladi', () => {
	const r = geo.parseGeometry({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [square(66, 38)] } })
	assert.equal(r.geometry.type, 'Polygon')
	assert.equal(r.parts, 1)
})

test('parseGeometry: FeatureCollection\'dagi hamma qismlar bitta MultiPolygon bo\'ladi (faqat birinchisi emas)', () => {
	const r = geo.parseGeometry({ type: 'FeatureCollection', features: [
		{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [square(66, 38)] } },
		{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[square(67, 38)], [square(68, 38)]] } }
	] })
	assert.equal(r.geometry.type, 'MultiPolygon')
	assert.equal(r.parts, 3)
})

test('parseGeometry: GeometryCollection va balandlik (3-koordinata)', () => {
	const r = geo.parseGeometry({ type: 'GeometryCollection', geometries: [{ type: 'Polygon', coordinates: [square(66, 38).map(([x, y]) => [x, y, 500])] }] })
	assert.equal(r.geometry.coordinates[0][0].length, 2)
})

test('parseGeometry: ochiq halqa yopiladi, 3 nuqtadan kam halqa tashlanadi', () => {
	const r = geo.parseGeometry({ type: 'Polygon', coordinates: [[[66, 38], [67, 38], [67, 39], [66, 39]], [[66.1, 38.1], [66.2, 38.1]]] })
	assert.equal(r.geometry.coordinates.length, 1)
	const ring = r.geometry.coordinates[0]
	assert.deepEqual(ring[0], ring[ring.length - 1])
})

test('parseGeometry: tushunarli xato xabarlari', () => {
	assert.match(geo.parseGeometry({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [66, 38] } }] }).error, /Polygon yoki MultiPolygon topilmadi.*Point/)
	assert.match(geo.parseGeometry({ type: 'Polygon', coordinates: [[[500000, 4200000], [500100, 4200000], [500100, 4200100], [500000, 4200000]]] }).error, /WGS84/)
	assert.ok(geo.parseGeometry(null).error)
	assert.match(geo.parseGeometry({ type: 'Polygon', coordinates: [[[66, 38], [67, 38]]] }).error, /yaroqli ko'pburchak yo'q/)
})

test('parseGeometry: juda katta chegara soddalashtiriladi, shakl saqlanadi', () => {
	const N = 120000
	const ring = Array.from({ length: N }, (_, i) => { const a = (i / N) * 2 * Math.PI; return [66 + Math.cos(a) * 0.5, 38 + Math.sin(a) * 0.5] })
	ring.push(ring[0])
	const r = geo.parseGeometry({ type: 'Polygon', coordinates: [ring] })
	assert.equal(r.simplified, true)
	assert.ok(r.points <= 40000, `nuqtalar: ${r.points}`)
	const [minX, minY, maxX, maxY] = geo.bboxOf(r.geometry)
	assert.ok(Math.abs(minX - 65.5) < 0.01 && Math.abs(maxX - 66.5) < 0.01 && Math.abs(minY - 37.5) < 0.01 && Math.abs(maxY - 38.5) < 0.01)
})

test('centerOf va pointInGeometry: ko\'p qismli geometriyada ishlaydi', () => {
	const r = geo.parseGeometry({ type: 'MultiPolygon', coordinates: [[square(66, 38)], [square(70, 38)]] })
	assert.ok(geo.pointInGeometry(66.5, 38.5, r.geometry))
	assert.ok(!geo.pointInGeometry(68.5, 38.5, r.geometry))
	const c = geo.centerOf(r.geometry)
	assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lng))
})

test('parseGeometry: «MultiPolygon» deb yozilgan, lekin Polygon chuqurligidagi koordinatalar (real fayllarda uchraydi)', () => {
	const r = geo.parseGeometry({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [square(66, 38)] } })
	assert.equal(r.error, undefined)
	assert.equal(r.geometry.type, 'Polygon')
	assert.equal(r.points, 5)
	assert.ok(geo.pointInGeometry(66.5, 38.5, r.geometry))
})

test('parseGeometry: «Polygon» deb yozilgan, lekin ko\'p qismli (4 daraja) koordinatalar', () => {
	const r = geo.parseGeometry({ type: 'Polygon', coordinates: [[square(66, 38)], [square(68, 38)]] })
	assert.equal(r.geometry.type, 'MultiPolygon')
	assert.equal(r.parts, 2)
})

test('parseGeometry: bo\'sh koordinatalar tushunarli xato beradi', () => {
	assert.ok(geo.parseGeometry({ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [] } }).error)
})
