// Ota-onalar uchun Telegram bot: ro'yxatga olish (maktab admini yaratgan havola orqali), FaceID bo'yicha o'quvchi
// maktabga kirdi / chiqdi xabarlari, bugungi/haftalik/oylik davomat, "kelmadi" xabari va sabab bildirish.
// Bitta umumiy bot (TELEGRAM_BOT_TOKEN, node-telegram-bot-api), har maktab o'z havolasi bilan.
//
// Ro'yxatga olish:
//  1) Umumiy havola (t.me/<bot>?start=<token>): ota-ona o'z telefon raqamini ulashadi (Telegram kontakti, user_id mos bo'lishi shart);
//     raqam o'quvchi kartasidagi ota-ona telefoni bilan mos kelsa, o'sha farzandlar avtomatik ulanadi. Mos kelmasa: admin ko'radigan "so'rov".
//  2) O'quvchiga maxsus havola: admin bitta o'quvchi uchun yaratadi (7 kun, 3 martagacha ishlaydi), ota-ona bosishi bilan ulanadi.
// Muhit: PARENT_BOT=0 — bot o'chiq; BOT_LEADER=false — bu jarayonda bot ishga tushmaydi (bir nechta jarayon bo'lsa bittasida ishlasin).
const crypto = require('crypto')
const mongoose = require('mongoose')
const QRCode = require('qrcode')
const MAX_AUTO_LINK = 10
const { ParentLink, ParentInvite, ParentRequest, ParentNotification, ParentAbsenceReport, ParentAbsentAlert, ParentHold } = require('../models/parent.model')
const studentModel = require('../models/student.model')
const sinfModel = require('../models/sinf.model')
const schoolModel = require('../models/school.model')
const settingsModel = require('../models/settings.model')
const StudentAttendance = require('../models/student.attandance.model')
const StudentAttendanceLog = require('../models/student.attandance.log.model')
const StudentExcuse = require('../models/student.excuse.model')
const PlatformSettings = require('../models/platform.settings.model')
const { encrypt, decrypt } = require('../utils/secretBox')
const { t, normLang, fromTelegram, menuAction, longDate, LANGS, LANG_LABELS } = require('../utils/botI18n')

const DEFAULTS = { enabled: true, notifyIn: true, notifyOut: true, minGapMinutes: 3, lateGraceMinutes: 0, absentAlertEnabled: false, absentAlertTime: '10:00', weeklyDigest: false }
const SEND_GAP_MS = 45 // Telegram chegarasi ~30 xabar/soniya
const SEND_TIMEOUT_MS = 15000
const INVITE_DAYS = 7
const INVITE_MAX_USES = 3
const PENDING_TTL_MS = 30 * 60 * 1000
const MAX_ATTEMPTS = 3 // vaqtinchalik xatolarda qayta urinishlar
const MAX_RATE_ATTEMPTS = 5 // 429 da
const QUEUE_MAX = 20000
const SETTINGS_TTL_MS = 60 * 1000
const CONTACT_LIMIT = 5 // bir chatdan soatiga telefon yuborish urinishlari
const REQ_PER_CHAT = 3 // bitta chatning kutilayotgan so'rovlari
const REQ_PER_SCHOOL = 300 // maktab bo'yicha kutilayotgan so'rovlar
const ABSENT_WINDOW_MIN = 240 // "kelmadi" xabari belgilangan vaqtdan keyin shuncha daqiqagacha yuboriladi
const QUIET_PRESETS = { a: ['22:00', '07:00'], b: ['20:00', '08:00'] }

const validId = (id) => mongoose.isValidObjectId(id)
const oid = (id) => new mongoose.Types.ObjectId(String(id))
const digits = (s) => String(s || '').replace(/\D/g, '')
// O'zbekiston raqamlari: +998 90 123 45 67 / 90 123 45 67 / 901234567 hammasi bir xil kalitga keladi (oxirgi 9 raqam)
const phoneKey = (s) => { const d = digits(s); return d.length >= 9 ? d.slice(-9) : '' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Asia/Tashkent (UTC+5, yozgi vaqt yo'q) devor soati: { date: 'YYYY-MM-DD', min: kun boshidan daqiqa, dow: 0=yakshanba }
const wall = (d = new Date()) => { const w = new Date(new Date(d).getTime() + 5 * 3600000); return { date: w.toISOString().slice(0, 10), min: w.getUTCHours() * 60 + w.getUTCMinutes(), dow: w.getUTCDay() } }
const clock = (d) => { const w = wall(d); return `${String(Math.floor(w.min / 60)).padStart(2, '0')}:${String(w.min % 60).padStart(2, '0')}` }
const startOfTodayTashkent = () => new Date(`${wall().date}T00:00:00+05:00`)
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const shiftDate = (d, days) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + days); return x.toISOString().slice(0, 10) }
const newToken = () => crypto.randomBytes(16).toString('base64url') // 22 belgi: Telegram start parametri uchun yaroqli
const isDup = (e) => e && (e.code === 11000 || /E11000/.test(String(e.message)))

// Qiymat jim soat oynasida (from <= now < to, yarim tun orqali ham) bo'lsa true
function inQuiet(nowMin, from, to) {
	const a = toMin(from), b = toMin(to)
	if (a === null || b === null || a === b) return false
	return a < b ? nowMin >= a && nowMin < b : nowMin >= a || nowMin < b
}

