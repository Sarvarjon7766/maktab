// Yuz topish (YuNet) va yuz izi (SFace) — OpenCV Zoo modellari (MIT / Apache-2.0), onnxruntime-node orqali (GPU: AI_PROVIDER, ai/provider.js).
// Python dasturdagi (Hikvision_Face_Attendance) cv2.FaceDetectorYN / FaceRecognizerSF ishining Node'dagi analogi:
//   1) YuNet: 640x640 bo'lakda yuz + 5 nuqta (o'ng ko'z, chap ko'z, burun, o'ng va chap lab burchagi — kadrdagi tartibda);
//   2) 5 nuqta bo'yicha yuz 112x112 ga tekislanadi (ArcFace shabloni, o'xshashlik o'zgartirishi);
//   3) SFace: 128 o'lchamli yuz izi (L2 normallangan); o'xshashlik — kosinus (skalyar ko'paytma).
const path = require('path')
const sharp = require('sharp')

const DET = path.join(__dirname, 'models', 'face_detection_yunet_2023mar.onnx')
const REC = path.join(__dirname, 'models', 'face_recognition_sface_2021dec.onnx')
// Ixtiyoriy kuchliroq model (ArcFace R100, 512-o'lcham): GPU'li serverda yoqiladi (AI sozlamalari -> faceModel). SFace'dan ~20 marta og'ir (CPU)
const ARC = process.env.FACE_ARC_MODEL || path.join(__dirname, 'models', 'face_recognition_arcface_r100.onnx')
const MODELS = { sface: { key: 'rec', file: REC }, arcface: { key: 'rec_arc', file: ARC } }
const TILE = 640
const BIG_FACE = 260 // shundan katta yuz (px) uchun kichraytirilgan nusxada qayta topish
const DST = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]

let ort = null
const sessions = {}
const session = (key, file) => {
	if (!sessions[key]) {
		ort = ort || require('onnxruntime-node')
		sessions[key] = ort.InferenceSession.create(file, { executionProviders: require('./provider').providers(), graphOptimizationLevel: 'all', logSeverityLevel: 3, intraOpNumThreads: require('./threads').AI_THREADS })
			.catch((e) => { delete sessions[key]; throw e })
	}
	return sessions[key]
}

const iou = (a, b) => {
	const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1), x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2)
	const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
	return i / ((a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - i || 1)
}

// Bitta 640x640 bo'lak: rgb (W x H, 3 kanal) dan (ox, oy) boshlanadigan qism, chetda qora bilan to'ldiriladi
async function runTile(det, rgb, W, H, ox, oy) {
	const plane = TILE * TILE, data = new Float32Array(3 * plane)
	for (let y = 0; y < TILE; y++) {
		const sy = oy + y
		if (sy >= H) break
		for (let x = 0; x < TILE; x++) {
			const sx = ox + x
			if (sx >= W) break
			const si = (sy * W + sx) * 3, di = y * TILE + x
			data[di] = rgb[si + 2]; data[plane + di] = rgb[si + 1]; data[2 * plane + di] = rgb[si] // BGR, 0..255
		}
	}
	return det.run({ input: new ort.Tensor('float32', data, [1, 3, TILE, TILE]) })
}

function decode(out, ox, oy, scale, score, into) {
	for (const stride of [8, 16, 32]) {
		const n = TILE / stride
		const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data, bb = out[`bbox_${stride}`].data, kp = out[`kps_${stride}`].data
		for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
			const i = r * n + c
			const s = Math.sqrt(Math.min(1, Math.max(0, cls[i])) * Math.min(1, Math.max(0, obj[i])))
			if (s < score) continue
			const cx = (c + bb[i * 4]) * stride + ox, cy = (r + bb[i * 4 + 1]) * stride + oy
			const w = Math.exp(bb[i * 4 + 2]) * stride, h = Math.exp(bb[i * 4 + 3]) * stride
			const lm = []
			for (let k = 0; k < 5; k++) lm.push([((kp[i * 10 + 2 * k] + c) * stride + ox) / scale, ((kp[i * 10 + 2 * k + 1] + r) * stride + oy) / scale])
			into.push({ x1: (cx - w / 2) / scale, y1: (cy - h / 2) / scale, x2: (cx + w / 2) / scale, y2: (cy + h / 2) / scale, score: s, lm })
		}
	}
}

