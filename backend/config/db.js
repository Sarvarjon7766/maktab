const mongoose = require('mongoose')

const OPTIONS = { serverSelectionTimeoutMS: 10000, socketTimeoutMS: 120000, maxPoolSize: 30 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let listenersAttached = false

const attachListeners = () => {
	if (listenersAttached) return
	listenersAttached = true
	mongoose.connection.on('error', (err) => console.error('❌ MongoDB xatosi:', err.message))
	mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB uzildi'))
	mongoose.connection.on('reconnected', () => console.log('✅ MongoDB qayta ulandi'))
}

// Ulanishni kutadi (qayta urinishlar bilan). Ulanmasa xato tashlaydi — chaqiruvchi chiqishni hal qiladi
const connectDB = async (attempts = 5) => {
	attachListeners()
	let lastError
	for (let i = 1; i <= attempts; i++) {
		try {
			const conn = await mongoose.connect(process.env.MONGO_URI, OPTIONS)
			console.log(`✅ MongoDB ulandi: ${conn.connection.host}`)
			return conn
		} catch (err) {
			lastError = err
			console.error(`❌ MongoDB ulanishda xatolik (${i}/${attempts}):`, err.message)
			if (i < attempts) await sleep(Math.min(15000, 1000 * 2 ** i))
		}
	}
	throw lastError
}

module.exports = connectDB
