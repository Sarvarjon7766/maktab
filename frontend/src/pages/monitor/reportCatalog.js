import axios from 'axios'
import { WEEKDAYS, schoolPlace, todayStr } from './monitorKit'

// Hisobotlar katalogi: har bir hisobot `run({ day, range })` orqali bir yoki bir nechta Excel varag'ini qaytaradi.
// Viloyat monitorida tumanlar kesimidagi hisobotlar ham bor; tuman/global monitorida faqat maktab va shaxslar kesimi.
const BASE = () => `${import.meta.env.VITE_BASE_URL}/api/monitor/`
const get = async (path, params) => {
	const res = await axios.get(BASE() + path, { params: { ...params, district: '' }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
	if (!res.data.success) throw new Error('fail')
	return res.data
}
// Sahifalangan ro'yxatni (har sahifa 200 ta) oxirigacha o'qiydi (xavfsizlik uchun 60 sahifagacha)
const paged = async (path, params, pick) => {
	const first = await get(path, { ...params, limit: 200, page: 1 })
	const out = [...pick(first)]
	for (let p = 2; p <= Math.min(first.pages || 1, 60); p++) out.push(...pick(await get(path, { ...params, limit: 200, page: p })))
	return { first, rows: out }
}
const p = (v) => (v === null || v === undefined ? '' : v)
const names = (list) => (list || []).map(x => `${x.name} (${x.value})`).join(', ')
const dt = (d) => (d ? new Date(d).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const wd = (date) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
const SEV = { high: 'Jiddiy', medium: "O'rta", low: 'Past' }
const STATUS = { absent: 'Kelmagan', inside: 'Maktabda', out: 'Chiqib ketgan' }
const KIND = { motion: 'Harakat', density: 'Odam zichligi', people: "Odamlar soni g'ayritabiiy", enter: 'Hududga kirish', exit: 'Hududdan chiqish', multi: "Ko'p turdagi obyekt", vision_empty: "Sinf bo'sh qolgan", vision_surge: 'Odamlar keskin oshgan', vision_overcrowd: "Ro'yxatdan ortiq odam", vision_restless: 'Sinf notinch', vision_commotion: 'Zalda tartibsizlik' }
const LEVEL = { attention: "E'tibor talab", mid: "O'rta", good: 'Yaxshi', nodata: "Ma'lumot yo'q" }
const range2 = (r) => `${r.from} — ${r.to}`

export const GROUPS = [
	{ key: 'district', label: 'Tumanlar', color: 'blue', region: true },
	{ key: 'school', label: 'Maktablar', color: 'sky' },
	{ key: 'student', label: "O'quvchilar", color: 'green' },
	{ key: 'staff', label: 'Xodimlar', color: 'violet' },
	{ key: 'class', label: 'Sinflar', color: 'amber' },
	{ key: 'camera', label: 'Kameralar va AI', color: 'orange' },
	{ key: 'watch', label: 'Nazorat', color: 'red' }
]

// ---------- Shaxslar ro'yxati (kunlik) ----------
const peopleSheet = (kind, status, name, title) => async ({ day }) => {
	const { first, rows } = await paged('people-all', { kind, status, date: day }, d => d.people)
	return [{
		name, title: `${title} — ${day}`, note: `${first.summary.total} ta jami`, totals: false,
		rows: rows.map(r => ({
			Maktab: r.schoolName, 'F.I.Sh.': r.fullName, ID: r.code || '', [kind === 'staff' ? 'Lavozim' : 'Sinf']: kind === 'staff' ? r.position : r.sinf,
			Holat: STATUS[r.status], 'Kech qolgan': r.late ? 'Ha' : "Yo'q", 'Birinchi kirish': r.firstIn || '', 'Oxirgi chiqish': r.lastOut || '', 'Maktabda bo\'lgan vaqt': r.totalTime || ''
		}))
	}]
}

const latePeople = (kind, name, title) => async ({ range }) => {
	const d = await get('late-people', { kind, ...range, limit: 300 })
	return [{
		name, title: `${title} — ${range2(range)}`, note: `${d.totalLatePeople} ta kech qolgan shaxs`,
		rows: d.people.map((r, i) => ({ "O'rin": i + 1, Maktab: r.schoolName, 'F.I.Sh.': r.fullName, ID: r.code || '', [kind === 'staff' ? 'Lavozim' : 'Sinf']: kind === 'staff' ? r.position : r.sinf, 'Kelgan kunlar': r.days, 'Kech qolgan kunlar': r.lateDays, 'Kech qolish %': r.percent, 'Eng kech kelgan': r.worst || '', 'Ish boshlanishi': r.limit || '' }))
	}]
}

export function buildCatalog({ region }) {
	const R = []
	const add = (r) => R.push(r)

	// ================= TUMANLAR (faqat viloyat monitori) =================
	if (region) {
		add({ key: 'districts', group: 'district', scope: 'range', title: 'Tumanlar solishtiruvi', text: "Har bir tuman: o'rin, maktab, o'quvchi, xodim soni, davomat (davr va bugun), kech qolish, kameralar.", run: async ({ range }) => {
			const d = await get('districts', range)
			return [{ name: 'Tumanlar', title: `Tumanlar solishtiruvi — ${range2(range)}`, totals: true, rows: d.rows.map(r => ({ "O'rin": r.rank ?? '', Tuman: r.name, Maktablar: r.schools, "O'quvchilar": r.students, Xodimlar: r.staff, "O'quvchi davomati % (davr)": p(r.studentPeriod), "O'quvchi bugun %": p(r.studentToday), 'Xodim davomati % (davr)': p(r.staffPeriod), 'Kech qolish %': p(r.latePercent), 'Kameralar online': `${r.cameraOnline}/${r.cameraTotal}`, 'Joylashuvi belgilangan maktablar': `${r.located}/${r.schools}` })) }]
		} })
		add({ key: 'd_trend', group: 'district', scope: 'range', title: 'Tumanlar dinamikasi (kunma-kun)', text: "Viloyat va har bir tuman davomati har bir kun bo'yicha.", run: async ({ range }) => {
			const d = await get('region/trend', range)
			return [{ name: 'Dinamika', title: `Tumanlar dinamikasi — ${range2(range)}`, rows: d.region.map(x => ({ Sana: x.date, Kun: wd(x.date), "Viloyat o'quvchi %": x.student, 'Viloyat xodim %': x.staff, ...Object.fromEntries(d.rows.map(r => [`${r.district} (o'quvchi %)`, r.days.find(y => y.date === x.date)?.student ?? ''])) })) }]
		} })
		add({ key: 'd_grades', group: 'district', scope: 'range', title: "Tumanlar × sinf darajalari", text: 'Har bir tuman: 1–11-sinf davomati va umumiy ko\'rsatkich.', run: async ({ range }) => {
			const d = await get('region/grades', range)
			return [{ name: 'Sinf darajalari', title: `Tumanlar × sinf darajalari — ${range2(range)}`, rows: d.rows.map(r => ({ Tuman: r.district, Sinflar: r.classes, "O'quvchilar": r.students, 'Umumiy %': p(r.overall), ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`${i + 1}-sinf %`, p(r.grades[i + 1]?.percent)])) })) }]
		} })
		add({ key: 'd_late', group: 'district', scope: 'range', title: 'Kech qolish (tumanlar)', text: "Tumanlar bo'yicha kech qolgan o'quvchi va xodimlar, eng ko'p kech qolganlar.", run: async ({ range }) => {
			const d = await get('region/late', range)
			return [{ name: 'Kech qolish', title: `Kech qolish — ${range2(range)}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Maktablar: r.schools, "Kech qolgan o'quvchilar": r.students, 'Kech qolgan xodimlar': r.staff, "Eng ko'p kech qolgan o'quvchilar": names(r.topStudents), "Eng ko'p kech qolgan xodimlar": names(r.topStaff) })) }]
		} })
		add({ key: 'd_risk', group: 'district', scope: 'range', title: 'Xavf guruhi (tumanlar)', text: "Ketma-ket kelmayotgan o'quvchilar tumanlar bo'yicha.", run: async ({ range }) => {
			const d = await get('region/risk', range)
			return [{ name: 'Xavf guruhi', title: `Xavf guruhi — ${range2(range)}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, "Xavf guruhidagi o'quvchilar": r.total, 'Eng uzoq ketma-ket (kun)': r.maxStreak, 'Eng xavfli': names(r.top) })) }]
		} })
		add({ key: 'd_leaves', group: 'district', scope: 'range', title: 'Sababli kelmaganlar (tumanlar)', text: "Ta'til, safar, kasallik: xodim va o'quvchilar tumanlar bo'yicha.", run: async ({ range }) => {
			const d = await get('region/leaves', range)
			return [{ name: 'Sababli kelmaganlar', title: `Sababli kelmaganlar — ${range2(range)}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, 'Sababli xodimlar': r.staff, 'Hozir faol': r.active, "Sababli o'quvchilar": r.students, "Ta'til": r.byType.tatil || 0, Safar: r.byType.safar || 0, Kasallik: r.byType.kasallik || 0, Boshqa: r.byType.boshqa || 0 })) }]
		} })
		add({ key: 'd_alerts', group: 'district', scope: 'day', title: 'Ogohlantirishlar (tumanlar)', text: "Tanlangan kundagi ogohlantirishlar tumanlar kesimida.", run: async ({ day }) => {
			const d = await get('region/alerts', { date: day })
			return [{ name: 'Ogohlantirishlar', title: `Ogohlantirishlar — ${day}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Jiddiy: r.high, "O'rta": r.medium, Past: r.low, Asosiylari: r.items.map(a => `${a.schoolName}: ${a.title}`).join('; ') })) }]
		} })
		add({ key: 'd_staff', group: 'district', scope: 'day', title: 'Xodimlar davomati (tumanlar)', text: "Tanlangan kun: tumanlar bo'yicha xodimlar.", run: async ({ day }) => {
			const d = await get('region/staff', { date: day })
			return [{ name: 'Xodimlar', title: `Xodimlar davomati — ${day}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Jami: r.total, Kelgan: r.came, 'Hozir maktabda': r.inside, Kelmagan: r.absent, 'Kech qolgan': r.late, 'Davomat %': p(r.percent) })) }]
		} })
		add({ key: 'd_students', group: 'district', scope: 'day', title: "O'quvchilar davomati (tumanlar)", text: "Tanlangan kun: tumanlar bo'yicha o'quvchilar.", run: async ({ day }) => {
			const d = await get('region/students', { date: day })
			return [{ name: "O'quvchilar", title: `O'quvchilar davomati — ${day}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Jami: r.total, Kelgan: r.came, 'Hozir maktabda': r.inside, Kelmagan: r.absent, 'Kech qolgan': r.late, 'Davomat %': p(r.percent) })) }]
		} })
		add({ key: 'd_classrooms', group: 'district', scope: 'day', title: 'Sinfxonalar AI (tumanlar)', text: "AI tahlili: e'tibor talab sinflar tumanlar bo'yicha.", run: async ({ day }) => {
			const d = await get('region/classrooms', { date: day })
			return [{ name: 'Sinfxonalar (AI)', title: `Sinfxonalar AI — ${day}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Sinflar: r.classes, "E'tibor talab": r.attention, "O'rta": r.mid, Yaxshi: r.good, "Ma'lumot yo'q": r.nodata })) }]
		} })
		add({ key: 'd_cameras', group: 'district', scope: 'none', title: 'Kameralar holati (tumanlar)', text: "Online va offline kameralar tumanlar bo'yicha.", run: async () => {
			const d = await get('region/cameras', {})
			return [{ name: 'Kameralar', title: 'Kameralar holati (tumanlar)', totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Kameralar: r.total, Online: r.online, Offline: r.offline, "Noma'lum": r.unknown, FaceControl: r.fcTotal, 'FaceControl offline': r.fcOffline, "Eng ko'p offline maktablar": names(r.worst) })) }]
		} })
		add({ key: 'd_events', group: 'district', scope: 'range', title: 'Kamera hodisalari (tumanlar)', text: "Hodisalar soni va turlari tumanlar bo'yicha.", run: async ({ range }) => {
			const d = await get('region/cameraEvents', range)
			return [{ name: 'Kamera hodisalari', title: `Kamera hodisalari — ${range2(range)}`, totals: true, rows: d.rows.map(r => ({ Tuman: r.district, Jami: r.total, Zichlik: r.density, Harakat: r.motion, Kirish: r.enter, Chiqish: r.exit })) }]
		} })
	}

	// ================= MAKTABLAR =================
	add({ key: 's_day', group: 'school', scope: 'day', title: 'Maktablar: kunlik hisobot', text: "Tanlangan kun: har bir maktabda o'quvchi va xodimlar kelgani, kelmagani, kech qolgani, kameralar.", run: async ({ day }) => {
		const d = await get('overview', { date: day })
		return [{ name: 'Maktablar', title: `Maktablar kunlik hisoboti — ${d.dateString}`, totals: true, rows: d.schools.map(s => ({
			Maktab: s.name, Hudud: schoolPlace(s), Faol: s.isActive ? 'Ha' : "Yo'q",
			"O'quvchi jami": s.stats.studentTotal, "O'quvchi kelgan": s.stats.studentCame, "O'quvchi kelmagan": s.stats.studentAbsent, "O'quvchi kech qolgan": s.stats.studentLate,
			"O'quvchi davomati %": s.stats.studentTotal ? Math.round((s.stats.studentCame / s.stats.studentTotal) * 1000) / 10 : '',
			'Xodim jami': s.stats.staffTotal, 'Xodim kelgan': s.stats.staffCame, 'Xodim sababli kelmagan': s.stats.staffExcused || 0, 'Xodim kelmagan (sababsiz)': s.stats.staffAbsent, 'Xodim kech qolgan': s.stats.staffLate,
			'Xodim davomati %': s.stats.staffTotal ? Math.round((s.stats.staffCame / Math.max(s.stats.staffTotal - (s.stats.staffExcused || 0), 1)) * 1000) / 10 : '',
			Sinflar: s.stats.classTotal, 'Kamera online': `${s.stats.cameraOnline}/${s.stats.cameraTotal}`
		})) }]
	} })
	add({ key: 's_period', group: 'school', scope: 'range', title: 'Maktablar: davr hisoboti', text: "Davrdagi o'rtacha davomat, o'quv kunlari, eng yaxshi va eng yomon kun.", run: async ({ range }) => {
		const d = await get('schools-report', range)
		return [{ name: 'Maktablar', title: `Maktablar davr hisoboti — ${range2(range)}`, totals: true, rows: d.schools.map(s => ({
			Maktab: s.name, Hudud: schoolPlace(s), "O'quv kunlari": s.schoolDays, "O'quvchi jami": s.studentTotal, "Kuniga o'rtacha kelgan o'quvchi": s.studentAvgCame, "O'quvchi davomati %": s.studentPercent,
			'Xodim jami': s.staffTotal, "Kuniga o'rtacha kelgan xodim": s.staffAvgCame, 'Xodim davomati %': s.staffPercent,
			'Eng yaxshi kun': s.best ? `${s.best.dateString} (${s.best.percent}%)` : '', 'Eng yomon kun': s.worst ? `${s.worst.dateString} (${s.worst.percent}%)` : ''
		})) }]
	} })
	add({ key: 's_trend', group: 'school', scope: 'range', title: 'Kunlik dinamika (umumiy)', text: "Davrning har bir kuni: barcha maktablar yig'indisi, kelganlar va foizlar.", run: async ({ range }) => {
		const d = await get('trend', range)
		return [{ name: 'Dinamika', title: `Kunlik dinamika — ${range2(range)}`, totals: true, rows: d.days.map(x => ({ Sana: x.dateString, 'Hafta kuni': WEEKDAYS[x.weekday], "O'quvchi kelgan": x.studentCame, "O'quvchi %": x.studentPercent, 'Xodim kelgan': x.staffCame, 'Xodim %': x.staffPercent })) }]
	} })
	add({ key: 's_arrival', group: 'school', scope: 'range', title: 'Kelish vaqti tahlili', text: "Maktablar bo'yicha o'rtacha kelish vaqti va 15 daqiqalik taqsimot (o'quvchi va xodim).", run: async ({ range }) => {
		const d = await get('arrival', range)
		return [
			{ name: "O'quvchi: maktablar", title: `O'quvchilarning o'rtacha kelish vaqti — ${range2(range)}`, rows: d.student.schools.map((s, i) => ({ "O'rin": i + 1, Maktab: s.schoolName, "O'rtacha kelish": s.avg, "Kuzatuvlar soni": s.n })) },
			{ name: 'Xodim: maktablar', title: `Xodimlarning o'rtacha kelish vaqti — ${range2(range)}`, rows: d.staff.schools.map((s, i) => ({ "O'rin": i + 1, Maktab: s.schoolName, "O'rtacha kelish": s.avg, "Kuzatuvlar soni": s.n })) },
			{ name: 'Taqsimot', title: 'Kelish vaqti taqsimoti (15 daqiqalik oraliq)', totals: true, rows: d.student.buckets.map(b => ({ Vaqt: b.time, "O'quvchilar": b.n, Xodimlar: d.staff.buckets.find(x => x.time === b.time)?.n || 0 })) }
		]
	} })
	add({ key: 's_weekday', group: 'school', scope: 'range', title: 'Hafta kunlari bo\'yicha', text: "Qaysi hafta kuni davomat yuqori yoki past ekani: kunlar dinamikasidan o'rtachalar.", run: async ({ range }) => {
		const d = await get('trend', range)
		const by = new Map()
		for (const x of d.days) { if (x.weekday === 0 || !x.studentCame) continue; const a = by.get(x.weekday) || { n: 0, s: 0, f: 0, c: 0 }; a.n++; a.s += x.studentPercent; a.f += x.staffPercent; a.c += x.studentCame; by.set(x.weekday, a) }
		return [{ name: 'Hafta kunlari', title: `Hafta kunlari bo'yicha davomat — ${range2(range)}`, rows: [1, 2, 3, 4, 5, 6].filter(k => by.has(k)).map(k => { const a = by.get(k); return { 'Hafta kuni': WEEKDAYS[k], 'Kunlar soni': a.n, "O'quvchi o'rtacha %": Math.round((a.s / a.n) * 10) / 10, 'Xodim o\'rtacha %': Math.round((a.f / a.n) * 10) / 10, "Kuniga o'rtacha kelgan o'quvchi": Math.round(a.c / a.n) } }) }]
	} })

	// ================= O'QUVCHILAR =================
	add({ key: 'st_absent', group: 'student', scope: 'day', title: "Kelmagan o'quvchilar", text: "Tanlangan kuni maktabga kelmagan barcha o'quvchilar ro'yxati (maktab, sinf).", run: peopleSheet('student', 'absent', "Kelmagan o'quvchilar", "Kelmagan o'quvchilar") })
	add({ key: 'st_late', group: 'student', scope: 'day', title: "Kech qolgan o'quvchilar", text: "Tanlangan kuni dars boshlanishidan keyin kelgan o'quvchilar va kelish vaqti.", run: peopleSheet('student', 'late', "Kech qolganlar", "Kech qolgan o'quvchilar") })
	add({ key: 'st_all', group: 'student', scope: 'day', title: "Barcha o'quvchilar holati", text: "Tanlangan kun: har bir o'quvchi — kelgan/kelmagan, kirish va chiqish vaqti.", run: peopleSheet('student', '', "O'quvchilar", "Barcha o'quvchilar holati") })
	add({ key: 'st_late_top', group: 'student', scope: 'range', title: "Eng ko'p kech qolgan o'quvchilar", text: "Davrdagi kech qolishlar reytingi: kech qolgan kunlar soni va foizi.", run: latePeople('student', "Kech qolgan o'quvchilar", "Eng ko'p kech qolgan o'quvchilar") })
	add({ key: 'st_risk', group: 'student', scope: 'range', title: 'Xavf guruhi (ro\'yxat)', text: "Ketma-ket 3 kun va undan ko'p kelmagan yoki 30% dan ortiq qoldirgan o'quvchilar.", run: async ({ range }) => {
		const d = await get('at-risk', { ...range, limit: 500 })
		return [{ name: 'Xavf guruhi', title: `Xavf guruhidagi o'quvchilar — ${range2(range)}`, note: `${d.total} ta`, rows: d.students.map((r, i) => ({ "O'rin": i + 1, Maktab: r.schoolName, "F.I.Sh.": r.fullName, ID: r.code || '', Sinf: r.sinf, "O'quv kunlari": r.schoolDays, Kelgan: r.present, Kelmagan: r.absent, 'Davomat %': r.percent, 'Ketma-ket kelmagan (kun)': r.streak, "Oxirgi kelgan sana": r.lastPresent || '' })) }]
	} })
	add({ key: 'st_leaves', group: 'student', scope: 'range', title: "Sababli kelmagan o'quvchilar", text: "Sinf rahbarlari kiritgan sababli kelmagan kunlar: sabab, davr, kim kiritgan.", run: async ({ range }) => {
		const d = await get('leaves', range)
		return [{ name: "O'quvchi sabablari", title: `Sababli kelmagan o'quvchilar — ${range2(range)}`, note: `${d.studentLeaves.length} ta`, rows: d.studentLeaves.map(r => ({ Maktab: r.schoolName, "F.I.Sh.": r.student.fullName, Sinf: r.sinf, Sabab: r.label, Izoh: r.comment, Boshlanishi: r.startDate, Tugashi: r.endDate || 'Davom etmoqda', Faol: r.active ? 'Ha' : "Yo'q", Kiritgan: r.createdBy })) }]
	} })

	// ================= XODIMLAR =================
	add({ key: 'sf_absent', group: 'staff', scope: 'day', title: 'Kelmagan xodimlar', text: "Tanlangan kuni ishga kelmagan barcha xodimlar ro'yxati.", run: peopleSheet('staff', 'absent', 'Kelmagan xodimlar', 'Kelmagan xodimlar') })
	add({ key: 'sf_late', group: 'staff', scope: 'day', title: 'Kech qolgan xodimlar', text: "Tanlangan kuni ish boshlanishidan keyin kelgan xodimlar va kelish vaqti.", run: peopleSheet('staff', 'late', 'Kech qolganlar', 'Kech qolgan xodimlar') })
	add({ key: 'sf_all', group: 'staff', scope: 'day', title: 'Barcha xodimlar holati', text: "Tanlangan kun: har bir xodim — kelgan/kelmagan, kirish va chiqish vaqti.", run: peopleSheet('staff', '', 'Xodimlar', 'Barcha xodimlar holati') })
	add({ key: 'sf_late_top', group: 'staff', scope: 'range', title: "Eng ko'p kech qolgan xodimlar", text: "Davrdagi kech qolishlar reytingi: kech qolgan kunlar soni va foizi.", run: latePeople('staff', 'Kech qolgan xodimlar', "Eng ko'p kech qolgan xodimlar") })
	add({ key: 'sf_leaves', group: 'staff', scope: 'range', title: 'Sababli kelmagan xodimlar', text: "Ta'til, xizmat safari, kasallik va boshqa sabablar: muddat, kunlar, kim kiritgan.", run: async ({ range }) => {
		const d = await get('leaves', range)
		return [
			{ name: 'Xodim sabablari', title: `Sababli kelmagan xodimlar — ${range2(range)}`, note: `${d.total} ta`, rows: d.leaves.map(r => ({ Maktab: r.schoolName, "F.I.Sh.": r.employee.fullName, Lavozim: r.employee.position, Sabab: r.label, Izoh: r.comment, Boshlanishi: r.startDate, Tugashi: r.endDate || 'Davom etmoqda', 'Kunlar': r.days, Faol: r.active ? 'Ha' : "Yo'q", Kiritgan: r.createdBy })) },
			{ name: 'Sabablar xulosasi', title: 'Sabablar bo\'yicha xulosa', totals: true, rows: Object.entries(d.byType).map(([k, n]) => ({ Sabab: d.labels?.[k] || k, Soni: n })) }
		]
	} })

	// ================= SINFLAR =================
	add({ key: 'c_day', group: 'class', scope: 'day', title: 'Barcha sinflar davomati', text: "Tanlangan kun: har bir maktabning har bir sinfi — jami, kelgan, kelmagan, foiz, sinf rahbari.", run: async ({ day }) => {
		const d = await get('classes-all', { date: day })
		return [{ name: 'Sinflar', title: `Sinflar davomati — ${d.dateString}`, totals: true, rows: d.classes.map(c => ({ Maktab: c.schoolName, Sinf: c.name, 'Sinf rahbari': c.head || '', Jami: c.total, Kelgan: c.came, 'Hozir maktabda': c.inside, Kelmagan: c.absent, 'Davomat %': c.percent })) }]
	} })
	add({ key: 'c_worst', group: 'class', scope: 'day', title: 'Eng past davomatli sinflar', text: "Tanlangan kun davomati eng past 100 ta sinf: tezkor e'tibor uchun.", run: async ({ day }) => {
		const d = await get('classes-all', { date: day })
		const rows = d.classes.filter(c => c.total > 0).sort((a, b) => a.percent - b.percent).slice(0, 100)
		return [{ name: 'Past davomat', title: `Eng past davomatli sinflar — ${day}`, rows: rows.map((c, i) => ({ "O'rin": i + 1, Maktab: c.schoolName, Sinf: c.name, 'Sinf rahbari': c.head || '', Jami: c.total, Kelmagan: c.absent, 'Davomat %': c.percent })) }]
	} })
	add({ key: 'c_grades', group: 'class', scope: 'range', title: 'Sinf darajalari (1–11)', text: "Barcha maktablarning 1-sinflari, 2-sinflari … 11-sinflari: davomat, kech qolish, eng yaxshi/yomon sinf.", run: async ({ range }) => {
		const d = await get('grades', range)
		return [
			{ name: 'Sinf darajalari', title: `Sinf darajalari bo'yicha davomat — ${range2(range)}`, note: `Umumiy ${p(d.overall)}%`, totals: true, rows: d.grades.map(g => ({ Daraja: `${g.grade}-sinf`, Maktablar: g.schools, Sinflar: g.classes, "O'quvchilar": g.students, 'Davomat %': p(g.percent), 'Kech qolish %': p(g.latePercent), 'Eng yaxshi sinf': g.best ? `${g.best.schoolName} ${g.best.name} (${g.best.percent}%)` : '', 'Eng yomon sinf': g.worst ? `${g.worst.schoolName} ${g.worst.name} (${g.worst.percent}%)` : '' })) },
			{ name: 'Daraja dinamikasi', title: 'Sinf darajalari kunma-kun davomati', rows: [...new Set(d.grades.flatMap(g => g.daily.map(x => x.date)))].sort().map(date => ({ Sana: date, Kun: wd(date), ...Object.fromEntries(d.grades.map(g => [`${g.grade}-sinf %`, g.daily.find(x => x.date === date)?.percent ?? ''])) })) }
		]
	} })
	add({ key: 'c_ai', group: 'class', scope: 'day', title: 'Sinfxonalar AI tahlili', text: "Kamerali sinflar bali va darajasi: e'tibor talab, o'rta, yaxshi, ma'lumot yo'q.", run: async ({ day }) => {
		const d = await get('classrooms-all', { date: day })
		return [{ name: 'Sinfxonalar AI', title: `Sinfxonalar AI tahlili — ${d.dateString}`, rows: d.classes.map(c => ({ Maktab: c.schoolName, Sinf: c.name, Daraja: LEVEL[c.analysis?.level] || '', Ball: p(c.analysis?.score), 'Kameralar soni': Array.isArray(c.cameras) ? c.cameras.length : p(c.cameras) })) }]
	} })

	// ================= KAMERALAR VA AI =================
	add({ key: 'cam_list', group: 'camera', scope: 'none', title: "Barcha kameralar ro'yxati", text: "Har bir kamera: maktab, joyi, turi, holati (online/offline), oxirgi aloqa va xatosi.", run: async () => {
		const d = await get('camera-health', {})
		return [{ name: 'Kameralar', title: "Kameralar ro'yxati", note: `Oddiy ${d.totals.regular.total} · FaceControl ${d.totals.facecontrol.total}`, rows: d.cameras.map(c => ({ Maktab: c.schoolName, Kamera: c.name, Joyi: c.place, Sinf: c.sinf || '', Turi: c.kind === 'facecontrol' ? 'FaceControl' : 'Oddiy kamera', Manba: c.source === 'hikconnect' ? 'Hik-Connect' : 'LAN', Holat: c.online === true ? 'Online' : c.online === false ? 'Offline' : "Noma'lum", 'Oxirgi aloqa': dt(c.lastSeenAt), Xato: c.error || '' })) }]
	} })
	add({ key: 'cam_offline', group: 'camera', scope: 'none', title: 'Offline kameralar', text: "Hozir aloqasi uzilgan kameralar: qaysi maktab, qancha vaqtdan beri.", run: async () => {
		const d = await get('camera-health', {})
		return [{ name: 'Offline', title: 'Offline kameralar', rows: d.cameras.filter(c => c.online !== true).map(c => ({ Maktab: c.schoolName, Kamera: c.name, Joyi: c.place, Turi: c.kind === 'facecontrol' ? 'FaceControl' : 'Oddiy kamera', Holat: c.online === false ? 'Offline' : "Noma'lum", 'Oxirgi aloqa': dt(c.lastSeenAt), Xato: c.error || '' })) }]
	} })
	add({ key: 'cam_schools', group: 'camera', scope: 'none', title: 'Maktablar kameralar xulosasi', text: "Har bir maktab: oddiy kameralar va FaceControl qurilmalari soni, online va offline.", run: async () => {
		const d = await get('camera-health', {})
		return [{ name: 'Maktablar kameralari', title: 'Maktablar kameralari xulosasi', totals: true, rows: d.schools.map(s => ({ Maktab: s.schoolName, Kameralar: s.regular.total, Online: s.regular.online, Offline: s.regular.offline, "Noma'lum": s.regular.unknown, FaceControl: s.facecontrol.total, 'FaceControl online': s.facecontrol.online, 'FaceControl offline': s.facecontrol.offline })) }]
	} })
	add({ key: 'cam_events', group: 'camera', scope: 'range', title: 'Kamera hodisalari xulosasi', text: "Davrdagi hodisalar: turlari, kunma-kun taqsimoti va eng faol maktablar.", run: async ({ range }) => {
		const d = await get('camera-events', { ...range, limit: 10 })
		const kinds = d.byKind.map(x => x.kind)
		return [
			{ name: 'Turlari', title: `Hodisalar turlari — ${range2(range)}`, totals: true, rows: d.byKind.map(x => ({ Tur: KIND[x.kind] || x.kind, Soni: x.n })) },
			{ name: 'Kunlar', title: 'Hodisalar kunma-kun', totals: true, rows: d.byDay.map(x => ({ Sana: x.date, Kun: wd(x.date), ...Object.fromEntries(kinds.map(k => [KIND[k] || k, x[k] || 0])) })) },
			{ name: 'Maktablar', title: 'Eng faol maktablar', rows: d.bySchool.map((s, i) => ({ "O'rin": i + 1, Maktab: s.schoolName, 'Hodisalar': s.n, 'Zichlik hodisalari': s.density })) }
		]
	} })
	add({ key: 'cam_events_list', group: 'camera', scope: 'range', title: "Kamera hodisalari ro'yxati", text: "Davrdagi har bir hodisa: vaqti, turi, kamerasi, sinfi, maktabi (eng ko'pi bilan 2000 ta).", run: async ({ range }) => {
		const first = await get('camera-events', { ...range, limit: 200, page: 1 })
		const ev = [...first.events]
		for (let pg = 2; pg <= Math.min(first.pages, 10); pg++) ev.push(...(await get('camera-events', { ...range, limit: 200, page: pg })).events)
		return [{ name: 'Hodisalar', title: `Kamera hodisalari — ${range2(range)}`, note: `${ev.length} / ${first.total}`, rows: ev.map(e => ({ Vaqt: dt(e.time), Maktab: e.schoolName, Tur: KIND[e.kind] || e.kind, Kamera: e.camera, Joyi: e.area, Sinf: e.sinf })) }]
	} })

	// ================= NAZORAT =================
	add({ key: 'w_alerts', group: 'watch', scope: 'day', title: "Ogohlantirishlar ro'yxati", text: "Tanlangan kun: jiddiylik, maktab, sabab va dalil bilan to'liq ro'yxat.", run: async ({ day }) => {
		const d = await get('alerts', { date: day })
		return [
			{ name: 'Ogohlantirishlar', title: `Ogohlantirishlar — ${d.dateString}`, note: `Jiddiy ${d.counts.high} · O'rta ${d.counts.medium} · Past ${d.counts.low}`, rows: d.alerts.map(a => ({ Jiddiylik: SEV[a.severity], Maktab: a.schoolName, Ogohlantirish: a.title, Dalil: a.evidence })) },
			{ name: 'Xulosa', title: 'Jiddiylik bo\'yicha xulosa', totals: true, rows: [{ Jiddiylik: 'Jiddiy', Soni: d.counts.high }, { Jiddiylik: "O'rta", Soni: d.counts.medium }, { Jiddiylik: 'Past', Soni: d.counts.low }] }
		]
	} })

	// ================= PAKETLAR (bir faylda ko'p varaq) =================
	const keys = (...k) => k.filter(x => R.some(r => r.key === x))
	const bundles = [
		region && { key: 'b_region', title: "Viloyat to'liq hisoboti", tone: 'from-blue-700 to-indigo-800', text: "Tumanlar solishtiruvi, dinamika, sinf darajalari, kech qolish, xavf guruhi, sabablar, ogohlantirishlar, kameralar, xodim va o'quvchilar — har biri alohida varaqda.", keys: keys('districts', 'd_trend', 'd_grades', 'd_late', 'd_risk', 'd_leaves', 'd_alerts', 'd_staff', 'd_students', 'd_classrooms', 'd_cameras', 'd_events'), scope: 'both' },
		{ key: 'b_day', title: "Kunlik paket", tone: 'from-emerald-600 to-teal-700', text: "Maktablar kunlik, barcha sinflar, kelmagan o'quvchilar va xodimlar, kech qolganlar, ogohlantirishlar — bir faylda.", keys: keys('s_day', 'c_day', 'st_absent', 'st_late', 'sf_absent', 'sf_late', 'w_alerts'), scope: 'day' },
		{ key: 'b_period', title: 'Davr paketi', tone: 'from-violet-600 to-purple-800', text: "Maktablar davr hisoboti, dinamika, hafta kunlari, kech qolish reytinglari, xavf guruhi, sinf darajalari, sabablar.", keys: keys('s_period', 's_trend', 's_weekday', 'st_late_top', 'sf_late_top', 'st_risk', 'c_grades', 'sf_leaves', 'st_leaves'), scope: 'range' },
		{ key: 'b_camera', title: 'Kameralar paketi', tone: 'from-orange-500 to-red-600', text: "Kameralar ro'yxati, offline kameralar, maktablar xulosasi, hodisalar xulosasi va ro'yxati.", keys: keys('cam_list', 'cam_offline', 'cam_schools', 'cam_events', 'cam_events_list'), scope: 'range' }
	].filter(Boolean)

	return { reports: R, bundles }
}

export const fileStamp = () => todayStr()

