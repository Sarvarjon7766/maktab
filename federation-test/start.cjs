// Federatsiya sinov stendi: 3 ta TUMAN serveri (bitta bazada tumanlar bo'lib berilgan) + 1 ta VILOYAT serveri (alohida baza).
// Asl tizim (5050) tegilmaydi va "haqiqat manbai" (oracle) bo'lib xizmat qiladi: viloyat natijasi shu bilan solishtiriladi.
//   node start.cjs        — hammasini ishga tushiradi
//   node start.cjs stop   — to'xtatadi
const { spawn, execSync } = require('child_process')
const fs = require('fs'), path = require('path')
const B = path.resolve(__dirname, '../backend')
const PIDS = path.join(__dirname, '.pids.json')
const mongoose = require(path.join(B, 'node_modules/mongoose'))
require(path.join(B, 'node_modules/dotenv')).config({ path: path.join(B, '.env') })

const stop = () => {
	if (!fs.existsSync(PIDS)) return
	for (const p of JSON.parse(fs.readFileSync(PIDS, 'utf8'))) { try { execSync(`taskkill /PID ${p.pid} /T /F`, { stdio: 'ignore' }) } catch { /* allaqachon yopilgan */ } }
	fs.unlinkSync(PIDS)
	console.log('to\'xtatildi')
}
const wait = async (port, ms = 40000) => {
	const t = Date.now()
	while (Date.now() - t < ms) { try { const r = await fetch(`http://localhost:${port}/api/config`); if (r.ok) return true } catch { /* hali ishga tushmagan */ } await new Promise((r) => setTimeout(r, 500)) }
	return false
}

;(async () => {
	if (process.argv[2] === 'stop') return stop()
	stop()
	await mongoose.connect(process.env.MONGO_URI)
	const names = (await mongoose.connection.collection('schools').distinct('district')).filter(Boolean).sort()
	await mongoose.disconnect()
	const groups = [names.slice(0, 5), names.slice(5, 10), names.slice(10)]
	const procs = []
	const run = (label, port, env) => {
		const out = fs.openSync(path.join(__dirname, `${label}.log`), 'w')
		const p = spawn(process.execPath, label === 'region' ? ['--watch', '--watch-path=../backend/services/federation', '--watch-path=../backend/routes', 'index.js'] : ['index.js'], { cwd: B, env: { ...process.env, PORT: String(port), DISABLE_BACKGROUND: '1', ...env }, stdio: ['ignore', out, out], detached: false, windowsHide: true })
		procs.push({ label, port, pid: p.pid, districts: env.FEDERATION_DISTRICTS || '' })
	}
	groups.forEach((g, i) => run(`district${i + 1}`, 5081 + i, { APP_MODE: 'district', FEDERATION_DISTRICTS: g.join(',') }))
	run('region', 5070, { APP_MODE: 'region', MONGO_URI: process.env.MONGO_URI.replace(/\/[^/]+$/, '/facecontrol_region') })
	fs.writeFileSync(PIDS, JSON.stringify(procs, null, 1))
	for (const p of procs) console.log(p.label, p.port, (await wait(p.port)) ? 'tayyor' : 'ISHGA TUSHMADI (log: ' + p.label + '.log)', p.districts)
})()
