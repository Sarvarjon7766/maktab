const test = require('node:test')
const assert = require('node:assert')
const { classify, tally } = require('../ai/pose')

// 17 ta COCO nuqtasi: berilmaganlari ishonchsiz (c=0)
const kp = (over = {}) => {
	const base = Array.from({ length: 17 }, () => ({ x: 0, y: 0, c: 0 }))
	for (const [i, p] of Object.entries(over)) base[Number(i)] = { c: 0.9, ...p }
	return base
}
const box = { x1: 100, y1: 100, x2: 200, y2: 260 }
// o'tirgan, yuzi kameraga: burun yelkadan baland, ikkala ko'z ko'rinadi
const seatedFront = { 0: { x: 150, y: 120 }, 1: { x: 140, y: 112 }, 2: { x: 160, y: 112 }, 5: { x: 120, y: 160 }, 6: { x: 180, y: 160 } }

test('o\'tirgan, yuzi ko\'rinadigan odam: tik turgan ham, boshi egilgan ham emas', () => {
	const s = classify(kp(seatedFront), box)
	assert.strictEqual(s.posture, 'seated')
	assert.strictEqual(s.facing, 'front')
	assert.strictEqual(s.headDown, false)
	assert.strictEqual(s.handRaised, false)
})

test('burun yelka chizig\'iga yaqin bo\'lsa boshi egilgan', () => {
	const s = classify(kp({ ...seatedFront, 0: { x: 150, y: 150 } }), box)
	assert.strictEqual(s.headDown, true)
})

test('bilak ko\'z va yelkadan yuqorida bo\'lsa qo\'l ko\'tarilgan', () => {
	const s = classify(kp({ ...seatedFront, 10: { x: 185, y: 90 } }), box)
	assert.strictEqual(s.handRaised, true)
})

test('bilak yelka pastida bo\'lsa qo\'l ko\'tarilmagan', () => {
	assert.strictEqual(classify(kp({ ...seatedFront, 10: { x: 185, y: 200 } }), box).handRaised, false)
})

test('tizza sondan ancha pastda va quti baland bo\'lsa tik turgan', () => {
	const s = classify(kp({ ...seatedFront, 11: { x: 130, y: 200 }, 12: { x: 170, y: 200 }, 13: { x: 130, y: 250 }, 14: { x: 170, y: 250 } }), { x1: 100, y1: 100, x2: 190, y2: 300 })
	assert.strictEqual(s.posture, 'standing')
})

test('yuz nuqtalari ko\'rinmasa orqasi bilan', () => {
	const s = classify(kp({ 5: { x: 120, y: 160 }, 6: { x: 180, y: 160 } }), box)
	assert.strictEqual(s.facing, 'back')
})

test('tally eski bazadagi nomlar bilan sanaydi', () => {
	const c = tally([{ posture: 'standing', facing: 'back', headDown: true, handRaised: true }, { posture: 'seated', facing: 'side', headDown: false, handRaised: false }, null])
	assert.deepStrictEqual(c, { analyzed: 2, seated: 1, standing: 1, backTurned: 1, sideTurned: 1, headDown: 1, raised: 1 })
})
