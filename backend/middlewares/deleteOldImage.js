const path = require('path')
const User = require('../models/user.model.js')
const { resolveUploadPath } = require('../utils/safeInput')

// Eski rasmni bu yerda DARHOL o'chirmaymiz — faqat yo'lini req.oldImagePath'ga
// saqlab qo'yamiz. Haqiqiy o'chirish UserService.update
// MUVAFFAQIYATLI bo'lgandan keyin, controller ichida amalga oshiriladi.
// Aks holda: yangi rasm yuklanadi -> eski rasm shu yerda o'chiriladi ->
// update validatsiya xatosi bilan muvaffaqiyatsiz bo'ladi -> foydalanuvchida
// na eski, na yangi rasm qolmaydi (qaytarib bo'lmaydigan yo'qotish).
const deleteOldImage = async (req, res, next) => {
	try {
		const userId = req.params.id
		// schoolId bo'yicha cheklangan — boshqa maktab xodimi id orqali tegilmasin
		const existingUser = await User.findOne({ _id: userId, schoolId: req.user?.school })

		if (!existingUser) {
			return res.status(404).json({ message: 'Foydalanuvchi topilmadi' })
		}

		if (req.file && existingUser.photo) {
			req.oldImagePath = resolveUploadPath(existingUser.photo) || undefined
		}

		next()
	} catch (err) {
		console.error('Eski rasmni tekshirishda xatolik:', err)
		next()
	}
}

module.exports = deleteOldImage

