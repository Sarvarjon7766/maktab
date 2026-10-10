// Maktab Hik-Connect kalitlarini bazada ochiq matnda saqlamaslik uchun
// AES-256-GCM shifrlash. Kalit HIK_SECRETS_KEY (ixtiyoriy) yoki JWT_SECRET'dan olinadi.
// DIQQAT: shu kalit o'zgarsa, saqlangan Hik kalitlarini qayta kiritish kerak bo'ladi.
const crypto = require('crypto')

const key = () => {
	const secret = process.env.HIK_SECRETS_KEY || process.env.JWT_SECRET
	if (!secret) throw new Error("HIK_SECRETS_KEY yoki JWT_SECRET o'rnatilmagan: shifrlash kaliti yo'q")
	return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(text) {
	const iv = crypto.randomBytes(12)
	const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
	const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()])
	return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join(':')
}

function decrypt(payload) {
	if (!payload) return ''
	const [iv, tag, enc] = payload.split(':').map(p => Buffer.from(p, 'base64'))
	const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
