const multer = require('multer')

// Xodimlarni Excel'dan ommaviy import qilish uchun — diskka yozilmaydi
// (memoryStorage), chunki fayl faqat bir martalik o'qish uchun kerak,
// keyin saqlanmaydi (rasm upload'idan farqli, xotira'dan bevosita
// exceljs bilan o'qiladi).
const storage = multer.memoryStorage()

const EXCEL_MIMETYPES = [
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
	'application/vnd.ms-excel', // ba'zi brauzerlar .xlsx uchun ham shuni yuboradi
]

const fileFilter = (req, file, cb) => {
	const isXlsxExt = file.originalname?.toLowerCase().endsWith('.xlsx')
	if (EXCEL_MIMETYPES.includes(file.mimetype) || isXlsxExt) {
		cb(null, true)
	} else {
		cb(new Error('Faqat .xlsx formatidagi fayllarni yuklash mumkin!'), false)
	}
}

const uploadExcel = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: 5 * 1024 * 1024 // 5 MB — bir necha ming qatorlik jadval uchun yetarli
	}
})

module.exports = uploadExcel

