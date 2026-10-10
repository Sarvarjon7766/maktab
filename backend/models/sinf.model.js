const { Schema, model, default: mongoose } = require('mongoose');

// Maktab sinfi (masalan "5-A"). Jismoniy MongoDB kolleksiya nomi ATAYLAB
// eski "departments" bo'lib qoldirilgan (collection: 'departments') —
// bu qayta nomlash faqat kod darajasida (model/API/frontend), mavjud
// ma'lumotlarni yana bir marta ko'chirish shart emas.
const sinfSchema = new Schema({
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    index: true,
    required: true
  },
  // Sinf darajasi (platforma Grade.number: 1–11) va parallel harfi (A, B, V ...). Nomi ikkalasidan hosil bo'ladi: "5-A"
  grade: {
    type: Number,
    default: null,
    index: true
  },
  letter: {
    type: String,
    default: '',
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  // Sinf rahbari (homeroom teacher) — xodim (User)
  head: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

// Maktab ichida nom takrorlanmasin (masalan "5-A" bitta maktabda bitta
// marta), lekin turli maktablarda bir xil nom qaytarilishi mumkin
sinfSchema.index({ schoolId: 1, name: 1 }, { unique: true });

module.exports = model('Sinf', sinfSchema, 'departments');