// Kadrdagi yuzlar. buffer — JPEG/PNG. opts: score (0.6), nms (0.3), upscale (1: asl o'lcham; kichik yuzlar uchun >1), tile (bo'laklar qadami)
// Qaytadi: [{ x1,y1,x2,y2, score, lm:[[x,y]x5], size }] — koordinatalar ASL kadrda; size — yuzning kichik tomoni (px)
async function detectFaces(buffer, opts = {}) {
	const { score = 0.6, nms = 0.3, upscale = 1, tile = 480 } = opts
	const det = await session('det', DET)
	let img = sharp(buffer).removeAlpha()
	const meta = await img.metadata()
	let W = meta.width, H = meta.height
	if (upscale !== 1) { W = Math.round(W * upscale); H = Math.round(H * upscale); img = img.resize(W, H, { kernel: 'lanczos3' }) }
	const rgb = await img.raw().toBuffer()
	const xs = [], ys = []
	for (let x = 0; ; x += tile) { xs.push(Math.min(x, Math.max(0, W - TILE))); if (x + TILE >= W) break }
	for (let y = 0; ; y += tile) { ys.push(Math.min(y, Math.max(0, H - TILE))); if (y + TILE >= H) break }
	const faces = []
	for (const oy of new Set(ys)) for (const ox of new Set(xs)) decode(await runTile(det, rgb, W, H, ox, oy), ox, oy, upscale, score, faces)
	faces.sort((a, b) => b.score - a.score)
	const keep = []
	for (const f of faces) if (!keep.some((k) => iou(k, f) > nms)) keep.push(f)
	for (const f of keep) f.size = Math.min(f.x2 - f.x1, f.y2 - f.y1)
	// Juda katta yuzlar (kameraga yaqin odam): 640 px li bo'lakka sig'maydi va ramka/5 nuqta noto'g'ri chiqadi (bitta yuz ikkita bo'lib qolishi mumkin).
	// Shunday yuz bo'lsa rasm kichraytirilgan nusxada qayta topiladi va katta yuzlar shu natija bilan almashtiriladi
	const biggest = keep.reduce((m, f) => Math.max(m, f.size), 0)
	if (biggest > BIG_FACE && !opts.noRefine) {
		const k = Math.min(1, 160 / biggest)
		const small = await detectFaces(buffer, { ...opts, upscale: upscale * k, noRefine: true })
		const refined = keep.filter((f) => f.size <= BIG_FACE)
		for (const big of keep.filter((f) => f.size > BIG_FACE)) {
			// katta yuz o'rniga kichraytirilgan nusxadagi eng mos yuz; topilmasa asl yuz saqlanadi
			const cand = small.filter((f) => iou(f, big) > 0.2).sort((x, y) => iou(y, big) - iou(x, big))[0]
			refined.push(cand || big)
		}
		for (const f of small) if (f.size > 40 && !refined.some((r) => iou(r, f) > nms)) refined.push(f)
		refined.sort((x, y) => y.score - x.score)
		const out = []
		for (const f of refined) if (!out.some((k) => iou(k, f) > nms)) out.push(f) // ikki katta yuz bir xil yuzga bog'langan bo'lsa takrorlanmasin
		return out
	}
	return keep
}

// Yuz fotosurati (katta yuz): kadr 640 gacha kichraytirilib bir bo'lakda topiladi — bazaga olish (enrollment) uchun
async function detectInPhoto(buffer, opts = {}) {
	const meta = await sharp(buffer).metadata()
	const scale = Math.min(1, TILE / Math.max(meta.width, meta.height))
	return detectFaces(buffer, { ...opts, upscale: scale })
}

// 5 nuqta -> ArcFace shabloniga o'xshashlik o'zgartirishi: [x', y'] = [a -b; b a][x, y] + [tx, ty]
function similarity(lm) {
	let sx = 0, sy = 0, dx = 0, dy = 0
	for (let i = 0; i < 5; i++) { sx += lm[i][0]; sy += lm[i][1]; dx += DST[i][0]; dy += DST[i][1] }
	sx /= 5; sy /= 5; dx /= 5; dy /= 5
	let num1 = 0, num2 = 0, den = 0
	for (let i = 0; i < 5; i++) {
		const ax = lm[i][0] - sx, ay = lm[i][1] - sy, bx = DST[i][0] - dx, by = DST[i][1] - dy
		num1 += ax * bx + ay * by; num2 += ax * by - ay * bx; den += ax * ax + ay * ay
	}
	if (den < 1e-6) return null
	const a = num1 / den, b = num2 / den
	return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) }
}

