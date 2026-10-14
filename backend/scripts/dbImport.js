// dbExport.js bilan olingan papkadan bazani tiklaydi. MAVJUD kolleksiyalar tozalanib, ustiga yoziladi (--keep bilan tegilmaydi, faqat qo'shiladi).
// Ishlatish: node scripts/dbImport.js <papka> [--keep]
// MONGO_URI .env dan yoki muhitdan olinadi (docker: mongodb://mongo:27017/faceid).
require('dotenv').config()
const mongoose = require('mongoose')
const { EJSON } = require('bson')
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const DIR = process.argv[2]
const KEEP = process.argv.includes('--keep')
if (!DIR || !fs.existsSync(DIR)) { console.error('Ishlatish: node scripts/dbImport.js <papka> [--keep]'); process.exit(1) }

;(async () => {
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/faceid')
	const db = mongoose.connection.db
	console.log('Baza:', db.databaseName)
	let total = 0
	for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.ndjson'))) {
		const name = f.replace(/\.ndjson$/, '')
		const col = db.collection(name)
		if (!KEEP) await col.deleteMany({})
		let batch = [], n = 0
		const flush = async () => { if (batch.length) { await col.insertMany(batch, { ordered: false }).catch((e) => { if (e.code !== 11000 && !(e.writeErrors || []).every((w) => w.code === 11000)) throw e }); n += batch.length; batch = [] } }
		for await (const line of readline.createInterface({ input: fs.createReadStream(path.join(DIR, f)), crlfDelay: Infinity })) {
			if (!line.trim()) continue
			batch.push(EJSON.parse(line, { relaxed: false }))
			if (batch.length >= 1000) await flush()
		}
		await flush()
		total += n
		console.log(`${name.padEnd(30)} ${n}`)
	}
	console.log(`\nTiklandi: ${total} hujjat. Indekslar backend ishga tushganda o'zi yaratiladi.`)
	await mongoose.disconnect()
})().catch((e) => { console.error('Import xatosi:', e); process.exit(1) })
