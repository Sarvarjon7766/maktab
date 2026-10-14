// Odam holatlari (skelet bo'yicha): har odam qutisi atrofidan RTMPose (ONNX, 17 nuqta, COCO) ishlatiladi.
// Yuz tanilmaydi, shaxs aniqlanmaydi: faqat "nechta o'tirgan / tik turgan / boshi egilgan / qo'l ko'targan".
// Natija TAXMINIY (kamera burchagi, partalar va qatorlar to'sib qo'yishi aniqlikka ta'sir qiladi).
// Model: ai/models/rtmpose_m.onnx — OpenMMLab RTMPose-m (body7, 256x192, Apache-2.0).
//   https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-body7_pt-body7_420e-256x192-e48f03d0_20230504.zip (ichidagi end2end.onnx)
const path = require('path')
const sharp = require('sharp')

const MODELS_DIR = path.join(__dirname, 'models')
const IN_W = 192, IN_H = 256
const PAD = 1.25 // qutiga nisbatan kengaytirish (mmpose standarti)
const MEAN = [123.675, 116.28, 103.53], STD = [58.395, 57.12, 57.375]
const SPLIT = 2 // SimCC: 1 piksel = 2 bin
const MAX_PEOPLE = 60
const MIN_BOX = 28 // juda kichik odamlar (skelet ishonchsiz) o'tkazib yuboriladi

// COCO-17 indekslari
const K = { nose: 0, leye: 1, reye: 2, lear: 3, rear: 4, lsho: 5, rsho: 6, lelb: 7, relb: 8, lwri: 9, rwri: 10, lhip: 11, rhip: 12, lkne: 13, rkne: 14, lank: 15, rank: 16 }
const EDGES = [[5, 6], [5, 7], [7, 9], [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [0, 1], [0, 2], [1, 3], [2, 4]]

const sessions = new Map()
function getSession(model) {
	const file = path.join(MODELS_DIR, path.basename(model || 'rtmpose_m.onnx'))
	if (!sessions.has(file)) {
		const ort = require('onnxruntime-node')
		sessions.set(file, ort.InferenceSession.create(file, { executionProviders: require('./provider').providers(), graphOptimizationLevel: 'all', intraOpNumThreads: require('./threads').AI_THREADS })
			.catch((e) => { sessions.delete(file); throw e }))
	}
	return sessions.get(file)
}

// Odam qutisi atrofidagi 192x256 kesim (qutidan tashqari qism qora bilan to'ldiriladi). Qaytaradi { data(CHW float32), x0, y0, s }
async function crop(buffer, meta, box) {
	const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2
	let w = box.x2 - box.x1, h = box.y2 - box.y1
	if (w > h * (IN_W / IN_H)) h = w * (IN_H / IN_W); else w = h * (IN_W / IN_H)
	w *= PAD; h *= PAD
	const x0 = cx - w / 2, y0 = cy - h / 2
	const s = IN_W / w
	const ix0 = Math.max(0, Math.floor(x0)), iy0 = Math.max(0, Math.floor(y0))
	const ix1 = Math.min(meta.width, Math.ceil(x0 + w)), iy1 = Math.min(meta.height, Math.ceil(y0 + h))
	if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return null
	const rw = Math.max(1, Math.min(IN_W, Math.round((ix1 - ix0) * s))), rh = Math.max(1, Math.min(IN_H, Math.round((iy1 - iy0) * s)))
	const left = Math.max(0, Math.min(IN_W - rw, Math.round((ix0 - x0) * s))), top = Math.max(0, Math.min(IN_H - rh, Math.round((iy0 - y0) * s)))
	const { data } = await sharp(buffer).extract({ left: ix0, top: iy0, width: ix1 - ix0, height: iy1 - iy0 }).resize(rw, rh, { fit: 'fill' }).removeAlpha()
		.extend({ top, left, bottom: IN_H - rh - top, right: IN_W - rw - left, background: { r: 0, g: 0, b: 0 } }).raw().toBuffer({ resolveWithObject: true })
	const plane = IN_W * IN_H
	const input = new Float32Array(3 * plane)
	for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) input[c * plane + i] = (data[i * 3 + c] - MEAN[c]) / STD[c] // RGB
	return { input, x0, y0, s }
}

