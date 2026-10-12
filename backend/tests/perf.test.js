const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
const { fresh } = require('../utils/ttlCache')
const { AI_THREADS } = require('../ai/threads')

test('fresh: TTL ichida bir xil so\'rov bitta hisob-kitobni baham ko\'radi', async () => {
	let calls = 0
	const fn = fresh(50, async () => { calls++; return { n: calls } }, (req) => req.k)
	const a = await Promise.all([fn({ k: 'x' }), fn({ k: 'x' }), fn({ k: 'x' })])
	assert.strictEqual(calls, 1)
	assert.deepStrictEqual(a.map(x => x.n), [1, 1, 1])
	await fn({ k: 'y' })
	assert.strictEqual(calls, 2) // boshqa kalit alohida
})

test('fresh: TTL o\'tgach eskirgan natija qaytarilmaydi', async () => {
	let calls = 0
	const fn = fresh(20, async () => ++calls, () => 'k')
	assert.strictEqual(await fn({}), 1)
	await new Promise(r => setTimeout(r, 40))
	assert.strictEqual(await fn({}), 2)
})

test('fresh: xato keshlanmaydi', async () => {
	let calls = 0
	const fn = fresh(1000, async () => { calls++; if (calls === 1) throw new Error('x'); return 'ok' }, () => 'e')
	await assert.rejects(fn({}))
	await new Promise(r => setImmediate(r))
	assert.strictEqual(await fn({}), 'ok')
})

test('AI oqimlari soni yadrolardan oshmaydi va kamida 1', () => {
	assert.ok(AI_THREADS >= 1 && AI_THREADS <= require('os').cpus().length)
})
