// Tahlil rejalashtirish: kamera turi bo'yicha oraliq va yuklama himoyasi (sof funksiyalar — sinaladi).
//  gate  — sinfsiz, yuz tanish yo'nalishi 'out' (darvoza): eng tez-tez va eng birinchi
//  class — sinfga biriktirilgan sinfxona kamerasi
//  hall  — sinfsiz zal/koridor kamerasi
// Oraliq sozlamada (gateIntervalSec, classIntervalSec, hallIntervalSec) soniyada; 0 yoki bo'sh bo'lsa umumiy oraliq (intervalSec) ishlatiladi —
// ya'ni sozlanmagan tizimda xatti-harakat oldingidek qoladi.
const PRIORITY = { gate: 0, class: 1, hall: 2 }
const MIN_MS = 10 * 1000

const tierOf = (c) => (c.sinfId ? 'class' : c.faceDirection === 'out' ? 'gate' : 'hall')

function intervalMs(camera, cfg, baseMs) {
	const sec = Number({ gate: cfg.gateIntervalSec, hall: cfg.hallIntervalSec, class: cfg.classIntervalSec }[tierOf(camera)])
	return sec > 0 ? Math.max(MIN_MS, sec * 1000) : baseMs
}

// Siklning o'zi shuncha tez-tez uyg'onadi: eng qisqa oraliq (lekin kamida 10 s)
function tickMs(cfg, baseMs) {
	const all = [cfg.gateIntervalSec, cfg.hallIntervalSec, cfg.classIntervalSec].map(Number).filter((s) => s > 0).map((s) => Math.max(MIN_MS, s * 1000))
	return Math.min(baseMs, ...all)
}

// Hozir navbati kelgan kameralar. lastAt: Map(cameraId -> oxirgi tahlil vaqti, ms). shed=true (tizim yuklangan) bo'lsa faqat darvoza kameralari qoladi.
// Oraliqdan 2 s oldin ham "navbati keldi" hisoblanadi (siklning mayda kechikishi navbatni bir sikl suramasligi uchun)
function selectDue(cameras, { now, lastAt, cfg, baseMs, shed = false }) {
	return cameras.filter((c) => {
		if (shed && tierOf(c) !== 'gate') return false
		const last = lastAt.get(String(c._id)) || 0
		return now - last >= intervalMs(c, cfg, baseMs) - 2000
	})
}

module.exports = { PRIORITY, tierOf, intervalMs, tickMs, selectDue }
