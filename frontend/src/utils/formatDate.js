// Intl.DateTimeFormat'ning 'uz-UZ' lokali ba'zi brauzer/OS ICU
// ma'lumotlarida to'liq qo'llab-quvvatlanmaydi — natijada
// toLocaleDateString('uz-UZ', { month: 'long' }) kabi chaqiruvlar
// "2026 M08 09" kabi buzilgan formatni qaytarib qo'yishi mumkin.
// Shu sabab oy nomlarini qo'lda, ishonchli ro'yxat bilan formatlaymiz.
const UZ_MONTHS = [
	'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
	'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr',
]

const UZ_WEEKDAYS = [
	'yakshanba', 'dushanba', 'seshanba', 'chorshanba',
	'payshanba', 'juma', 'shanba',
]

// Grafik o'qi kabi tor joylar uchun qisqa shakl — indekslari
// UZ_WEEKDAYS / Date#getUTCDay() bilan bir xil (0 = yakshanba)
export const UZ_WEEKDAYS_SHORT = [
	'Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan',
]

const EN_WEEKDAY_TO_INDEX = {
	Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
	Thursday: 4, Friday: 5, Saturday: 6,
}

// Barcha formatlash funksiyalari shu yerdan foydalanadi — sana/vaqt
// qismlari doim Asia/Tashkent vaqt zonasiga nisbatan olinadi (qurilmaning
// o'zi boshqa zonada sozlangan bo'lsa ham natija to'g'ri chiqadi).
function tashkentParts(date) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Tashkent',
		year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long',
		hour: '2-digit', minute: '2-digit', hour12: false,
	}).formatToParts(date)
	const get = (type) => parts.find(p => p.type === type)?.value
	return {
		day: get('day'),
		month: get('month'),
		year: get('year'),
		weekdayIndex: EN_WEEKDAY_TO_INDEX[get('weekday')],
		hour: get('hour'),
		minute: get('minute'),
	}
}

// "9 avgust, 2026"
export function formatUzDate(date) {
	const p = tashkentParts(date)
	return `${p.day} ${UZ_MONTHS[Number(p.month) - 1]}, ${p.year}`
}

// "yakshanba, 9 avgust, 2026"
export function formatUzDateWithWeekday(date) {
	const p = tashkentParts(date)
	return `${UZ_WEEKDAYS[p.weekdayIndex]}, ${p.day} ${UZ_MONTHS[Number(p.month) - 1]}, ${p.year}`
}

// "9 avgust, 2026, soat 14:30"
export function formatUzDateTime(date) {
	const p = tashkentParts(date)
	const month = UZ_MONTHS[Number(p.month) - 1]
	return `${p.day} ${month}, ${p.year}, soat ${p.hour}:${p.minute}`
}

// "14:30"
export function formatUzTime(date) {
	const p = tashkentParts(date)
	return `${p.hour}:${p.minute}`
}

// "09.08.2026"
export function formatUzShortDate(date) {
	const p = tashkentParts(date)
	const mm = String(p.month).padStart(2, '0')
	const dd = String(p.day).padStart(2, '0')
	return `${dd}.${mm}.${p.year}`
}

// "09.08" — grafik/jadval yorliqlari uchun. `dateString` "YYYY-MM-DD"
// ko'rinishida, sof matn sifatida qabul qilinadi (Date obyektiga
// aylantirilmaydi) — aks holda `new Date("YYYY-MM-DD")` uni UTC yarim
// tunidagi vaqt deb o'qiydi va Toshkent (UTC+5) uchun sana bir kunga
// orqaga surilib ketishi mumkin edi.
export function formatShortDateFromDateString(dateString) {
	const [, mm, dd] = dateString.split('-')
	return `${dd}.${mm}`
}

// Haftaning kuni indeksini ("YYYY-MM-DD"dan, 0 = yakshanba, Date#getUTCDay()
// bilan bir xil) qaytaradi. `Date.UTC(...)` + `getUTCDay()` ataylab
// qo'llanadi — `new Date(dateString).getDay()` brauzerning MAHALLIY vaqt
// zonasida hisoblab, formatShortDateFromDateString'dagi izohda aytilgan
// xatolikning aynan o'zini (sana bir kunga siljib ketishi) keltirib
// chiqarar edi.
export function getWeekdayIndexFromDateString(dateString) {
	const [y, m, d] = dateString.split('-').map(Number)
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

// { hour, minute } sifatida, Asia/Tashkent bo'yicha — `new Date().getHours()`/
// `getMinutes()` o'rniga ishlatiladi, chunki ular BRAUZER lokal vaqt zonasida
// hisoblaydi va boshqa zonadagi qurilmada "kechikkan" statusini noto'g'ri
// belgilab qo'yishi mumkin edi.
export function getTashkentHourMinute(date) {
	const p = tashkentParts(date)
	return { hour: Number(p.hour), minute: Number(p.minute) }
}

// "YYYY-MM-DD", Asia/Tashkent bo'yicha — "bugungi sana"ni backendga
// so'rov sifatida yuborish kerak bo'lgan barcha joylarda shu ishlatilishi
// kerak. `new Date().toISOString().slice(0, 10)` o'rniga — u UTC bo'yicha
// hisoblaydi va Toshkentda 00:00–04:59 oralig'ida bir kun oldingi sanani
// qaytarib, o'sha vaqt oralig'ida "bugungi" izoh/ta'til belgilari
// noto'g'ri (yo'q yoki eskirgan) ko'rinishiga sabab bo'lardi.
export function getTashkentDateString(date = new Date()) {
	const p = tashkentParts(date)
	const mm = String(p.month).padStart(2, '0')
	const dd = String(p.day).padStart(2, '0')
	return `${p.year}-${mm}-${dd}`
}


// Oylarning to'liq nomlari (Profile.jsx va boshqalar uchun)
export const MONTHS_LONG = UZ_MONTHS
