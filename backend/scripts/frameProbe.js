// Kadr sifati tashxisi: kameradan ikkala usulda (capturePic va asosiy oqim) kadr olib, o'lchami va aniqlangan odam sonini solishtiradi.
//   node scripts/frameProbe.js <sinf nomi (11-B) | kamera id | kamera nomi | qurilma serial> [soni]
// Kadrlar private/probe/ papkasiga saqlanadi (docker: docker compose cp backend:/app/private/probe ./probe). Hech narsani o'zgartirmaydi.
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const sharp = require('sharp')

const OUT = path.join(__dirname, '..', 'private', 'probe')
const query = process.argv[2]
const limit = Math.max(1, Number(process.argv[3]) || 2)

async function describe(label, buf, file) {
	const m = await sharp(buf).metadata()
	fs.writeFileSync(path.join(OUT, file), buf)
	let people = '?'
	try { people = (await require('../ai/personDetector').detectPeople(buf, { tiled: true })).count } catch (e) { people = `xato: ${e.message}` }
	console.log(`  ${label.padEnd(10)} ${m.width}x${m.height}  ${(buf.length / 1024).toFixed(0)} KB  ${(buf.length / (m.width * m.height) * 8).toFixed(2)} bit/piksel  odam=${people}  -> ${file}`)
}

;(async () => {
	if (!query) { console.log('Foydalanish: node scripts/frameProbe.js <kamera nomi yoki id> [soni]'); process.exit(1) }
	await mongoose.connect(process.env.MONGO_URI)
	const Cam = require('../models/hik.camera.model')
	const Snap = require('../services/hik.snapshot.service')
	const Sinf = require('../models/sinf.model')
	const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const sinfs = mongoose.isValidObjectId(query) ? [] : await Sinf.find({ name: new RegExp(`^${esc}$`, 'i') }).select('_id').lean()
	// Qidiruv: kamera id, kamera nomi, qurilma serial yoki sinf nomi (masalan 11-B)
	const filter = mongoose.isValidObjectId(query) ? { _id: query } : { $or: [{ name: new RegExp(esc, 'i') }, { serial: query }, { sinfId: { $in: sinfs.map((x) => x._id) } }] }
	const cams = await Cam.find({ ...filter, inCloud: { $ne: false } }).limit(limit).lean()
	if (!cams.length) {
		console.log('Kamera topilmadi. Odam sanash yoqilgan kameralar:')
		const on = await Cam.find({ visionEnabled: true, inCloud: { $ne: false } }).populate('sinfId', 'name').limit(20).lean()
		on.forEach((c) => console.log(`  ${c._id}  ${c.name || '-'}  sinf=${c.sinfId?.name || '-'}  qurilma=${c.serial} kanal=${c.channelNo}`))
		process.exit(1)
	}
	fs.mkdirSync(OUT, { recursive: true })
	console.log(`ffmpeg: ${Snap.hasFfmpeg() ? 'bor' : "YO'Q (asosiy oqimdan olish ishlamaydi)"}`)
	for (const c of cams) {
		console.log(`\n${c.name || c._id} · qurilma ${c.serial} · kanal ${c.channelNo}`)
		const tag = String(c._id).slice(-6)
		try { await describe('capturePic', await Snap.captureSnapshot(c), `${tag}_snapshot.jpg`) } catch (e) { console.log(`  capturePic  xato: ${e.message}`) }
		if (Snap.hasFfmpeg()) {
			try { await describe('asosiy oqim', await Snap.captureLive(c), `${tag}_live.jpg`) } catch (e) { console.log(`  asosiy oqim xato: ${e.message}`) }
		}
	}
	process.exit(0)
})().catch((e) => { console.error(e.message); process.exit(1) })
