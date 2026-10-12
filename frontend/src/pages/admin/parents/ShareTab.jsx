import { tx } from '../../../i18n'
import { useState } from 'react'
import { FiCopy, FiRefreshCw, FiSend, FiUserX } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import { api, copyText, errText, Empty, LinkBox } from './ui'

const STEPS = [
	['1', 'Havolani yuboring', "Quyidagi havolani yoki tayyor xabarni ota-onalar guruhiga yuboring, yoki QR kodni yig'ilishda ko'rsating"],
	['2', "Ota-ona botni ochadi", "Havolani bosadi va «Telefon raqamni yuborish» tugmasini bosadi"],
	['3', 'Avtomatik ulanadi', "Raqami o'quvchi kartasidagi ota-ona telefoniga mos kelsa, farzandlari o'zi ulanadi"]
]

// "Ulash" bo'limi: ota-onalarni ro'yxatga olishning ikki usuli va sinflar bo'yicha qamrov
const ShareTab = ({ ov, coverage, onChanged, goStudents }) => {
	const [rotating, setRotating] = useState(false)
	const link = ov.link
	const noPhone = coverage.reduce((a, c) => a + c.noPhone, 0)
	const message = [tx("Assalomu alaykum, hurmatli ota-onalar!"), "", tx("{{school}} farzandingiz maktabga kirishi va chiqishi haqida Telegram orqali sizga xabar yuboradi.", { school: ov.school }), "", tx("Ro'yxatdan o'tish uchun:"), tx("1) Havolani bosing: {{url}}", { url: link?.url || '' }), tx("2) Botda «Telefon raqamni yuborish» tugmasini bosing."), "", tx("Eslatma: raqam maktabda ro'yxatga olingan ota-ona raqamingiz bo'lishi kerak.")].join("\n")

	const rotate = async () => {
		if (!window.confirm("Eski umumiy havola ishlamay qoladi (allaqachon ro'yxatdan o'tgan ota-onalarga ta'sir qilmaydi). Yangi havolani qayta tarqatish kerak bo'ladi. Davom etamizmi?")) return
		setRotating(true)
		try { await api('post', 'invite/school', { data: { rotate: true } }); toast.success('Yangi havola yaratildi'); await onChanged() } catch (e) { toast.error(errText(e)) } finally { setRotating(false) }
	}

	if (!ov.bot.ready || !link) {
		return <Empty title={tx("Havola hali tayyor emas")} hint={tx("Telegram bot tizim administratori tomonidan ulangach, ro'yxatga olish havolasi va QR kod shu yerda paydo bo'ladi.")} />
	}

	return (
		<div className="space-y-5">
			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<div className="flex flex-wrap items-start justify-between gap-3 mb-4">
					<div>
						<p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-green-700 bg-green-50 rounded-full px-2.5 py-1">{tx("Tavsiya etiladi")}</p>
						<h2 className="text-lg font-semibold text-gray-900 mt-2">{tx("1-usul: hamma ota-onalarga bitta havola")}</h2>
						<p className="text-sm text-gray-500 mt-0.5">{tx("Bot: @{{username}} · shu havola orqali hozirgacha", { username: ov.bot.username })} <b className="text-gray-700">{link.uses}</b> {tx("ta ota-ona ro'yxatdan o'tgan")}</p>
					</div>
					<button onClick={rotate} disabled={rotating} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw size={13} className={rotating ? 'animate-spin' : ''} /> {tx("Havolani yangilash")}</button>
				</div>

				<div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
					<div>
						<p className="text-sm font-medium text-gray-800 mb-2">{tx("Havola va QR kod")}</p>
						<LinkBox invite={link} />
						<a href={`https://t.me/share/url?url=${encodeURIComponent(link.url)}&text=${encodeURIComponent(`${ov.school}: farzandingiz kirishi va chiqishi haqida xabar olish uchun ro'yxatdan o'ting`)}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-500 text-white text-sm hover:bg-sky-600"><FiSend size={14} /> {tx("Telegram orqali yuborish")}</a>
					</div>
					<div>
						<p className="text-sm font-medium text-gray-800 mb-2">{tx("Ota-onalarga yuboriladigan tayyor xabar")}</p>
						<textarea readOnly value={message} rows={9} className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-800 leading-relaxed resize-none" onFocus={e => e.target.select()} />
						<button onClick={() => copyText(message, 'Xabar matni nusxalandi')} className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"><FiCopy size={14} /> {tx("Matnni nusxalash")}</button>
					</div>
				</div>

				<ol className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3">
					{STEPS.map(([n, t, d]) => (
						<li key={n} className="flex gap-3 rounded-xl bg-gray-50 p-3"><span className="w-7 h-7 rounded-full bg-slate-900 text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</span><div><p className="font-medium text-gray-900 text-sm">{t}</p><p className="text-xs text-gray-500 mt-0.5">{d}</p></div></li>
					))}
				</ol>
				{noPhone > 0 && (
					<p className="mt-4 text-sm rounded-xl bg-amber-50 border border-amber-100 text-amber-900 px-4 py-3">
						<b>{tx("{{n}} ta o'quvchining", { n: noPhone })}</b> {tx("ota-ona telefoni kartada kiritilmagan: ularning ota-onasi bu usulda")} <b>{tx("avtomatik ulanmaydi")}</b>. Telefonni <Link to="../students" className="underline font-medium">{tx("O'quvchilar")}</Link> {tx("sahifasida kiriting yoki pastdagi 2-usuldan foydalaning.")}
					</p>
				)}
			</section>

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-semibold text-gray-900">{tx("2-usul: bitta farzand uchun alohida havola")}</h2>
				<p className="text-sm text-gray-500 mt-0.5 mb-4">{tx("Ota-ona telefoni kiritilmagan yoki raqami boshqa bo'lgan holatlar uchun. Havola faqat shu farzandga bog'lanadi (7 kun amal qiladi, 3 tagacha ota-ona ulana oladi).")}</p>
				<div className="flex flex-wrap gap-2">
					<button onClick={() => goStudents({ phone: 'no', covered: 'no' })} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800"><FiUserX size={15} /> {tx("Telefonsiz o'quvchilar ({{n}})", { n: noPhone })}</button>
					<button onClick={() => goStudents({ covered: 'no' })} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">{tx("Ota-onasi ulanmaganlar")}</button>
				</div>
				<p className="text-xs text-gray-400 mt-3">{tx("«Farzandlar» bo'limida o'quvchini bosing: ochilgan panelda shu farzand uchun havola va QR kod yaratiladi.")}</p>
			</section>

			<section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
				<h2 className="text-lg font-semibold text-gray-900 mb-1">{tx("Sinflar bo'yicha qamrov")}</h2>
				<p className="text-sm text-gray-500 mb-4">{tx("Har sinfda nechta o'quvchining kamida bitta ota-onasi ulangan. Sinfni bossangiz, ulanmaganlar ro'yxati ochiladi.")}</p>
				{coverage.length === 0 ? <p className="text-sm text-gray-500">{tx("Maktabda hali o'quvchi yo'q.")}</p> : (
					<ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
						{coverage.map(c => {
							const pct = c.students ? Math.round(c.covered / c.students * 100) : 0
							return (
								<li key={String(c.sinfId)}>
									<button onClick={() => goStudents({ sinfId: String(c.sinfId), covered: 'no' })} className="w-full text-left group">
										<div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-medium text-gray-900 group-hover:text-blue-600">{c.name}</span><span className="text-gray-500 text-xs">{c.covered} / {c.students} · {pct}%{c.noPhone ? ` · ${c.noPhone} ta telefonsiz` : ''}</span></div>
										<div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400'}`} style={{ width: `${pct}%` }} /></div>
									</button>
								</li>
							)
						})}
					</ul>
				)}
			</section>
		</div>
	)
}

export default ShareTab
