// pm2: tuman yoki viloyat serverini ishga tushirish. Rejim backend/.env dagi APP_MODE dan olinadi.
//   (loyiha ildizidan)  pm2 start backend/deploy/ecosystem.config.cjs && pm2 save && pm2 startup
module.exports = {
	apps: [{
		name: 'faceid',
		cwd: require('path').resolve(__dirname, '..'), // backend/ papkasi
		script: 'index.js',
		instances: 1,            // AI va fon vazifalari bitta nusxada ishlashi kerak
		max_memory_restart: '3G',
		env: { NODE_ENV: 'production' },
		time: true
	}]
}
