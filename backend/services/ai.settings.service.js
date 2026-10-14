// AI (aqlli kuzatuv) sozlamalari: hammasi tizim egasi panelidan boshqariladi va bazada (PlatformSettings.ai) saqlanadi.
// .env dagi eski VISION_* qiymatlari faqat BOSHLANG'ICH qiymat sifatida o'qiladi (bazada o'zgarish bo'lmasa). 15 soniya keshlanadi.
const fs = require('fs')
const path = require('path')
const PlatformSettings = require('../models/platform.settings.model')

const MODELS_DIR = path.join(__dirname, '..', 'ai', 'models')
const MODEL_FILE = /^[A-Za-z0-9._-]{3,80}\.onnx$/
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d)

// Maydonlar: [standart, min, max, tur]. tur: 'n' son, 'b' mantiqiy, 's' matn (model nomi / manzil)
// .env qiymatlari har safar o'qiladi (dotenv servis yuklanganidan keyin ishga tushishi mumkin)
const buildSchema = () => {
	const env = process.env
	return {
	enabled: [env.VISION_ENABLED !== '0', null, null, 'b'],            // sinfxona kameralarini tahlil qilish
	intervalSec: [num(env.VISION_INTERVAL_SEC, 30), 15, 3600, 'n'],      // har kamerani necha soniyada tahlil qilish
	classIntervalSec: [0, 0, 3600, 'n'],                                  // sinfxona kamerasi oralig'i (0 = umumiy oraliq)
	gateIntervalSec: [0, 0, 3600, 'n'],                                   // darvoza (chiqish) kamerasi oralig'i (0 = umumiy; tavsiya 20)
	hallIntervalSec: [0, 0, 3600, 'n'],                                   // zal/koridor kamerasi oralig'i (0 = umumiy)
	poseEveryN: [1, 1, 20, 'n'],                                          // skeletni har N-tahlilda hisoblash (1 = har safar)
	shedLagMs: [300, 0, 5000, 'n'],                                       // event loop kechikishi shundan oshsa darvozadan boshqa kameralar tahlili to'xtatiladi (0 = o'chiq)
	sampleEveryMin: [30, 5, 720, 'n'],                                    // hodisa bo'lmasa avtomatik namuna oralig'i (daqiqa)
	deviceParallel: [num(env.VISION_DEVICE_PARALLEL, 3), 1, 64, 'n'],     // bir vaqtda nechta qurilma (NVR) so'raladi
	deviceGapSec: [num(env.VISION_DEVICE_GAP_SEC, 8), 2, 120, 'n'],       // bir qurilmadagi ketma-ket so'rovlar orasi
	emptyMin: [num(env.VISION_EMPTY_MIN, 15), 1, 120, 'n'],               // dars vaqtida sinf shuncha daqiqa bo'sh tursa "bo'sh qoldi"
	detectorModel: ['yolox_s.onnx', null, null, 's'],                     // odam topuvchi model fayli (ai/models)
	detectorScore: [num(env.PERSON_SCORE, 0.35), 0.1, 0.9, 'n'],          // odam ishonch chegarasi
	tiled: [true, null, null, 'b'],                                       // kadrni bo'laklab tahlil qilish (orqa qatordagilar uchun)
	poseEnabled: [env.VISION_POSE !== '0', null, null, 'b'],              // skelet/holatlar (o'tirgan, tik, ...)
	poseLive: [env.VISION_POSE_LIVE !== '0', null, null, 'b'],            // holatlarni har tahlilda sanash (aks holda faqat hodisada)
	poseModel: ['rtmpose_m.onnx', null, null, 's'],
	poseConf: [num(env.POSE_CONF, 0.25), 0.05, 0.9, 'n'],                 // skelet nuqtasi ishonch chegarasi
	hallCrowd: [num(env.VISION_HALL_CROWD, 40), 5, 5000, 'n'],            // zalda "zich" odam soni (kamerada alohida berilmagan bo'lsa)
	restlessAct: [0.6, 0.2, 1, 'n'],                                      // harakat darajasi shundan yuqori bo'lsa "notinch"
	restlessMinPeople: [8, 2, 200, 'n'],                                  // notinchlik uchun kadrda eng kam odam
	phoneEnabled: [env.VISION_PHONE !== '0', null, null, 'b'],            // telefon nomzodlari (ishonchsiz, faqat statistika)
	phoneScore: [num(env.PHONE_SCORE, 0.3), 0.1, 0.9, 'n'],
	vlmEnabled: [env.VISION_VLM === '1', null, null, 'b'],                // "AI ikkinchi fikri" (Ollama kerak)
	ollamaUrl: [env.OLLAMA_URL || 'http://localhost:11434', null, null, 's'],
	vlmModel: [env.VISION_VLM_MODEL || 'qwen2.5vl:3b', null, null, 's'],
	vlmGpu: [env.VISION_VLM_GPU === '1', null, null, 'b'],                // ko'rish modelini GPU'da ishlatish
	// Sinfxona kameralarida yuz tanish (ai/faceEngine.js, services/face.service.js). Sukut bo'yicha O'CHIQ: biometrik ma'lumot
	faceEnabled: [env.FACE_ENABLED === '1', null, null, 'b'],
	faceModel: ['sface', null, null, 's'],                                   // yuz izi modeli: sface (yengil) | arcface (kuchli, GPU kerak)
	faceScore: [num(env.FACE_SCORE, 0.6), 0.3, 0.95, 'n'],                // yuz topish ishonch chegarasi
	faceMinSize: [num(env.FACE_MIN_SIZE, 16), 8, 200, 'n'],               // shundan kichik (px) yuzlar tanishda hisobga olinmaydi
	faceUpscale: [num(env.FACE_UPSCALE, 1), 1, 3, 'n'],                   // kadrni kattalashtirib yuz qidirish (kichik yuzlar uchun; sekinroq)
	// Eslatma: SFace'da bir odamning HAR XIL suratlari orasidagi kosinus ~0.35–0.55 (o'lchandi), shuning uchun chegara past; xavfsizlik sinf ichida cheklash,
	// 2-o'quvchidan farq va ko'p kadr tasdig'idan keladi. Haqiqiy maktab ma'lumotida kalibrovka qiling (o'qituvchi ro'yxati bilan solishtirib)
	faceThreshold: [num(env.FACE_THRESHOLD, 0.36), 0.2, 0.8, 'n'],        // o'xshashlik chegarasi (kichik yuzlarda o'zi ko'tariladi)
	faceVoteThreshold: [num(env.FACE_VOTE_THRESHOLD, 0.40), 0.25, 0.9, 'n'], // sinfni aniqlashda ovoz beruvchi yuz uchun chegara (qattiqroq)
	faceMargin: [num(env.FACE_MARGIN, 0.06), 0, 0.5, 'n'],                // 1- va 2-o'quvchi orasidagi eng kam farq
	faceMinHits: [num(env.FACE_MIN_HITS, 2), 1, 20, 'n'],                 // "ko'rindi" deb tasdiqlash uchun kerakli kadrlar soni
	faceAttendance: [false, null, null, 'b'],                              // yuz tanilganda avtomatik «kirdi» yozish (standart O'CHIQ)
	faceAttendanceScore: [0.45, 0.3, 0.95, 'n'],                          // davomatga yozish uchun o'xshashlik (oddiy chegaradan qattiqroq)
	faceGateScore: [0.55, 0.3, 0.95, 'n'],                                // darvoza (chiqish) kamerasi: davomat uchun o'xshashlik (sinf taxmini yo'q, shuning uchun qattiqroq)
	faceGateHits: [1, 1, 10, 'n'],                                        // darvoza kamerasida shuncha kadrda tanilsa yoziladi (odam darvozadan tez o'tadi, 1 kadr ham yetadi)
	faceAttendanceCooldownMin: [5, 0, 120, 'n'],                          // bir odamning yuz orqali «kirdi» va «chiqdi» holati orasidagi eng kam vaqt (daqiqa): tebranib ketmasligi uchun
	faceAttendanceMinCoverage: [0.8, 0, 1, 'n'],                          // sinfda izi bor o'quvchilar ulushi shundan past bo'lsa avtomatik davomat yozilmaydi
	faceAttendanceHits: [3, 1, 10, 'n'],                                  // shuncha kadrda tanilsagina yoziladi
	faceNotifyParents: [false, null, null, 'b'],                          // yuz orqali yozilgan kirishda ota-onaga Telegram xabari yuborish
	faceAutoLearn: [env.FACE_AUTO_LEARN !== '0', null, null, 'b']          // ishonchli tanilgan kesmalardan yuz izlarini avtomatik to'ldirish
	}
}

