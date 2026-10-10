// Server javob xabarlarini (o'zbek-lotin) yig'adi: controllers/, services/, routes/, middlewares/, utils/ va index.js.
// Natija: locales/_server-messages.json (takrorsiz, apostroflar ' ga keltirilgan, tartiblangan massiv).
// Ishlatish: node scripts/extractServerMessages.js
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DIRS = ['controllers', 'services', 'routes', 'middlewares', 'utils']
const norm = (s) => s.replace(/[ʻʼ‘’`´]/g, "'")

function walk(dir, out = []) {
	for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, f.name)
		if (f.isDirectory()) walk(p, out)
		else if (f.name.endsWith('.js') && !/^(i18n|botI18n)\.js$/.test(f.name)) out.push(p)
	}
	return out
}

// pos dan boshlab bitta satr/shablon literalini o'qiydi: { value, end } yoki null
function readString(src, pos) {
	const q = src[pos]
	if (q !== "'" && q !== '"' && q !== '`') return null
	let i = pos + 1, val = ''
	while (i < src.length) {
		const c = src[i]
		if (c === '\\') { const n = src[i + 1]; val += n === 'n' ? '\n' : n; i += 2; continue }
		if (q === '`' && c === '$' && src[i + 1] === '{') { // ${expr} -> {{expr}}
			let d = 1, j = i + 2
			while (j < src.length && d > 0) { if (src[j] === '{') d++; else if (src[j] === '}') d--; j++ }
			const expr = src.slice(i + 2, j - 1).trim().replace(/[^\w.]+/g, '_').replace(/^_+|_+$/g, '')
			val += `{{${expr.split('.').pop() || 'x'}}}`
			i = j; continue
		}
		if (c === q) return { value: val, end: i + 1 }
		if (c === '\n' && q !== '`') return null
		val += c; i++
	}
	return null
}

// Ifoda (vergul/yopuvchi qavs bo'yicha depth 0 gacha) ichidagi barcha satr literallarini yig'adi
function exprStrings(src, pos) {
	const out = []
	let depth = 0, i = pos
	while (i < src.length) {
		const c = src[i]
		if (c === "'" || c === '"' || c === '`') {
			const s = readString(src, i)
			if (!s) { i++; continue }
			out.push(s.value); i = s.end; continue
		}
		if (c === '(' || c === '[' || c === '{') depth++
		else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth-- }
		else if (c === ',' && depth === 0) break
		else if (c === '\n' && depth === 0 && !/[?:+&|]\s*$/.test(src.slice(Math.max(0, i - 3), i))) {
			// keyingi qator ? : bilan davom etmasa ifoda tugagan
			if (!/^\s*[?:+]/.test(src.slice(i + 1, i + 40))) break
		}
		i++
	}
	return out
}

// Foydalanuvchiga ko'rinadigan matn: kamida bitta harf va (bo'sh joy yoki lotin harf+apostrof...). Texnik tokenlarni (snake/kebab/kod) chiqarib tashlaydi
function looksHuman(s) {
	const t = s.trim()
	if (t.length < 3) return false
	if (!/[A-Za-zА-Яа-яЎўҚқҒғҲҳ]/.test(t)) return false
	if (/^[\w./:#@%{}\-$]+$/.test(t) && !/\s/.test(t)) return /^[A-Z][a-z']+$/.test(t) // bitta so'z faqat Bosh harfli bo'lsa
	if (/^(https?:|\/|\.\/|\^|\[)/.test(t)) return false
	return true
}

const SKIP = new Set(['Google', 'server error', 'Server error', 'Authorization', 'Bearer'])
const PATTERNS = [/\bmessage\s*:\s*/g, /\bmessage\s*=\s*/g, /\berror\s*:\s*/g, /\bnew\s+(?:\w*)?Error\(\s*/g, /\bthrow\s+(?=['"`])/g, /\breason\s*:\s*/g, /\bdetail\s*:\s*/g, /\btitle\s*:\s*/g, /\bevidence\s*:\s*/g, /\blabel\s*:\s*/g, /\bnote\s*:\s*/g, /\bdesc\s*:\s*/g, /\bgroup\s*:\s*/g, /\bvalue\s*:\s*(?=['"`])/g, /\bhint\s*:\s*/g]

function extract(file) {
	const src = fs.readFileSync(file, 'utf8')
	const found = []
	for (const re of PATTERNS) {
		re.lastIndex = 0
		let m
		while ((m = re.exec(src))) for (const s of exprStrings(src, m.index + m[0].length)) found.push(s)
	}
	return found
}

function run() {
	const files = [path.join(ROOT, 'index.js'), ...DIRS.flatMap((d) => (fs.existsSync(path.join(ROOT, d)) ? walk(path.join(ROOT, d)) : []))]
	const set = new Set()
	for (const f of files) for (const s of extract(f)) { const n = norm(s).replace(/\s+$/g, ''); if (looksHuman(n) && !SKIP.has(n) && !/^\{\{(v|name)\}\}: \{\{/.test(n) && !/^\{\{v\}\}: /.test(n) && !/^(\{\{[^}]+\}\}\s*)+$/.test(n)) set.add(n) }
	const out = [...set].sort((a, b) => a.localeCompare(b))
	fs.mkdirSync(path.join(ROOT, 'locales'), { recursive: true })
	fs.writeFileSync(path.join(ROOT, 'locales', '_server-messages.json'), JSON.stringify(out, null, '\t') + '\n')
	console.log(`${out.length} ta xabar -> locales/_server-messages.json`)
	return out
}

if (require.main === module) run()
module.exports = { run, extract }
