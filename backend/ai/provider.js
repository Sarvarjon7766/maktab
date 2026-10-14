// ONNX modellari qaysi qurilmada ishlashi: AI_PROVIDER=cuda,cpu (Linux + NVIDIA) | dml,cpu (Windows GPU) | cpu (standart).
// Ro'yxat ketma-ket sinab ko'riladi: GPU topilmasa yoki ishga tushmasa keyingisiga (cpu) o'tadi
const ALLOWED = new Set(['cpu', 'cuda', 'dml', 'coreml'])
const providers = () => {
	const list = String(process.env.AI_PROVIDER || 'cpu').split(',').map((s) => s.trim().toLowerCase()).filter((s) => ALLOWED.has(s))
	if (!list.length) return ['cpu']
	return list.includes('cpu') ? list : [...list, 'cpu']
}
module.exports = { providers }