// Telegram xatosini tasniflash: blocked | rate | transient | fatal
function classifyError(e) {
	const status = e?.response?.statusCode || e?.response?.body?.error_code || 0
	const desc = String(e?.response?.body?.description || e?.message || '').toLowerCase()
	const retryAfter = e?.response?.body?.parameters?.retry_after || 0
	const code = String(e?.code || '').toLowerCase()
	if (status === 429 || retryAfter) return { type: 'rate', retryAfter: retryAfter || 2, desc }
	if (status === 403 || (status === 400 && /chat not found|user is deactivated|bot was blocked|bot can't initiate|peer_id_invalid/.test(desc))) return { type: 'blocked', desc }
	if (status >= 500 || (!status && /etimedout|econnreset|esockettimedout|enotfound|eai_again|econnrefused|epipe|efatal|socket hang up|network|timed out|timeout/.test(`${code} ${desc}`))) return { type: 'transient', desc }
	return { type: 'fatal', desc }
}

class ParentService {
	constructor() {
		this.bot = null
		this.botUsername = ''
		this.botError = ''
		this.source = null
		this.currentToken = ''
		this.queue = []
		this.pumping = false
		this.pausedUntil = 0 // 429: butun navbat shu vaqtgacha to'xtaydi
		this.stats = { dropped: 0, retried: 0, restarts: 0 }
		this.pending = new Map() // chatId -> { schoolId, inviteId, at }: telefon raqami kutilmoqda
		this.awaiting = new Map() // chatId -> { reportId, at }: "Boshqa" sababi matni kutilmoqda
		this.contactHits = new Map() // chatId -> [vaqtlar]
		this.touchAt = new Map() // chatId -> oxirgi "blokdan chiqarish" vaqti
		this.langCache = new Map()
		this.lastSent = new Map() // student:kind -> vaqt (takroriy xabarlarni kamaytirish)
		this.schoolNames = new Map()
		this.sinfNames = new Map()
		this.settingsCache = new Map()
		this.dayCache = new Map()
		this.warned = new Set()
		this.logBuf = []
		this.sentIds = new Set()
		this.flushTimer = null
		this.maintTimer = null
		this.lastPollingError = null
		this.pollFails = 0
		this.restartCount = 0
		this.restarting = false
		this.digestDone = new Set()
	}

	get ready() { return !!this.bot && !!this.botUsername }

	// ---------- Bot ----------
	// Token manbai: avval tizim egasi platforma panelida kiritgani (bazada shifrlangan), bo'lmasa .env dagi TELEGRAM_BOT_TOKEN
	async resolveToken() {
		const doc = await PlatformSettings.findOne().select('+telegramBotToken').lean()
		if (doc?.telegramBotToken) { try { return { token: decrypt(doc.telegramBotToken), source: 'db' } } catch { /* shifrlash kaliti o'zgargan: qayta kiritish kerak */ } }
		if (process.env.TELEGRAM_BOT_TOKEN) return { token: process.env.TELEGRAM_BOT_TOKEN, source: 'env' }
		return { token: '', source: null }
	}

	async start() {
		if (process.env.PARENT_BOT === '0') { this.botError = "Ota-onalar boti o'chirilgan (PARENT_BOT=0)"; return }
		if (String(process.env.BOT_LEADER || '').toLowerCase() === 'false') { this.botError = "Bu jarayonda bot ishga tushmaydi (BOT_LEADER=false)"; return }
		const { token, source } = await this.resolveToken()
		this.source = source
		if (!token) { this.botError = 'Bot tokeni kiritilmagan'; return }
		const r = await this.launch(token)
		if (!r.success) console.log('Ota-onalar boti:', r.error)
	}

	// Botni ishga tushiradi. Avval yangi token tekshiriladi (getMe); muvaffaqiyatli bo'lsagina eski bot to'xtatiladi.
	// { success, username, error }
	async launch(token, { restoring = false } = {}) {
		const TelegramBot = this.TelegramBotClass || require('node-telegram-bot-api')
		const bot = new TelegramBot(token, { polling: false })
		let me
		try { me = await bot.getMe() } catch (e) {
			const error = `Bot tokeni yaroqsiz yoki Telegram'ga ulanib bo'lmadi: ${e.message}`
			if (!this.bot) this.botError = error // ishlayotgan bot bo'lsa uning holatiga tegmaymiz
			return { success: false, error }
		}
		const old = this.bot, oldToken = this.currentToken
		if (old) await this.detach()
		try {
			this.attach(bot, me.username)
			this.currentToken = token
			this.pollFails = 0
			Promise.resolve(bot.startPolling()).catch((e) => this.onPollingError(bot, e)) // birinchi so'rov uzoq davom etadi: kutmaymiz
			console.log(`Ota-onalar boti ishga tushdi: @${me.username}`)
			return { success: true, username: me.username }
		} catch (e) {
			try { bot.removeAllListeners() } catch { /* ignore */ }
			this.bot = null; this.botUsername = ''
			const error = `Botni ishga tushirib bo'lmadi: ${e.message}`
			this.botError = error
			if (old && oldToken && !restoring) await this.launch(oldToken, { restoring: true }).catch(() => {}) // eski ishlayotgan botni qaytaramiz
			return { success: false, error }
		}
	}

	// Joriy botni to'xtatadi (navbat va hisoblagichlar saqlanadi)
	async detach() {
		const bot = this.bot
		this.bot = null
		this.botUsername = ''
		clearTimeout(this.restartTimer); clearTimeout(this.okTimer)
		this.restarting = false
		if (bot) { try { bot.removeAllListeners() } catch { /* ignore */ } try { await bot.stopPolling() } catch { /* allaqachon to'xtagan */ } }
	}

	// Markaziy to'xtatish (SIGINT/SIGTERM'ni boshqa joy boshqaradi) — yuborilmagan jurnal yozuvlari yoziladi
	async stop() {
		await this.detach()
		clearInterval(this.maintTimer); this.maintTimer = null
		await this.flush().catch(() => {})
	}

	// Tizim egasi tokenni kiritadi: tekshiriladi, yangi bot ishga tushgandan KEYIN eskisi to'xtatiladi va token shifrlangan holda saqlanadi
	async connect(token) {
		token = String(token || '').trim()
		if (!/^\d{5,12}:[A-Za-z0-9_-]{25,}$/.test(token)) return { success: false, message: "Token formati noto'g'ri. Namuna: 123456789:AAH... (BotFather bergan to'liq token)" }
		const r = await this.launch(token)
		if (!r.success) return { success: false, message: r.error }
		await PlatformSettings.updateOne({}, { $set: { telegramBotToken: encrypt(token), telegramBotUsername: r.username } }, { upsert: true })
		this.source = 'db'
		return { success: true, username: r.username }
	}

	async disconnect() {
		await this.stop()
		await PlatformSettings.updateOne({}, { $set: { telegramBotToken: '', telegramBotUsername: '' } })
		this.source = null
		this.currentToken = ''
		this.botError = 'Bot ulanmagan'
		return { success: true }
	}

	// Polling xatolari: oxirgisini ko'rsatish uchun saqlaymiz; 409 (boshqa nusxa) va tarmoq xatolarida kechiktirib qayta ishga tushiramiz
	onPollingError(bot, e) {
		const m = String(e?.message || e)
		this.lastPollingError = { message: m.slice(0, 300), code: String(e?.code || ''), at: new Date() }
		if (!this.warned.has(m)) { this.warned.add(m); if (this.warned.size > 50) this.warned.clear(); console.log('Ota-onalar boti (polling):', m) }
		if (bot !== this.bot || this.restarting) return
		const conflict = /409|conflict/i.test(m)
		const net = /EFATAL|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket hang up/i.test(`${e?.code || ''} ${m}`)
		if (!conflict && !net) return
		clearTimeout(this.okTimer)
		this.okTimer = setTimeout(() => { this.pollFails = 0; this.restartCount = 0 }, 120000)
		if (this.okTimer.unref) this.okTimer.unref()
		this.pollFails++
		if (this.pollFails < 3) return
		this.restartPolling(bot)
	}

	restartPolling(bot) {
		this.restarting = true
		const delay = Math.min(60000, 2000 * 2 ** Math.min(this.restartCount, 5))
		this.restartCount++
		this.stats.restarts++
		this.restartTimer = setTimeout(async () => {
			try {
				try { await bot.stopPolling() } catch { /* ignore */ }
				if (this.bot === bot) { this.pollFails = 0; Promise.resolve(bot.startPolling()).catch((e) => this.onPollingError(bot, e)) }
			} finally { this.restarting = false }
		}, delay)
		if (this.restartTimer.unref) this.restartTimer.unref()
	}

	// Tizim egasi uchun: bot holati va maktablar bo'yicha qamrov
	async platformStatus() {
		const today = startOfTodayTashkent()
		const [perSchool, sent, failed, pending, schools] = await Promise.all([
			ParentLink.aggregate([{ $match: { active: true } }, { $group: { _id: '$schoolId', guardians: { $sum: 1 }, students: { $addToSet: '$student' } } }]),
			ParentNotification.countDocuments({ status: 'sent', createdAt: { $gte: today } }),
			ParentNotification.countDocuments({ status: 'failed', createdAt: { $gte: today } }),
			ParentRequest.countDocuments({ status: 'pending' }),
			schoolModel.find({}).select('name isActive').lean()
		])
		const names = new Map(schools.map((x) => [String(x._id), x.name]))
		const rows = perSchool.map((r) => ({ schoolId: r._id, name: names.get(String(r._id)) || '—', guardians: r.guardians, students: r.students.length })).sort((a, b) => b.guardians - a.guardians)
		const resolved = await this.resolveToken()
		return {
			success: true,
			bot: {
				ready: this.ready, username: this.botUsername, error: this.ready ? '' : this.botError, source: this.source || resolved.source, tokenSet: !!resolved.token, tokenTail: resolved.token ? resolved.token.slice(-4) : '',
				lastPollingError: this.lastPollingError, restarts: this.stats.restarts,
				queue: { length: this.queue.length, dropped: this.stats.dropped, retried: this.stats.retried, pausedUntil: this.pausedUntil > Date.now() ? new Date(this.pausedUntil) : null }
			},
			totals: { guardians: rows.reduce((a, r) => a + r.guardians, 0), schools: rows.length, sentToday: sent, failedToday: failed, pending },
			schools: rows
		}
	}

	// Bot ob'ektini ulaydi (sinov uchun soxta bot ham berish mumkin)
	attach(bot, username) {
		this.bot = bot
		this.botUsername = username
		this.botError = ''
		bot.on('polling_error', (e) => this.onPollingError(bot, e))
		bot.on('message', (msg) => this.onMessage(msg).catch((e) => console.log('Bot xabar:', e.message)))
		bot.on('callback_query', (q) => this.onCallback(q).catch((e) => console.log('Bot tugma:', e.message)))
		if (!this.maintTimer) { this.maintTimer = setInterval(() => this.maintain(), 10 * 60 * 1000); if (this.maintTimer.unref) this.maintTimer.unref() }
	}

	// Xotirani tozalash: eski yozuvlar to'planib qolmasin
	maintain() {
		const now = Date.now()
		for (const [k, v] of this.lastSent) if (now - v > 2 * 3600000) this.lastSent.delete(k)
		for (const [k, v] of this.pending) if (now - v.at > PENDING_TTL_MS) this.pending.delete(k)
		for (const [k, v] of this.awaiting) if (now - v.at > 15 * 60000) this.awaiting.delete(k)
		for (const [k, v] of this.contactHits) { const fresh = v.filter((x) => now - x < 3600000); if (fresh.length) this.contactHits.set(k, fresh); else this.contactHits.delete(k) }
		for (const [k, v] of this.touchAt) if (now - v > 600000) this.touchAt.delete(k)
		for (const [k, v] of this.schoolNames) if (v.until < now) this.schoolNames.delete(k)
		for (const [k, v] of this.settingsCache) if (v.until < now) this.settingsCache.delete(k)
		for (const [k, v] of this.dayCache) if (v.until < now) this.dayCache.delete(k)
		if (this.langCache.size > 20000) this.langCache.clear()
		if (this.digestDone.size > 200) this.digestDone.clear()
	}

	// ---------- Yuborish (navbatsiz javoblar va navbatli xabarlar) ----------
	// Telegram'ga yuborish: 15 soniyadan oshsa xato
	async sendRaw(chatId, text, opts) {
		let timer
		const timeout = new Promise((_, rej) => { timer = setTimeout(() => { const e = new Error('Telegram javob bermadi (timeout)'); e.code = 'ETIMEDOUT'; rej(e) }, SEND_TIMEOUT_MS) })
		try { return await Promise.race([this.bot.sendMessage(chatId, text, opts), timeout]) } finally { clearTimeout(timer) }
	}

	// Foydalanuvchi so'roviga javob (navbatsiz). Muvaffaqiyatsiz bo'lsa null
	async say(chatId, text, opts = {}) {
		if (!this.bot) return null
		try { return await this.sendRaw(chatId, text, opts) } catch (e) { return null }
	}

	menuKeyboard(lang) {
		return { keyboard: [[{ text: t(lang, 'm_today') }, { text: t(lang, 'm_week') }, { text: t(lang, 'm_month') }], [{ text: t(lang, 'm_children') }, { text: t(lang, 'm_settings') }]], resize_keyboard: true, is_persistent: true }
	}
	sayMenu(chatId, lang, text) { return this.say(chatId, text, { reply_markup: this.menuKeyboard(lang) }) }
	async ack(q, text = '') { try { if (this.bot?.answerCallbackQuery) await this.bot.answerCallbackQuery(q.id, text ? { text } : {}) } catch { /* ignore */ } }

	async schoolName(schoolId) {
		const k = String(schoolId)
		const c = this.schoolNames.get(k)
		if (c && c.until > Date.now()) return c.name
		const s = await schoolModel.findById(schoolId).select('name').lean()
		this.schoolNames.set(k, { name: s?.name || 'Maktab', until: Date.now() + 10 * 60 * 1000 })
		return s?.name || 'Maktab'
	}

	async sinfName(sinfId) {
		if (!sinfId) return ''
		const k = String(sinfId)
		const c = this.sinfNames.get(k)
		if (c && c.until > Date.now()) return c.name
		const s = await sinfModel.findById(sinfId).select('name').lean()
		this.sinfNames.set(k, { name: s?.name || '', until: Date.now() + 10 * 60 * 1000 })
		if (this.sinfNames.size > 5000) this.sinfNames.clear()
		return s?.name || ''
	}

	// Chat tili: ulanishdagi lang, bo'lmasa Telegram language_code'dan (ru -> ru, qolgani uz)
	async langOf(chatId, msg) {
		const k = String(chatId)
		const c = this.langCache.get(k)
		if (c) return c
		let lang = null
		try { const l = await ParentLink.findOne({ chatId: k, lang: { $ne: null } }).select('lang').lean(); lang = normLang(l?.lang) } catch { /* ignore */ }
		if (!lang) lang = fromTelegram(msg?.from?.language_code)
		this.langCache.set(k, lang)
		return lang
	}

	async setLang(chatId, lang) {
		this.langCache.set(String(chatId), lang)
		await ParentLink.updateMany({ chatId: String(chatId) }, { $set: { lang } })
	}

	// Chatdan har qanday xabar kelsa, ota-ona botni qayta yoqqan bo'ladi: bloklangan ulanishlar ochiladi
	async touch(chatId) {
		const k = String(chatId), now = Date.now()
		if (now - (this.touchAt.get(k) || 0) < 60000) return
		this.touchAt.set(k, now)
		await ParentLink.updateMany({ chatId: k, blocked: true }, { $set: { blocked: false } }).catch(() => {})
	}

	// ---------- Ota-ona bilan muloqot ----------
	async onMessage(msg) {
		if (!msg?.chat || msg.chat.type !== 'private') return // guruh va kanallarda faqat jim
		const chatId = String(msg.chat.id)
		this.pollFails = 0
		await this.touch(chatId)
		if (msg.contact) return this.onContact(msg)
		const text = String(msg.text || '').trim()
		if (!text) return
		const lang = await this.langOf(chatId, msg)
		const cmd = /^\/([A-Za-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text)
		if (cmd) {
			const name = cmd[1].toLowerCase()
			switch (name) {
				case 'start': return this.onStart(msg, (cmd[2] || '').trim().split(/\s+/)[0] || '')
				case 'help': case 'yordam': case 'menu': return this.sayMenu(chatId, lang, t(lang, 'help'))
				case 'farzandlarim': case 'children': return this.onChildren(msg)
				case 'toxtatish': case 'stop': return this.onPausePicker(msg, true)
				case 'yoqish': case 'resume': return this.onPausePicker(msg, false)
				case 'bugun': case 'today': return this.onReport(msg, 'today')
				case 'hafta': case 'week': return this.onReport(msg, 'week')
				case 'oy': case 'month': return this.onReport(msg, 'month')
				case 'sozlamalar': case 'settings': return this.onSettings(msg)
				case 'bekor': case 'cancel': this.awaiting.delete(chatId); return this.sayMenu(chatId, lang, t(lang, 'menu_hint'))
				default: return this.sayMenu(chatId, lang, t(lang, 'fallback'))
			}
		}
		const act = menuAction(text)
		if (act === 'today' || act === 'week' || act === 'month') return this.onReport(msg, act)
		if (act === 'children') return this.onChildren(msg)
		if (act === 'settings') return this.onSettings(msg)
		const aw = this.awaiting.get(chatId)
		if (aw && Date.now() - aw.at < 15 * 60000) {
			this.awaiting.delete(chatId)
			await ParentAbsenceReport.updateOne({ _id: aw.reportId, chatId, status: 'pending' }, { $set: { comment: text.slice(0, 300) } })
			return this.sayMenu(chatId, lang, t(lang, 'comment_saved'))
		}
		return this.sayMenu(chatId, lang, t(lang, 'fallback'))
	}

	async children(chatId) {
		const links = await ParentLink.find({ chatId: String(chatId), active: true, disabledByAdmin: { $ne: true } }).lean()
		if (!links.length) return []
		const students = await studentModel.find({ _id: { $in: links.map((l) => l.student) } }).select('fullName sinf schoolId isActive').lean()
		const sm = new Map(students.map((s) => [String(s._id), s]))
		const out = []
		for (const l of links) {
			const s = sm.get(String(l.student))
			if (!s || s.isActive === false) continue
			out.push({ link: l, student: s, sinf: await this.sinfName(s.sinf), who: s.fullName })
		}
		return out
	}
	whoOf(c) { return `${c.student.fullName}${c.sinf ? ` (${c.sinf})` : ''}` }

	async onStart(msg, payload) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		if (!payload) {
			const n = await ParentLink.countDocuments({ chatId, active: true })
			return n ? this.sayMenu(chatId, lang, t(lang, 'start_back', { n })) : this.say(chatId, t(lang, 'start_new'), { reply_markup: { remove_keyboard: true } })
		}
		const invite = await ParentInvite.findOne({ token: payload, active: true })
		const bad = !invite || (invite.expiresAt && invite.expiresAt < new Date()) || (invite.maxUses && invite.uses >= invite.maxUses)
		if (bad) return this.say(chatId, t(lang, 'invite_bad'))
		const school = await this.schoolName(invite.schoolId)

		if (invite.student) { // o'quvchiga maxsus havola: darrov ulanadi
			const student = await studentModel.findOne({ _id: invite.student, schoolId: invite.schoolId, isActive: { $ne: false } }).lean()
			if (!student) return this.say(chatId, t(lang, 'student_gone'))
			const sinf = await this.sinfName(student.sinf)
			const cls = sinf ? ` (${sinf})` : ''
			const existing = await ParentLink.findOne({ student: student._id, chatId }).select('active disabledByAdmin').lean()
			if (existing && existing.active && !existing.disabledByAdmin) { // allaqachon ulangan: havola hisoblanmaydi
				await this.link(invite.schoolId, student, msg, 'invite')
				return this.sayMenu(chatId, lang, t(lang, 'already_linked', { name: student.fullName }))
			}
			const claimed = await this.claimInvite(invite._id)
			if (!claimed) return this.say(chatId, t(lang, 'invite_bad'))
			let r
			try { r = await this.link(invite.schoolId, student, msg, 'invite') } catch (e) { await this.releaseInvite(invite._id); throw e }
			if (r.disabled) { await this.releaseInvite(invite._id); return this.say(chatId, t(lang, 'disabled_note', { names: `${student.fullName}${cls}` })) }
			if (!r.created) await this.releaseInvite(invite._id)
			return this.sayMenu(chatId, lang, t(lang, 'joined_student', { name: student.fullName, cls, school }))
		}
		// umumiy havola: telefon raqami bilan tasdiqlanadi
		this.pending.set(chatId, { schoolId: String(invite.schoolId), inviteId: String(invite._id), at: Date.now() })
		return this.say(chatId, t(lang, 'ask_phone', { school }), {
			reply_markup: { keyboard: [[{ text: t(lang, 'btn_phone'), request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
		})
	}

	// Havola ishlatilishini atomik band qiladi (uses < maxUses, muddat va faollik shu so'rovning o'zida tekshiriladi). null — band qilib bo'lmadi
	claimInvite(inviteId) {
		const now = new Date()
		return ParentInvite.findOneAndUpdate(
			{ _id: inviteId, active: true, $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }, { $or: [{ maxUses: 0 }, { $expr: { $lt: ['$uses', '$maxUses'] } }] }] },
			{ $inc: { uses: 1 } }, { new: true }
		)
	}
	releaseInvite(inviteId) { return ParentInvite.updateOne({ _id: inviteId, uses: { $gt: 0 } }, { $inc: { uses: -1 } }).catch(() => {}) }

	// Bir chatdan soatiga CONTACT_LIMIT ta kontakt yuborish mumkin
	contactThrottled(chatId) {
		const now = Date.now()
		const hits = (this.contactHits.get(chatId) || []).filter((x) => now - x < 3600000)
		if (hits.length >= CONTACT_LIMIT) { this.contactHits.set(chatId, hits); return true }
		hits.push(now); this.contactHits.set(chatId, hits)
		return false
	}

	// Maktabdagi o'quvchilardan raqami mos kelganlarini topadi. parentPhoneKey bo'lsa indeks bilan, bo'lmasa (eski qatorlar) JS filtri bilan
	async studentsByPhone(schoolId, key) {
		const rows = await studentModel.find({ schoolId, isActive: { $ne: false }, $or: [{ parentPhoneKey: key }, { parentPhoneKey: { $exists: false }, parentPhone: { $nin: [null, ''] } }] }).select('fullName sinf parentPhone parentPhoneKey').limit(20000).lean()
		return rows.filter((s) => phoneKey(s.parentPhone) === key)
	}

	async onContact(msg) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		const c = msg.contact || {}
		// telefon faqat o'ziniki bo'lishi shart: user_id bo'lmasa (qo'lda yozilgan/boshqa kontakt) qabul qilinmaydi
		if (!c.user_id || String(c.user_id) !== String(msg.from?.id)) return this.say(chatId, t(lang, 'phone_not_own'))
		if (this.contactThrottled(chatId)) return this.say(chatId, t(lang, 'phone_throttle'))
		const state = this.pending.get(chatId)
		if (!state || Date.now() - state.at > PENDING_TTL_MS) { this.pending.delete(chatId); return this.say(chatId, t(lang, 'need_link'), { reply_markup: { remove_keyboard: true } }) }
		const key = phoneKey(c.phone_number)
		if (!key) return this.say(chatId, t(lang, 'phone_bad'))
		// havola hali yaroqlimi (faol, muddati o'tmagan)? kutish vaqtida bekor qilingan bo'lishi mumkin
		const inv = await ParentInvite.findOne({ _id: state.inviteId, active: true }).lean()
		if (!inv || (inv.expiresAt && inv.expiresAt < new Date()) || (inv.maxUses && inv.uses >= inv.maxUses)) {
			this.pending.delete(chatId)
			return this.say(chatId, t(lang, 'invite_bad'), { reply_markup: { remove_keyboard: true } })
		}
		const school = await this.schoolName(state.schoolId)

		const matchedAll = await this.studentsByPhone(state.schoolId, key)
		this.pending.delete(chatId)
		// bitta telefon bo'yicha ko'pi bilan 10 ta farzand avtomatik ulanadi; ortiqchasi admin ko'rib chiqishi uchun so'rovga tushadi
		const matched = matchedAll.slice(0, MAX_AUTO_LINK)
		for (const extra of matchedAll.slice(MAX_AUTO_LINK)) await this.createRequest(state.schoolId, chatId, msg, { phone: c.phone_number || '', kind: 'unmatched', student: extra._id, note: `Telefon bo'yicha ${MAX_AUTO_LINK} tadan ortiq o'quvchi topildi` }).catch(() => {})
		if (!matched.length) {
			const ok = await this.createRequest(state.schoolId, chatId, msg, { phone: c.phone_number || '', kind: 'unmatched' })
			return this.say(chatId, t(lang, ok ? 'no_match' : 'no_match_limit'), { reply_markup: { remove_keyboard: true } })
		}
		let created = 0
		const linked = [], disabled = []
		for (const s of matched) {
			const r = await this.link(state.schoolId, s, msg, 'phone', c.phone_number)
			const label = `• ${s.fullName}${await this.sinfName(s.sinf) ? ` (${await this.sinfName(s.sinf)})` : ''}`
			if (r.disabled) disabled.push(label); else { linked.push(label); if (r.created) created++ }
		}
		if (created) await this.claimInvite(state.inviteId) // umumiy havola cheksiz (maxUses=0): faqat foydalanish hisobi yuritiladi
		if (linked.length) await this.sayMenu(chatId, lang, t(lang, 'joined_phone', { names: linked.join('\n'), school }))
		if (disabled.length) await this.say(chatId, t(lang, 'disabled_note', { names: disabled.join('\n') }), linked.length ? {} : { reply_markup: { remove_keyboard: true } })
	}

	// Admin ko'radigan so'rov (kutilayotganlar soni chat va maktab bo'yicha cheklangan). false — limit to'lgan
	async createRequest(schoolId, chatId, msg, { phone = '', kind = 'unmatched', student = null, note = '' } = {}) {
		const filter = { schoolId, chatId, status: 'pending', kind, ...(student ? { student } : {}) }
		if (await ParentRequest.exists(filter)) return true
		const [perChat, perSchool] = await Promise.all([ParentRequest.countDocuments({ chatId, status: 'pending' }), ParentRequest.countDocuments({ schoolId, status: 'pending' })])
		if (perChat >= REQ_PER_CHAT || perSchool >= REQ_PER_SCHOOL) return false
		await ParentRequest.create({ schoolId, chatId, telegramUserId: String(msg.from?.id || ''), firstName: msg.from?.first_name || '', lastName: msg.from?.last_name || '', username: msg.from?.username || '', phone, kind, student, note })
		return true
	}

	async onChildren(msg) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		const kids = await this.children(chatId)
		if (!kids.length) return this.say(chatId, t(lang, 'children_none'), { reply_markup: this.menuKeyboard(lang) })
		const now = new Date()
		const lines = kids.map((c) => {
			const tags = []
			if (c.link.paused) tags.push(t(lang, 'tag_paused'))
			if (c.link.mutedUntil && c.link.mutedUntil > now) tags.push(t(lang, 'tag_muted', { time: clock(c.link.mutedUntil) }))
			if (c.link.quietFrom && c.link.quietTo) tags.push(t(lang, 'tag_quiet', { from: c.link.quietFrom, to: c.link.quietTo }))
			return `• ${this.whoOf(c)}${tags.length ? ` (${tags.join(', ')})` : ''}`
		})
		return this.sayMenu(chatId, lang, `${t(lang, 'children_title')}\n${lines.join('\n')}`)
	}

	// /toxtatish va /yoqish: farzandlar ro'yxati tugmalar bilan (har biri alohida), oxirida "Hammasi"
	async onPausePicker(msg, pause) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		const kids = await this.children(chatId)
		if (!kids.length) return this.say(chatId, t(lang, 'children_none'), { reply_markup: this.menuKeyboard(lang) })
		const cb = pause ? 'pz' : 'rs'
		const rows = kids.map((c) => [{ text: this.whoOf(c), callback_data: `${cb}:${c.link._id}` }])
		if (kids.length > 1) rows.push([{ text: t(lang, 'btn_all'), callback_data: `${cb}:all` }])
		return this.say(chatId, t(lang, pause ? 'pick_pause' : 'pick_resume'), { reply_markup: { inline_keyboard: rows } })
	}

	async onSettings(msg) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		const kids = await this.children(chatId)
		const rows = kids.map((c) => [{ text: this.whoOf(c), callback_data: `cs:${c.link._id}` }])
		rows.push(...[LANGS.slice(0, 2), LANGS.slice(2)].map((pair) => pair.map((l) => ({ text: `${l === lang ? '✓ ' : ''}${LANG_LABELS[l]}`, callback_data: `lg:${l}` }))))
		return this.say(chatId, t(lang, 'settings_title'), { reply_markup: { inline_keyboard: rows } })
	}

	async childPanel(chatId, lang, linkId) {
		const c = (await this.children(chatId)).find((x) => String(x.link._id) === String(linkId))
		if (!c) return this.say(chatId, t(lang, 'children_none'))
		const l = c.link, muted = l.mutedUntil && l.mutedUntil > new Date()
		const rows = [
			[{ text: t(lang, l.paused ? 'btn_resume' : 'btn_pause'), callback_data: `${l.paused ? 'rs' : 'pz'}:${l._id}` }],
			[{ text: t(lang, 'btn_mute1'), callback_data: `mu:${l._id}:1` }, { text: t(lang, 'btn_mute8'), callback_data: `mu:${l._id}:8` }],
			[{ text: t(lang, 'btn_mute24'), callback_data: `mu:${l._id}:24` }],
			...(muted ? [[{ text: t(lang, 'btn_unmute'), callback_data: `mu:${l._id}:0` }]] : []),
			[{ text: t(lang, 'btn_quiet', { from: QUIET_PRESETS.a[0], to: QUIET_PRESETS.a[1] }), callback_data: `qh:${l._id}:a` }],
			[{ text: t(lang, 'btn_quiet', { from: QUIET_PRESETS.b[0], to: QUIET_PRESETS.b[1] }), callback_data: `qh:${l._id}:b` }],
			...(l.quietFrom && l.quietTo ? [[{ text: t(lang, 'btn_quiet_off'), callback_data: `qh:${l._id}:off` }]] : [])
		]
		return this.say(chatId, t(lang, 'child_settings', { name: this.whoOf(c) }), { reply_markup: { inline_keyboard: rows } })
	}

	async onCallback(q) {
		const msg = q?.message
		if (!msg?.chat || msg.chat.type !== 'private') { await this.ack(q); return }
		const chatId = String(msg.chat.id)
		this.pollFails = 0
		await this.touch(chatId)
		const lang = await this.langOf(chatId, q)
		const [act, a, b] = String(q.data || '').split(':')
		await this.ack(q)
		const mine = (id) => (validId(id) ? ParentLink.findOne({ _id: id, chatId, active: true, disabledByAdmin: { $ne: true } }).lean() : null)
		const nameOf = async (l) => { const s = await studentModel.findById(l.student).select('fullName').lean(); return s?.fullName || t(lang, 'deleted_student') }
		if (act === 'pz' || act === 'rs') {
			const pause = act === 'pz'
			if (a === 'all') {
				const r = await ParentLink.updateMany({ chatId, active: true, disabledByAdmin: { $ne: true } }, { $set: { paused: pause } })
				return this.say(chatId, r.matchedCount ? t(lang, pause ? 'paused_all' : 'resumed_all') : t(lang, 'no_children'))
			}
			const l = await mine(a)
			if (!l) return this.say(chatId, t(lang, 'no_children'))
			await ParentLink.updateOne({ _id: l._id }, { $set: { paused: pause } })
			return this.say(chatId, t(lang, pause ? 'paused_one' : 'resumed_one', { name: await nameOf(l) }))
		}
		if (act === 'cs') return this.childPanel(chatId, lang, a)
		if (act === 'mu') {
			const l = await mine(a)
			if (!l) return this.say(chatId, t(lang, 'no_children'))
			const h = { '0': 0, '1': 1, '8': 8, '24': 24 }[b]
			if (h === undefined) return
			const until = h ? new Date(Date.now() + h * 3600000) : null
			await ParentLink.updateOne({ _id: l._id }, { $set: { mutedUntil: until } })
			return this.say(chatId, until ? t(lang, 'muted_set', { name: await nameOf(l), time: clock(until) }) : t(lang, 'muted_off', { name: await nameOf(l) }))
		}
		if (act === 'qh') {
			const l = await mine(a)
			if (!l) return this.say(chatId, t(lang, 'no_children'))
			const p = QUIET_PRESETS[b]
			await ParentLink.updateOne({ _id: l._id }, { $set: { quietFrom: p ? p[0] : '', quietTo: p ? p[1] : '' } })
			return this.say(chatId, p ? t(lang, 'quiet_set', { name: await nameOf(l), from: p[0], to: p[1] }) : t(lang, 'quiet_off', { name: await nameOf(l) }))
		}
		if (act === 'lg') {
			const nl = normLang(a)
			if (!nl) return
			await this.setLang(chatId, nl)
			return this.sayMenu(chatId, nl, t(nl, 'lang_set'))
		}
		if (act === 'ab') return this.onAbsenceAnswer(chatId, lang, a, b)
	}

	// ---------- Davomat hisobotlari (Bugun / Hafta / Oy) ----------
	excuseLabel(lang, type) { return t(lang, ['kasallik', 'oilaviy', 'musobaqa'].includes(type) ? `excuse_${type}` : 'excuse_boshqa') }

	async excuseFor(studentId, date) {
		return StudentExcuse.findOne({ student: studentId, startDate: { $lte: date }, $or: [{ endDate: null }, { endDate: { $gte: date } }] }).select('type').lean()
	}

	// Maktab kunlari: oraliqda kamida bitta davomat yozuvi bo'lgan sanalar (kamera uzilishi/bayram kunlari ro'yxatga kirmaydi)
	async schoolDays(schoolId, from, to) {
		const k = `${schoolId}:${from}:${to}`
		const c = this.dayCache.get(k)
		if (c && c.until > Date.now()) return c.days
		const days = (await StudentAttendance.distinct('dateString', { schoolId, dateString: { $gte: from, $lte: to } })).sort()
		this.dayCache.set(k, { days, until: Date.now() + 120000 })
		return days
	}

	lateMinutes(firstIn, workStart) {
		const s = toMin(workStart || '09:00')
		if (!firstIn || s === null) return 0
		return Math.max(0, wall(firstIn).min - s)
	}

	// Bitta farzandning bugungi holati (matn qatorlari)
	async todayLines(c, lang, cfg, now = new Date()) {
		const { date } = wall(now)
		const sid = c.student._id, schoolId = c.student.schoolId
		const [att, logs, excuse, schoolDay] = await Promise.all([
			StudentAttendance.findOne({ student: sid, dateString: date }).lean(),
			StudentAttendanceLog.find({ student: sid, dateString: date }).sort({ checkInTime: 1 }).select('checkInTime checkOutTime checkin checkout').lean(),
			this.excuseFor(sid, date),
			StudentAttendance.exists({ schoolId, dateString: date })
		])
		const head = this.whoOf(c)
		if (!att && !logs.length) {
			if (excuse) return [`${head}: ${t(lang, 'st_absent_excused', { type: this.excuseLabel(lang, excuse.type) })}`]
			const wsMin = toMin(cfg.workStartTime || '09:00')
			if (wsMin !== null && wall(now).min < wsMin) return [`${head}: ${t(lang, 'st_no_school')}`] // ish boshlanishidan oldin 'kelmadi' ko'rsatilmaydi (rangeStats bilan bir xil qoida)
			return [`${head}: ${t(lang, schoolDay ? 'st_absent' : 'st_no_school')}`]
		}
		const first = logs.find((l) => l.checkInTime)?.checkInTime
		const lastOut = [...logs].reverse().find((l) => l.checkOutTime)?.checkOutTime
		const inside = logs.some((l) => l.checkin && !l.checkout)
		const parts = []
		if (first) parts.push(t(lang, 'st_in', { time: clock(first) }))
		if (lastOut && !inside) parts.push(t(lang, 'st_out', { time: clock(lastOut) }))
		if (inside) parts.push(t(lang, 'st_inside'))
		const out = [`${head}: ${parts.join(', ') || t(lang, 'st_inside')}`]
		let ms = 0
		for (const l of logs) if (l.checkInTime) ms += Math.max(0, (l.checkOutTime ? new Date(l.checkOutTime) : now) - new Date(l.checkInTime))
		const mins = Math.floor(ms / 60000)
		if (mins > 0) out.push(`  ${t(lang, 'spent', { h: Math.floor(mins / 60), m: mins % 60 })}`)
		const late = this.lateMinutes(first, cfg.workStartTime)
		out.push(`  ${late > (cfg.lateGraceMinutes || 0) ? t(lang, 'late', { n: late }) : t(lang, 'on_time')}`)
		return out
	}

	// Oraliq statistikasi: { days, present, absent, late, excused, pct }
	async rangeStats(student, from, to, cfg, now = new Date()) {
		const schoolId = student.schoolId
		const today = wall(now)
		const [schoolDays, presentRows, firsts, excuses] = await Promise.all([
			this.schoolDays(schoolId, from, to),
			StudentAttendance.find({ student: student._id, dateString: { $gte: from, $lte: to } }).select('dateString').lean(),
			StudentAttendanceLog.aggregate([{ $match: { student: student._id, dateString: { $gte: from, $lte: to }, checkin: true } }, { $group: { _id: '$dateString', first: { $min: '$checkInTime' } } }]),
			StudentExcuse.find({ student: student._id, startDate: { $lte: to }, $or: [{ endDate: null }, { endDate: { $gte: from } }] }).select('startDate endDate').lean()
		])
		const present = new Set(presentRows.map((r) => r.dateString))
		const firstBy = new Map(firsts.map((f) => [f._id, f.first]))
		const ws = toMin(cfg.workStartTime || '09:00')
		const days = [...new Set([...schoolDays, ...present])].filter((d) => !(d === today.date && !present.has(d) && ws !== null && today.min < ws)).sort()
		let p = 0, absent = 0, late = 0, excused = 0
		for (const d of days) {
			if (present.has(d)) { p++; if (this.lateMinutes(firstBy.get(d), cfg.workStartTime) > (cfg.lateGraceMinutes || 0)) late++ }
			else if (excuses.some((e) => e.startDate <= d && (!e.endDate || e.endDate >= d))) excused++
			else absent++
		}
		const denom = p + absent
		return { days: days.length, present: p, absent, late, excused, pct: denom ? Math.round((p / denom) * 100) : 100 }
	}

	rangeOf(kind, now = new Date()) {
		const w = wall(now)
		if (kind === 'week') return { from: shiftDate(w.date, -((w.dow + 6) % 7)), to: w.date }
		return { from: `${w.date.slice(0, 8)}01`, to: w.date }
	}

	async onReport(msg, kind) {
		const chatId = String(msg.chat.id)
		const lang = await this.langOf(chatId, msg)
		const kids = await this.children(chatId)
		if (!kids.length) return this.say(chatId, t(lang, 'children_none'), { reply_markup: this.menuKeyboard(lang) })
		const lines = []
		if (kind === 'today') lines.push(t(lang, 'today_title', { date: longDate(lang, wall().date) }))
		else { const r = this.rangeOf(kind); lines.push(t(lang, kind === 'week' ? 'week_title' : 'month_title', r)) }
		for (const c of kids) {
			const cfg = await this.getSettings(c.student.schoolId)
			if (kind === 'today') { lines.push('', ...(await this.todayLines(c, lang, cfg))); continue }
			const r = this.rangeOf(kind)
			const s = await this.rangeStats(c.student, r.from, r.to, cfg)
			lines.push('', this.whoOf(c), s.days ? `  ${t(lang, 'stats_line', s)}` : `  ${t(lang, 'no_days')}`)
		}
		return this.sayMenu(chatId, lang, lines.join('\n'))
	}

	// O'quvchini ota-onaga ulaydi (takroran ulansa yangilanadi). { created, disabled } qaytaradi.
	// Admin o'chirgan ulanish (disabledByAdmin) havola/telefon orqali qayta yoqilmaydi: admin uchun so'rov yaratiladi. via='admin' qayta yoqadi
	async link(schoolId, student, from, via, phone = '') {
		const user = from?.from || from || {}
		const chatId = String(from?.chat?.id ?? from?.chatId ?? user.id)
		const sinfId = student.sinf?._id || student.sinf || null
		const filter = { student: student._id, chatId }
		const existing = await ParentLink.findOne(filter).select('disabledByAdmin').lean()
		if (existing?.disabledByAdmin && via !== 'admin') {
			await this.createRequest(schoolId, chatId, from?.chat ? from : { from: user }, { phone, kind: 'disabled', student: student._id, note: t('uz', 'req_disabled_note', { name: student.fullName || '' }) }).catch(() => {})
			return { created: false, disabled: true }
		}
		const lang = await this.langOf(chatId, from?.from ? from : { from: user })
		const set = { schoolId, sinf: sinfId, telegramUserId: String(user.id || ''), firstName: user.first_name || '', lastName: user.last_name || '', username: user.username || '', ...(phone ? { phone } : {}), active: true, blocked: false }
		const onInsert = { via, notifyIn: true, notifyOut: true, paused: false, lang }
		if (via === 'admin') set.disabledByAdmin = false; else onInsert.disabledByAdmin = false
		try {
			const r = await ParentLink.updateOne(filter, { $set: set, $setOnInsert: onInsert }, { upsert: true })
			return { created: !!r.upsertedCount }
		} catch (e) {
			if (isDup(e)) return { created: false } // parallel urinish: boshqa so'rov allaqachon yaratgan
			throw e
		}
	}

	// ---------- Kirdi / chiqdi xabarlari ----------
	// Maktab sozlamalari 60 soniya keshlanadi (har skan uchun bazaga bormaslik uchun). workStartTime ham shu yerda
	async getSettings(schoolId) {
		const k = String(schoolId)
		const c = this.settingsCache.get(k)
		if (c && c.until > Date.now()) return c.cfg
		const s = await settingsModel.findOne({ schoolId }).select('parentNotify workStartTime').lean()
		const cfg = { ...DEFAULTS, ...(s?.parentNotify || {}), workStartTime: s?.workStartTime || '09:00' }
		this.settingsCache.set(k, { cfg, until: Date.now() + SETTINGS_TTL_MS })
		return cfg
	}

	// StudentAttandanceService muvaffaqiyatli kirish/chiqishni qayd etganda chaqiriladi (kutilmaydi, xato davomatni buzmaydi)
	notifyStudentEvent({ schoolId, studentId, kind, time }) {
		this.dispatch({ schoolId, studentId, kind, time }).catch((e) => console.log('Ota-onaga xabar xatosi:', e.message))
	}

	// Bir vaqtda kelgan bir xil (o'quvchi, tur) hodisalar bir marta yuboriladi: lastSent birinchi await'dan OLDIN sinxron band qilinadi,
	// xabar yuborilmay qaytilsa (_dispatch false) avvalgi qiymat tiklanadi
	async dispatch({ schoolId, studentId, kind, time }) {
		if (!this.bot) return
		const when = time ? new Date(time) : new Date()
		const key = `${studentId}:${kind}`
		if (!this.sendingKeys) this.sendingKeys = new Set()
		if (this.sendingKeys.has(key)) return // shu kalit bo'yicha boshqa dispatch hozir ishlayapti
		this.sendingKeys.add(key)
		const prev = this.lastSent.get(key)
		this.lastSent.set(key, when)
		let kept = false
		try { kept = await this._dispatch({ schoolId, studentId, kind, when, prev }) } finally {
			this.sendingKeys.delete(key)
			if (!kept) { if (prev === undefined) this.lastSent.delete(key); else this.lastSent.set(key, prev) }
		}
	}

	async _dispatch({ schoolId, studentId, kind, when, prev }) {
		const cfg = await this.getSettings(schoolId)
		if (!cfg.enabled || (kind === 'in' && !cfg.notifyIn) || (kind === 'out' && !cfg.notifyOut)) return false
		if (prev && Math.abs(when - prev) < cfg.minGapMinutes * 60000) return false // bir necha daqiqa ichida takroriy skan: qayta yubormaymiz
		const guardians = await ParentLink.find({ student: studentId, active: true, disabledByAdmin: { $ne: true }, paused: false, blocked: false, [kind === 'in' ? 'notifyIn' : 'notifyOut']: true }).lean()
		if (!guardians.length) return false
		const student = await studentModel.findOne({ _id: studentId, isActive: { $ne: false } }).select('fullName sinf').lean() // faol bo'lmagan o'quvchiga xabar yo'q; sinf joriy holatda
		if (!student) return false
		const [school, sinf] = await Promise.all([this.schoolName(schoolId), this.sinfName(student.sinf)])
		const who = `${student.fullName}${sinf ? ` (${sinf})` : ''}`
		let late = 0
		if (kind === 'in') {
			const first = await StudentAttendanceLog.findOne({ student: studentId, dateString: wall(when).date }).sort({ checkInTime: 1 }).select('checkInTime').lean()
			if (first?.checkInTime && Math.abs(new Date(first.checkInTime) - when) < 2000) { const m = this.lateMinutes(when, cfg.workStartTime); if (m > (cfg.lateGraceMinutes || 0)) late = m } // faqat kunning birinchi kirishi
		}
		const texts = {}
		const textFor = (lang) => texts[lang] || (texts[lang] = `${t(lang, kind === 'in' ? 'notif_in' : 'notif_out', { who, time: clock(when), school })}${late ? `\n${t(lang, 'late_line', { n: late })}` : ''}`)
		const now = Date.now(), nowMin = wall().min
		for (const g of guardians) {
			const lang = normLang(g.lang) || 'uz'
			const base = { schoolId, student: studentId, guardian: g._id, chatId: g.chatId, kind, eventTime: when, text: textFor(lang), priority: 1 }
			if (g.mutedUntil && g.mutedUntil.getTime() > now) { this.logNotification(base, 'skipped', 'Jim rejim'); continue }
			if (g.quietFrom && g.quietTo && inQuiet(nowMin, g.quietFrom, g.quietTo)) { // tinch soat: oyna tugagach jamlab yuboriladi
				const delta = (toMin(g.quietTo) - nowMin + 1440) % 1440
				await ParentHold.create({ schoolId, student: studentId, guardian: g._id, chatId: g.chatId, kind, text: base.text, eventTime: when, releaseAt: new Date(Math.floor(now / 60000) * 60000 + delta * 60000) }).catch(() => {})
				continue
			}
			this.enqueue(base)
		}
		return true
	}

	// Tinch soatlari tugagan ushlab turilgan xabarlarni chat bo'yicha bitta xabar qilib navbatga qo'yadi (har daqiqa)
	async releaseHolds(now = new Date()) {
		if (!this.bot || this.holdBusy) return { released: 0 }
		this.holdBusy = true
		try {
			const holds = await ParentHold.find({ releaseAt: { $lte: now } }).sort({ eventTime: 1 }).limit(3000).lean()
			if (!holds.length) return { released: 0 }
			const byChat = new Map()
			for (const h of holds) { if (!byChat.has(h.chatId)) byChat.set(h.chatId, []); byChat.get(h.chatId).push(h) }
			const doneIds = []
			for (const [chatId, list] of byChat) {
				try {
					const link = await ParentLink.findOne({ chatId }).select('lang schoolId blocked active').lean()
					const lang = normLang(link?.lang) || 'uz'
					let text = `${t(lang, 'held_title')}\n\n${list.map((h) => h.text).join('\n\n')}`
					if (text.length > 3800) text = `${text.slice(0, 3790)}...`
					this.enqueue({ schoolId: list[0].schoolId, student: list[0].student, guardian: list[0].guardian, chatId, kind: 'held', eventTime: list[list.length - 1].eventTime, text, priority: 0 })
					doneIds.push(...list.map((h) => h._id)) // faqat navbatga qabul qilingan chatlarning yozuvlari o'chiriladi
				} catch (e) { console.log("Ushlab turilgan xabarni navbatga qo'yishda xato (yozuvlar saqlandi):", e.message) }
			}
			if (doneIds.length) await ParentHold.deleteMany({ _id: { $in: doneIds } })
			return { released: doneIds.length, chats: byChat.size }
		} finally { this.holdBusy = false }
	}

	enqueue(item) {
		if (this.queue.length >= QUEUE_MAX) { // to'lib ketsa: eng eski past ustuvorli xabar (kelmadi/jamlanma/xulosa), bo'lmasa eng eskisi tashlanadi
			let i = this.queue.findIndex((x) => x.priority === 0)
			if (i < 0) i = 0
			this.queue.splice(i, 1)
			this.stats.dropped++
		}
		this.queue.push({ priority: 1, ...item, attempts: 0, notBefore: 0 })
		this.pump().catch(() => {})
	}

	async pump() {
		if (this.pumping) return
		this.pumping = true
		try {
			while (this.queue.length && this.bot) {
				const now = Date.now()
				if (this.pausedUntil > now) { await sleep(Math.min(this.pausedUntil - now, 2000)); continue } // 429: butun navbat kutadi
				let idx = this.queue.findIndex((x) => x.priority === 1 && x.notBefore <= now)
				if (idx < 0) idx = this.queue.findIndex((x) => x.notBefore <= now)
				if (idx < 0) { const next = this.queue.reduce((m, x) => Math.min(m, x.notBefore), Infinity); await sleep(Math.max(20, Math.min(next - now, 2000))); continue }
				const it = this.queue.splice(idx, 1)[0]
				await this.deliver(it)
				await sleep(SEND_GAP_MS)
			}
		} finally { this.pumping = false }
	}

	async deliver(it) {
		try {
			await this.sendRaw(it.chatId, it.text, it.opts)
			if (it.guardian) this.sentIds.add(String(it.guardian))
			this.logNotification(it, 'sent')
		} catch (e) {
			const c = classifyError(e)
			if (c.type === 'rate') {
				this.pausedUntil = Date.now() + (c.retryAfter + 0.2) * 1000
				if (++it.attempts <= MAX_RATE_ATTEMPTS) { it.notBefore = this.pausedUntil; this.queue.unshift(it); this.stats.retried++; return }
				return this.logNotification(it, 'failed', 'Telegram cheklovi (429)')
			}
			if (c.type === 'transient' && it.attempts < MAX_ATTEMPTS) { // tarmoq / 5xx: 1s, 2s, 4s kutib qayta uriniladi
				it.attempts++; it.notBefore = Date.now() + 1000 * 2 ** (it.attempts - 1); this.queue.push(it); this.stats.retried++
				return
			}
			if (c.type === 'blocked') {
				await ParentLink.updateMany({ chatId: String(it.chatId) }, { $set: { blocked: true } }).catch(() => {}) // ota-ona botni bloklagan yoki chat yo'q
				return this.logNotification(it, 'blocked', "Ota-ona botni bloklagan yoki to'xtatgan")
			}
			this.logNotification(it, 'failed', String(e?.message || "Yuborib bo'lmadi").slice(0, 200))
		}
	}

	// Jurnal va lastSentAt yozuvlari to'planib, bir martada yoziladi
	logNotification(it, status, error = '') {
		if (!it.student) return
		this.logBuf.push({ schoolId: it.schoolId, student: it.student, guardian: it.guardian || null, chatId: it.chatId, kind: it.kind, eventTime: it.eventTime || null, status, error, createdAt: new Date() })
		if (this.logBuf.length >= 100) this.flush().catch(() => {})
		else if (!this.flushTimer) { this.flushTimer = setTimeout(() => { this.flushTimer = null; this.flush().catch(() => {}) }, 2000); if (this.flushTimer.unref) this.flushTimer.unref() }
	}

	async flush() {
		clearTimeout(this.flushTimer); this.flushTimer = null
		const docs = this.logBuf.splice(0), ids = [...this.sentIds]; this.sentIds.clear()
		if (docs.length) await ParentNotification.insertMany(docs, { ordered: false }).catch(() => {})
		if (ids.length) await ParentLink.updateMany({ _id: { $in: ids } }, { $set: { lastSentAt: new Date() } }).catch(() => {})
	}

	// ---------- "Kelmadi" xabari va sabab bildirish ----------
	// Bot ishlayotgan jarayonda cron chaqiradi: har 5 daqiqada, maktab sozlagan vaqtdan keyin kuniga bir marta
	async runAbsentAlerts(now = new Date()) {
		if (!this.bot || this.absentBusy) return { skipped: true }
		this.absentBusy = true
		try {
			const w = wall(now)
			const schools = await settingsModel.find({ 'parentNotify.absentAlertEnabled': true }).select('schoolId parentNotify workStartTime').lean()
			let sent = 0
			for (const s of schools) {
				const cfg = { ...DEFAULTS, ...(s.parentNotify || {}), workStartTime: s.workStartTime || '09:00' }
				const at = toMin(cfg.absentAlertTime)
				if (at === null || w.min < at || w.min > at + ABSENT_WINDOW_MIN) continue
				try {
					const r = await this.absentForSchool(s.schoolId, now, cfg)
					sent += r.sent || 0
				} catch (e) { console.log(`Kelmadi xabari (maktab ${s.schoolId}):`, e.message) } // bitta maktab xatosi qolganlarini to'xtatmasin
			}
			return { sent }
		} finally { this.absentBusy = false }
	}

	// Bitta maktab uchun: bugun hech qanday davomat yozuvi bo'lmagan (va sababsiz) farzandlarning ota-onalariga xabar
	async absentForSchool(schoolId, now = new Date(), cfgIn = null) {
		const w = wall(now)
		const cfg = cfgIn || await this.getSettings(schoolId)
		const anyToday = await StudentAttendance.exists({ schoolId, dateString: w.date })
		if (!anyToday) return { sent: 0, reason: 'no-school-day' } // bayram yoki kamera ishlamagan kun: xabar yubormaymiz
		const links = await ParentLink.find({ schoolId, active: true, disabledByAdmin: { $ne: true }, paused: false, blocked: false, notifyIn: true }).lean()
		if (!links.length) return { sent: 0 }
		// ommaviy uzilish himoyasi: maktab o'quvchilarining 60% dan ko'pida bugun davomat yozuvi bo'lmasa (kamera/internet nosozligi) xabar yubormaymiz; kichik maktablarda (<20 o'quvchi) foiz ma'nosiz, shuning uchun tekshirilmaydi
		const [studentsTotal, withRow] = await Promise.all([studentModel.countDocuments({ schoolId, isActive: { $ne: false } }), StudentAttendance.distinct('student', { schoolId, dateString: w.date })])
		if (studentsTotal >= 20 && (studentsTotal - withRow.length) / studentsTotal > 0.6) return { sent: 0, reason: 'mass-outage' }
		const ids = [...new Set(links.map((l) => String(l.student)))].map(oid)
		const [presentIds, excuses, students, school] = await Promise.all([
			StudentAttendance.distinct('student', { schoolId, dateString: w.date, student: { $in: ids } }),
			require('./student.excuse.service').mapForDate(w.date, schoolId),
			studentModel.find({ _id: { $in: ids }, isActive: { $ne: false } }).select('fullName sinf').lean(),
			this.schoolName(schoolId)
		])
		const present = new Set(presentIds.map(String))
		const sm = new Map(students.map((s) => [String(s._id), s]))
		const nowMs = new Date(now).getTime()
		let sent = 0
		for (const l of links) {
			const sid = String(l.student), s = sm.get(sid)
			if (!s || present.has(sid) || excuses.has(sid)) continue
			if (l.mutedUntil && l.mutedUntil.getTime() > nowMs) continue
			if (l.quietFrom && l.quietTo && inQuiet(w.min, l.quietFrom, l.quietTo)) continue // tinch soat: keyingi 5 daqiqalik tekshiruvda qayta uriniladi
			let alert
			try { alert = await ParentAbsentAlert.create({ schoolId, student: s._id, chatId: l.chatId, dateString: w.date }) } catch (e) { if (isDup(e)) continue; throw e } // bugun yuborilgan
			const lang = normLang(l.lang) || 'uz'
			const who = `${s.fullName}${(await this.sinfName(s.sinf)) ? ` (${await this.sinfName(s.sinf)})` : ''}`
			const kb = { inline_keyboard: [[{ text: t(lang, 'btn_sick'), callback_data: `ab:${alert._id}:k` }, { text: t(lang, 'btn_family'), callback_data: `ab:${alert._id}:o` }, { text: t(lang, 'btn_other'), callback_data: `ab:${alert._id}:b` }]] }
			try {
				this.enqueue({ schoolId, student: s._id, guardian: l._id, chatId: l.chatId, kind: 'absent', eventTime: now, text: t(lang, 'absent_alert', { who, time: clock(now), school }), opts: { reply_markup: kb }, priority: 0 })
			} catch (e) { await ParentAbsentAlert.deleteOne({ _id: alert._id }).catch(() => {}); console.log("Kelmadi xabarini navbatga qo'yib bo'lmadi:", e.message); continue } // yuborilgan deb belgilanmaydi
			sent++
		}
		return { sent }
	}

	async onAbsenceAnswer(chatId, lang, alertId, code) {
		const type = { k: 'kasallik', o: 'oilaviy', b: 'boshqa' }[code]
		if (!type || !validId(alertId)) return
		const alert = await ParentAbsentAlert.findOneAndUpdate({ _id: alertId, chatId, responded: false }, { $set: { responded: true } })
		if (!alert) return this.say(chatId, t(lang, 'absent_already'))
		const s = await studentModel.findById(alert.student).select('sinf').lean()
		const report = await ParentAbsenceReport.create({ schoolId: alert.schoolId, student: alert.student, sinf: s?.sinf || null, chatId, dateFrom: alert.dateString, dateTo: alert.dateString, type })
		if (type === 'boshqa') { this.awaiting.set(chatId, { reportId: String(report._id), at: Date.now() }); return this.say(chatId, `${t(lang, 'absent_ack')}\n${t(lang, 'absent_ask_comment')}`) }
		return this.say(chatId, t(lang, 'absent_ack'))
	}

	// ---------- Haftalik xulosa (yakshanba 19:00) ----------
	async runWeeklyDigest(now = new Date()) {
		if (!this.bot || this.digestBusy) return { skipped: true }
		this.digestBusy = true
		try {
			const w = wall(now)
			const schools = await settingsModel.find({ 'parentNotify.weeklyDigest': true }).select('schoolId parentNotify workStartTime').lean()
			let sent = 0
			for (const s of schools) {
				const dk = `${s.schoolId}:${w.date}`
				if (this.digestDone.has(dk)) continue
				const cfg = { ...DEFAULTS, ...(s.parentNotify || {}), workStartTime: s.workStartTime || '09:00' }
				try {
					sent += (await this.digestForSchool(s.schoolId, now, cfg)).sent
					this.digestDone.add(dk) // faqat muvaffaqiyatdan keyin belgilanadi
				} catch (e) { console.log(`Haftalik xulosa (maktab ${s.schoolId}):`, e.message) }
			}
			return { sent }
		} finally { this.digestBusy = false }
	}

	async digestForSchool(schoolId, now, cfg) {
		const r = this.rangeOf('week', now)
		const links = await ParentLink.find({ schoolId, active: true, disabledByAdmin: { $ne: true }, paused: false, blocked: false }).lean()
		const ids = [...new Set(links.map((l) => String(l.student)))].map(oid)
		const students = await studentModel.find({ _id: { $in: ids }, isActive: { $ne: false } }).select('fullName sinf schoolId').lean()
		const sm = new Map(students.map((s) => [String(s._id), s]))
		const byChat = new Map()
		for (const l of links) { if (sm.has(String(l.student))) { if (!byChat.has(l.chatId)) byChat.set(l.chatId, []); byChat.get(l.chatId).push(l) } }
		let sent = 0
		for (const [chatId, list] of byChat) {
			const lang = normLang(list[0].lang) || 'uz'
			const lines = [t(lang, 'digest_title', r)]
			for (const l of list) {
				const s = sm.get(String(l.student))
				const st = await this.rangeStats(s, r.from, r.to, cfg, now)
				const sinf = await this.sinfName(s.sinf)
				lines.push('', `${s.fullName}${sinf ? ` (${sinf})` : ''}`, `  ${st.days ? t(lang, 'stats_line', st) : t(lang, 'no_days')}`)
			}
			this.enqueue({ schoolId, student: list[0].student, guardian: list[0]._id, chatId, kind: 'digest', eventTime: now, text: lines.join('\n'), priority: 0 })
			sent++
		}
		return { sent }
	}

	// Cron jadvallari (cronjob.js shu metodni bir marta chaqiradi). Hammasi faqat bot ishlayotgan jarayonda ish qiladi
	scheduleJobs(cron) {
		const opt = { timezone: 'Asia/Tashkent' }
		const guard = (name, fn) => () => { Promise.resolve().then(fn).catch((e) => console.log(`Ota-onalar boti (${name}):`, e.message)) }
		return [
			cron.schedule('*/5 * * * *', guard('kelmadi', () => this.runAbsentAlerts()), opt),
			cron.schedule('* * * * *', guard('tinch soat', () => this.releaseHolds()), opt),
			cron.schedule('0 19 * * 0', guard('haftalik xulosa', () => this.runWeeklyDigest()), opt)
		]
	}

	// ---------- Admin: havolalar ----------
	async inviteView(invite) {
		if (!this.ready) return null
		const url = `https://t.me/${this.botUsername}?start=${invite.token}`
		return { url, token: invite.token, uses: invite.uses, maxUses: invite.maxUses, expiresAt: invite.expiresAt, qr: await QRCode.toDataURL(url, { margin: 1, width: 320 }) }
	}

	// Butun maktab uchun umumiy havola (bitta faol). rotate=true — eskisi bekor qilinib yangisi yaratiladi
	async schoolInvite(schoolId, userId, rotate = false) {
		if (!this.ready) return { success: false, message: this.botError || 'Bot ishga tushmagan' }
		let inv = await ParentInvite.findOne({ schoolId, student: null, active: true })
		if (inv && rotate) { inv.active = false; await inv.save(); inv = null }
		if (!inv) inv = await ParentInvite.create({ schoolId, token: newToken(), student: null, createdBy: userId || null, maxUses: 0, expiresAt: null })
		return { success: true, invite: await this.inviteView(inv) }
	}

	async studentInvite(schoolId, userId, studentId) {
		if (!this.ready) return { success: false, message: this.botError || 'Bot ishga tushmagan' }
		if (!validId(studentId)) return { success: false, message: "O'quvchi tanlanmagan" }
		const s = await studentModel.findOne({ _id: studentId, schoolId, isActive: { $ne: false } }).select('fullName').lean()
		if (!s) return { success: false, message: "O'quvchi topilmadi" }
		const inv = await ParentInvite.create({ schoolId, token: newToken(), student: s._id, createdBy: userId || null, maxUses: INVITE_MAX_USES, expiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) })
		return { success: true, student: s.fullName, invite: await this.inviteView(inv) }
	}

	// ---------- Admin: nazorat ----------
	// Oxirgi 7 kun: yuborilgan / bloklangan / xato (kunlar kesimida ham)
	async deliveryStats(schoolId, days = 7) {
		const from = new Date(`${shiftDate(wall().date, -(days - 1))}T00:00:00+05:00`)
		const rows = await ParentNotification.aggregate([
			{ $match: { schoolId: oid(schoolId), createdAt: { $gte: from } } },
			{ $group: { _id: { d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Tashkent' } }, s: '$status' }, n: { $sum: 1 } } }
		])
		const total = { sent: 0, blocked: 0, failed: 0, skipped: 0 }
		const byDay = new Map()
		for (let i = days - 1; i >= 0; i--) byDay.set(shiftDate(wall().date, -i), { date: shiftDate(wall().date, -i), sent: 0, blocked: 0, failed: 0 })
		for (const r of rows) { if (total[r._id.s] !== undefined) total[r._id.s] += r.n; const d = byDay.get(r._id.d); if (d && d[r._id.s] !== undefined) d[r._id.s] += r.n }
		return { ...total, days: [...byDay.values()] }
	}

	async overview(schoolId) {
		const school = oid(schoolId)
		const today = startOfTodayTashkent()
		const [cfg, guardians, covered, students, pending, sent, failed, reports, delivery] = await Promise.all([
			this.getSettings(schoolId),
			ParentLink.countDocuments({ schoolId: school, active: true }),
			ParentLink.distinct('student', { schoolId: school, active: true }),
			studentModel.countDocuments({ schoolId: school, isActive: { $ne: false } }),
			ParentRequest.countDocuments({ schoolId: school, status: 'pending' }),
			ParentNotification.countDocuments({ schoolId: school, status: 'sent', createdAt: { $gte: today } }),
			ParentNotification.countDocuments({ schoolId: school, status: 'failed', createdAt: { $gte: today } }),
			ParentAbsenceReport.countDocuments({ schoolId: school, status: 'pending' }),
			this.deliveryStats(schoolId)
		])
		let link = null
		if (this.ready) { const r = await this.schoolInvite(schoolId, null, false); link = r.invite }
		return { success: true, school: await this.schoolName(schoolId), bot: { ready: this.ready, username: this.botUsername }, settings: cfg, link, delivery, counts: { guardians, coveredStudents: covered.length, students, pending, reports, sentToday: sent, failedToday: failed } }
	}

	async saveSettings(schoolId, patch) {
		const cur = await this.getSettings(schoolId)
		const bool = (k) => (patch[k] !== undefined ? !!patch[k] : cur[k])
		const time = patch.absentAlertTime !== undefined ? String(patch.absentAlertTime) : cur.absentAlertTime
		if (toMin(time) === null || toMin(time) > 1439) return { success: false, message: "Vaqt noto'g'ri (HH:MM)" }
		const next = {
			enabled: bool('enabled'), notifyIn: bool('notifyIn'), notifyOut: bool('notifyOut'),
			minGapMinutes: patch.minGapMinutes !== undefined ? Math.max(0, Math.min(60, Number(patch.minGapMinutes) || 0)) : cur.minGapMinutes,
			lateGraceMinutes: patch.lateGraceMinutes !== undefined ? Math.max(0, Math.min(120, Math.round(Number(patch.lateGraceMinutes) || 0))) : cur.lateGraceMinutes,
			absentAlertEnabled: bool('absentAlertEnabled'), absentAlertTime: time.padStart(5, '0'), weeklyDigest: bool('weeklyDigest')
		}
		// parentNotify sxemasida yangi maydonlar bo'lmasligi mumkin: strict:false bilan nuqta-yo'l orqali yoziladi
		const $set = {}
		for (const [k, v] of Object.entries(next)) $set[`parentNotify.${k}`] = v
		await settingsModel.updateOne({ schoolId }, { $set }, { upsert: true, strict: false })
		this.settingsCache.delete(String(schoolId))
		return { success: true, settings: next }
	}

	// O'quvchilar ro'yxati: har birida nechta ota-ona ulangan (qamrov), filtr va sahifalash bilan
	async students(schoolId, { sinfId, q, covered, phone, page = 1, limit = 40 } = {}) {
		const school = oid(schoolId)
		const filter = { schoolId: school, isActive: { $ne: false } }
		if (validId(sinfId)) filter.sinf = oid(sinfId)
		if (q) filter.fullName = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
		const coveredIds = await ParentLink.distinct('student', { schoolId: school, active: true })
		if (covered === 'yes') filter._id = { $in: coveredIds }
		else if (covered === 'no') filter._id = { $nin: coveredIds }
		if (phone === 'no') filter.$or = [{ parentPhone: null }, { parentPhone: '' }] // ota-ona telefoni kiritilmagan o'quvchilar
		const size = Math.min(100, Math.max(5, Number(limit) || 40))
		const cur = Math.max(1, Number(page) || 1)
		const [total, rows] = await Promise.all([studentModel.countDocuments(filter), studentModel.find(filter).sort({ fullName: 1 }).skip((cur - 1) * size).limit(size).populate('sinf', 'name').select('fullName sinf parentName parentPhone').lean()])
		const counts = await ParentLink.aggregate([{ $match: { student: { $in: rows.map((r) => r._id) }, active: true } }, { $group: { _id: '$student', n: { $sum: 1 } } }])
		const byStudent = new Map(counts.map((c) => [String(c._id), c.n]))
		return { success: true, total, page: cur, pages: Math.max(1, Math.ceil(total / size)), students: rows.map((s) => ({ _id: s._id, fullName: s.fullName, sinf: s.sinf?.name || '', sinfId: s.sinf?._id || null, parentName: s.parentName || '', parentPhone: s.parentPhone || '', hasPhone: !!phoneKey(s.parentPhone), guardians: byStudent.get(String(s._id)) || 0 })) }
	}

	async guardians(schoolId, { sinfId, studentId, q, page = 1, limit = 40 } = {}) {
		const school = oid(schoolId)
		const filter = { schoolId: school }
		if (validId(studentId)) filter.student = oid(studentId)
		if (validId(sinfId)) filter.sinf = oid(sinfId)
		const size = Math.min(100, Math.max(5, Number(limit) || 40))
		const cur = Math.max(1, Number(page) || 1)
		let rows = await ParentLink.find(filter).sort({ createdAt: -1 }).populate('student', 'fullName').populate('sinf', 'name').lean()
		if (q) { const t = String(q).toLowerCase(); rows = rows.filter((r) => `${r.firstName} ${r.lastName} ${r.username} ${r.phone} ${r.student?.fullName || ''}`.toLowerCase().includes(t)) }
		const total = rows.length
		return {
			success: true, total, page: cur, pages: Math.max(1, Math.ceil(total / size)),
			guardians: rows.slice((cur - 1) * size, cur * size).map((r) => ({ _id: r._id, chatId: r.chatId, studentId: r.student?._id || null, name: `${r.firstName} ${r.lastName}`.trim() || r.username || 'Ota-ona', username: r.username, phone: r.phone, student: r.student?.fullName || "O'chirilgan o'quvchi", sinf: r.sinf?.name || '', via: r.via, active: r.active, disabledByAdmin: !!r.disabledByAdmin, paused: r.paused, blocked: r.blocked, notifyIn: r.notifyIn, notifyOut: r.notifyOut, lastSentAt: r.lastSentAt, createdAt: r.createdAt }))
		}
	}

	// Ota-onalar: bir ota-ona bitta karta (farzandlari chip bo'lib). chatId bo'yicha guruhlanadi
	async parents(schoolId, { q, sinfId, status, page = 1, limit = 20 } = {}) {
		const links = await ParentLink.find({ schoolId: oid(schoolId) }).sort({ createdAt: -1 }).limit(8000).populate('student', 'fullName').populate('sinf', 'name').lean()
		const map = new Map()
		for (const l of links) {
			if (!map.has(l.chatId)) map.set(l.chatId, { chatId: l.chatId, name: '', username: '', phone: '', via: new Set(), children: [], active: false, paused: false, blocked: false, notifyIn: true, notifyOut: true, lastSentAt: null, createdAt: l.createdAt })
			const p = map.get(l.chatId)
			p.name = p.name || `${l.firstName} ${l.lastName}`.trim()
			p.username = p.username || l.username
			p.phone = p.phone || l.phone
			p.via.add(l.via)
			p.children.push({ linkId: l._id, studentId: l.student?._id || null, name: l.student?.fullName || "O'chirilgan o'quvchi", sinf: l.sinf?.name || '', sinfId: l.sinf?._id || null, active: l.active, disabledByAdmin: !!l.disabledByAdmin })
			p.active = p.active || l.active; p.paused = p.paused || l.paused; p.blocked = p.blocked || l.blocked
			p.notifyIn = p.notifyIn && l.notifyIn; p.notifyOut = p.notifyOut && l.notifyOut
			if (l.lastSentAt && (!p.lastSentAt || l.lastSentAt > p.lastSentAt)) p.lastSentAt = l.lastSentAt
		}
		let rows = [...map.values()].map((p) => ({ ...p, via: [...p.via], name: p.name || p.username || 'Ota-ona', state: p.blocked ? 'blocked' : !p.active ? 'inactive' : p.paused ? 'paused' : 'active' }))
		if (validId(sinfId)) rows = rows.filter((p) => p.children.some((c) => String(c.sinfId) === String(sinfId)))
		if (['active', 'blocked', 'paused', 'inactive'].includes(status)) rows = rows.filter((p) => p.state === status)
		if (q) { const t = String(q).toLowerCase(); rows = rows.filter((p) => `${p.name} ${p.username} ${p.phone} ${p.children.map((c) => c.name).join(' ')}`.toLowerCase().includes(t)) }
		const size = Math.min(100, Math.max(5, Number(limit) || 20))
		const cur = Math.max(1, Number(page) || 1)
		return { success: true, total: rows.length, page: cur, pages: Math.max(1, Math.ceil(rows.length / size)), parents: rows.slice((cur - 1) * size, cur * size) }
	}

	// Sinflar bo'yicha qamrov: nechta o'quvchining kamida bitta ota-onasi ulangan, nechtasining telefoni yo'q
	async coverage(schoolId) {
		const school = oid(schoolId)
		const [sinfs, byClass, covered] = await Promise.all([
			sinfModel.find({ schoolId: school }).select('name').lean(),
			studentModel.aggregate([{ $match: { schoolId: school, isActive: { $ne: false } } }, { $group: { _id: '$sinf', students: { $sum: 1 }, noPhone: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$parentPhone', ''] } }, 5] }, 0, 1] } } } }]),
			ParentLink.aggregate([{ $match: { schoolId: school, active: true } }, { $group: { _id: '$sinf', students: { $addToSet: '$student' } } }])
		])
		const st = new Map(byClass.map((x) => [String(x._id), x]))
		const cv = new Map(covered.map((x) => [String(x._id), x.students.length]))
		const classes = sinfs.map((s) => ({ sinfId: s._id, name: s.name, students: st.get(String(s._id))?.students || 0, noPhone: st.get(String(s._id))?.noPhone || 0, covered: cv.get(String(s._id)) || 0 }))
			.filter((c) => c.students > 0).sort((a, b) => a.name.localeCompare(b.name, 'uz', { numeric: true }))
		return { success: true, classes }
	}

	// Ota-ona darajasidagi amallar (hamma farzandlariga birdaniga). Admin o'chirsa disabledByAdmin qo'yiladi: ota-ona o'zi qayta yoqolmaydi
	async updateParent(schoolId, chatId, patch) {
		const set = {}
		for (const k of ['active', 'notifyIn', 'notifyOut']) if (patch[k] !== undefined) set[k] = !!patch[k]
		if (set.active === true) { set.blocked = false; set.paused = false; set.disabledByAdmin = false }
		if (set.active === false) set.disabledByAdmin = true
		if (!Object.keys(set).length) return { success: false, message: "O'zgartirish yo'q" }
		const r = await ParentLink.updateMany({ schoolId, chatId: String(chatId) }, { $set: set })
		return r.matchedCount ? { success: true } : { success: false, message: 'Topilmadi' }
	}

	// "O'chirish" yozuvni yo'q qilmaydi: ulanish o'chirilgan deb belgilanadi (aks holda ota-ona telefon orqali darrov qayta ulanib olardi)
	async removeParent(schoolId, chatId) {
		const r = await ParentLink.updateMany({ schoolId, chatId: String(chatId) }, { $set: { active: false, disabledByAdmin: true } })
		return r.matchedCount ? { success: true, removed: r.matchedCount } : { success: false, message: 'Topilmadi' }
	}

	async testParent(schoolId, chatId) {
		if (!this.bot) return { success: false, message: 'Bot ulanmagan' }
		const links = await ParentLink.find({ schoolId, chatId: String(chatId) }).populate('student', 'fullName').lean()
		if (!links.length) return { success: false, message: 'Topilmadi' }
		const kids = links.map((l) => l.student?.fullName).filter(Boolean).join(', ')
		return this.sendTest(schoolId, links[0], kids, links.map((l) => l._id))
	}

	async sendTest(schoolId, link, kids, linkIds) {
		const lang = normLang(link.lang) || 'uz'
		const base = { schoolId, student: link.student?._id || link.student, guardian: link._id, chatId: String(link.chatId), kind: 'test' }
		try {
			await this.sendRaw(String(link.chatId), t(lang, 'test_msg', { school: await this.schoolName(schoolId), kids }))
			this.logNotification(base, 'sent')
			return { success: true }
		} catch (e) {
			const blocked = classifyError(e).type === 'blocked'
			if (blocked) await ParentLink.updateMany({ _id: { $in: linkIds } }, { $set: { blocked: true } })
			this.logNotification(base, blocked ? 'blocked' : 'failed', blocked ? 'Ota-ona botni bloklagan' : String(e.message || '').slice(0, 200))
			return { success: false, message: blocked ? 'Ota-ona botni bloklagan' : "Yuborib bo'lmadi" }
		}
	}

	// Ro'yxatdan o'tgan ota-onaga yana bir farzand biriktirish (aka-uka, telefon mos kelmagan holatlar)
	async addChild(schoolId, chatId, studentId) {
		if (!validId(studentId)) return { success: false, message: "O'quvchi tanlanmagan" }
		const base = await ParentLink.findOne({ schoolId, chatId: String(chatId) }).lean()
		const student = await studentModel.findOne({ _id: studentId, schoolId, isActive: { $ne: false } }).lean()
		if (!base || !student) return { success: false, message: "Ota-ona yoki o'quvchi topilmadi" }
		const r = await this.link(schoolId, student, { chatId: base.chatId, from: { id: base.telegramUserId, first_name: base.firstName, last_name: base.lastName, username: base.username } }, 'admin', base.phone)
		if (this.bot && r.created) await this.say(base.chatId, t(normLang(base.lang) || 'uz', 'admin_added', { name: `${student.fullName}${(await this.sinfName(student.sinf)) ? ` (${await this.sinfName(student.sinf)})` : ''}` }))
		return { success: true, created: r.created }
	}

	async updateGuardian(schoolId, id, patch) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const set = {}
		for (const k of ['active', 'notifyIn', 'notifyOut']) if (patch[k] !== undefined) set[k] = !!patch[k]
		if (set.active === true) { set.blocked = false; set.disabledByAdmin = false } // admin qayta yoqadi
		if (set.active === false) set.disabledByAdmin = true
		if (!Object.keys(set).length) return { success: false, message: "O'zgartirish yo'q" }
		const r = await ParentLink.updateOne({ _id: id, schoolId }, { $set: set })
		return r.matchedCount ? { success: true } : { success: false, message: 'Topilmadi' }
	}

	async removeGuardian(schoolId, id) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const r = await ParentLink.updateOne({ _id: id, schoolId }, { $set: { active: false, disabledByAdmin: true } })
		return r.matchedCount ? { success: true } : { success: false, message: 'Topilmadi' }
	}

	async testGuardian(schoolId, id) {
		if (!this.bot) return { success: false, message: this.botError || 'Bot ishga tushmagan' }
		const g = validId(id) ? await ParentLink.findOne({ _id: id, schoolId }).populate('student', 'fullName').lean() : null
		if (!g) return { success: false, message: 'Topilmadi' }
		return this.sendTest(schoolId, g, g.student?.fullName || '', [g._id])
	}

	async requests(schoolId) {
		const rows = await ParentRequest.find({ schoolId, status: 'pending' }).sort({ createdAt: -1 }).limit(200).lean()
		if (!rows.length) return { success: true, requests: [] }
		const students = await studentModel.find({ schoolId, isActive: { $ne: false } }).select('fullName sinf parentName parentPhone').populate('sinf', 'name').limit(5000).lean()
		const tail = (v) => digits(v).slice(-6)
		return {
			success: true,
			requests: rows.map((r) => {
				const tokens = [r.firstName, r.lastName, r.username].filter(Boolean).map((x) => String(x).toLowerCase()).filter((x) => x.length >= 3)
				const out = []
				for (const st of students) {
					let reason = ''
					if (r.student && String(r.student) === String(st._id)) reason = "Ota-ona shu o'quvchiga qayta ulanmoqchi"
					else if (tail(r.phone).length === 6 && tail(st.parentPhone) === tail(r.phone)) reason = "Telefon raqamining oxiri mos"
					else if (tokens.some((x) => String(st.parentName || '').toLowerCase().includes(x))) reason = 'Ota-ona ismi mos'
					else if (tokens.some((x) => String(st.fullName).toLowerCase().split(/\s+/)[0] === x)) reason = 'Familiya mos'
					if (reason) out.push({ studentId: st._id, fullName: st.fullName, sinf: st.sinf?.name || '', reason })
				}
				const order = { "Ota-ona shu o'quvchiga qayta ulanmoqchi": -1, "Telefon raqamining oxiri mos": 0, 'Ota-ona ismi mos': 1, 'Familiya mos': 2 }
				out.sort((a, b) => order[a.reason] - order[b.reason])
				return { _id: r._id, name: `${r.firstName} ${r.lastName}`.trim() || r.username || "Noma'lum", username: r.username, phone: r.phone, kind: r.kind || 'unmatched', note: r.note || '', createdAt: r.createdAt, suggestions: out.slice(0, 5) }
			})
		}
	}

	async approveRequest(schoolId, id, studentIds) {
		const ids = (Array.isArray(studentIds) ? studentIds : [studentIds]).filter(validId)
		if (!validId(id) || !ids.length) return { success: false, message: "Kamida bitta o'quvchini tanlang" }
		const req = await ParentRequest.findOne({ _id: id, schoolId, status: 'pending' })
		const students = await studentModel.find({ _id: { $in: ids }, schoolId, isActive: { $ne: false } }).lean()
		if (!req || !students.length) return { success: false, message: "So'rov yoki o'quvchi topilmadi" }
		for (const st of students) await this.link(schoolId, st, { chatId: req.chatId, from: { id: req.telegramUserId, first_name: req.firstName, last_name: req.lastName, username: req.username } }, 'admin', req.phone)
		req.status = 'approved'; req.student = students[0]._id; await req.save()
		const lang = await this.langOf(req.chatId)
		const names = (await Promise.all(students.map(async (st) => `• ${st.fullName}${(await this.sinfName(st.sinf)) ? ` (${await this.sinfName(st.sinf)})` : ''}`))).join('\n')
		if (this.bot) await this.say(req.chatId, t(lang, 'admin_linked', { names }), { reply_markup: this.menuKeyboard(lang) })
		return { success: true, linked: students.length }
	}

	async rejectRequest(schoolId, id) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const req = await ParentRequest.findOneAndUpdate({ _id: id, schoolId, status: 'pending' }, { $set: { status: 'rejected' } })
		if (!req) return { success: false, message: 'Topilmadi' }
		if (this.bot) await this.say(req.chatId, t(await this.langOf(req.chatId), 'request_rejected'))
		return { success: true }
	}

	// ---------- Admin: ota-ona bildirgan sabablar ----------
	async absenceReports(schoolId, { status = 'pending', page = 1, limit = 40 } = {}) {
		const filter = { schoolId: oid(schoolId) }
		if (['pending', 'approved', 'rejected'].includes(status)) filter.status = status
		const size = Math.min(100, Math.max(5, Number(limit) || 40))
		const cur = Math.max(1, Number(page) || 1)
		const [total, rows] = await Promise.all([ParentAbsenceReport.countDocuments(filter), ParentAbsenceReport.find(filter).sort({ createdAt: -1 }).skip((cur - 1) * size).limit(size).lean()])
		const [students, sinfs, parents] = await Promise.all([
			studentModel.find({ _id: { $in: rows.map((r) => r.student) } }).select('fullName').lean(),
			sinfModel.find({ _id: { $in: rows.map((r) => r.sinf).filter(Boolean) } }).select('name').lean(),
			ParentLink.find({ schoolId: oid(schoolId), chatId: { $in: rows.map((r) => r.chatId) } }).select('chatId firstName lastName username phone').lean()
		])
		const sn = new Map(students.map((s) => [String(s._id), s.fullName])), cn = new Map(sinfs.map((s) => [String(s._id), s.name])), pn = new Map()
		for (const p of parents) if (!pn.has(p.chatId)) pn.set(p.chatId, p)
		return {
			success: true, total, page: cur, pages: Math.max(1, Math.ceil(total / size)),
			reports: rows.map((r) => { const p = pn.get(r.chatId); return { _id: r._id, student: sn.get(String(r.student)) || "O'chirilgan o'quvchi", studentId: r.student, sinf: cn.get(String(r.sinf)) || '', parent: p ? (`${p.firstName} ${p.lastName}`.trim() || p.username || p.phone || '') : '', phone: p?.phone || '', dateFrom: r.dateFrom, dateTo: r.dateTo, type: r.type, comment: r.comment, status: r.status, createdAt: r.createdAt } })
		}
	}

	async decideReport(schoolId, userId, id, approve) {
		if (!validId(id)) return { success: false, message: "Id noto'g'ri" }
		const rep = await ParentAbsenceReport.findOneAndUpdate({ _id: id, schoolId, status: 'pending' }, { $set: { status: approve ? 'approved' : 'rejected', decidedBy: validId(userId) ? userId : null } })
		if (!rep) return { success: false, message: 'Topilmadi yoki allaqachon ko\'rib chiqilgan' }
		if (approve) {
			const r = await require('./student.excuse.service').create(schoolId, userId, { studentId: rep.student, type: rep.type, comment: rep.comment || "Ota-ona Telegram orqali bildirdi", startDate: rep.dateFrom, endDate: rep.dateTo })
			if (!r.success) { await ParentAbsenceReport.updateOne({ _id: rep._id }, { $set: { status: 'pending', decidedBy: null } }); return r }
		}
		if (this.bot) {
			const s = await studentModel.findById(rep.student).select('fullName').lean()
			await this.say(rep.chatId, t(await this.langOf(rep.chatId), approve ? 'report_approved' : 'report_rejected', { name: s?.fullName || '' }))
		}
		return { success: true }
	}

	async log(schoolId, { status, page = 1, limit = 40 } = {}) {
		const filter = { schoolId: oid(schoolId) }
		if (['sent', 'failed', 'blocked', 'skipped'].includes(status)) filter.status = status
		const size = Math.min(100, Math.max(5, Number(limit) || 40))
		const cur = Math.max(1, Number(page) || 1)
		const [total, rows] = await Promise.all([ParentNotification.countDocuments(filter), ParentNotification.find(filter).sort({ createdAt: -1 }).skip((cur - 1) * size).limit(size).populate('student', 'fullName').populate('guardian', 'firstName lastName username').lean()])
		return {
			success: true, total, page: cur, pages: Math.max(1, Math.ceil(total / size)),
			items: rows.map((r) => ({ _id: r._id, student: r.student?.fullName || '', guardian: `${r.guardian?.firstName || ''} ${r.guardian?.lastName || ''}`.trim() || r.guardian?.username || '', kind: r.kind, status: r.status, error: r.error, eventTime: r.eventTime, createdAt: r.createdAt }))
		}
	}
}

module.exports = new ParentService()
module.exports.phoneKey = phoneKey
module.exports.classifyError = classifyError
module.exports.inQuiet = inQuiet
module.exports.ParentService = ParentService

