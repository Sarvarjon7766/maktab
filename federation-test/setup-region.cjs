// Viloyat sinov bazasini tayyorlaydi: viloyat superadmini, tuman chegaralari nusxasi, tumanlar reestri (3 ta tuman serveri).
const path = require('path'), fs = require('fs')
const B = path.resolve(__dirname, '../backend')
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') })
const mongoose = require(path.join(B, 'node_modules/mongoose'))
const bcrypt = require(path.join(B, 'node_modules/bcrypt'))
const SP = process.env.FED_SP || ''
;(async () => {
	const base = process.env.MONGO_URI
	const src = await mongoose.createConnection(base).asPromise()
	const dst = await mongoose.createConnection(base.replace(/\/[^/]+$/, '/facecontrol_region')).asPromise()
	// 1) tuman chegaralari
	const docs = await src.collection('districts').find({}).toArray()
	await dst.collection('districts').deleteMany({}); if (docs.length) await dst.collection('districts').insertMany(docs)
	// 2) viloyat superadmini va monitor
	const users = dst.collection('users')
	const mk = async (username, role, extra = {}) => {
		const password = await bcrypt.hash('Region-test-123', 10)
		await users.updateOne({ username }, { $set: { username, fullName: username, role, password, isActive: true, schoolId: null, position: role, hodimID: username, ...extra } }, { upsert: true })
	}
	await mk('viloyat', 'superadmin')
	await mk('viloyat-monitor', 'monitor', { monitorScope: { region: 'Samarqand', district: '' } })
	await mk('tuman-monitor', 'monitor', { monitorScope: { region: 'Samarqand', district: "Bulung'ur" } })
	await dst.collection('remotedistricts').deleteMany({})
	await src.close(); await dst.close()
	// 3) tumanlar reestri — viloyat serveri API'si orqali (kalit shifrlanadi)
	const key = fs.readFileSync(process.env.FED_KEY_FILE, 'utf8').trim()
	const login = await fetch('http://localhost:5070/api/user/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'viloyat', password: 'Region-test-123' }) }).then((r) => r.json())
	if (!login.token) throw new Error('viloyat login: ' + JSON.stringify(login))
	for (const [i, port] of [5081, 5082, 5083].entries()) {
		const r = await fetch('http://localhost:5070/api/federation-admin/districts', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token }, body: JSON.stringify({ name: `Server-${i + 1}`, region: 'Samarqand', baseUrl: `http://localhost:${port}`, apiKey: key }) }).then((r) => r.json())
		console.log('Server-' + (i + 1), r.success ? (r.connected ? 'ulandi' : 'ULANMADI: ' + r.error) : r.message, (r.district?.districts || []).join(', '))
	}
})().catch((e) => { console.error(e); process.exit(1) })
