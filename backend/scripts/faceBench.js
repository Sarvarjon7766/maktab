// Yuz modellarini solishtirish (SFace vs ArcFace) — bir odamga bitta rasm bo'lsa ham ishlaydi.
//   node scripts/faceBench.js <rasmlar_papkasi> [--max=40]
// Usul: har rasmdagi eng katta yuz bazaga (toza) olinadi; tanish uchun shu rasmning KAMERA SIFATIGA tushirilgan nusxasi
// (yuz kichraytirilib, JPEG siqilib, biroz xiralashtirib) beriladi. Natija: «kim bu?» da 1-o'rinda to'g'ri topilish ulushi (rank-1),
// to'g'ri juft va begona juftlarning o'rtacha o'xshashligi. Faqat konsolga umumiy raqamlar chiqadi, rasm nusxalanmaydi.
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')
const ort = require('onnxruntime-node')
const E = require('../ai/faceEngine')

const dir = process.argv[2]
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '--max=40').slice(6))
if (!dir || !fs.existsSync(dir)) { console.error('Ishlatish: node scripts/faceBench.js <papka> [--max=40]'); process.exit(1) }

const ARC = process.env.FACE_ARC_MODEL || path.join(__dirname, '..', 'ai', 'models', 'face_recognition_arcface_r100.onnx')
const SFACE = path.join(__dirname, '..', 'ai', 'models', 'face_recognition_sface_2021dec.onnx')
const norm = (f) => { let n = 0; for (const v of f) n += v * v; n = Math.sqrt(n) || 1; return Float32Array.from(f, (v) => v / n) }
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s }

;(async () => {
	const sf = await ort.InferenceSession.create(SFACE, { executionProviders: ['cpu'], logSeverityLevel: 3 })
	const ar = await ort.InferenceSession.create(ARC, { executionProviders: ['cpu'], logSeverityLevel: 3 })
	// aligned: Float32 CHW RGB 0..255 (faceEngine.alignCrop)
	const MODELS = {
		sface: async (al) => norm((await sf.run({ data: new ort.Tensor('float32', al, [1, 3, 112, 112]) })).fc1.data),
		'arc_sym(x-127.5)/127.5': async (al) => norm(Object.values(await ar.run({ data: new ort.Tensor('float32', Float32Array.from(al, (v) => (v - 127.5) / 127.5), [1, 3, 112, 112]) }))[0].data),
		'arc_unit(x/255)': async (al) => norm(Object.values(await ar.run({ data: new ort.Tensor('float32', Float32Array.from(al, (v) => v / 255), [1, 3, 112, 112]) }))[0].data),
		'arc_raw(0..255)': async (al) => norm(Object.values(await ar.run({ data: new ort.Tensor('float32', al, [1, 3, 112, 112]) }))[0].data)
	}

	const files = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).slice(0, MAX)
	const gallery = [] // { id, buf, face, aligned }
	for (const f of files) {
		try {
			const buf = await sharp(fs.readFileSync(path.join(dir, f))).rotate().jpeg({ quality: 95 }).toBuffer()
			const faces = await E.detectInPhoto(buf, { score: 0.7 })
			if (!faces.length) continue
			const face = faces.sort((a, b) => b.size - a.size)[0]
			const meta = await sharp(buf).metadata()
			const rgb = await sharp(buf).removeAlpha().raw().toBuffer()
			const sc = Math.min(1, 640 / Math.max(meta.width, meta.height)) // detectInPhoto koordinatalari asl kadrda — kerak emas, lekin ishonch uchun
			void sc
			gallery.push({ id: f, buf, face, W: meta.width, H: meta.height, rgb })
		} catch { /* o'qib bo'lmadi */ }
	}
	console.log(`Rasmlar: ${files.length}, yuz topilgan: ${gallery.length}`)
	if (gallery.length < 5) { console.log('Kamida 5 ta yuzli rasm kerak'); process.exit(0) }

	const emb = {}
	for (const [name, fn] of Object.entries(MODELS)) emb[name] = await Promise.all(gallery.map(async (g) => fn(E.alignCrop(g.rgb, g.W, g.H, g.face.lm))))

	const SIZES = [18, 24, 32, 48]
	const result = {}
	for (const target of SIZES) {
		const probes = []
		for (const g of gallery) {
			const k = target / g.face.size
			const w = Math.max(64, Math.round(g.W * k)), h = Math.max(48, Math.round(g.H * k))
			// kamera sifati: kichraytirish, biroz xiralik, JPEG siqish; so'ng tanish uchun kattalashtirib (upscale) topiladi
			const small = await sharp(g.buf).resize(w, h, { kernel: 'lanczos3' }).blur(0.6).jpeg({ quality: 45 }).toBuffer()
			const up = Math.min(4, Math.max(1, 40 / target)) // topuvchi kichik yuzni ko'rishi uchun
			const faces = await E.detectFaces(small, { score: 0.5, upscale: up })
			if (!faces.length) { probes.push(null); continue }
			// asl yuz markaziga eng yaqin topilgan yuz
			const cx = ((g.face.x1 + g.face.x2) / 2) * k, cy = ((g.face.y1 + g.face.y2) / 2) * k
			const f = faces.sort((a, b) => Math.hypot((a.x1 + a.x2) / 2 - cx, (a.y1 + a.y2) / 2 - cy) - Math.hypot((b.x1 + b.x2) / 2 - cx, (b.y1 + b.y2) / 2 - cy))[0]
			const m = await sharp(small).metadata()
			const rgb = await sharp(small).removeAlpha().raw().toBuffer()
			probes.push({ f, W: m.width, H: m.height, rgb })
		}
		const found = probes.filter(Boolean).length
		for (const [name, fn] of Object.entries(MODELS)) {
			let hit = 0, gen = 0, imp = 0, impN = 0, tried = 0
			for (let i = 0; i < probes.length; i++) {
				const p = probes[i]
				if (!p) continue
				const al = E.alignCrop(p.rgb, p.W, p.H, p.f.lm)
				if (!al) continue
				const e = await fn(al)
				tried++
				let best = -2, bi = -1
				for (let j = 0; j < emb[name].length; j++) {
					const s = dot(e, emb[name][j])
					if (j === i) gen += s; else { imp += s; impN++ }
					if (s > best) { best = s; bi = j }
				}
				if (bi === i) hit++
			}
			;(result[name] = result[name] || {})[target] = { rank1: tried ? hit / tried : 0, found, tried, genuine: gen / (tried || 1), impostor: imp / (impN || 1) }
		}
	}
	console.log(`\nGalereya: ${gallery.length} kishi. Ko'rsatkich: (yuz topildi ulushi) | rank-1 | o'rtacha to'g'ri / begona o'xshashlik`)
	for (const [name, bySize] of Object.entries(result)) {
		console.log(`\n${name}`)
		for (const t of SIZES) {
			const r = bySize[t]
			console.log(`  yuz ${String(t).padStart(2)} px: topildi ${r.found}/${gallery.length}  rank-1 ${(r.rank1 * 100).toFixed(0)}%  to'g'ri ${r.genuine.toFixed(2)}  begona ${r.impostor.toFixed(2)}`)
		}
	}
	process.exit(0)
})().catch((e) => { console.error(e); process.exit(1) })
