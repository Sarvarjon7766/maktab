// Telefon NOMZODLARI: har bir odam atrofidagi hudud kattalashtirilib YOLOX'ning COCO "cell phone" (67) sinfi bo'yicha qidiriladi.
// DIQQAT: bu ishonchli aniqlash EMAS. Sinov kadrlarida haqiqiy telefonlar topildi, lekin kitob/daftar ham telefon deb chiqdi (taxminan har 3 tadan 1 tasi to'g'ri).
// Shuning uchun natija faqat dalil rasmida "telefon nomzodi" sifatida belgilanadi; ogohlantirish yoki hisobotga kirmaydi.
const { detectClass } = require('./personDetector')

const SCORE = Number(process.env.PHONE_SCORE) || 0.3
const MAX_PEOPLE = 25
const CLS_PHONE = 67

const iou = (a, b) => {
	const x = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)), y = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
	const i = x * y
	return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i || 1)
}

// result.boxes — odamlar. Qaytaradi [{ x1,y1,x2,y2,score }] yoki [] (xatoda ham bo'sh: dalil rasmi telefonsiz chiziladi)
async function find(buf, result, score = SCORE) {
	try {
		const out = []
		for (const b of result.boxes.slice(0, MAX_PEOPLE)) {
			const w = b.x2 - b.x1, h = b.y2 - b.y1
			const side = Math.max(160, Math.min(420, Math.max(w * 1.8, h * 1.3)))
			const cx = (b.x1 + b.x2) / 2, cy = b.y1 + h * 0.55
			for (const p of await detectClass(buf, { left: cx - side / 2, top: cy - side / 2, width: side, height: side }, CLS_PHONE, score)) {
				const pw = p.x2 - p.x1, ph = p.y2 - p.y1
				if (pw < 9 || ph < 8 || pw / ph > 3 || ph / pw > 2.5) continue // juda mayda yoki shakli telefonga o'xshamaydi
				if (!out.some((c) => iou(c, p) > 0.3)) out.push(p)
			}
		}
		return out
	} catch (e) {
		console.log('Telefon qidirish xatosi:', e.message)
		return []
	}
}

const svgOf = (phones, scale) => phones.map((p) => `<rect x="${((p.x1 - 4) * scale).toFixed(1)}" y="${((p.y1 - 4) * scale).toFixed(1)}" width="${((p.x2 - p.x1 + 8) * scale).toFixed(1)}" height="${((p.y2 - p.y1 + 8) * scale).toFixed(1)}" fill="none" stroke="#e879f9" stroke-width="3" stroke-dasharray="6 4"/>`).join('')

module.exports = { find, svgOf }
