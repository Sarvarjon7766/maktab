const EmployeeSyncService = require('../services/employee.sync.service')

class EmployeeSyncController {
	async getPending(req, res) {
		try {
			const employees = await EmployeeSyncService.getPending(req.school._id)
			return res.status(200).json(employees)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async ack(req, res) {
		try {
			const { employee_id, success, error, device_results } = req.body
			const result = await EmployeeSyncService.ack(employee_id, success, error, device_results, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async getPendingDeletes(req, res) {
		try {
			const employees = await EmployeeSyncService.getPendingDeletes(req.school._id)
			return res.status(200).json(employees)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}

	async ackDelete(req, res) {
		try {
			const { employee_id, success } = req.body
			const result = await EmployeeSyncService.ackDelete(employee_id, success, req.school._id)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
}

module.exports = new EmployeeSyncController()
