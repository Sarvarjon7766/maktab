// AI modellari (ONNX, CPU) ishlatadigan oqimlar soni. Standart: yadrolarning yarmi (kamida 1): qolgani API, baza va brauzerga qoladi.
// Hamma yadro band bo'lsa butun tizim (va shu kompyuterdagi brauzer) qotadi. Sozlash: AI_THREADS=n
const os = require('os')
const cores = (os.availableParallelism ? os.availableParallelism() : os.cpus().length) || 2
const AI_THREADS = Math.max(1, Math.min(cores, Number(process.env.AI_THREADS) || Math.floor(cores / 2)))
module.exports = { AI_THREADS }
