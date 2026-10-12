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
