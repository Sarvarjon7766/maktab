const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
const HP = require('../services/hik.person.service')
const { splitName, isMissing } = HP._internals

test('personCode: 16 belgi, harf/raqam, barqaror va maktabga bog\'liq', async () => {
	const school = { _id: 'school1' }
	const a = await HP.codeFor(school, 'acc', '6ac4edb7cfccf441c96cba77')
	assert.match(a, /^[0-9a-f]{16}$/)
	assert.strictEqual(a, await HP.codeFor(school, 'acc', '6ac4edb7cfccf441c96cba77'))
	assert.notStrictEqual(a, await HP.codeFor({ _id: 'school2' }, 'acc', '6ac4edb7cfccf441c96cba77'))
	await assert.rejects(HP.codeFor(school, 'acc', ''))
})

test('ism: familiya birinchi so\'z, qolgani ism', () => {
	assert.deepStrictEqual(splitName('Abdullayev Ali Valiyevich'), { lastName: 'Abdullayev', firstName: 'Ali Valiyevich' })
	assert.deepStrictEqual(splitName('  Karimov   Bobur '), { lastName: 'Karimov', firstName: 'Bobur' })
	assert.deepStrictEqual(splitName('Madonna'), { firstName: 'Madonna', lastName: '' })
})

test('"shaxs topilmadi" xatolari o\'chirishda muvaffaqiyat hisoblanadi', () => {
	assert.ok(isMissing(new Error('Hik xatosi: CCF038063 No person matched search conditions.{CCF038063}')))
	assert.ok(isMissing(new Error('Hik xatosi: CCF038023 Person is not existed.{CCF038023}')))
	assert.ok(!isMissing(new Error('Hik xatosi: OPEN000010 param valid error')))
})
