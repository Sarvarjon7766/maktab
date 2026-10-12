// Fon vazifalari (kamera so'rovlari, AI tahlil, Hik hodisalari, Telegram bot, hisobotlar) bir vaqtda FAQAT BITTA server nusxasida ishlashi kerak.
// Aks holda (masalan, ikkita terminalda `npm run dev` yoki PM2 klaster) AI va Hik so'rovlari ikki-uch baravar bajariladi,
// protsessor to'lib tizim qotadi, bazaga takroriy yozuvlar tushadi.
// Usul: MongoDB'dagi `locks` hujjati ijara (lease) sifatida: egasi har RENEW_MS da yangilaydi; ega o'lsa TTL_MS dan keyin boshqa nusxa oladi.
const crypto = require('crypto')
const mongoose = require('mongoose')

const ID = `${process.pid}-${crypto.randomBytes(3).toString('hex')}`
const KEY = 'background'
const TTL_MS = 45 * 1000
const RENEW_MS = 15 * 1000

let timer = null
let leading = false
const coll = () => mongoose.connection.collection('locks')

// true — shu nusxa rahbar (qulf egasi)
async function tryAcquire() {
	const now = new Date()
	try {
		const res = await coll().findOneAndUpdate(
			{ _id: KEY, $or: [{ holder: ID }, { expiresAt: { $lt: now } }] },
			{ $set: { holder: ID, expiresAt: new Date(Date.now() + TTL_MS), pid: process.pid, at: now } },
			{ upsert: true, returnDocument: 'after' }
		)
		const doc = res && res.value !== undefined ? res.value : res // turli drayver versiyalari
		return !doc || doc.holder === ID
	} catch (e) {
		if (e && e.code === 11000) return false // qulf boshqa nusxada va muddati tugamagan
		throw e
	}
}

// onAcquire — rahbar bo'lganda (fon vazifalarini ishga tushiring), onLose — qulf yo'qolganda (to'xtating)
function run({ onAcquire, onLose }) {
	const tick = async () => {
		let ok = false
		try { ok = await tryAcquire() } catch (e) { console.log('Rahbar qulfi xatosi:', e.message); ok = leading } // baza vaqtincha ishlamasa holatni saqlaymiz
		if (ok && !leading) { leading = true; console.log(`Fon vazifalari: bu nusxa rahbar (${ID})`); try { onAcquire() } catch (e) { console.error('Fon vazifalarini boshlash xatosi:', e.message) } }
		else if (!ok && leading) { leading = false; console.log('Fon vazifalari: rahbarlik boshqa nusxaga o\'tdi, to\'xtatilmoqda'); try { onLose() } catch (e) { console.error(e.message) } }
	}
	tick()
	timer = setInterval(tick, RENEW_MS)
	timer.unref?.()
}

async function release() {
	if (timer) clearInterval(timer)
	timer = null
	if (!leading) return
	leading = false
	try { await coll().deleteOne({ _id: KEY, holder: ID }) } catch { /* ahamiyatsiz */ }
}

module.exports = { run, release, isLeader: () => leading, ID }
