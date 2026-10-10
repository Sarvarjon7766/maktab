// Kadrdagi odamlarni sanaydi (YOLOX-s, ONNX, CPU). Yuz tanish EMAS: faqat "odam bor/yo'q va nechta".
// Model: Megvii YOLOX (Apache-2.0), COCO 'person' sinfi = 0.
const path = require('path')
const sharp = require('sharp')

const MODEL_PATH = process.env.PERSON_MODEL_PATH || path.join(__dirname, 'models', 'yolox_s.onnx')
const SIZE = 640
const STRIDES = [8, 16, 32]
const SCORE_THRESHOLD = Number(process.env.PERSON_SCORE) || 0.35
const NMS_THRESHOLD = 0.45
const CONTAINED_THRESHOLD = Number(process.env.PERSON_CONTAINED) || 0.7

let sessionPromise = null
function getSession() {
	if (!sessionPromise) {
		const ort = require('onnxruntime-node')
		sessionPromise = ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['cpu'], graphOptimizationLevel: 'all' })
			.catch((e) => { sessionPromise = null; throw e })
	}
	return sessionPromise
}

// Har stride uchun [x, y, stride] jadvali (YOLOX decode_in_inference=False chiqishi uchun)
const GRIDS = (() => {
	const out = []
	for (const stride of STRIDES) {
		const n = SIZE / stride
		for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push([x, y, stride])
	}
	return out
})()

// Ikki quti bir odamnikimi: IoU yuqori YOKI kichigi katta qutining ichida (bo'lak chegarasida kesilgan quti)
function overlaps(a, b) {
	const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1)
	const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2)
	const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
	const areaA = (a.x2 - a.x1) * (a.y2 - a.y1), areaB = (b.x2 - b.x1) * (b.y2 - b.y1)
	const union = areaA + areaB - inter
	const iou = union <= 0 ? 0 : inter / union
	const minArea = Math.min(areaA, areaB)
	const contained = minArea <= 0 ? 0 : inter / minArea
	return iou >= NMS_THRESHOLD || contained >= CONTAINED_THRESHOLD
}

function nms(boxes) {
	boxes.sort((a, b) => b.score - a.score)
	const keep = []
	for (const b of boxes) {
		if (keep.every((k) => !overlaps(k, b))) keep.push(b)
	}
	return keep
}

// Bitta hudud (region) bo'yicha model ishlatadi. Qaytaradi: butun rasm koordinatalaridagi qutilar
async function runRegion(buffer, region) {
	const ratio = Math.min(SIZE / region.width, SIZE / region.height)
	const nw = Math.round(region.width * ratio), nh = Math.round(region.height * ratio)

	// Letterbox: nisbatni saqlab kichraytirib, 114 rangli to'ldirish bilan 640x640 qilamiz
	const { data } = await sharp(buffer)
		.extract(region)
		.resize(nw, nh)
		.removeAlpha()
		.extend({ top: 0, left: 0, bottom: SIZE - nh, right: SIZE - nw, background: { r: 114, g: 114, b: 114 } })
		.raw()
		.toBuffer({ resolveWithObject: true })

	// HWC RGB -> CHW BGR float32 (YOLOX normalizatsiyasiz, 0..255)
	const plane = SIZE * SIZE
	const input = new Float32Array(3 * plane)
	for (let i = 0; i < plane; i++) {
		input[i] = data[i * 3 + 2]
		input[plane + i] = data[i * 3 + 1]
		input[2 * plane + i] = data[i * 3]
	}

	const ort = require('onnxruntime-node')
	const session = await getSession()
	const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) }
	const result = await session.run(feeds)
	const out = result[session.outputNames[0]].data // [1, 8400, 85]

	const boxes = []
	for (let i = 0; i < GRIDS.length; i++) {
		const o = i * 85
		const score = out[o + 4] * out[o + 5] // obj * person
		if (score < SCORE_THRESHOLD) continue
		const [gx, gy, s] = GRIDS[i]
		const cx = (out[o] + gx) * s, cy = (out[o + 1] + gy) * s
		const bw = Math.exp(out[o + 2]) * s, bh = Math.exp(out[o + 3]) * s
		boxes.push({
			x1: (cx - bw / 2) / ratio + region.left, y1: (cy - bh / 2) / ratio + region.top,
			x2: (cx + bw / 2) / ratio + region.left, y2: (cy + bh / 2) / ratio + region.top, score
		})
	}
	return boxes
}

// Kichik/uzoqdagi odamlar uchun rasm 2x2 bo'lakka (20% ustma-ust) bo'linib, butun rasm bilan birga tahlil qilinadi
function regionsFor(w, h, tiled) {
	const full = { left: 0, top: 0, width: w, height: h }
	if (!tiled) return [full]
	const tw = Math.round(w * 0.6), th = Math.round(h * 0.6)
	return [
		full,
		{ left: 0, top: 0, width: tw, height: th },
		{ left: w - tw, top: 0, width: tw, height: th },
		{ left: 0, top: h - th, width: tw, height: th },
		{ left: w - tw, top: h - th, width: tw, height: th }
	]
}

// buffer: JPEG/PNG. Qaytaradi { count, boxes:[{x1,y1,x2,y2,score}] } (asl rasm piksellarida)
async function detectPeople(buffer, { tiled = true } = {}) {
	const meta = await sharp(buffer).metadata()
	const w = meta.width, h = meta.height
	if (!w || !h) throw new Error("Rasm o'lchami aniqlanmadi")

	let all = []
	for (const region of regionsFor(w, h, tiled)) all = all.concat(await runRegion(buffer, region))

	const people = nms(all).map((b) => ({
		x1: Math.max(0, Math.round(b.x1)), y1: Math.max(0, Math.round(b.y1)),
		x2: Math.min(w, Math.round(b.x2)), y2: Math.min(h, Math.round(b.y2)),
		score: Math.round(b.score * 100) / 100
	}))
	return { count: people.length, boxes: people, width: w, height: h }
}

module.exports = { detectPeople }
