// mongodump o'rnatilmagani uchun vaqtinchalik zaxira skripti — har bir
// kolleksiyani alohida JSON faylga eksport qiladi (migratsiyadan oldingi
// to'liq holat suratini olish uchun).
// Ishlatish: node backend/scripts/backupDb.js <chiqish-papkasi>
require('dotenv').config()
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const OUT_DIR = process.argv[2]
if (!OUT_DIR) {
	console.error('Usage: node backupDb.js <output-dir>')
	process.exit(1)
}
if (!fs.existsSync(OUT_DIR)) {
	fs.mkdirSync(OUT_DIR, { recursive: true })
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol'

async function run() {
	await mongoose.connect(MONGO_URI)
	const db = mongoose.connection.db
	const collections = await db.listCollections().toArray()

	console.log(`Baza: ${MONGO_URI}`)
	console.log(`${collections.length} ta kolleksiya topildi\n`)

	for (const { name } of collections) {
		const docs = await db.collection(name).find({}).toArray()
		const filePath = path.join(OUT_DIR, `${name}.json`)
		fs.writeFileSync(filePath, JSON.stringify(docs, null, 2))
		console.log(`  ${name}: ${docs.length} ta hujjat -> ${filePath}`)
	}

	console.log('\nZaxira tugadi.')
	await mongoose.connection.close()
}

run().catch(err => {
	console.error('Zaxira xatoligi:', err)
	process.exit(1)
})
