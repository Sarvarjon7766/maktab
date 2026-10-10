// Tarjima qilinmagan, foydalanuvchiga ko'rinishi mumkin bo'lgan satrlarni topadi (evristika).
//   node scripts/i18n-scan.mjs [papka-yoki-fayl ...]     — ro'yxat
//   node scripts/i18n-scan.mjs --count                   — faqat fayllar bo'yicha son
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'

const SRC = path.resolve('src')
const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const COUNT = process.argv.includes('--count')
const roots = (args.length ? args : ['src']).map(a => path.resolve(a))
const files = []
const walkDir = (d) => {
	const st = fs.statSync(d)
	if (st.isFile()) { if (/\.(jsx|js)$/.test(d)) files.push(d); return }
	for (const e of fs.readdirSync(d, { withFileTypes: true })) {
		if (['i18n', 'locales', 'node_modules'].includes(e.name)) continue
		walkDir(path.join(d, e.name))
	}
}
roots.forEach(walkDir)

const NON_TEXT_ATTRS = new Set(['className', 'class', 'style', 'to', 'href', 'src', 'id', 'key', 'type', 'name', 'value', 'htmlFor', 'rel', 'target', 'role', 'color', 'fill', 'stroke', 'd', 'viewBox', 'width', 'height', 'method', 'accept', 'autoComplete', 'inputMode', 'size', 'variant', 'tone', 'kind', 'mode', 'layout', 'position', 'align', 'dataKey', 'stackId', 'xmlns', 'path', 'icon', 'tokenKey', 'view', 'sort', 'metric', 'scope', 'cols', 'format'])
const letters = (s) => (s.match(/\p{L}/gu) || []).length
const tailwindish = (s) => /^[\w\-:/[\]#%.!()'" ,*>&@]+$/.test(s) && /[-:/[\]]/.test(s) && !/[A-Z][a-z]+ [a-z]/.test(s)
const looksText = (s) => {
	const v = s.trim()
	if (letters(v) < 3) return false
	if (/^(https?:|\/|#|\.|@|data:|blob:|file:)/.test(v)) return false
	if (/^[a-z][a-zA-Z0-9_]*$/.test(v)) return false      // camelCase / identifikator / kichik so'z
	if (/^[A-Z0-9_]+$/.test(v)) return false             // KONSTANTA
	if (/^[\w.-]+\.(jpg|png|jpeg|webp|svg|json|xlsx|js|jsx)$/i.test(v)) return false
	if (tailwindish(v)) return false
	if (/^(GET|POST|PUT|DELETE|PATCH|application\/|image\/|text\/|Bearer )/.test(v)) return false
	return /\s/.test(v) || /^[A-ZА-ЯЎҒҚҲ]/.test(v) || /[ʻ'’]/.test(v)
}

let total = 0
const out = {}
for (const file of files) {
	const code = fs.readFileSync(file, 'utf8')
	let ast
	try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }) } catch { continue }
	const rel = path.relative(SRC, file).replace(/\\/g, '/')
	const hits = []
	const visit = (node, parent, grand) => {
		if (!node || typeof node.type !== 'string') return
		if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['tx', 'tk', 't'].includes(node.callee.name)) return
		if (node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration') return
		if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && ['require', 'console'].includes(node.callee.name)) return
		if (node.type === 'MemberExpression' && node.object.name === 'console') return
		if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'console') return
		if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && NON_TEXT_ATTRS.has(node.name.name)) return
		if (node.type === 'ObjectProperty' && !node.computed && parent && node.key === undefined) return
		if (node.type === 'StringLiteral' || node.type === 'TemplateLiteral') {
			const text = node.type === 'StringLiteral' ? node.value : node.quasis.map(q => q.value.cooked).join('${}')
			const isKey = parent?.type === 'ObjectProperty' && parent.key === node && !parent.computed
			const inCase = parent?.type === 'SwitchCase'
			const isCmp = parent?.type === 'BinaryExpression' && ['===', '!==', '==', '!='].includes(parent.operator)
			const isClassFn = parent?.type === 'CallExpression' && parent.callee.name && /^(cn|clsx|classNames|twMerge)$/.test(parent.callee.name)
			const isDirective = node.type === 'StringLiteral' && parent?.type === 'ExpressionStatement'
			if (!isKey && !inCase && !isCmp && !isClassFn && !isDirective && looksText(text)) hits.push({ line: node.loc.start.line, text: text.replace(/\s+/g, ' ').slice(0, 110) })
		}
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'start' || key === 'end') continue
			const v = node[key]
			if (Array.isArray(v)) v.forEach(c => visit(c, node, parent))
			else if (v && typeof v.type === 'string') visit(v, node, parent)
		}
	}
	visit(ast.program, null, null)
	if (hits.length) { out[rel] = hits; total += hits.length }
}
if (COUNT) {
	Object.entries(out).sort((a, b) => b[1].length - a[1].length).forEach(([f, h]) => console.log(`${String(h.length).padStart(4)}  ${f}`))
} else {
	for (const [f, h] of Object.entries(out)) { console.log(`\n# ${f}`); h.forEach(x => console.log(`  ${x.line}: ${x.text}`)) }
}
console.log(`\nJami: ${total} ta, ${Object.keys(out).length} faylda`)
