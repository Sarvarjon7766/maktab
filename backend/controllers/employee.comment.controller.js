const EmployeeCommentService = require('../services/employee.comment.service')
const dayjs = require('dayjs')

class EmployeeCommentController {

  async create(req, res) {
    try {
      const creatorId   = req.user.userId
      const creatorRole = req.user.role
      const { employeeId, startDate, endDate, comment, type } = req.body

      // Faqat o'zi uchun yozsa ruxsat, boshqa odam uchun yozsa admin/user/leader kerak
      const isSelf = employeeId === creatorId
      if (!isSelf && !['user', 'admin', 'leader'].includes(creatorRole)) {
        return res.status(403).json({ success: false, message: "Ruxsat yo'q" })
      }

      const result = await EmployeeCommentService.create(req.body, creatorId, req.user.school)
      return res.status(result.success ? 201 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  async getByEmployee(req, res) {
    try {
      const { userId } = req.params
      // O'z izohini (Profile sahifasi) yoki admin-darajadagi rol boshqa
      // xodimning izohini o'qiy oladi — aks holda istalgan xodim boshqa
      // birovning kasallik/ta'til sababini o'qiy olardi
      const isSelf = userId === req.user.userId
      if (!isSelf && !['user', 'admin', 'leader'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: "Ruxsat yo'q" })
      }
      const result = await EmployeeCommentService.getByEmployee(userId, req.user.school)
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  async getActiveForDate(req, res) {
    try {
      const { userId } = req.params
      const isSelf = userId === req.user.userId
      if (!isSelf && !['user', 'admin', 'leader'].includes(req.user.role)) {
        return res.status(403).json({ success: false, message: "Ruxsat yo'q" })
      }
      const dateString = req.query.date || dayjs().format('YYYY-MM-DD')
      const result = await EmployeeCommentService.getActiveForDate(userId, dateString, req.user.school)
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  // Bugungi (yoki berilgan) sana uchun barcha xodimlar kommentlari map
  async getMapForDate(req, res) {
    try {
      const dateString = req.query.date || dayjs().format('YYYY-MM-DD')
      const result = await EmployeeCommentService.getMapForDate(dateString, req.user.school)
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  async update(req, res) {
    try {
      const result = await EmployeeCommentService.update(
        req.params.id,
        req.body,
        req.user.userId,
        req.user.role,
        req.user.school
      )
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  async close(req, res) {
    try {
      const result = await EmployeeCommentService.close(
        req.params.id,
        req.user.userId,
        req.user.role,
        req.user.school
      )
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }

  async remove(req, res) {
    try {
      const result = await EmployeeCommentService.remove(
        req.params.id,
        req.user.userId,
        req.user.role,
        req.user.school
      )
      return res.status(result.success ? 200 : 400).json(result)
    } catch {
      return res.status(500).json({ success: false, message: 'Server xatosi' })
    }
  }
}

module.exports = new EmployeeCommentController()
