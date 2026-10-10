// Barcha tx("...") / tk("...") kalitlarini yig'adi va tarjima qamrovini tekshiradi.
//   node scripts/i18n-extract.mjs            — src/locales/_keys.json ni yangilaydi
//   node scripts/i18n-extract.mjs --check    — ru/en lug'atlarida yo'q kalitlarni ko'rsatadi
//   node scripts/i18n-extract.mjs --missing  — yo'q kalitlarni src/locales/_missing-ru.json va _missing-en.json ga yozadi
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

const SRC = path.resolve('src')
const LOC = path.join(SRC, 'locales')
const norm = (s) => String(s).replace(/[ʻʼ‘’`´]/g, "'")
const files = []
const walkDir = (d) => {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (['i18n', 'locales', 'node_modules'].includes(e.name)) continue
		const p = path.join(d, e.name)
		if (e.isDirectory()) walkDir(p); else if (/\.(jsx|js)$/.test(e.name)) files.push(p)
	}
}
walkDir(SRC)

const keys = new Map() // kalit → [fayllar]
const EXCEL_RE = /exportXlsx|downloadWorkbook|buildWorkbook|XLSX\.|aoa_to_sheet|json_to_sheet|reportCatalog/
const SKIP_VAL_KEYS = new Set(['className', 'color', 'fill', 'stroke', 'type', 'id', 'dataKey', 'kind', 'tone', 'bar', 'chip', 'icon', 'path', 'to', 'key', 'value', 'role', 'scope', 'group', 'font', 'style', 'bg', 'text', 'border', 'ring', 'accent'])
const letters = (v) => (v.match(/\p{L}/gu) || []).length
const textual = (v) => letters(v) >= 2 && !/^(https?:|\/|#|\.)/.test(v) && !/^[a-z][a-zA-Z0-9_]*$/.test(v) && !/^[\w\-:/[\]#%.!]+$/.test(v)
const dynamic = []
for (const file of files) {
	const code = fs.readFileSync(file, 'utf8')
	let ast
	try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }) } catch { continue }
	const rel = path.relative(SRC, file).replace(/\\/g, '/')
	const isExcel = EXCEL_RE.test(code)
	const cand = []
	const dynBefore = dynamic.length
	const addKey = (k) => { k = norm(k); (keys.get(k) || keys.set(k, []).get(k)).push(rel) }
	const visit = (node) => {
		if (!node || typeof node.type !== 'string') return
		// Excel/hisobot fayllarida: qator ob'ektlarining kalitlari va qat'iy satr qiymatlari ham tarjima kaliti
		if (isExcel && node.type === 'ObjectProperty' && !node.computed) {
			const kn = node.key.type === 'StringLiteral' ? node.key.value : node.key.type === 'Identifier' ? node.key.name : null
			if (kn && textual(kn) && (node.key.type === 'StringLiteral' || /^[A-ZА-Я]/.test(kn))) addKey(kn)
			if (node.value.type === 'StringLiteral' && !SKIP_VAL_KEYS.has(kn) && textual(node.value.value) && /[A-ZА-Яa-z]/.test(node.value.value) && (/\s/.test(node.value.value) || /^[A-Z]/.test(node.value.value))) addKey(node.value.value)
		}
		// tx(o'zgaruvchi) chaqiruvlari bor fayllarda: matnga o'xshash barcha satrlar nomzod kalit (ortiqchasi zarar qilmaydi)
		if (node.type === 'StringLiteral' && textual(node.value) && (/\s/.test(node.value) || /^[A-ZА-Я]/.test(node.value)) && !/^[a-z]+(-[a-z0-9]+)+/.test(node.value)) cand.push(node.value)
		if (node.type === 'JSXAttribute') return visitAttr(node)
		if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && (node.callee.name === 'tx' || node.callee.name === 'tk')) {
			const a = node.arguments[0]
			if (a?.type === 'StringLiteral') { const k = norm(a.value); (keys.get(k) || keys.set(k, []).get(k)).push(rel) }
			else if (a?.type === 'TemplateLiteral' && a.expressions.length === 0) { const k = norm(a.quasis[0].value.cooked); (keys.get(k) || keys.set(k, []).get(k)).push(rel) }
			else if (a) dynamic.push(`${rel}:${node.loc.start.line}`)
		}
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'start' || key === 'end') continue
			const v = node[key]
			if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v)
		}
	}
	const visitAttr = (node) => { if (node.value?.type === 'JSXExpressionContainer') visit(node.value.expression); if (node.value?.type === 'StringLiteral' && !['className', 'style', 'to', 'href', 'src', 'id', 'type', 'key', 'name'].includes(node.name.name)) { /* atribut matnlari tx bilan o'ralgan bo'ladi */ } }
	visit(ast.program)
	if (dynamic.length > dynBefore) cand.forEach(addKey)
}

// Server xabarlari (backend/locales/_server-messages.json) ham kalit hisoblanadi
let server = []
try { server = JSON.parse(fs.readFileSync(path.resolve('../backend/locales/_server-messages.json'), 'utf8')).map(norm) } catch { /* hali yo'q */ }
const all = [...new Set([...keys.keys(), ...server])].sort((a, b) => a.localeCompare(b, 'uz'))
fs.mkdirSync(LOC, { recursive: true })
fs.writeFileSync(path.join(LOC, '_keys.json'), JSON.stringify(all, null, 1))
console.log(`Kalitlar: ${keys.size} (kodda) + ${server.length} (server xabarlari) = ${all.length}; dinamik (tahlil qilib bo'lmaydigan) chaqiruvlar: ${dynamic.length}`)
if (dynamic.length) console.log('  dinamik:', dynamic.slice(0, 15).join(', '))

if (process.argv.includes('--check') || process.argv.includes('--missing')) {
	for (const lng of ['ru', 'en']) {
		let dict = {}
		try { dict = JSON.parse(fs.readFileSync(path.join(LOC, `${lng}.json`), 'utf8')) } catch { /* bo'sh */ }
		const have = new Set(Object.keys(dict).map(norm))
		const cssLike = /(^|\s)(bg|text|hover|ring|border|rounded|group|transition|px|py|flex|from|to)-/ // dinamik nomzodlardan tushib qolgan Tailwind sinflari: tarjima kerak emas
		const missing = all.filter(k => !have.has(k) && !cssLike.test(k))
		const stale = [...have].filter(k => !all.includes(k))
		console.log(`${lng}: yo'q ${missing.length} / ${all.length}; ortiqcha ${stale.length}`)
		if (process.argv.includes('--missing')) fs.writeFileSync(path.join(LOC, `_missing-${lng}.json`), JSON.stringify(missing, null, 1))
	}
}