// 112x112 tekislangan yuz (RGB, bilinear). rgb — butun kadr
function alignCrop(rgb, W, H, lm) {
	const m = similarity(lm)
	if (!m) return null
	const det = m.a * m.a + m.b * m.b
	const out = new Float32Array(3 * 112 * 112)
	const plane = 112 * 112
	for (let v = 0; v < 112; v++) {
		for (let u = 0; u < 112; u++) {
			const px = u - m.tx, py = v - m.ty
			const x = (m.a * px + m.b * py) / det, y = (-m.b * px + m.a * py) / det
			const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
			for (let c = 0; c < 3; c++) {
				const at = (xx, yy) => { const cx = Math.min(W - 1, Math.max(0, xx)), cy = Math.min(H - 1, Math.max(0, yy)); return rgb[(cy * W + cx) * 3 + c] }
				const val = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy
				out[c * plane + v * 112 + u] = val
			}
		}
	}
	return out
}

// Yuz izi: L2 normallangan Float32Array (sface — 128, arcface — 512 o'lcham). model: 'sface' | 'arcface'
// ArcFace kirishi: RGB (x-127.5)/127.5 (/255 ham o'xshash natija beradi, xom 0..255 esa noto'g'ri — scripts/faceBench.js)
async function embedAligned(aligned, model = 'sface') {
	const m = MODELS[model] || MODELS.sface
	const rec = await session(m.key, m.file)
	const input = model === 'arcface' ? Float32Array.from(aligned, (v) => (v - 127.5) / 127.5) : aligned
	const out = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, 112, 112]) })
	const f = Float32Array.from(out[rec.outputNames[0]].data)
	let n = 0
	for (const v of f) n += v * v
	n = Math.sqrt(n) || 1
	for (let i = 0; i < f.length; i++) f[i] /= n
	return f
}

// Kadrdagi barcha yuzlarning izi: [{ ...yuz, embedding }]. maxFaces — eng katta yuzlardan shuncha
async function embedFaces(buffer, faces, { maxFaces = 80, model = 'sface' } = {}) {
	await session('det', DET)
	ort = ort || require('onnxruntime-node')
	const meta = await sharp(buffer).metadata()
	const rgb = await sharp(buffer).removeAlpha().raw().toBuffer()
	const sorted = [...faces].sort((a, b) => b.size - a.size).slice(0, maxFaces)
	const out = []
	for (const f of sorted) {
		const al = alignCrop(rgb, meta.width, meta.height, f.lm)
		if (al) out.push({ ...f, embedding: await embedAligned(al, model), quality: qualityOf(f, al) })
	}
	return out
}

// Yuz sifati (bazaga olish va avto-o'rganish uchun): o'lcham, topish ishonchi, tiniqlik (Laplas dispersiyasi, tekislangan 112x112 da) va burilish.
// yaw — burunning ko'zlar o'rtasidan gorizontal siljishi / ko'zlar oralig'i (0 = to'g'ri qaragan; ~0.35+ = sezilarli burilgan)
function laplacianVar(aligned) {
	const W = 112, plane = W * W, g = new Float32Array(plane)
	for (let i = 0; i < plane; i++) g[i] = 0.299 * aligned[i] + 0.587 * aligned[plane + i] + 0.114 * aligned[2 * plane + i]
	let sum = 0, sq = 0, n = 0
	for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
		const i = y * W + x, l = g[i - 1] + g[i + 1] + g[i - W] + g[i + W] - 4 * g[i]
		sum += l; sq += l * l; n++
	}
	const mean = sum / n
	return sq / n - mean * mean
}
function yawOf(lm) {
	const eyeDist = Math.hypot(lm[1][0] - lm[0][0], lm[1][1] - lm[0][1]) || 1
	return Math.abs(lm[2][0] - (lm[0][0] + lm[1][0]) / 2) / eyeDist
}
function qualityOf(face, aligned) {
	return { size: Math.round(face.size), score: Math.round(face.score * 100) / 100, sharp: Math.round(laplacianVar(aligned)), yaw: Math.round(yawOf(face.lm) * 100) / 100 }
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

module.exports = { MODELS, qualityOf, detectFaces, detectInPhoto, embedFaces, embedAligned, alignCrop, similarity, dot, DST }
