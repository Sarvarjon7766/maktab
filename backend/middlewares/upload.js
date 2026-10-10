const multer = require('multer')
const fs = require('fs')

// Saqlanadigan kengaytma mimetype bo'yicha oq ro'yxatdan olinadi —
// foydalanuvchi bergan originalname kengaytmasiga ISHONILMAYDI
// (SVG/HTML kabi faol kontent /uploads orqali xizmat qilinmasligi uchun)
const MIME_TO_EXT = {
	'image/jpeg': '.jpg',
	'image/jpg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp'
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, 'uploads/')
	},
	filename: (req, file, cb) => {
		const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
		const ext = MIME_TO_EXT[String(file.mimetype).toLowerCase()]
		if (!ext) return cb(new Error("Faqat JPG, PNG yoki WEBP rasm yuklash mumkin"))
		cb(null, file.fieldname + '-' + uniqueSuffix + ext)
	}
})

const fileFilter = (req, file, cb) => {
	if (MIME_TO_EXT[String(file.mimetype).toLowerCase()]) {
		cb(null, true)
	} else {
		cb(new Error("Faqat JPG, PNG yoki WEBP rasm yuklash mumkin"), false)
	}
}

const multerInstance = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 20 * 1024 * 1024
	}
})

// Fayl boshidagi "magic bytes" bo'yicha haqiqiy formatni aniqlaydi
function sniffImage(buf) {
	if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return '.jpg'
	if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return '.png'
	if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return '.webp'
	return null
}

function verifyMagic(file) {
	let fd
	try {
		fd = fs.openSync(file.path, 'r')
		const buf = Buffer.alloc(12)
		const n = fs.readSync(fd, buf, 0, 12, 0)
		const kind = sniffImage(buf.subarray(0, n))
		return !!kind && kind === MIME_TO_EXT[String(file.mimetype).toLowerCase()]
	} catch (e) {
		return false
	} finally {
		if (fd !== undefined) try { fs.closeSync(fd) } catch (e) { }
	}
}

function removeFile(file) {
	try { fs.unlinkSync(file.path) } catch (e) { }
}

// multer.single(...) ni o'raydi: yuklangandan keyin fayl mazmuni haqiqatan
// JPEG/PNG/WEBP ekanini tekshiradi, mos kelmasa faylni o'chirib 400 qaytaradi
function single(fieldName) {
	const mw = multerInstance.single(fieldName)
	return (req, res, next) => {
		mw(req, res, (err) => {
			if (err) return next(err)
			if (req.file && !verifyMagic(req.file)) {
				removeFile(req.file)
				req.file = undefined
				return res.status(400).json({ success: false, message: "Fayl rasm emas yoki format mos kelmaydi (faqat JPG, PNG, WEBP)" })
			}
			next()
		})
	}
}

module.exports = { single }
