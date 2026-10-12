const test = require('node:test')
const assert = require('node:assert')
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret'
const { loginLimiter } = require('../middlewares/security')
const { sign, signedUrl } = require('../utils/uploadsAuth')

const fakeRes = () => {
	const res = { headers: {}, code: 200, body: null }
	res.setHeader = (k, v) => { res.headers[k] = v }
	res.status = (c) => { res.code = c; return res }
	res.json = (b) => { res.body = b; return res }
	return res
}
const attempt = (ok) => {
	const req = { ip: '10.0.0.1', body: { username: 'ali' }, socket: {} }
	const res = fakeRes()
	let passed = false
	loginLimiter(req, res, () => { passed = true })
	if (passed) res.json({ success: ok })
	return res
}

test('11-chi noto\'g\'ri login urinishi bloklanadi (429)', () => {
	for (let i = 0; i < 10; i++) assert.notStrictEqual(attempt(false).code, 429)
	assert.strictEqual(attempt(false).code, 429)
})

test('imzo deterministik va fayl nomiga bog\'liq', () => {
	assert.strictEqual(sign('a.jpg'), sign('a.jpg'))
	assert.notStrictEqual(sign('a.jpg'), sign('b.jpg'))
	assert.match(signedUrl('http://x/uploads/', 'a b.jpg'), /^http:\/\/x\/uploads\/a%20b\.jpg\?sig=[0-9a-f]{32}$/)
})
