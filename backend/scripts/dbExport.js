// To'liq baza eksporti (turlar saqlanadi: ObjectId, Date): har bir kolleksiya — alohida .ndjson fayl (EJSON).
// mongodump o'rnatilmagan kompyuterlar uchun. Tiklash: scripts/dbImport.js
// Ishlatish: node scripts/dbExport.js <chiqish-papkasi>
require('dotenv').config()
const mongoose = require('mongoose')
const { EJSON } = require('bson')
const fs = require('fs')
const path = require('path')

const OUT = process.argv[2]
if (!OUT) { console.error('Ishlatish: node scripts/dbExport.js <chiqish-papkasi>'); process.exit(1) }
fs.mkdirSync(OUT, { recursive: true })

;(async () => {
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/faceid')
	const db = mongoose.connection.db
	const cols = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'))
	let total = 0
	for (const name of cols) {
		const out = fs.createWriteStream(path.join(OUT, `${name}.ndjson`))
		let n = 0
		for await (const doc of db.collection(name).find({}, { batchSize: 2000 })) {
			if (!out.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) await new Promise((r) => out.once('drain', r))
			n++
		}
		await new Promise((r) => out.end(r))
		total += n
		console.log(`${name.padEnd(30)} ${n}`)
	}
	console.log(`\nTayyor: ${cols.length} kolleksiya, ${total} hujjat -> ${OUT}`)
	await mongoose.disconnect()
})().catch((e) => { console.error('Eksport xatosi:', e); process.exit(1) })