const defaults = () => Object.fromEntries(Object.entries(buildSchema()).map(([k, v]) => [k, v[0]]))

let cache = null
const TTL = 15 * 1000

// Bazadagi qiymatlar standart ustiga qo'yiladi; noto'g'ri qiymat standartga qaytadi
function merge(stored) {
	const out = defaults()
	for (const [k, [def, min, max, type]] of Object.entries(buildSchema())) {
		if (!stored || stored[k] === undefined || stored[k] === null) continue
		const v = stored[k]
		if (type === 'b') out[k] = v === true || v === 'true'
		else if (type === 'n') { const n = Number(v); if (Number.isFinite(n)) out[k] = Math.min(max, Math.max(min, n)) }
		else out[k] = String(v).slice(0, 200) || def
	}
	return out
}

async function get(force = false) {
	if (!force && cache && Date.now() - cache.at < TTL) return cache.value
	let stored = null
	try { stored = (await PlatformSettings.findOne().select('ai').lean())?.ai || null } catch { /* baza vaqtincha ishlamasa oxirgi/standart qiymat */ }
	cache = { at: Date.now(), value: merge(stored) }
	return cache.value
}

// Tekshirib saqlaydi: faqat ma'lum maydonlar, diapazon cheklovi, model fayllari mavjudligi, Ollama manzili
async function save(input) {
	const patch = {}
	for (const [k, [def, min, max, type]] of Object.entries(buildSchema())) {
		if (input?.[k] === undefined) continue
		const v = input[k]
		if (type === 'b') { patch[k] = v === true || v === 'true'; continue }
		if (type === 'n') {
			const n = Number(v)
			if (!Number.isFinite(n)) return { success: false, message: `«${k}» son bo'lishi kerak` }
			patch[k] = Math.min(max, Math.max(min, n)); continue
		}
		const s = String(v || '').trim()
		if (k === 'detectorModel' || k === 'poseModel') {
			if (!MODEL_FILE.test(s) || !fs.existsSync(path.join(MODELS_DIR, s))) return { success: false, message: `Model fayli topilmadi: ${s}` }
		}
		if (k === 'ollamaUrl') {
			try { const u = new URL(s); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('x') } catch { return { success: false, message: "Ollama manzili noto'g'ri" } }
		}
		if (k === 'faceModel') {
			if (!['sface', 'arcface'].includes(s)) return { success: false, message: "Yuz izi modeli noto'g'ri" }
			if (s === 'arcface' && !fs.existsSync(require('../ai/faceEngine').MODELS.arcface.file)) return { success: false, message: 'ArcFace model fayli topilmadi (ai/models/face_recognition_arcface_r100.onnx)' }
		}
		if (k === 'vlmModel' && !/^[A-Za-z0-9._:/-]{2,80}$/.test(s)) return { success: false, message: "Ko'rish modeli nomi noto'g'ri" }
		patch[k] = s || def
	}
	const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`ai.${k}`, v]))
	await PlatformSettings.updateOne({}, { $set: set }, { upsert: true })
	cache = null
	return { success: true, settings: await get(true) }
}

