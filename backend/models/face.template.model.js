const { Schema, model, default: mongoose } = require('mongoose')

// O'quvchining yuz izi (SFace, 128 son = 512 bayt). Bir o'quvchida bir nechta iz bo'ladi:
//   photo — asosiy surat (Student.photo) dan; extra — admin yuklagan qo'shimcha yuz suratlari (3–5 ta tavsiya);
//   auto  — sinf kamerasidan ishonchli tanilgan kesmalar (avto-o'rganish; faqat iz saqlanadi, kesma rasm emas).
// Biometrik ma'lumot: o'quvchi o'chirilsa/nofaol bo'lsa yoki yuz tanish o'chirilsa — izlar ham o'chadi (services/face.service.js).
const faceTemplateSchema = new Schema({
	schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true, index: true },
	studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
	sinfId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sinf', default: null },
	kind: { type: String, enum: ['student', 'staff'], default: 'student' }, // 'staff' bo'lsa studentId — xodim (User) id'si, sinfId yo'q
	embedding: { type: Buffer, required: true },
	model: { type: String, enum: ['sface', 'arcface'], default: 'sface' }, // izni olgan model: boshqa model izlari bilan solishtirilmaydi
	source: { type: String, enum: ['photo', 'extra', 'auto'], default: 'photo' },
	file: { type: String, default: '' },       // extra: uploads ichidagi surat fayli; photo: Student.photo nomi (o'zgarsa qayta olinadi)
	size: { type: Number, default: 0 },        // yuzning kichik tomoni (px)
	score: { type: Number, default: 0 },       // yuz topish ishonchi
	sharp: { type: Number, default: 0 },       // tiniqlik (Laplas dispersiyasi)
	yaw: { type: Number, default: 0 }          // burilish (0 = to'g'ri qaragan)
}, { timestamps: true })

faceTemplateSchema.index({ schoolId: 1, sinfId: 1 })
faceTemplateSchema.index({ studentId: 1, source: 1 })

module.exports = model('FaceTemplate', faceTemplateSchema)