// SimCC chiqishini nuqtalarga aylantiradi (asl rasm koordinatalarida)
function decode(simccX, simccY, nx, ny, cr) {
	const pts = []
	for (let k = 0; k < 17; k++) {
		let bx = 0, mx = -Infinity, by = 0, my = -Infinity
		for (let i = 0; i < nx; i++) { const v = simccX[k * nx + i]; if (v > mx) { mx = v; bx = i } }
		for (let i = 0; i < ny; i++) { const v = simccY[k * ny + i]; if (v > my) { my = v; by = i } }
		pts.push({ x: cr.x0 + (bx / SPLIT) / cr.s, y: cr.y0 + (by / SPLIT) / cr.s, c: Math.max(0, Math.min(1, Math.min(mx, my))) })
	}
	return pts
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// Bitta odamning holati. kp — 17 nuqta [{x,y,c}], box — odam qutisi, t — nuqta ishonch chegarasi.
// Qaytaradi { posture: 'seated'|'standing', facing: 'front'|'side'|'back'|null, headDown, handRaised } (aniqlanmasa null/false)
function classify(kp, box, t = 0.25) {
	const ok = (i) => kp[i] && kp[i].c >= t
	const bw = Math.max(1, box.x2 - box.x1), bh = Math.max(1, box.y2 - box.y1)
	const haveSho = ok(K.lsho) && ok(K.rsho)
	const shoMid = haveSho ? { x: (kp[K.lsho].x + kp[K.rsho].x) / 2, y: (kp[K.lsho].y + kp[K.rsho].y) / 2 } : null
	const sw = haveSho ? Math.max(dist(kp[K.lsho], kp[K.rsho]), bw * 0.25) : bw * 0.45 // yelka kengligi (burilganda qisqaradi, shuning uchun pastdan cheklangan)

	// Yuz tomoni: burun va ko'zlar ko'rinishiga qarab
	const eyes = (ok(K.leye) ? 1 : 0) + (ok(K.reye) ? 1 : 0)
	let facing = null
	if (haveSho || ok(K.nose) || eyes) {
		if (ok(K.nose) && eyes === 2) facing = 'front'
		else if (ok(K.nose) || eyes === 1) facing = 'side'
		else if (haveSho || ok(K.lear) || ok(K.rear)) facing = 'back'
	}

	// Boshi egilgan: burun yelka chizig'idan ancha baland emas (tik o'tirganda burun yelkadan ~0.7 yelka kengligi yuqorida bo'ladi)
	let headDown = false
	if (shoMid && ok(K.nose) && facing !== 'back') headDown = (shoMid.y - kp[K.nose].y) / sw < 0.38
	else if (shoMid && facing === 'back' && (ok(K.lear) || ok(K.rear))) headDown = false

	// Qo'l ko'tarilgan: bilak yelkadan va (ko'z ko'rinsa) ko'zdan aniq yuqorida, qo'l yon tomonga cho'zilmagan
	let handRaised = false
	for (const [wri, sho, elb] of [[K.lwri, K.lsho, K.lelb], [K.rwri, K.rsho, K.relb]]) {
		if (!ok(wri) || !ok(sho)) continue
		const w = kp[wri], s = kp[sho]
		const eyeY = ok(K.leye) && ok(K.reye) ? Math.min(kp[K.leye].y, kp[K.reye].y) : ok(K.nose) ? kp[K.nose].y : s.y - sw * 0.7
		const above = (s.y - w.y) / sw
		if (above > 0.6 && w.y < eyeY - sw * 0.1 && Math.abs(w.x - s.x) < sw * 1.8 && (!ok(elb) || kp[elb].y < s.y + sw * 0.35)) { handRaised = true; break }
	}

	// Tik turgan: son va tizzalar ko'rinib, tizza sondan ancha pastda (o'tirganda son va tizza deyarli bir balandlikda);
	// pastki tana ko'rinmasa quti nisbati (tik turgan odam balandroq) bo'yicha
	let standing = false
	const hipsOk = ok(K.lhip) && ok(K.rhip)
	const kneesOk = ok(K.lkne) && ok(K.rkne)
	if (shoMid && hipsOk && kneesOk) {
		const hipY = (kp[K.lhip].y + kp[K.rhip].y) / 2, kneeY = (kp[K.lkne].y + kp[K.rkne].y) / 2
		const torso = Math.max(1, hipY - shoMid.y)
		standing = torso > 0 && (kneeY - hipY) / torso > 0.75 && bh / bw > 1.9
	} else if (bh / bw > 2.6) standing = true

	return { posture: standing ? 'standing' : 'seated', facing, headDown, handRaised }
}

// Maydon nomlari bazadagi eski yozuvlar bilan bir xil: seated, standing, backTurned, sideTurned, headDown, raised (+ analyzed)
const emptyCounts = () => ({ analyzed: 0, seated: 0, standing: 0, backTurned: 0, sideTurned: 0, headDown: 0, raised: 0 })

function tally(states) {
	const c = emptyCounts()
	for (const s of states) {
		if (!s) continue
		c.analyzed++
		c[s.posture]++
		if (s.facing === 'back') c.backTurned++
		else if (s.facing === 'side') c.sideTurned++
		if (s.headDown) c.headDown++
		if (s.handRaised) c.raised++
	}
	return c
}

// buffer — JPEG/PNG, boxes — [{x1,y1,x2,y2}], opts: { model, conf }. Qaytaradi { counts, people:[{ box, kp, state }] } yoki null (model yo'q)
async function analyzePeople(buffer, boxes, { model = 'rtmpose_m.onnx', conf = 0.25 } = {}) {
	const ort = require('onnxruntime-node')
	const session = await getSession(model)
	const meta = await sharp(buffer).metadata()
	const list = [...boxes].sort((a, b) => (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1)).slice(0, MAX_PEOPLE)
	const people = []
	for (const box of list) {
		if (box.x2 - box.x1 < MIN_BOX * 0.6 || box.y2 - box.y1 < MIN_BOX) continue
		const cr = await crop(buffer, meta, box)
		if (!cr) continue
		const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', cr.input, [1, 3, IN_H, IN_W]) })
		const sx = out[session.outputNames[0]], sy = out[session.outputNames[1]]
		const kp = decode(sx.data, sy.data, sx.dims[2], sy.dims[2], cr)
		const visible = kp.filter((p) => p.c >= conf).length
		people.push({ box, kp, state: visible >= 5 ? classify(kp, box, conf) : null })
	}
	return { counts: tally(people.map((p) => p.state)), total: boxes.length, people }
}

module.exports = { analyzePeople, classify, tally, emptyCounts, EDGES }
