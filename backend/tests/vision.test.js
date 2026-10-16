const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret'
const Vision = require('../services/vision.service')

const now = new Date()
const cfg = { restlessAct: 0.6, restlessMinPeople: 8, hallCrowd: 40, emptyMin: 15 }

test('ketma-ket ikki o\'lchovda tez harakat: sinf notinch', () => {
	const f = Vision.evaluate(20, [{ t: now, count: 20, activity: 0.7 }], { n: 25 }, {}, now, { cfg, activity: 0.65, hall: false })
	assert.strictEqual(f.kind, 'vision_restless')
})

test('bir martalik tez harakat hodisa bermaydi', () => {
	assert.strictEqual(Vision.evaluate(20, [{ t: now, count: 20, activity: 0.1 }], { n: 25 }, {}, now, { cfg, activity: 0.9, hall: false }), null)
})

test('zalda tez harakat: tartibsizlik belgisi', () => {
	const f = Vision.evaluate(20, [{ t: now, count: 20, activity: 0.7 }], { n: 0 }, {}, now, { cfg, activity: 0.7, hall: true })
	assert.strictEqual(f.kind, 'vision_commotion')
})

test('zalda odam soni chegaradan oshsa zich to\'planish', () => {
	const f = Vision.evaluate(60, [{ t: now, count: 55 }], { n: 0 }, {}, now, { cfg, hall: true })
	assert.strictEqual(f.kind, 'vision_overcrowd')
})

test('ko\'pchilik tik turgan holat ketma-ket ikki o\'lchovda sinf notinch', () => {
	const st = {}
	const ctx = { cfg, pose: { analyzed: 12, standing: 9 }, activity: 0.1, hall: false }
	assert.strictEqual(Vision.evaluate(14, [{ t: now, count: 14 }], { n: 15 }, st, now, ctx), null)
	assert.strictEqual(Vision.evaluate(14, [{ t: now, count: 14 }], { n: 15 }, st, now, ctx).kind, 'vision_restless')
})

test('ro\'yxatdan ortiq odam', () => {
	const f = Vision.evaluate(30, [{ t: now, count: 30 }], { n: 20 }, {}, now, { cfg, hall: false })
	assert.strictEqual(f.kind, 'vision_overcrowd')
})

// runDevice: bitta kanal "javob bermadi" (OPEN000555) bersa, shu qurilmadagi ishlaydigan kameralar tahlili to'xtamasligi kerak
const BUSY = () => new Error('Hik xatosi: OPEN000555 Device response timeout')
async function runWith(serial, cams, bad) {
	const realSet = global.setTimeout
	global.setTimeout = (fn) => realSet(fn, 0) // qurilma orasidagi pauzalar sinovda kutilmasin
	const seen = []
	const analyze = Vision.analyze
	Vision.analyze = async (cam) => { seen.push(cam.name); if (bad.has(cam.name)) throw BUSY() }
	try { return { stats: await Vision.runDevice(serial, cams), seen, dev: Vision.deviceFor(serial) } } finally { Vision.analyze = analyze; global.setTimeout = realSet }
}

test('nosoz kanallar ishlaydigan kameralarni to\'xtatmaydi', async () => {
	const cams = ['b1', 'b2', 'g1', 'g2'].map((name) => ({ _id: `c-${name}`, name }))
	const { stats, seen, dev } = await runWith('SER-MIXED', cams, new Set(['b1', 'b2']))
	assert.deepStrictEqual(seen, ['b1', 'b2', 'g1', 'g2']) // hammasi urinildi
	assert.strictEqual(stats.ok, 2)
	assert.strictEqual(dev.until, 0, 'qurilma to\'xtatilmagan')
	assert.ok(Vision.failures.get('c-b1') && Vision.failures.get('c-b2'), 'nosoz kameralarga alohida kutish')
	assert.ok(!Vision.failures.get('c-g1'))
})

test('hamma kamera javob bermasa qurilma to\'xtatiladi', async () => {
	const cams = ['a1', 'a2'].map((name) => ({ _id: `c-${name}`, name }))
	const { stats, dev } = await runWith('SER-DOWN', cams, new Set(['a1', 'a2']))
	assert.strictEqual(stats.ok, 0)
	assert.ok(dev.until > Date.now() && dev.kind === 'busy', 'qurilma kutishga qo\'yildi')
})

test('ishlaydigan kameralar oldin tahlil qilinadi', async () => {
	Vision.failures.set('c-x-bad', { n: 2, until: 0 })
	const cams = [{ _id: 'c-x-bad', name: 'bad' }, { _id: 'c-x-good', name: 'good' }]
	const { seen } = await runWith('SER-ORDER', cams, new Set())
	assert.deepStrictEqual(seen, ['good', 'bad'])
})
