import { useEffect, useState } from 'react'
import { FiAlertTriangle, FiCheckSquare, FiInfo, FiPrinter } from 'react-icons/fi'
import { Link } from 'react-router-dom'

// Maktab admini uchun yo'riqnoma: maktab ma'lumotlarini bosqichma-bosqich to'ldirish.
// Matn faqat ilovadagi haqiqiy bo'lim, maydon va tugma nomlariga tayanadi; ilova o'zgarsa shu faylni yangilang.
// "PDF sifatida saqlash" — brauzerning chop etish oynasi (Chop etish → "PDF sifatida saqlash").
const STORE = 'schoolGuideDone'
const readDone = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch { return {} } }

const Tip = ({ children }) => <div className="my-3 flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><FiInfo className="mt-0.5 shrink-0" /><div>{children}</div></div>
const Warn = ({ children }) => <div className="my-3 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><FiAlertTriangle className="mt-0.5 shrink-0" /><div>{children}</div></div>
const B = ({ children }) => <b className="font-semibold text-slate-900">{children}</b>
const Steps = ({ children }) => <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-slate-700 marker:font-semibold marker:text-blue-600">{children}</ol>
const List = ({ children }) => <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-slate-700">{children}</ul>

const Section = ({ id, n, title, where, children }) => (
	<section id={id} className="scroll-mt-20 break-inside-avoid-page rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none">
		<h2 className="flex items-center gap-3 text-lg font-semibold text-slate-900">
			<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{n}</span>{title}
		</h2>
		{where && <p className="mt-1 text-xs text-slate-500">Menyu: <span className="font-medium text-slate-700">{where}</span></p>}
		<div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
	</section>
)

const ORDER = [
	['sozlamalar', 'Sozlamalar'], ['sinflar', 'Sinflar'], ['xodimlar', 'Xodimlar'], ['oquvchilar', "O'quvchilar"],
	['kameralar', 'Kamera sozlamalari'], ['yuz', 'Yuz tanish (ixtiyoriy)'], ['bot', 'Ota-onalar boti'], ['tekshiruv', 'Yakuniy tekshiruv'],
]

