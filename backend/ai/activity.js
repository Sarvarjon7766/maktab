// Sinfdagi harakat darajasi: ketma-ket ikki kadrdagi odamlarni juftlab, o'z joyidan sezilarli siljiganlar
// va kirib-chiqqanlar ulushini topadi (0 = hamma joyida o'tiribdi, 1 = hamma o'zgargan).
// Piksel farqidan farqi: yorug'lik, ekspozitsiya va kamera titrashiga bog'liq emas.
const MOVE_FACTOR = 0.5 // markaz qutining kengligining shuncha qismidan ko'p siljisa "siljigan"
const MATCH_FACTOR = 1.5 // shundan uzoqdagi qutilar bir odam hisoblanmaydi

const center = (b) => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2, w: Math.max(1, b.x2 - b.x1) })

// prev, cur — [{x1,y1,x2,y2}]. Qaytaradi 0..1 yoki null (taqqoslab bo'lmasa)
function activityBetween(prev, cur) {
	if (!prev || !cur || prev.length + cur.length === 0) return null
	const A = prev.map(center), B = cur.map(center)
	const pairs = []
	for (let i = 0; i < A.length; i++) {
		for (let j = 0; j < B.length; j++) {
			const d = Math.hypot(A[i].x - B[j].x, A[i].y - B[j].y)
			const w = Math.min(A[i].w, B[j].w)
			if (d <= w * MATCH_FACTOR) pairs.push({ i, j, d, w })
		}
	}
	pairs.sort((p, q) => p.d - q.d)
	const usedA = new Set(), usedB = new Set()
	let matched = 0, moved = 0
	for (const p of pairs) {
		if (usedA.has(p.i) || usedB.has(p.j)) continue
		usedA.add(p.i); usedB.add(p.j)
		matched++
		if (p.d > p.w * MOVE_FACTOR) moved++
	}
	const unmatched = (A.length - matched) + (B.length - matched)
	return Math.min(1, (moved * 2 + unmatched) / (A.length + B.length))
}

module.exports = { activityBetween }
