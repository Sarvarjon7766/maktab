// JSX'da ishlatilgan lekin fayl ichida e'lon qilinmagan identifikatorlarni topadi (<motion.div>, <Foo />). ESLint no-undef buni ushlamaydi
import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
const traverse = traverseModule.default || traverseModule
const files = []
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx|js)$/.test(e.name)) files.push(p) } }
walk(path.resolve('src'))
let bad = 0
for (const f of files) {
	const code = fs.readFileSync(f, 'utf8')
	let ast
	try { ast = parse(code, { sourceType: 'module', plugins: ['jsx'] }) } catch { continue }
	traverse(ast, {
		JSXOpeningElement(p) {
			let n = p.node.name
			if (n.type === 'JSXNamespacedName') return
			const isMember = n.type === 'JSXMemberExpression'
			while (n.type === 'JSXMemberExpression') n = n.object
			const name = n.name
			if (!name || (!isMember && /^[a-z]/.test(name))) return // oddiy html teglar
			if (!p.scope.hasBinding(name)) { bad++; console.log(`${path.relative('.', f)}:${p.node.loc.start.line}  <${name}> e'lon qilinmagan`) }
		}
	})
}
console.log(bad ? `Jami: ${bad}` : 'JSX identifikatorlari: muammo yo\'q')
