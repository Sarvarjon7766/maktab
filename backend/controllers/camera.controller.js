const CameraService = require('../services/camera.service')

class CameraController {
	async create(req, res) {
		try {
			const result = await CameraService.create(req.body, req.user.school)
			if (result.success) {
				return res.status(201).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
	async update(req, res) {
		try {
			const result = await CameraService.update(req.params.id, req.body, req.user.school)
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
	async deleted(req, res) {
		try {
			const result = await CameraService.deleted(req.params.id, req.user.school)
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
	async getAll(req, res) {
		try {
			const result = await CameraService.getAll(req.user.school)
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
	async getDevices(req, res) {
		try {
			const result = await CameraService.getDevices(req.school._id)
			return res.status(200).json(result)
		} catch (error) {
			console.log(error)
			return res.status(500).json({ success: false, message: "Server xatosi" })
		}
	}
	async updateStatus(req, res) {
		try {
			const result = await CameraService.updateStatus(req.body.statuses, req.school._id)
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
module.exports = new CameraController()
