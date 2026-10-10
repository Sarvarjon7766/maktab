const { Schema, model, default: mongoose } = require('mongoose')

const attendanceSchema = new Schema({
  // user._id orqali ham chiqarish mumkin, lekin denormalizatsiya qilingan —
  // tabel/hisobot so'rovlari populate qilmasdan to'g'ridan-to'g'ri maktab
  // bo'yicha filtrlashi uchun.
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  
  date: {
    type: Date,
    required: true
  },

  dateString: {
    type: String,
    required: true
  },

  status: {
    type: String,
    enum: ['ishda', 'tashqarida', 'kelmagan'],
    default: 'ishda'
  },
  totalTime: {
    type: String,
    default: '0:00'
  },
  totalEntries: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
})

// Har bir xodim uchun kuniga faqat BITTA davomat yozuvi bo'lishi kerak —
// bu ham tez-tez ishlatiladigan {user,dateString} so'rovlarni tezlashtiradi,
// ham checkInAttendance'dagi atomik findOneAndUpdate+upsert orqali ikkita
// bir vaqtdagi kirish hodisasi ikkita yozuv yaratib qo'yishining oldini oladi
attendanceSchema.index({ user: 1, dateString: 1 }, { unique: true })
attendanceSchema.index({ dateString: 1, status: 1 })
attendanceSchema.index({ schoolId: 1, dateString: 1, status: 1 })

module.exports = model('Attendance', attendanceSchema)

