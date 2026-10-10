const SinfService = require('../services/sinf.service')
class SinfController {
	async create(req, res) {
		try {
			const result = await SinfService.create(req.body, req.user.school)
			if (result.success) {
				return res.status(201).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server error", error })
		}
	}
	async getAll(req, res) {
		try {
			const result = await SinfService.getAll(req.user.school)
			if (result.success) {
				return res.status(200).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server error", error })
		}
	}
	async update(req, res) {
		try {
			const result = await SinfService.update(req.params.id, req.body, req.user.school)
			if (result.success) {
				return res.status(201).json(result)
			} else {
				return res.status(400).json(result)
			}
		} catch (error) {
			return res.status(500).json({ success: false, message: "Server error", error })
		}
	}

}
module.exports = new SinfController()