const AdminGuide = () => {
	const [done, setDone] = useState(readDone)
	useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(done)) } catch { /* ixtiyoriy */ } }, [done])
	const left = ORDER.filter(([id]) => !done[id]).length

	return (
		<div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6 print:p-0">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl font-bold text-slate-900">Maktab admini uchun yo'riqnoma</h1>
					<p className="mt-1 max-w-2xl text-sm text-slate-500">Maktabingiz ma'lumotlarini tizimga to'liq kiritish tartibi. Bo'limlarni <B>shu ketma-ketlikda</B> bajaring: keyingi qadam oldingisiga tayanadi (masalan, o'quvchini sinfsiz qo'shib bo'lmaydi).</p>
				</div>
				<button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"><FiPrinter /> PDF sifatida saqlash / chop etish</button>
			</div>

			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:shadow-none">
				<p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><FiCheckSquare className="text-blue-600" /> Bajarilganlar ro'yxati <span className="text-xs font-normal text-slate-500">({ORDER.length - left} / {ORDER.length}) · belgilar shu brauzerda saqlanadi</span></p>
				<div className="grid gap-1.5 sm:grid-cols-2">
					{ORDER.map(([id, label], i) => (
						<label key={id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
							<input type="checkbox" checked={!!done[id]} onChange={e => setDone(d => ({ ...d, [id]: e.target.checked }))} />
							<a href={`#${id}`} className={`${done[id] ? 'text-slate-400 line-through' : 'text-slate-800'} hover:text-blue-700`}>{i + 1}. {label}</a>
						</label>
					))}
				</div>
			</div>

			<Section id="boshlash" n="0" title="Boshlashdan oldin tayyorlang">
				<List>
					<li><B>Kirish ma'lumoti:</B> tizim egasi bergan login va parol. Kirish sahifasida paroldagi xatoni ko'rish uchun parol maydonidagi <B>ko'z</B> belgisini bosing.</li>
					<li><B>Xodimlar ro'yxati:</B> to'liq ism-sharif, lavozim; har biriga login va parol (yoki bo'sh qoldirsangiz, tizim o'zi beradi).</li>
					<li><B>O'quvchilar ro'yxati:</B> to'liq ism-sharif va sinfi. Ota-ona ismi va telefon raqami (Telegram bot uchun kerak).</li>
					<li><B>Rasmlar</B> (yuz tanish yoqilsa): har kishining aniq, yorug' joyda olingan old tomondan surati. JPG yoki PNG, <B>10 KB – 200 KB</B>.</li>
				</List>
				<Warn>Shaxsiy ma'lumotlar (rasm, telefon, JSHSHIR) faqat ish uchun kerak bo'lgan hajmda kiritiladi. Ro'yxatlarni Excel faylda ochiq tarqatmang.</Warn>
			</Section>

			<Section id="sozlamalar" n="1" title="Maktab sozlamalari" where="Tizim → Sozlamalar">
				<Steps>
					<li><B>Ish va dars boshlanish vaqti</B> — «Boshlanish vaqti» maydoniga maktabdagi ish boshlanish soatini kiriting. Shu vaqtdan keyin kirgan kishi «kech qolgan» hisoblanadi (maydon ostidagi misol buni ko'rsatadi).</li>
					<li><B>Takroriy skanlarni filtrlash</B> — bir kishi eshikdan qisqa vaqt ichida ikki marta o'tsa, ikkinchisi yozilmaydigan vaqt (soniyada).</li>
					<li><B>Kirishdan keyin chiqish uchun kutish</B> va <B>Chiqishdan keyin kirish uchun kutish</B> — kirgandan (chiqqandan) so'ng shu vaqt o'tmaguncha qarama-qarshi yozuv yozilmaydi. Qiymat 0 dan 3600 soniyagacha.</li>
					<li><B>Saqlash</B> tugmasini bosing. «Saqlanmagan o'zgarishlar bor» yozuvi chiqib turgan bo'lsa, hali saqlanmagan.</li>
				</Steps>
				<Tip>Aniq qiymatlarni bilmasangiz, boshlang'ich holatda qoldiring va faqat boshlanish vaqtini maktabingiznikiga moslang.</Tip>
			</Section>

			<Section id="sinflar" n="2" title="Sinflarni yaratish" where="Ro'yxatlar → Sinflar">
				<Steps>
					<li><B>Yangi sinf</B> tugmasini bosing.</li>
					<li><B>Sinf</B> maydonida avval <B>darajani</B> (1–11-sinf) tanlang, so'ng <B>harfni</B> yozing (A, B, V ... — 3 belgigacha, avtomatik bosh harfga o'tadi). Pastdagi ko'k satrda sinf nomi chiqadi, masalan <B>5-A</B>.</li>
					<li><B>Sinf rahbari</B> (ixtiyoriy) — xodim ismi yoki lavozimi bo'yicha qidirib tanlang. Xodimlar hali kiritilmagan bo'lsa, keyin ham biriktirish mumkin.</li>
					<li><B>Izoh</B> (ixtiyoriy) va <B>Qo'shish</B>.</li>
					<li>Maktabdagi <B>hamma</B> sinflar uchun takrorlang (parallel sinflar — alohida: 5-A, 5-B ...).</li>
				</Steps>
				<Warn>«Darajani tanlang» ro'yxati bo'sh bo'lsa, darajalar tizim egasi tomonidan yopib qo'yilgan bo'lishi mumkin. Tizim egasiga xabar bering: u «Darajalar» bo'limida ularni ochadi.</Warn>
			</Section>

			<Section id="xodimlar" n="3" title="Xodimlarni qo'shish" where="Ro'yxatlar → Xodimlar">
				<p><B>A) Bittalab qo'shish</B> — <B>Yangi xodim</B> tugmasi (sahifa yuqorisidagi «+» belgisi, ustiga borsangiz «Yangi xodim» deb yoziladi):</p>
				<List>
					<li><B>Majburiy:</B> To'liq ism sharif, Lavozimi, Foydalanuvchi nomi (login), Parol.</li>
					<li><B>Ixtiyoriy:</B> shaxsiy telefon, ish telefoni, JSHSHIR (14 xonali raqam; faqat admin ko'radi), sinf (sinf rahbari bo'lsa; «Sinfsiz» ham bo'ladi).</li>
					<li><B>Rasm:</B> «Rasm yuklash». JPG/JPEG/PNG, 10–200 KB, yuz aniq va yorug'lik yaxshi bo'lsin. Yuz tanish va kamera uchun kerak.</li>
				</List>
				<p><B>B) Excel orqali ko'plab qo'shish</B> (ko'p xodim bo'lsa tezroq):</p>
				<Steps>
					<li><B>Excel'dan qo'shish</B> tugmasini bosing, ochilgan oynada <B>Shablonni yuklab olish</B>ni bosing.</li>
					<li>Shablonni to'ldiring. <B>Majburiy ustunlar:</B> F.I.Sh, Lavozimi, Login, Parol. <B>Ixtiyoriy:</B> Sinf (sinf oldindan mavjud bo'lsin). Ustunlar tartibi muhim emas, faqat 1-qatordagi sarlavha nomlari to'g'ri bo'lsin.</li>
					<li>Parol bo'sh qoldirilsa, tizim xavfsiz parolni o'zi beradi va natijada <B>«Avtomatik parol»</B> ro'yxatini ko'rsatadi, uni darhol xodimlarga yetkazing.</li>
					<li>To'ldirilgan .xlsx faylni tanlab <B>Yuklash</B>ni bosing. «muvaffaqiyatli qo'shildi» va «qatorda muammo» sonlari chiqadi; muammoli qatorlar raqami bilan ko'rsatiladi, ularni tuzatib qayta yuklang.</li>
				</Steps>
				<Warn>Rasmni Excel orqali qo'shib bo'lmaydi. Xodimlar rasmsiz qo'shiladi; keyin har birini <B>tahrirlash</B> oynasida rasm yuklaysiz.</Warn>
				<p><B>C) Tartib:</B> <B>Xodimlarni tartiblash</B> bo'limida xodimlarni sudrab, ro'yxatdagi ketma-ketlikni belgilang va <B>Saqlash</B>ni bosing.</p>
			</Section>

			<Section id="oquvchilar" n="4" title="O'quvchilarni qo'shish" where="Ro'yxatlar → O'quvchilar">
				<Warn><B>Avval sinflar yaratilgan bo'lishi shart</B> (2-qadam). O'quvchi qo'shishda sinf tanlanadi, Excelda esa sinf nomi shu maktabda allaqachon mavjud bo'lishi kerak.</Warn>
				<p><B>A) Bittalab qo'shish</B> — <B>O'quvchi qo'shish</B>:</p>
				<List>
					<li><B>Majburiy:</B> To'liq ism sharifi, Sinf (ro'yxatdan tanlanadi).</li>
					<li><B>Ixtiyoriy:</B> Jinsi (o'g'il bola / qiz bola), <B>Ota-onasining ismi</B>, <B>Ota-ona telefon raqami</B>, rasm.</li>
				</List>
				<Tip><B>Ota-ona telefon raqamini albatta kiriting.</B> Telegram bot ota-onani aynan shu raqam bo'yicha topadi (7-qadam). Raqam yo'q bo'lsa, ota-ona avtomatik ulanmaydi.</Tip>
				<p><B>B) Excel orqali ko'plab qo'shish:</B></p>
				<Steps>
					<li><B>Excel'dan qo'shish</B> tugmasini bosing va <B>Shablonni yuklab olish</B> bilan shablonni oling.</li>
					<li><B>Majburiy ustunlar:</B> F.I.Sh, Sinf (masalan «5-A», aynan yaratilgan nom bilan). <B>Ixtiyoriy:</B> Ota-ona ismi, Ota-ona telefoni.</li>
					<li>.xlsx faylni tanlab <B>Yuklash</B>. Natijada nechta qo'shilgani va qaysi qatorlarda muammo borligi ko'rsatiladi: tuzatib, faqat muammoli qatorlarni qayta yuklang.</li>
				</Steps>
			</Section>

			<Section id="kameralar" n="5" title="Kameralarni sinflarga biriktirish" where="Kameralar va kuzatuv → Kamera sozlamalari">
				<Tip>Kameralarni maktabga <B>tizim egasi</B> biriktiradi. «Hozircha biriktirilgan Hik-Connect kamerasi yo'q» yozuvi chiqsa, tizim egasiga murojaat qiling: bu sahifada o'zingiz kamera qo'sha olmaysiz.</Tip>
				<Steps>
					<li>Har bir kamera uchun <B>qayerda turishini</B> tanlang: <B>Sinfxona</B> (dars jarayoni kuzatiladi) yoki <B>Zal / koridor</B> (odamlar zichligi va tartibsizlik belgilari kuzatiladi).</li>
					<li>Sinfxona kamerasiga <B>qaysi sinf o'sha xonada dars o'tsa, shu sinfni</B> biriktiring. Bir sinfga bir nechta kamera biriktirish mumkin.</li>
					<li>Sinf biriktirilgach <B>odam sanash o'zi yoqiladi</B>. 1–2 daqiqadan keyin kamera qatorida hozirgi odam soni chiqadi.</li>
					<li>Sahifadagi ogohlantirish «<B>N ta kamera hali sinfga biriktirilmagan</B>» — ular uchun tahlil ishlamaydi; ularning hammasini biriktiring.</li>
				</Steps>
				<List>
					<li>Natijalar <B>Sinfxonalar nazorati</B>, <B>Aqlli kuzatuv</B> va <B>Hisobotlar</B>da ko'rinadi. Bu tahlilda yuz tanilmaydi, shaxs aniqlanmaydi: faqat odam soni va holatlar (tik turgan, boshi egilgan, qo'l ko'targan) sanaladi.</li>
					<li><B>Yuz tanish kameralari (FaceControl)</B> alohida sahifada, <B>FaceControl</B> bo'limida ko'rsatiladi.</li>
					<li>Yangi xodim yoki o'quvchi qo'shilsa, rasmi yoki ismi o'zgarsa yoki o'chirilsa, ma'lumot Hik-Connect bulutiga o'zi yuboriladi.</li>
				</List>
				<p>Jonli videoni <B>Jonli kuzatuv</B> bo'limida ko'rasiz. Kamera ovozi standart holatda o'chiq. Ko'p kamera bir vaqtda ochilsa, ba'zilari navbatda turadi va navbati kelganda o'zi ochiladi.</p>
			</Section>

			<Section id="yuz" n="6" title="Yuz tanish (faqat yoqilgan bo'lsa)" where="Kameralar va kuzatuv → Yuz tanish">
				<Warn>Yuz tanish — <B>biometrik ma'lumot</B>. Uni ishlatishdan oldin ota-onalar roziligi va saqlash qoidalari hal qilingan bo'lishi kerak (amaldagi talablar lex.uz'da tekshirilsin). Bu bo'limdagi funksiyani tizim egasi yoqadi: «O'chiq (tizim egasi yoqadi)» yozuvi turgan bo'lsa, bu qadamni o'tkazib yuboring.</Warn>
				<Steps>
					<li>O'quvchi va xodimlarning <B>asosiy rasmlari</B> yuklangan bo'lsin (3 va 4-qadam).</li>
					<li><B>Suratlardan baza yaratish</B> tugmasini bosing. Bir necha daqiqa ketishi mumkin; tugagach «olindi / o'tkazildi» sonlari chiqadi.</li>
					<li>Aniqlik uchun har bir o'quvchiga <B>3–5 ta qo'shimcha rasm</B> yuklang (o'quvchini tahrirlash oynasida). Kamera orqali tanilgan yuzlar izlarni o'zi to'ldirib boradi.</li>
					<li><B>Sinflar bo'yicha qamrov</B> jadvalida qaysi sinfda necha o'quvchining yuz izi borligi ko'rinadi; to'liq bo'lmagan sinflarga rasm qo'shing.</li>
				</Steps>
				<Tip>Yuz tanish natijasi «ko'rindi» belgisi sifatida saqlanadi: tanilmagan o'quvchi «kelmagan» hisoblanmaydi.</Tip>
			</Section>

			<Section id="bot" n="7" title="Ota-onalar Telegram botini ulash" where="Aloqa → Ota-onalar boti">
				<Tip>Telegram botni <B>tizim administratori</B> ulaydi. «Bot ulanmagan» yoki «Havola hali tayyor emas» yozuvi chiqsa, tizim egasiga murojaat qiling.</Tip>
				<Steps>
					<li><B>Ulashish</B> bo'limida ota-onalarga yuboriladigan <B>havola va QR-kod</B> bilan tayyor xabar bor. <B>Matnni nusxalash</B> tugmasi bilan nusxalab, sinf guruhlariga yuboring.</li>
					<li>Ota-ona havolani bosadi va botda <B>«Telefon raqamni yuborish»</B> tugmasini bosadi. Raqam <B>maktabda ro'yxatga olingan raqam</B> bo'lishi kerak. Shuning uchun o'quvchi kartasidagi ota-ona telefoni to'g'ri bo'lishi muhim.</li>
					<li>Telefoni kiritilmagan o'quvchilar uchun <B>2-usul</B>: shu farzand uchun alohida havola (7 kun amal qiladi, 3 tagacha ota-ona ulana oladi).</li>
					<li>Raqami ro'yxatdan topilmagan ota-onalar <B>So'rovlar</B> bo'limiga tushadi: kim ekanini aniqlab, farzandiga biriktiring yoki rad eting.</li>
					<li><B>Xabarlar</B> bo'limida qaysi xabarlar yuborilishini tanlang: farzandi kirganda / chiqqanda, kechikish haqida, haftalik xulosa (yakshanba 19:00), farzandi kelmaganda (soatni o'zingiz belgilaysiz).</li>
				</Steps>
			</Section>

			<Section id="tekshiruv" n="8" title="Yakuniy tekshiruv" where="Asosiy → Bosh sahifa">
				<List>
					<li><B>Sinflar</B>da hamma sinf bor; har birida o'quvchilar soni to'g'ri.</li>
					<li><B>Xodimlar</B> va <B>O'quvchilar</B> ro'yxatlari to'liq; rasm kerak bo'lganlarning rasmi bor.</li>
					<li><B>Kamera sozlamalari</B>da «sinfga biriktirilmagan» kamera qolmagan; <B>Jonli kuzatuv</B>da kameralar ochiladi.</li>
					<li><B>Bosh sahifa</B>da va <B>Kirish–Chiqish</B>da bugungi yozuvlar paydo bo'la boshlagan.</li>
					<li>Ota-ona botiga bitta sinov ota-onani ulab, xabar kelishini tekshiring.</li>
				</List>
			</Section>

			<Section id="muammolar" n="?" title="Ko'p uchraydigan muammolar">
				<List>
					<li><B>Sinf oynasida daraja chiqmaydi</B> — darajalar yopiq: tizim egasi «Darajalar»da ochadi.</li>
					<li><B>Excelda «sinf topilmadi»</B> — sinf nomi yaratilgan nomga aynan mos emas (masalan «5-A» o'rniga «5A») yoki sinf hali yaratilmagan.</li>
					<li><B>Rasm yuklanmaydi</B> — hajmi 10–200 KB oralig'ida emas yoki format JPG/PNG emas. Rasmni kichraytiring.</li>
					<li><B>Kamera ko'rinmaydi yoki «offline»</B> — kameraning internetga ulanganini tekshiring; tizim egasi tomonda Hik-Connect akkaunti ulanganini ham so'rang.</li>
					<li><B>Videoda «shifrlangan» xabari</B> — qurilmadagi shifrlash kodi tizimdagi bilan mos emas: tizim egasiga ayting.</li>
					<li><B>Ota-ona botga ulana olmayapti</B> — telefon raqami o'quvchi kartasidagidan farq qiladi: «So'rovlar» yoki 2-usul (alohida havola).</li>
				</List>
				<p className="text-xs text-slate-500 print:hidden">Savol yoki noaniqlik bo'lsa, tizim egasiga murojaat qiling. <Link to="/user" className="underline">Bosh sahifaga qaytish</Link></p>
			</Section>
		</div>
	)
}

export default AdminGuide
