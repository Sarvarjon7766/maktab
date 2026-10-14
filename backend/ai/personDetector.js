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
		sessionPromise = ort.InferenceSession.create(MODEL_PATH, { executionProviders: require('./provider').providers(), graphOptimizationLevel: 'all', intraOpNumThreads: require('./threads').AI_THREADS })
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
async function runRegion(buffer, region, scoreThreshold = SCORE_THRESHOLD, cls = 0) {
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
		const score = out[o + 4] * out[o + 5 + cls] // obj * sinf ehtimoli (cls=0: odam)
		if (score < scoreThreshold) continue
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

// Bitta tik turgan odam ikki bo'lakka bo'linib qolishi mumkin (tana va oyoqlari alohida quti; bo'lak chegarasi yoki to'sib turgan parta sabab).
// IoU/ichida bo'lish tekshiruvi buni tutmaydi, natijada odam ikki marta sanaladi va «tik turgan» holati aniqlanmaydi.
// Qoida: bir ustunda (gorizontal 70%+ mos), vertikal ulanib turgan ikki quti birlashtirilganda TIK TURGAN odam shakliga (balandlik/eni 2.5–4.5) kelsa — bitta odam.
// O'tirgan o'quvchining ortidagisi bunday shakl bermaydi (birlashganda ~1.5–2.3), shuning uchun ular birlashmaydi.
function mergeFragments(people) {
	const list = people.map((p) => ({ ...p }))
	let merged = true
	while (merged) {
		merged = false
		outer: for (let i = 0; i < list.length; i++) {
			for (let j = i + 1; j < list.length; j++) {
				const a = list[i], b = list[j]
				const up = a.y1 <= b.y1 ? a : b, low = up === a ? b : a
				const wa = up.x2 - up.x1, wb = low.x2 - low.x1
				const hOverlap = Math.max(0, Math.min(up.x2, low.x2) - Math.max(up.x1, low.x1)) / Math.max(1, Math.min(wa, wb))
				if (hOverlap < 0.7) continue
				const ha = up.y2 - up.y1, hb = low.y2 - low.y1
				const vOverlap = Math.max(0, up.y2 - low.y1)
				const gap = Math.max(0, low.y1 - up.y2)
				const total = Math.max(up.y2, low.y2) - Math.min(up.y1, low.y1)
				if (vOverlap > 0.6 * Math.min(ha, hb) || gap > 0.1 * total) continue
				const x1 = Math.min(up.x1, low.x1), x2 = Math.max(up.x2, low.x2)
				const ratio = total / Math.max(1, x2 - x1)
				if (ratio < 2.5 || ratio > 4.5) continue
				const box = { x1, y1: Math.min(up.y1, low.y1), x2, y2: Math.max(up.y2, low.y2), score: Math.max(up.score, low.score) }
				list.splice(j, 1); list.splice(i, 1, box)
				merged = true
				break outer
			}
		}
	}
	return list
}

// buffer: JPEG/PNG. Qaytaradi { count, boxes:[{x1,y1,x2,y2,score}] } (asl rasm piksellarida)
async function detectPeople(buffer, { tiled = true, score } = {}) {
	const threshold = Number.isFinite(Number(score)) && Number(score) > 0 ? Number(score) : SCORE_THRESHOLD
	tiled = tiled !== false
	const meta = await sharp(buffer).metadata()
	const w = meta.width, h = meta.height
	if (!w || !h) throw new Error("Rasm o'lchami aniqlanmadi")

	let all = []
	for (const region of regionsFor(w, h, tiled)) all = all.concat(await runRegion(buffer, region, threshold))

	const people = mergeFragments(nms(all)).map((b) => ({
		x1: Math.max(0, Math.round(b.x1)), y1: Math.max(0, Math.round(b.y1)),
		x2: Math.min(w, Math.round(b.x2)), y2: Math.min(h, Math.round(b.y2)),
		score: Math.round(b.score * 100) / 100
	}))
	return { count: people.length, boxes: people, width: w, height: h }
}

// Rasmning bir hududida istalgan COCO sinfini (masalan 67 = telefon) qidiradi. region rasm ichiga qirqiladi. Qaytaradi [{x1,y1,x2,y2,score}]
async function detectClass(buffer, region, cls, score) {
	const meta = await sharp(buffer).metadata()
	const left = Math.max(0, Math.round(region.left)), top = Math.max(0, Math.round(region.top))
	const width = Math.min(meta.width - left, Math.round(region.width)), height = Math.min(meta.height - top, Math.round(region.height))
	if (width < 16 || height < 16) return []
	const boxes = await runRegion(buffer, { left, top, width, height }, score, cls)
	return nms(boxes).map((b) => ({ x1: Math.round(b.x1), y1: Math.round(b.y1), x2: Math.round(b.x2), y2: Math.round(b.y2), score: Math.round(b.score * 100) / 100 }))
}

module.exports = { detectPeople, detectClass, mergeFragments }
