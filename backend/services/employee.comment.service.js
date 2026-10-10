const EmployeeComment = require('../models/employee.comment.model')
const mongoose = require('mongoose')
const userModel = require('../models/user.model')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
dayjs.extend(utc)
dayjs.extend(timezone)

class EmployeeCommentService {

  async create(data, createdById, schoolId) {
    try {
      const { employeeId, startDate, endDate, comment, type } = data
      if (!employeeId || !startDate || !comment) {
        return { success: false, message: "Xodim, boshlanish sanasi va izoh majburiy" }
      }
      if (endDate && startDate > endDate) {
        return { success: false, message: "Boshlanish sanasi tugash sanasidan keyin bo'lolmaydi" }
      }
      // xodim shu maktabga tegishli bo'lishi shart (boshqa maktab xodimiga izoh yozib bo'lmaydi)
      if (!mongoose.isValidObjectId(employeeId) || !(await userModel.exists({ _id: employeeId, schoolId }))) {
        return { success: false, message: "Xodim topilmadi" }
      }
      const doc = await EmployeeComment.create({
        schoolId,
        employee: employeeId,
        startDate,
        endDate: endDate || null,
        comment,
        type: type || 'boshqa',
        createdBy: createdById
      })
      const populated = await doc.populate([
        { path: 'employee', select: 'fullName position' },
        { path: 'createdBy', select: 'fullName' }
      ])
      return { success: true, message: "Komment saqlandi", data: populated }
    } catch (err) {
      console.error('EmployeeCommentService.create:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  async getByEmployee(employeeId, schoolId) {
    try {
      const comments = await EmployeeComment.find({ employee: employeeId, schoolId })
        .populate('createdBy', 'fullName')
        .sort({ startDate: -1 })
        .lean()
      return { success: true, data: comments }
    } catch (err) {
      console.error('EmployeeCommentService.getByEmployee:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  // Muayyan sana uchun faol kommentni qaytaradi
  async getActiveForDate(employeeId, dateString, schoolId) {
    try {
      const comment = await EmployeeComment.findOne({
        employee: employeeId,
        schoolId,
        closed: { $ne: true },
        startDate: { $lte: dateString },
        $or: [{ endDate: null }, { endDate: { $gte: dateString } }]
      })
        .populate('createdBy', 'fullName')
        .lean()
      return { success: true, data: comment || null }
    } catch (err) {
      console.error('EmployeeCommentService.getActiveForDate:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  // Muayyan sana oralig'idagi barcha kommentlar (davomat sahifasi uchun)
  // { userId: comment } ko'rinishida map qaytaradi
  async getMapForDate(dateString, schoolId) {
    try {
      const comments = await EmployeeComment.find({
        schoolId,
        closed: { $ne: true },
        startDate: { $lte: dateString },
        $or: [{ endDate: null }, { endDate: { $gte: dateString } }]
      })
        .populate('employee', 'fullName')
        .populate('createdBy', 'fullName')
        .lean()

      const map = {}
      comments.forEach(c => {
        map[c.employee._id.toString()] = c
      })
      return { success: true, data: map }
    } catch (err) {
      console.error('EmployeeCommentService.getMapForDate:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  async update(id, data, requesterId, requesterRole, schoolId) {
    try {
      // findById emas — boshqa maktabning kommenti id orqali taxmin qilib
      // tahrirlanmasligi uchun (canEdit=true bo'lgan admin-darajadagi rollar uchun muhim)
      const doc = await EmployeeComment.findOne({ _id: id, schoolId })
      if (!doc) return { success: false, message: "Komment topilmadi" }

      // Faqat izohni YOZGAN kishi (createdBy) yoki admin/leader tahrirlay oladi.
      // Izoh MAVZUSI (doc.employee) avval alohida "egasi" deb hisoblanardi —
      // bu xodim o'zi haqida boshqa birov (masalan rahbar) yozgan izohni ham
      // o'zi tahrirlashi mumkin bo'lib qolardi. O'z-o'ziga yozilgan izohlarda
      // createdBy === employee bo'lgani uchun bu cheklov ularga ta'sir qilmaydi.
      const isOwner = doc.createdBy?.toString() === requesterId
      const canEdit = ['user', 'admin', 'leader'].includes(requesterRole)

      if (!isOwner && !canEdit) {
        return { success: false, message: "Ruxsat yo'q" }
      }

      const { startDate, endDate, comment, type } = data
      if (endDate && startDate && startDate > endDate) {
        return { success: false, message: "Boshlanish sanasi tugash sanasidan keyin bo'lolmaydi" }
      }

      if (startDate)          doc.startDate = startDate
      if ('endDate' in data)  doc.endDate   = endDate || null
      if (comment)            doc.comment   = comment
      if (type)               doc.type      = type
      // Qo'lda tahrirlash "Qaytdi" bilan yopilgan kommentni qayta faollashtiradi
      doc.closed = false
      await doc.save()

      return { success: true, message: "Komment yangilandi", data: doc }
    } catch (err) {
      console.error('EmployeeCommentService.update:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  // Xodim qaytdi — endDate = bugun
  async close(id, requesterId, requesterRole, schoolId) {
    try {
      const doc = await EmployeeComment.findOne({ _id: id, schoolId })
      if (!doc) return { success: false, message: "Komment topilmadi" }

      const isOwner = doc.createdBy?.toString() === requesterId
      const canEdit = ['user', 'admin', 'leader'].includes(requesterRole)

      if (!isOwner && !canEdit) return { success: false, message: "Ruxsat yo'q" }

      // "Faol komment" so'rovlari endDate >= sana shartini tekshiradi (shu kunni
      // ham qamrab oladi), shuning uchun endDate'ni BUGUNGA emas KECHAGA
      // qo'yamiz — aks holda komment bugun ham "faol" bo'lib ko'rinaveradi va
      // "Qaytdi" tugmasi bugun uchun hech narsa o'zgartirmagandek tuyuladi
      const yesterday = dayjs().tz('Asia/Tashkent').subtract(1, 'day').format('YYYY-MM-DD')
      // Agar komment bugun boshlangan bo'lsa, endDate startDate'dan oldinga
      // tushib ketmasin — bu holda faqat o'sha kunning o'zi bilan yopiladi
      doc.endDate = yesterday < doc.startDate ? doc.startDate : yesterday
      // closed=true — bugun boshlanib bugun yopilgan holatda ham (endDate
      // startDate'dan oldinga o'tolmagani uchun) "hozirgi holat" so'rovlaridan
      // darhol chetlanishini kafolatlaydi
      doc.closed = true
      await doc.save()
      return { success: true, message: "Komment yopildi (xodim qaytdi)" }
    } catch (err) {
      console.error('EmployeeCommentService.close:', err)
      return { success: false, message: "Server xatosi" }
    }
  }

  // Kirish qayd etilganda faol kommentni avtomatik yopish
  async autoCloseOnCheckin(employeeId) {
    try {
      const today = dayjs().tz('Asia/Tashkent').format('YYYY-MM-DD')
      const yesterday = dayjs().tz('Asia/Tashkent').subtract(1, 'day').format('YYYY-MM-DD')
      const docs = await EmployeeComment.find({
        employee: employeeId,
        closed: { $ne: true },
        startDate: { $lte: today },
        $or: [{ endDate: null }, { endDate: { $gte: today } }]
      })
      for (const doc of docs) {
        doc.endDate = yesterday < doc.startDate ? doc.startDate : yesterday
        doc.closed = true
        await doc.save()
      }
    } catch (err) {
      console.error('EmployeeCommentService.autoCloseOnCheckin:', err)
    }
  }

  async remove(id, requesterId, requesterRole, schoolId) {
    try {
      const doc = await EmployeeComment.findOne({ _id: id, schoolId })
      if (!doc) return { success: false, message: "Komment topilmadi" }

      const isOwner = doc.createdBy?.toString() === requesterId
      const canDelete = ['user', 'admin', 'leader'].includes(requesterRole)

      if (!isOwner && !canDelete) {
        return { success: false, message: "Ruxsat yo'q" }
      }

      await doc.deleteOne()
      return { success: true, message: "Komment o'chirildi" }
    } catch (err) {
      console.error('EmployeeCommentService.remove:', err)
      return { success: false, message: "Server xatosi" }
    }
  }
}

module.exports = new EmployeeCommentService()