async function reset() {
	await PlatformSettings.updateOne({}, { $unset: { ai: '' } }, { upsert: true })
	cache = null
	return { success: true, settings: await get(true) }
}

// Mavjud modellar: ai/models papkasidagi .onnx fayllar va (bo'lsa) Ollama modellari
async function models(ollamaUrl) {
	let files = []
	try { files = fs.readdirSync(MODELS_DIR).filter((f) => MODEL_FILE.test(f)).map((f) => ({ name: f, mb: Math.round(fs.statSync(path.join(MODELS_DIR, f)).size / 1048576) })) } catch { /* papka yo'q */ }
	let vlm = [], vlmError = ''
	try {
		const base = String(ollamaUrl || (await get()).ollamaUrl).replace(/\/$/, '')
		const r = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) })
		vlm = ((await r.json()).models || []).map((m) => ({ name: m.name, gb: Math.round((m.size || 0) / 1e8) / 10 }))
	} catch (e) { vlmError = e.name === 'TimeoutError' ? 'Ollama javob bermadi' : 'Ollama ulanmadi' }
	const isPose = (n) => /pose|rtm|keypoint|hrnet|movenet/i.test(n)
	return { detectors: files.filter((f) => !isPose(f.name)), poses: files.filter((f) => isPose(f.name)), vlm, vlmError }
}

module.exports = { get, save, reset, models, defaults, buildSchema }
