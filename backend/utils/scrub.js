// Federatsiya javoblaridan maxfiy maydonlarni chuqur olib tashlaydi: parol, token, API kalit va h.k. hech qachon tuman serveridan chiqmasin.
// Kalit nomi so'zlarga bo'linadi (camelCase / snake_case) va maxfiy so'z bo'lsa, qiymatidan qat'i nazar o'chiriladi.
// So'zma-so'z solishtirish: "dashboard" kabi nomlar xato ushlanmaydi.
const WORDS = new Set(['password', 'pass', 'passwd', 'pwd', 'secret', 'token', 'apikey', 'appkey', 'appsecret', 'hash', 'salt', 'credential', 'credentials', 'authorization', 'cookie', 'telegram', 'bot', 'otp', 'jwt'])

const wordsOf = (key) => String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
const isSensitive = (key) => {
	const w = wordsOf(key)
	if (w.some((x) => WORDS.has(x))) return true
	const joined = w.join('')
	return joined.includes('apikey') || joined.includes('appkey') || joined.includes('secretkey')
}

function scrub(value, depth = 0) {
	if (depth > 12) return value
	if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1))
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		// ObjectId, Decimal128 kabi turlar o'zining toJSON'i bilan seriyalanadi (aks holda ichki `buffer` maydoni oddiy obyekt bo'lib chiqib, id buziladi)
		if (typeof value.toJSON === 'function') { const j = value.toJSON(); return j && typeof j === 'object' ? scrub(j, depth + 1) : j }
		const out = {}
		for (const [k, v] of Object.entries(value)) {
			if (isSensitive(k)) continue
			out[k] = scrub(v, depth + 1)
		}
		return out
	}
	return value
}

module.exports = { scrub, isSensitive }
