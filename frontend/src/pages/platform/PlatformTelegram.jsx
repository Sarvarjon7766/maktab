import axios from 'axios'
import { useCallback, useEffect, useState } from 'react'
import { FaTelegramPlane } from 'react-icons/fa'
import { FiAlertTriangle, FiCheckCircle, FiEye, FiEyeOff, FiLink2, FiRefreshCw, FiSearch, FiSend, FiUsers, FiXCircle } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

const BASE = import.meta.env.VITE_BASE_URL
const call = (method, data) => axios({ method, url: `${BASE}/api/platform-settings/telegram`, data, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

const Tile = ({ icon, label, value, hint, tone = 'bg-blue-50 text-blue-600', onClick }) => (
	<div {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: e => { if (e.key === 'Enter') onClick() } } : {})} className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-sm flex items-start gap-3 ${onClick ? 'cursor-pointer transition hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400' : ''}`}>
		<span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{icon}</span>
		<div className="min-w-0"><p className="text-xs text-gray-500">{label}</p><p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>{hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}</div>
	</div>
)

// Tizim egasi: ota-onalar Telegram botini BIR MARTA ulaydi (butun platforma uchun). Maktab adminlari shu bot orqali o'z
// havolalarini "Ota-onalar boti" sahifasida oladi va ota-onalarni nazorat qiladi. Token bazada shifrlangan holda saqlanadi
const PlatformTelegram = () => {
	const [data, setData] = useState(null)
	const [token, setToken] = useState('')
	const [show, setShow] = useState(false)
	const [busy, setBusy] = useState(false)
	const [changing, setChanging] = useState(false)
	const [q, setQ] = useState('')
	const navigate = useNavigate()
	const toCoverage = () => document.getElementById('telegram-coverage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })

	const load = useCallback(() => call('get').then(r => setData(r.data)).catch(() => setData({ error: true })), [])
	useEffect(() => { load() }, [load])

	const connect = async (e) => {
		e.preventDefault()
		if (!token.trim()) return toast.error('Tokenni kiriting')
		setBusy(true)
		try {
			const r = await call('put', { token })
			toast.success(`Bot ulandi: @${r.data.username}`)
			setToken(''); setChanging(false); await load()
		} catch (err) { toast.error(err.response?.data?.message || "Ulab bo'lmadi") } finally { setBusy(false) }
	}
	const disconnect = async () => {
		if (!window.confirm("Botni uzasizmi? Ota-onalarga xabar yuborish va yangi ro'yxatga olish to'xtaydi (ulangan ota-onalar ma'lumotlari saqlanadi).")) return
		setBusy(true)
		try { await call('delete'); toast.success('Bot uzildi'); await load() } catch { toast.error("Uzib bo'lmadi") } finally { setBusy(false) }
	}

	const bot = data?.bot
	const t = data?.totals
	const form = (
		<form onSubmit={connect} className="space-y-3">
			<div className="flex flex-wrap gap-2">
				<div className="relative flex-1 min-w-[260px]">
					<input value={token} onChange={e => setToken(e.target.value)} type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder="123456789:AAH... (BotFather bergan token)" className="w-full pl-3 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm text-black font-mono" />
					<button type="button" onClick={() => setShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700">{show ? <FiEyeOff size={16} /> : <FiEye size={16} />}</button>
				</div>
				<button disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-60"><FiLink2 size={14} /> {busy ? 'Tekshirilmoqda...' : 'Tekshirish va ulash'}</button>
				{changing && <button type="button" onClick={() => { setChanging(false); setToken('') }} className="px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Bekor qilish</button>}
			</div>
			<p className="text-xs text-gray-500">Token Telegram'ga yuboriladi va tekshiriladi; saqlanganda shifrlanadi, keyin to'liq ko'rsatilmaydi. Backendni qayta ishga tushirish shart emas.</p>
		</form>
	)

	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6 space-y-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2"><FaTelegramPlane className="text-sky-500" /> Telegram bot (ota-onalar uchun)</h1>
					<p className="text-sm text-gray-500 mt-0.5">Farzandi maktabga kirsa/chiqsa, ota-onalarga FaceID bo'yicha xabar yuboradigan bot. Butun platforma uchun bitta bot, har maktab o'z havolasi bilan</p>
				</div>
				<button onClick={load} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"><FiRefreshCw size={14} /> Yangilash</button>
			</div>

			{data?.error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">Ma'lumotni yuklab bo'lmadi</div>}
			{!data && <p className="text-sm text-gray-500">Yuklanmoqda...</p>}

			{bot?.ready && (
				<section className="rounded-2xl border border-green-200 bg-green-50/60 p-5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<FiCheckCircle className="text-green-600" size={26} />
							<div>
								<p className="font-semibold text-green-900">Bot ulangan: <a href={`https://t.me/${bot.username}`} target="_blank" rel="noreferrer" className="underline">@{bot.username}</a></p>
								<p className="text-xs text-green-800/80">Token: ••••{bot.tokenTail} · manba: {bot.source === 'db' ? 'platforma paneli' : '.env fayli'}. Maktab adminlari endi o'z havolalarini oladi</p>
							</div>
						</div>
						<div className="flex gap-2">
							<button onClick={() => setChanging(c => !c)} className="px-3 py-2 rounded-lg border border-green-300 bg-white text-sm text-green-800 hover:bg-green-50">Tokenni almashtirish</button>
							<button onClick={disconnect} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"><FiXCircle size={14} /> Uzish</button>
						</div>
					</div>
					{changing && <div className="mt-4">{form}</div>}
				</section>
			)}

			{bot && !bot.ready && (
				<section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-4">
					<div className="flex gap-3">
						<FiAlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={22} />
						<div>
							<p className="font-semibold text-amber-900">Bot hali ulanmagan</p>
							<p className="text-sm text-amber-800">{bot.tokenSet ? bot.error : "Ota-onalar uchun bot yaratib, tokenini pastga kiriting. Bu bir marta qilinadi."}</p>
						</div>
					</div>
					<ol className="list-decimal pl-6 space-y-1 text-sm text-amber-900">
						<li>Telegram'da <b>@BotFather</b> ni oching va <code className="bg-white/70 px-1 rounded">/newbot</code> buyrug'ini yuboring.</li>
						<li>Bot nomi va foydalanuvchi nomini kiriting (masalan, <i>Maktab FaceID</i> va <i>maktab_faceid_bot</i>).</li>
						<li>BotFather bergan <b>tokenni</b> (<code className="bg-white/70 px-1 rounded">123456789:AAH...</code>) nusxalab, pastga qo'ying.</li>
					</ol>
					{form}
				</section>
			)}

			{t && (
				<div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
					<Tile icon={<FiUsers size={18} />} label="Ulangan ota-onalar" value={t.guardians} hint={`${t.schools} ta maktabda`} onClick={toCoverage} />
					<Tile icon={<FiSend size={18} />} label="Bugun yuborilgan xabarlar" value={t.sentToday} hint={t.failedToday ? `${t.failedToday} ta xato` : 'Xatosiz'} tone="bg-violet-50 text-violet-600" />
					<Tile icon={<FiAlertTriangle size={18} />} label="Kutilayotgan so'rovlar" value={t.pending} hint="Maktab adminlari ko'rib chiqadi" tone={t.pending ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'} />
					<Tile icon={<FaTelegramPlane size={18} />} label="Faol maktablar" value={t.schools} hint="Kamida bitta ota-ona ulangan" tone="bg-sky-50 text-sky-600" onClick={toCoverage} />
				</div>
			)}

			{bot && (bot.lastPollingError || bot.queue?.length > 0 || bot.queue?.dropped > 0 || bot.restarts > 0) && (
				<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm space-y-2">
					<h2 className="font-semibold text-gray-900">Bot diagnostikasi</h2>
					{bot.lastPollingError && <p className="text-sm text-gray-700">Oxirgi polling xatosi: <span className="font-mono text-xs text-red-700 break-all">{bot.lastPollingError.message}</span> <span className="text-xs text-gray-400">· {new Date(bot.lastPollingError.at).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}</span></p>}
					<p className="text-xs text-gray-500">Qayta ishga tushirishlar: {bot.restarts || 0} · Navbatdagi xabarlar: {bot.queue?.length || 0} · Tashlab yuborilgan: {bot.queue?.dropped || 0} · Qayta urinishlar: {bot.queue?.retried || 0}{bot.queue?.pausedUntil ? ' · Telegram cheklovi sababli navbat vaqtincha to\'xtagan' : ''}</p>
				</section>
			)}

			{data?.schools && (
				<section id="telegram-coverage" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
					<div className="mb-3 flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-semibold text-gray-900">Maktablar bo'yicha qamrov</h2>
						{data.schools.length > 0 && (
							<div className="relative w-full max-w-xs">
								<FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
								<input value={q} onChange={e => setQ(e.target.value)} placeholder="Maktab nomi bo'yicha qidirish" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
							</div>
						)}
					</div>
					{data.schools.length === 0 ? <p className="text-sm text-gray-500 rounded-xl bg-gray-50 px-4 py-6 text-center">Hali birorta maktabda ota-ona ulanmagan. Maktab adminlari "Ota-onalar boti" sahifasidan havola yaratadi</p> : (
						<div className="overflow-x-auto rounded-xl border border-gray-100">
							<table className="w-full text-sm">
								<thead><tr className="text-left text-xs uppercase tracking-wide text-gray-500 bg-gray-50">{['Maktab', 'Ulangan ota-onalar', "Qamrab olingan o'quvchilar"].map(h => <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
								<tbody>{data.schools.filter(s => !q.trim() || String(s.name || '').toLowerCase().replace(/['‘’ʻʼ`´]/g, '').includes(q.trim().toLowerCase().replace(/['‘’ʻʼ`´]/g, ''))).map(s => <tr key={String(s.schoolId)} onClick={() => s.schoolId && navigate(`/platform/schools/${s.schoolId}/parents`)} title="Ota-onalar sahifasini ochish" className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"><td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td><td className="px-4 py-2.5 text-gray-700">{s.guardians}</td><td className="px-4 py-2.5 text-gray-700">{s.students}</td></tr>)}</tbody>
							</table>
						</div>
					)}
				</section>
			)}
		</div>
	)
}

export default PlatformTelegram
