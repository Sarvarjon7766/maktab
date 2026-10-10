const { Schema, model, default: mongoose } = require('mongoose')

const employeeCommentSchema = new Schema({
  // Denormalizatsiya — to'g'ridan-to'g'ri maktab bo'yicha filtrlash uchun
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    index: true,
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: { type: String, required: true },   // YYYY-MM-DD
  endDate:   { type: String, default: null },    // YYYY-MM-DD | null = muddatsiz
  closed:    { type: Boolean, default: false },  // "Qaytdi" bosilgan — hozirgi holat so'rovlaridan chetlanadi
  comment:   { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['tatil', 'safar', 'kasallik', 'boshqa'],
    default: 'boshqa'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, { timestamps: true })

// Muayyan sana uchun kommentni tez topish uchun index
employeeCommentSchema.index({ employee: 1, startDate: 1, endDate: 1 })
// getMapForDate() BARCHA xodimlar bo'yicha `employee`siz so'raydi (admin/
// leader davomat sahifasi har render'da) — yuqoridagi indeks buni qamrab
// olmaydi, chunki uning yetakchi kaliti `employee`
employeeCommentSchema.index({ closed: 1, startDate: 1, endDate: 1 })

module.exports = model('EmployeeComment', employeeCommentSchema)

