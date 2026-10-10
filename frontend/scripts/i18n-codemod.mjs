// JSX matnlarini avtomatik tx("...") bilan o'raydi (o'zbek-lotin matn kalit sifatida).
//   node scripts/i18n-codemod.mjs --dry     — faqat hisobot
//   node scripts/i18n-codemod.mjs --write   — fayllarga yozadi
// Qo'lda ko'rish kerak bo'lgan joylar (matn + o'zgaruvchi aralash, shablon satrlar) scripts/i18n-todo.json ga yoziladi
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import MagicString from 'magic-string'

const SRC = path.resolve('src')
const WRITE = process.argv.includes('--write')
const ATTRS = new Set(['placeholder', 'title', 'alt', 'aria-label', 'label', 'subtitle', 'description', 'text', 'empty', 'emptyText', 'searchPlaceholder', 'detail', 'sub', 'hint', 'helperText', 'tooltip', 'message', 'heading', 'header', 'caption', 'legend', 'openLabel', 'confirmText', 'okText', 'all'])
const SKIP_DIRS = new Set(['i18n', 'locales'])
const SKIP_FILES = new Set(['main.jsx'])

const files = []
const walkDir = (d) => {
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		const p = path.join(d, e.name)
		if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkDir(p) } else if (/\.(jsx|js)$/.test(e.name) && !SKIP_FILES.has(e.name)) files.push(p)
	}
}
walkDir(SRC)

const letters = (s) => (s.match(/\p{L}/gu) || []).length
const worthy = (s) => letters(s) >= 2 && !/^[\d\s.,:;·\-–—/|()%+[\]]+$/.test(s) && !/^(https?:|\/|#|\.|@)/.test(s) && !/^[a-z]+([A-Z][a-z]+)+$/.test(s) // camelCase identifikatorlar emas
const q = (s) => JSON.stringify(s)

const todo = {}
let total = 0, changedFiles = 0

for (const file of files) {
	const code = fs.readFileSync(file, 'utf8')
	let ast
	try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }) } catch { continue }
	const ms = new MagicString(code)
	const rel = path.relative(SRC, file).replace(/\\/g, '/')
	const note = (kind, node) => { (todo[rel] ||= []).push({ kind, line: node.loc.start.line, text: code.slice(node.start, Math.min(node.end, node.start + 120)).replace(/\s+/g, ' ') }) }
	let n = 0

	const wrapStr = (node) => { ms.overwrite(node.start, node.end, `{tx(${q(node.value)})}`); n++ }
	// Ifoda ichidagi satr bo'laklarini o'raydi (ifoda kontekstida {} siz)
	const wrapExprStrings = (e, asChild) => {
		if (!e) return
		if (e.type === 'StringLiteral') { if (worthy(e.value)) { ms.overwrite(e.start, e.end, `tx(${q(e.value)})`); n++ } return }
		if (e.type === 'ConditionalExpression') { wrapExprStrings(e.consequent); wrapExprStrings(e.alternate); return }
		if (e.type === 'LogicalExpression') { if (e.operator !== '&&') wrapExprStrings(e.left); wrapExprStrings(e.right); return }
		if (e.type === 'TemplateLiteral' && asChild && letters(e.quasis.map(x => x.value.cooked).join('')) >= 2) note('template', e)
	}

	const visit = (node, parent, inI18n) => {
		if (!node || typeof node.type !== 'string') return
		const isI18nCall = node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['tx', 'tk', 't'].includes(node.callee.name)
		if (isI18nCall) return
		if (node.type === 'JSXText') {
			const raw = node.value
			const key = raw.replace(/\s+/g, ' ').trim()
			if (!worthy(key) || /&\w+;|&#/.test(code.slice(node.start, node.end))) {
				if (worthy(key)) note('entity', node)
				return
			}
			// atrofdagi bolalar orasida ifoda bo'lsa (matn + {o'zgaruvchi}) — alohida bo'laklash tarjimaga zarar qiladi: qo'lda
			const siblings = parent?.children || []
			const hasExpr = siblings.some(c => c.type === 'JSXExpressionContainer' && c.expression.type !== 'JSXEmptyExpression' && !(c.expression.type === 'StringLiteral' && c.expression.value.trim() === ''))
			if (hasExpr) { note('mixed', node); return }
			const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0]
			ms.overwrite(node.start, node.end, `${lead}{tx(${q(key)})}${trail}`)
			n++
			return
		}
		if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && ATTRS.has(node.name.name) && node.value) {
			if (node.value.type === 'StringLiteral' && worthy(node.value.value)) { wrapStr(node.value); return }
			if (node.value.type === 'JSXExpressionContainer') { wrapExprStrings(node.value.expression, false); }
		}
		if (node.type === 'JSXExpressionContainer' && (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment')) {
			wrapExprStrings(node.expression, true)
		}
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'start' || key === 'end') continue
			const v = node[key]
			if (Array.isArray(v)) v.forEach(c => visit(c, node))
			else if (v && typeof v.type === 'string') visit(v, node)
		}
	}
	visit(ast.program, null)
	if (!n) continue

	// import qo'shish
	const hasImport = /import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*['"][^'"]*i18n['"]/.test(code)
	if (!hasImport) {
		const imports = ast.program.body.filter(b => b.type === 'ImportDeclaration')
		const last = imports[imports.length - 1]
		let relPath = path.relative(path.dirname(file), path.join(SRC, 'i18n')).replace(/\\/g, '/')
		if (!relPath.startsWith('.')) relPath = `./${relPath}`
		const eol = code.includes('\r\n') ? '\r\n' : '\n'
		const line = `import { tx } from '${relPath}'`
		if (last) ms.appendLeft(last.end, `${eol}${line}`)
		else ms.prepend(`${line}${eol}`)
	}
	total += n; changedFiles++
	if (WRITE) fs.writeFileSync(file, ms.toString())
	console.log(`${String(n).padStart(4)}  ${rel}`)
}
fs.writeFileSync(path.resolve('scripts/i18n-todo.json'), JSON.stringify(todo, null, 1))
const todoCount = Object.values(todo).reduce((a, l) => a + l.length, 0)
console.log(`\n${WRITE ? 'Yozildi' : 'Quruq ishga tushirish'}: ${changedFiles} fayl, ${total} matn; qo'lda ko'rish: ${todoCount} joy (scripts/i18n-todo.json)`)
