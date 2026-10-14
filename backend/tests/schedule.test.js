const test = require('node:test')
const assert = require('node:assert')
const s = require('../ai/schedule')

const cls = { _id: 'c1', sinfId: 's1' }
const hall = { _id: 'h1', sinfId: null }
const gate = { _id: 'g1', sinfId: null, faceDirection: 'out' }

test('tierOf: kamera turi', () => {
	assert.equal(s.tierOf(cls), 'class')
	assert.equal(s.tierOf(hall), 'hall')
	assert.equal(s.tierOf(gate), 'gate')
	assert.equal(s.tierOf({ _id: 'x', sinfId: 's1', faceDirection: 'out' }), 'class') // sinfga biriktirilgan kamera darvoza bo'la olmaydi
})

test('intervalMs: sozlanmagan bo\'lsa umumiy oraliq (oldingi xatti-harakat)', () => {
	for (const c of [cls, hall, gate]) assert.equal(s.intervalMs(c, {}, 60000), 60000)
	assert.equal(s.intervalMs(gate, { gateIntervalSec: 20 }, 60000), 20000)
	assert.equal(s.intervalMs(cls, { gateIntervalSec: 20, classIntervalSec: 240 }, 60000), 240000)
	assert.equal(s.intervalMs(gate, { gateIntervalSec: 2 }, 60000), 10000) // pastki chegara 10 s
})

test('tickMs: eng qisqa oraliq, sozlanmasa umumiy', () => {
	assert.equal(s.tickMs({}, 60000), 60000)
	assert.equal(s.tickMs({ gateIntervalSec: 20, classIntervalSec: 240 }, 60000), 20000)
	assert.equal(s.tickMs({ classIntervalSec: 300 }, 60000), 60000) // umumiydan uzun oraliq siklni sekinlashtirmaydi
})

test('selectDue: navbati kelganlar, yangi kamera darhol, yuklamada faqat darvoza', () => {
	const cfg = { gateIntervalSec: 20, classIntervalSec: 240 }
	const now = 1_000_000
	const lastAt = new Map([['c1', now - 100000], ['g1', now - 25000], ['h1', now - 70000]])
	const due = s.selectDue([cls, hall, gate], { now, lastAt, cfg, baseMs: 60000 }).map((c) => c._id)
	assert.deepEqual(due.sort(), ['g1', 'h1']) // sinfxona (240 s) hali kelmagan; darvoza (20 s) va zal (60 s) kelgan
	assert.deepEqual(s.selectDue([cls, hall, gate], { now, lastAt: new Map(), cfg, baseMs: 60000 }).map((c) => c._id).sort(), ['c1', 'g1', 'h1']) // hech tahlil qilinmagan
	assert.deepEqual(s.selectDue([cls, hall, gate], { now, lastAt: new Map(), cfg, baseMs: 60000, shed: true }).map((c) => c._id), ['g1']) // yuklangan tizim
})

test('selectDue: oraliqdan 2 s oldin ham navbat keladi (sikl kechikishi navbatni surmasin)', () => {
	const now = 500000
	assert.equal(s.selectDue([gate], { now, lastAt: new Map([['g1', now - 18500]]), cfg: { gateIntervalSec: 20 }, baseMs: 60000 }).length, 1)
	assert.equal(s.selectDue([gate], { now, lastAt: new Map([['g1', now - 15000]]), cfg: { gateIntervalSec: 20 }, baseMs: 60000 }).length, 0)
})
