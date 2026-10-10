// O'quvchilarda parentPhoneKey (ota-ona telefonining oxirgi 9 raqami) maydonini to'ldiradi.
// Bot telefon bo'yicha qidirganda bu kalit indeks bilan ishlaydi; kalit bo'lmagan eski qatorlar ham ishlaydi (sekinroq), shuning uchun majburiy emas.
// Ishlatish (backend papkasidan):
//   node scripts/backfillParentPhoneKey.js          -- faqat hisoblaydi (hech narsa yozmaydi)
//   node scripts/backfillParentPhoneKey.js --run    -- yozadi (faqat parentPhoneKey yo'q yoki noto'g'ri qatorlar, qayta ishga tushirish xavfsiz)
require('dotenv').config()
const mongoose = require('mongoose')
const Student = require('../models/student.model')

const RUN = process.argv.includes('--run')
const BATCH = 500

async function main() {
	await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/facecontrol')
	const cursor = Student.collection.find({}, { projection: { parentPhone: 1, parentPhoneKey: 1 } })
	let seen = 0, stale = 0, written = 0
	let ops = []
	const flush = async () => { if (ops.length) { const r = await Student.collection.bulkWrite(ops, { ordered: false }); written += r.modifiedCount || 0; ops = [] } }
	for await (const s of cursor) {
		seen++
		const key = Student.phoneKeyOf(s.parentPhone)
		if (s.parentPhoneKey === key) continue
		stale++
		if (RUN) { ops.push({ updateOne: { filter: { _id: s._id }, update: { $set: { parentPhoneKey: key } } } }); if (ops.length >= BATCH) await flush() }
	}
	if (RUN) await flush()
	console.log(`Ko'rildi: ${seen}, yangilanishi kerak: ${stale}${RUN ? `, yozildi: ${written}` : " (quruq ishga tushirish: yozish uchun --run)"}`)
	await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
