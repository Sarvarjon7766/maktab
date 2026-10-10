// Maktabni ishga tushirish bosqichlari: nima tayyor, nima yetishmayapti. Bosh sahifadagi "Tizimni sozlash" kartasi uchun.
// Tahlil sahifalarining ko'pi (davomat, aqlli kuzatuv, kutilgan tarkib) shu ma'lumotlarga tayanadi.
const sinfModel = require('../models/sinf.model')
const studentModel = require('../models/student.model')
const userModel = require('../models/user.model')
const hikCameraModel = require('../models/hik.camera.model')
const { ParentLink } = require('../models/parent.model')
const adduserModel = require('../models/add.user.model')

const STAFF_ROLES = ['viewer', 'leader']

class SetupService {
	async status(schoolId) {
		const has = (f) => ({ $exists: true, $nin: [null, ''] , ...f })
		const [sinflar, withHead, students, withPhoto, staff, cameras, linked, vision, online, parentStudents, cameraIssues] = await Promise.all([
			sinfModel.countDocuments({ schoolId }),
			sinfModel.countDocuments({ schoolId, head: { $exists: true, $ne: null } }),
			studentModel.countDocuments({ schoolId, isActive: { $ne: false } }),
			studentModel.countDocuments({ schoolId, isActive: { $ne: false }, photo: has() }),
			userModel.countDocuments({ schoolId, role: { $in: STAFF_ROLES }, isActive: { $ne: false } }),
			hikCameraModel.countDocuments({ schoolId, role: 'monitor', inCloud: { $ne: false } }),
			hikCameraModel.countDocuments({ schoolId, role: 'monitor', inCloud: { $ne: false }, sinfId: { $ne: null } }),
			hikCameraModel.countDocuments({ schoolId, role: 'monitor', inCloud: { $ne: false }, visionEnabled: true }),
			hikCameraModel.countDocuments({ schoolId, role: 'monitor', inCloud: { $ne: false }, visionEnabled: true, online: true }),
			ParentLink.distinct('student', { schoolId, active: true }),
			// Rasmi kameraga yuborilgan, lekin qabul qilinmagan (xato bilan qaytgan) xodimlar
			adduserModel.countDocuments({ schoolId, attempts: { $gt: 0 }, lastError: { $nin: [null, ''] } })
		])
		const steps = [
			{ key: 'sinf', title: 'Sinflar yaratilgan', value: `${sinflar} ta`, done: sinflar > 0, link: 'sinf', hint: "Sinflarni qo'shing: hamma tahlil sinflar bo'yicha ishlaydi" },
			{ key: 'head', title: 'Sinf rahbarlari belgilangan', value: `${withHead} / ${sinflar}`, done: sinflar > 0 && withHead === sinflar, link: 'sinf', hint: "Har sinfga sinf rahbarini (xodim) biriktiring" },
			{ key: 'staff', title: "Xodimlar qo'shilgan", value: `${staff} ta`, done: staff > 0, link: 'users', hint: "Xodimlarni qo'shing yoki Excel orqali yuklang" },
			{ key: 'students', title: "O'quvchilar qo'shilgan", value: `${students} ta`, done: students > 0, link: 'students', hint: "O'quvchilarni sinflarga qo'shing: davomat va kutilgan sinf tarkibi shundan hisoblanadi" },
			{ key: 'photos', title: "O'quvchilar rasmi (FaceID)", value: `${withPhoto} / ${students}`, done: students > 0 && withPhoto === students, link: 'students', hint: "Rasmi bo'lmagan o'quvchi FaceControl'da tanilmaydi" },
			{ key: 'parents', title: "Ota-onalar Telegram botga ulangan", value: `${parentStudents.length} / ${students} o'quvchi`, done: students > 0 && parentStudents.length > 0, link: 'parents', hint: "Ota-onalar uchun havola yarating: farzandi kirsa/chiqsa Telegram'da xabar oladi" },
			{ key: 'cameras', title: 'Kameralar sinfga biriktirilgan', value: `${linked} / ${cameras}`, done: linked > 0, link: 'camera', hint: "Kameralar sahifasida kamerani sinfga biriktiring" },
			{ key: 'vision', title: 'Aqlli kuzatuv yoqilgan', value: `${online} / ${vision} online`, done: vision > 0, link: 'camera', hint: "Sinfga biriktirilgan kamerada aqlli kuzatuv o'zi yoqiladi" }
		]
		const done = steps.filter((s) => s.done).length
		return { success: true, cameraIssues, steps, done, total: steps.length, percent: Math.round((done / steps.length) * 100) }
	}
}

module.exports = new SetupService()
