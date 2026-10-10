const { Schema, model, default: mongoose } = require('mongoose')

const attendanceLogSchema = new Schema({
  // Denormalizatsiya — to'g'ridan-to'g'ri maktab bo'yicha filtrlash uchun
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

  // To'liq vaqt (UTC)
  date: {
    type: Date,
    required: true
  },

  // Faqat YYYY-MM-DD (local kun uchun)
  dateString: {
    type: String,
    required: true
  },

  checkin: {
    type: Boolean,
    required: false
  },
  checkout: {
    type: Boolean,
    required: false
  },
  checkInTime: {
    type: Date,
    required: false
  },
  checkOutTime: {
    type: Date,
    required: false
  },
  comment: {
    type: String,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
})

// Eng ko'p ishlatiladigan so'rov naqshlari: xodimning eng oxirgi logi
// (cooldown tekshiruvi, har check-in/check-out'da), kunlik statistika
// (dateString+checkin), va ochiq (hali yopilmagan) yozuvlarni tez topish
attendanceLogSchema.index({ user: 1, date: -1 })
attendanceLogSchema.index({ dateString: 1, checkin: 1 })
attendanceLogSchema.index({ schoolId: 1, dateString: 1, checkin: 1, user: 1, checkInTime: 1 })
attendanceLogSchema.index({ checkin: 1, checkout: 1 })

module.exports = model('AttendanceLog', attendanceLogSchema)

