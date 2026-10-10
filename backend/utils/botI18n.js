// Ota-onalar Telegram boti matnlari: o'zbek lotin (uz, asosiy), o'zbek kirill (uz-cyrl), rus (ru), ingliz (en). Topilmagan kalit uchun uz, u ham yo'q bo'lsa kalitning o'zi qaytadi.
// Matnlar oddiy matn (parse_mode ishlatilmaydi), shuning uchun belgilarni escape qilish kerak emas.
const uz = {
	help: "Bu bot maktabda farzandingiz kirishi va chiqishi haqida xabar beradi.\n\nPastdagi tugmalardan foydalaning yoki buyruqlarni yozing:\n/bugun, /hafta, /oy: davomat\n/farzandlarim: ulangan farzandlar\n/toxtatish, /yoqish: xabarlarni farzand bo'yicha to'xtatish yoki yoqish\n/sozlamalar: til, jim rejim, tinch soatlar\n\nRo'yxatdan o'tish uchun maktab ma'muriyati bergan havolani oching.",
	start_new: "Assalomu alaykum!\n\nBu bot farzandingiz maktabga kirsa yoki chiqsa, sizga xabar beradi.\n\nBoshlash uchun:\n1) Maktab ma'muriyatidan Telegram havolasini oling\n2) Havolani bosing va \"Boshlash\" tugmasini bosing\n3) Telefon raqamingizni yuboring: farzandlaringiz avtomatik ulanadi",
	start_back: "Siz {n} ta farzandga ulangansiz. Pastdagi menyudan foydalaning.",
	invite_bad: "Bu havola yaroqsiz yoki muddati tugagan. Maktab ma'muriyatidan yangi havola so'rang.",
	student_gone: "Bu havola endi yaroqli emas (o'quvchi topilmadi). Maktab ma'muriyatiga murojaat qiling.",
	joined_student: "Ro'yxatdan o'tdingiz!\n\n{name}{cls} maktabga kirsa yoki chiqsa, shu yerda xabar olasiz.\nMaktab: {school}\n\nPastdagi menyudan foydalaning.",
	already_linked: "{name} allaqachon sizga ulangan.",
	ask_phone: "Assalomu alaykum! Maktab: {school}\n\nFarzandingizni topish uchun pastdagi tugma orqali telefon raqamingizni yuboring. Raqam maktabdagi o'quvchi kartasida ko'rsatilgan ota-ona raqami bilan solishtiriladi.",
	btn_phone: "Telefon raqamni yuborish",
	need_link: "Avval maktab ma'muriyati bergan havolani qayta oching.",
	phone_not_own: "Faqat o'zingizning telefon raqamingizni (pastdagi tugma orqali) yuboring.",
	phone_bad: "Telefon raqami noto'g'ri. Qayta urinib ko'ring.",
	phone_throttle: "Juda ko'p urinish. Bir soatdan keyin qayta urinib ko'ring.",
	no_match: "Bu raqam maktab ro'yxatidan topilmadi. So'rovingiz maktab ma'muriyatiga yuborildi: tasdiqlangach shu yerda xabar olasiz.\n\n(Raqam o'quvchi kartasida ota-ona telefoni sifatida kiritilgan bo'lishi kerak.)",
	no_match_limit: "Bu raqam maktab ro'yxatidan topilmadi. Hozir so'rovlar ko'p, iltimos maktab ma'muriyatiga to'g'ridan-to'g'ri murojaat qiling.",
	joined_phone: "Ro'yxatdan o'tdingiz!\n\nUlangan farzandlar:\n{names}\n\nEndi ular maktabga kirsa yoki chiqsa, shu yerda xabar olasiz.\nMaktab: {school}",
	disabled_note: "Quyidagi farzand(lar) ma'muriyat tomonidan o'chirilgan, shuning uchun ulanmadi. So'rovingiz ma'muriyatga yuborildi:\n{names}",
	req_disabled_note: "Admin tomonidan o'chirilgan ulanish: ota-ona qayta ulanishga urindi ({name})",
	children_none: "Hozircha ulangan farzand yo'q. Maktab ma'muriyati bergan havolani oching.",
	children_title: "Ulangan farzandlar:",
	tag_paused: "xabar to'xtatilgan",
	tag_muted: "jim rejim {time} gacha",
	tag_quiet: "tinch soat {from}-{to}",
	pick_pause: "Qaysi farzand uchun xabarlarni to'xtatamiz?",
	pick_resume: "Qaysi farzand uchun xabarlarni yoqamiz?",
	btn_all: "Hammasi",
	paused_one: "{name}: xabarlar to'xtatildi. Qayta yoqish: /yoqish",
	resumed_one: "{name}: xabarlar yoqildi.",
	paused_all: "Barcha farzandlar uchun xabarlar to'xtatildi. Qayta yoqish: /yoqish",
	resumed_all: "Barcha farzandlar uchun xabarlar yoqildi.",
	m_today: "Bugun", m_week: "Hafta", m_month: "Oy", m_children: "Farzandlarim", m_settings: "Sozlamalar",
	menu_hint: "Menyudan tanlang.",
	settings_title: "Sozlamalar. Farzandni tanlang yoki tilni o'zgartiring:",
	lang_set: "Til o'zgartirildi: O'zbekcha.",
	excuse_kasallik: "kasallik", excuse_oilaviy: "oilaviy sabab", excuse_musobaqa: "musobaqa / tadbir", excuse_boshqa: "boshqa sabab",
	child_settings: "{name}: sozlamalar",
	btn_pause: "Xabarlarni to'xtatish", btn_resume: "Xabarlarni yoqish",
	btn_mute1: "1 soat jim", btn_mute8: "8 soat jim", btn_mute24: "24 soat jim", btn_unmute: "Jimlikni olib tashlash",
	btn_quiet: "Tinch soat {from}-{to}", btn_quiet_off: "Tinch soatni o'chirish",
	muted_set: "{name}: {time} gacha jim rejim.",
	muted_off: "{name}: jim rejim o'chirildi.",
	quiet_set: "{name}: {from} dan {to} gacha xabarlar yig'ib turiladi va tinch soat tugagach bitta xabarda yuboriladi.",
	quiet_off: "{name}: tinch soat o'chirildi.",
	today_title: "Bugun, {date}",
	week_title: "Shu hafta ({from} - {to})",
	month_title: "Shu oy ({from} - {to})",
	st_absent: "kelmadi",
	st_absent_excused: "kelmadi (sababli: {type})",
	st_no_school: "bugun maktab kuni emas yoki hali hech kim kelmagan",
	st_in: "kirdi {time}",
	st_out: "chiqdi {time}",
	st_inside: "hozir maktabda",
	spent: "maktabda bo'lgan vaqt: {h} soat {m} daqiqa",
	late: "kech qoldi: {n} daqiqa",
	on_time: "o'z vaqtida",
	stats_line: "keldi: {present}, kelmadi: {absent}, kech qoldi: {late}, sababli: {excused}, davomat: {pct}%",
	no_days: "Bu davrda maktab kunlari hali qayd etilmagan.",
	fallback: "Tushunmadim. Pastdagi menyudan foydalaning yoki /yordam deb yozing.",
	notif_in: "Farzandingiz {who} maktabga kirdi\nVaqt: {time}\nMaktab: {school}",
	notif_out: "Farzandingiz {who} maktabdan chiqdi\nVaqt: {time}\nMaktab: {school}",
	late_line: "{n} daqiqa kechikdi",
	absent_alert: "{who} bugun maktabga kelmadi (soat {time} holatiga ko'ra).\nMaktab: {school}\nSababini bildiring:",
	btn_sick: "Kasal", btn_family: "Oilaviy", btn_other: "Boshqa",
	absent_ack: "Sabab qabul qilindi, maktab ma'muriyati ko'rib chiqadi.",
	absent_ask_comment: "Sababini qisqacha yozib yuboring (yoki shu bilan yakunlash uchun e'tibor bermang).",
	comment_saved: "Izoh saqlandi.",
	absent_already: "Bu xabarga javob allaqachon yuborilgan.",
	report_approved: "{name}: bildirgan sababingiz qabul qilindi.",
	report_rejected: "{name}: bildirgan sababingiz tasdiqlanmadi. Aniqlik uchun maktabga murojaat qiling.",
	held_title: "Tinch soatlarda kelgan xabarlar:",
	digest_title: "Haftalik xulosa ({from} - {to})",
	admin_linked: "Maktab ma'muriyati sizni quyidagi farzand(lar)ga ulab qo'ydi:\n{names}\n\nEndi kirish va chiqish haqida xabar olasiz.",
	admin_added: "Maktab ma'muriyati sizga yana bir farzandni ulab qo'ydi: {name}",
	request_rejected: "So'rovingiz maktab ma'muriyati tomonidan tasdiqlanmadi. Aniqlik kiritish uchun maktabga murojaat qiling.",
	test_msg: "Sinov xabari: {school}\nFarzandingiz ({kids}) maktabga kirsa yoki chiqsa, shu yerga xabar keladi.",
	deleted_student: "O'chirilgan o'quvchi",
	group_ignored: "",
	no_children: "Ulangan farzand yo'q."
}

const ru = {
	help: "Этот бот сообщает, когда ваш ребёнок входит в школу и выходит из неё.\n\nПользуйтесь кнопками меню или командами:\n/bugun, /hafta, /oy: посещаемость\n/farzandlarim: подключённые дети\n/toxtatish, /yoqish: приостановить или включить уведомления по каждому ребёнку\n/sozlamalar: язык, режим тишины, тихие часы\n\nДля регистрации откройте ссылку, которую дала администрация школы.",
	start_new: "Здравствуйте!\n\nЭтот бот сообщит вам, когда ваш ребёнок войдёт в школу или выйдет из неё.\n\nЧтобы начать:\n1) Получите ссылку на Telegram у администрации школы\n2) Откройте ссылку и нажмите \"Начать\"\n3) Отправьте свой номер телефона: дети подключатся автоматически",
	start_back: "К вам подключено детей: {n}. Пользуйтесь меню ниже.",
	invite_bad: "Ссылка недействительна или срок её действия истёк. Попросите у администрации школы новую ссылку.",
	student_gone: "Ссылка больше не действует (ученик не найден). Обратитесь в администрацию школы.",
	joined_student: "Вы зарегистрированы!\n\nО входе и выходе {name}{cls} вы будете получать сообщения здесь.\nШкола: {school}\n\nПользуйтесь меню ниже.",
	already_linked: "{name} уже подключён к вам.",
	ask_phone: "Здравствуйте! Школа: {school}\n\nЧтобы найти вашего ребёнка, отправьте номер телефона кнопкой ниже. Номер сверяется с номером родителя в карточке ученика.",
	btn_phone: "Отправить номер телефона",
	need_link: "Сначала снова откройте ссылку, которую дала администрация школы.",
	phone_not_own: "Отправьте только свой номер телефона (кнопкой ниже).",
	phone_bad: "Неверный номер телефона. Попробуйте ещё раз.",
	phone_throttle: "Слишком много попыток. Повторите через час.",
	no_match: "Этот номер не найден в списке школы. Заявка отправлена администрации: после подтверждения вы получите сообщение здесь.\n\n(Номер должен быть указан в карточке ученика как телефон родителя.)",
	no_match_limit: "Этот номер не найден в списке школы. Сейчас много заявок, пожалуйста, обратитесь в администрацию школы напрямую.",
	joined_phone: "Вы зарегистрированы!\n\nПодключённые дети:\n{names}\n\nТеперь вы будете получать сообщения об их входе и выходе.\nШкола: {school}",
	disabled_note: "Следующие дети были отключены администрацией, поэтому не подключены. Заявка отправлена администрации:\n{names}",
	req_disabled_note: "Подключение, отключённое администратором: родитель пытался подключиться снова ({name})",
	children_none: "Подключённых детей пока нет. Откройте ссылку от администрации школы.",
	children_title: "Подключённые дети:",
	tag_paused: "уведомления приостановлены",
	tag_muted: "тишина до {time}",
	tag_quiet: "тихие часы {from}-{to}",
	pick_pause: "Для какого ребёнка приостановить уведомления?",
	pick_resume: "Для какого ребёнка включить уведомления?",
	btn_all: "Все",
	paused_one: "{name}: уведомления приостановлены. Включить: /yoqish",
	resumed_one: "{name}: уведомления включены.",
	paused_all: "Уведомления приостановлены для всех детей. Включить: /yoqish",
	resumed_all: "Уведомления включены для всех детей.",
	m_today: "Сегодня", m_week: "Неделя", m_month: "Месяц", m_children: "Мои дети", m_settings: "Настройки",
	menu_hint: "Выберите в меню.",
	settings_title: "Настройки. Выберите ребёнка или смените язык:",
	lang_set: "Язык изменён: Русский.",
	excuse_kasallik: "болезнь", excuse_oilaviy: "семейные обстоятельства", excuse_musobaqa: "мероприятие", excuse_boshqa: "другое",
	child_settings: "{name}: настройки",
	btn_pause: "Приостановить уведомления", btn_resume: "Включить уведомления",
	btn_mute1: "Тишина на 1 час", btn_mute8: "Тишина на 8 часов", btn_mute24: "Тишина на 24 часа", btn_unmute: "Снять тишину",
	btn_quiet: "Тихие часы {from}-{to}", btn_quiet_off: "Отключить тихие часы",
	muted_set: "{name}: режим тишины до {time}.",
	muted_off: "{name}: режим тишины отключён.",
	quiet_set: "{name}: с {from} до {to} сообщения копятся и приходят одним сообщением после окончания тихих часов.",
	quiet_off: "{name}: тихие часы отключены.",
	today_title: "Сегодня, {date}",
	week_title: "Эта неделя ({from} - {to})",
	month_title: "Этот месяц ({from} - {to})",
	st_absent: "не пришёл",
	st_absent_excused: "не пришёл (по уважительной причине: {type})",
	st_no_school: "сегодня не учебный день или ещё никто не пришёл",
	st_in: "вошёл {time}",
	st_out: "вышел {time}",
	st_inside: "сейчас в школе",
	spent: "время в школе: {h} ч {m} мин",
	late: "опоздал: {n} мин",
	on_time: "вовремя",
	stats_line: "был: {present}, не был: {absent}, опоздал: {late}, по причине: {excused}, посещаемость: {pct}%",
	no_days: "За этот период учебные дни ещё не зафиксированы.",
	fallback: "Не понял. Воспользуйтесь меню ниже или напишите /yordam.",
	notif_in: "Ваш ребёнок {who} вошёл в школу\nВремя: {time}\nШкола: {school}",
	notif_out: "Ваш ребёнок {who} вышел из школы\nВремя: {time}\nШкола: {school}",
	late_line: "опоздал на {n} мин",
	absent_alert: "{who} сегодня не пришёл в школу (на {time}).\nШкола: {school}\nСообщите причину:",
	btn_sick: "Болезнь", btn_family: "Семейные", btn_other: "Другое",
	absent_ack: "Причина принята, администрация школы рассмотрит её.",
	absent_ask_comment: "Напишите причину коротко (или оставьте как есть).",
	comment_saved: "Комментарий сохранён.",
	absent_already: "Ответ на это сообщение уже отправлен.",
	report_approved: "{name}: указанная вами причина принята.",
	report_rejected: "{name}: указанная вами причина не подтверждена. Обратитесь в школу для уточнения.",
	held_title: "Сообщения за тихие часы:",
	digest_title: "Итоги недели ({from} - {to})",
	admin_linked: "Администрация школы подключила вас к следующим детям:\n{names}\n\nТеперь вы будете получать сообщения о входе и выходе.",
	admin_added: "Администрация школы подключила к вам ещё одного ребёнка: {name}",
	request_rejected: "Ваша заявка не подтверждена администрацией школы. Обратитесь в школу для уточнения.",
	test_msg: "Тестовое сообщение: {school}\nКогда ваш ребёнок ({kids}) войдёт в школу или выйдет из неё, сообщение придёт сюда.",
	deleted_student: "Удалённый ученик",
	group_ignored: "",
	no_children: "Подключённых детей нет."
}

const en = {
	help: "This bot notifies you when your child enters or leaves the school.\n\nUse the buttons below or type the commands:\n/bugun, /hafta, /oy: attendance\n/farzandlarim: linked children\n/toxtatish, /yoqish: pause or resume notifications per child\n/sozlamalar: language, silent mode, quiet hours\n\nTo register, open the link provided by the school administration.",
	start_new: "Hello!\n\nThis bot will notify you when your child enters or leaves the school.\n\nTo get started:\n1) Get the Telegram link from the school administration\n2) Open the link and press \"Start\"\n3) Send your phone number: your children will be linked automatically",
	start_back: "You are linked to {n} child(ren). Use the menu below.",
	invite_bad: "This link is invalid or has expired. Ask the school administration for a new link.",
	student_gone: "This link is no longer valid (student not found). Please contact the school administration.",
	joined_student: "You are registered!\n\nYou will receive messages here when {name}{cls} enters or leaves the school.\nSchool: {school}\n\nUse the menu below.",
	already_linked: "{name} is already linked to you.",
	ask_phone: "Hello! School: {school}\n\nTo find your child, send your phone number using the button below. The number is matched against the parent's number listed on the student's card at the school.",
	btn_phone: "Send phone number",
	need_link: "First, open the link provided by the school administration again.",
	phone_not_own: "Send only your own phone number (using the button below).",
	phone_bad: "The phone number is invalid. Please try again.",
	phone_throttle: "Too many attempts. Please try again in an hour.",
	no_match: "This number was not found in the school's list. Your request has been sent to the school administration: you will be notified here once it is approved.\n\n(The number must be entered as the parent's phone on the student's card.)",
	no_match_limit: "This number was not found in the school's list. There are many requests right now, please contact the school administration directly.",
	joined_phone: "You are registered!\n\nLinked children:\n{names}\n\nYou will now receive messages here when they enter or leave the school.\nSchool: {school}",
	disabled_note: "The following child(ren) were disabled by the administration, so they were not linked. Your request has been sent to the administration:\n{names}",
	req_disabled_note: "Connection disabled by the admin: the parent tried to reconnect ({name})",
	children_none: "There are no linked children yet. Open the link provided by the school administration.",
	children_title: "Linked children:",
	tag_paused: "notifications paused",
	tag_muted: "silent until {time}",
	tag_quiet: "quiet hours {from}-{to}",
	pick_pause: "For which child should notifications be paused?",
	pick_resume: "For which child should notifications be resumed?",
	btn_all: "All",
	paused_one: "{name}: notifications paused. To resume: /yoqish",
	resumed_one: "{name}: notifications resumed.",
	paused_all: "Notifications paused for all children. To resume: /yoqish",
	resumed_all: "Notifications resumed for all children.",
	m_today: "Today", m_week: "Week", m_month: "Month", m_children: "My children", m_settings: "Settings",
	menu_hint: "Choose from the menu.",
	settings_title: "Settings. Choose a child or change the language:",
	lang_set: "Language changed: English.",
	excuse_kasallik: "illness", excuse_oilaviy: "family reasons", excuse_musobaqa: "competition / event", excuse_boshqa: "other reason",
	child_settings: "{name}: settings",
	btn_pause: "Pause notifications", btn_resume: "Resume notifications",
	btn_mute1: "Silent for 1 hour", btn_mute8: "Silent for 8 hours", btn_mute24: "Silent for 24 hours", btn_unmute: "Turn off silent mode",
	btn_quiet: "Quiet hours {from}-{to}", btn_quiet_off: "Turn off quiet hours",
	muted_set: "{name}: silent mode until {time}.",
	muted_off: "{name}: silent mode turned off.",
	quiet_set: "{name}: from {from} to {to} messages are held and sent as a single message when quiet hours end.",
	quiet_off: "{name}: quiet hours turned off.",
	today_title: "Today, {date}",
	week_title: "This week ({from} - {to})",
	month_title: "This month ({from} - {to})",
	st_absent: "absent",
	st_absent_excused: "absent (excused: {type})",
	st_no_school: "today is not a school day or nobody has arrived yet",
	st_in: "entered {time}",
	st_out: "left {time}",
	st_inside: "currently at school",
	spent: "time at school: {h} h {m} min",
	late: "late: {n} minutes",
	on_time: "on time",
	stats_line: "present: {present}, absent: {absent}, late: {late}, excused: {excused}, attendance: {pct}%",
	no_days: "No school days have been recorded for this period yet.",
	fallback: "I did not understand. Use the menu below or type /yordam.",
	notif_in: "Your child {who} entered the school\nTime: {time}\nSchool: {school}",
	notif_out: "Your child {who} left the school\nTime: {time}\nSchool: {school}",
	late_line: "arrived {n} minutes late",
	absent_alert: "{who} did not come to school today (as of {time}).\nSchool: {school}\nPlease tell us the reason:",
	btn_sick: "Illness", btn_family: "Family", btn_other: "Other",
	absent_ack: "The reason has been received; the school administration will review it.",
	absent_ask_comment: "Write the reason briefly (or ignore this to finish).",
	comment_saved: "Comment saved.",
	absent_already: "A reply to this message has already been sent.",
	report_approved: "{name}: the reason you provided has been accepted.",
	report_rejected: "{name}: the reason you provided was not confirmed. Please contact the school for clarification.",
	held_title: "Messages received during quiet hours:",
	digest_title: "Weekly summary ({from} - {to})",
	admin_linked: "The school administration has linked you to the following child(ren):\n{names}\n\nYou will now receive entry and exit notifications.",
	admin_added: "The school administration has linked another child to you: {name}",
	request_rejected: "Your request was not approved by the school administration. Please contact the school for clarification.",
	test_msg: "Test message: {school}\nYou will receive a message here when your child ({kids}) enters or leaves the school.",
	deleted_student: "Deleted student",
	group_ignored: "",
	no_children: "There are no linked children."
}

// Kirill: uz matnlaridan avtomatik (toCyrillic). {param} va /buyruq o'zgarmaydi. Noto'g'ri chiqqanlari uzCyrlOverride da qo'lda beriladi
const { toCyrillic } = require('./i18n')
const cyr = (s) => String(s).split(/(\{\w+\}|\/[a-z]+)/).map((p) => (/^(\{\w+\}|\/[a-z]+)$/.test(p) ? p : toCyrillic(p))).join('')
const uzCyrlOverride = {
	btn_phone: 'Телефон рақамни юбориш',
	m_week: 'Ҳафта',
	m_month: 'Ой',
	late_line: '{n} дақиқа кечикди'
}
const uzCyrl = {}
for (const k of Object.keys(uz)) uzCyrl[k] = uzCyrlOverride[k] !== undefined ? uzCyrlOverride[k] : cyr(uz[k])

const DICT = { uz, 'uz-cyrl': uzCyrl, ru, en }
const LANGS = Object.keys(DICT)
const normLang = (l) => (LANGS.includes(l) ? l : null)
// Telegram language_code ('ru', 'ru-RU', 'en-US', 'uz'...) -> bizning til. Noma'lum bo'lsa uz
const fromTelegram = (code) => {
	const c = String(code || '').toLowerCase()
	if (c.startsWith('ru')) return 'ru'
	if (c.startsWith('en')) return 'en'
	return 'uz'
}

// Hafta kunlari (0 = yakshanba) va oylar
const WEEKDAYS = {
	uz: ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'],
	'uz-cyrl': ['Якшанба', 'Душанба', 'Сешанба', 'Чоршанба', 'Пайшанба', 'Жума', 'Шанба'],
	ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
	en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
}
const MONTHS = {
	uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
	'uz-cyrl': ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
	ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
	en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
}
// 'YYYY-MM-DD' -> tilga mos uzun sana: uz "7-oktyabr 2026, Chorshanba", ru "7 октября 2026, среда", en "Wednesday, 7 October 2026"
function longDate(lang, ymd) {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''))
	if (!m) return String(ymd || '')
	const l = DICT[lang] ? lang : 'uz'
	const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
	const day = +m[3], mon = MONTHS[l][+m[2] - 1], wd = WEEKDAYS[l][dow]
	if (l === 'en') return `${wd}, ${day} ${mon} ${m[1]}`
	if (l === 'ru') return `${day} ${mon} ${m[1]}, ${wd}`
	return `${day}-${mon} ${m[1]}, ${wd}`
}

function t(lang, key, params = {}) {
	const d = Object.hasOwn(DICT, lang) ? DICT[lang] : uz
	const own = (o) => (Object.hasOwn(o, key) && typeof o[key] === 'string' ? o[key] : undefined)
	let s = own(d)
	if (s === undefined) s = own(uz)
	if (s === undefined) return key
	const pr = params || {}
	return s.replace(/\{(\w+)\}/g, (_, k) => (!Object.hasOwn(pr, k) || pr[k] === undefined || pr[k] === null ? '' : String(pr[k])))
}

// Menyu tugmasi matni qaysi amalga to'g'ri kelishini topadi (barcha tillarda)
function menuAction(text) {
	const x = String(text || '').trim().toLowerCase()
	for (const lang of LANGS) {
		for (const [key, action] of [['m_today', 'today'], ['m_week', 'week'], ['m_month', 'month'], ['m_children', 'children'], ['m_settings', 'settings']]) {
			if (DICT[lang][key].toLowerCase() === x) return action
		}
	}
	return null
}

// Til tanlash tugmalari (har biri o'z tilida)
const LANG_LABELS = { uz: "O'zbekcha", 'uz-cyrl': 'Ўзбекча', ru: 'Русский', en: 'English' }

module.exports = { t, LANGS, normLang, fromTelegram, menuAction, longDate, LANG_LABELS, WEEKDAYS, MONTHS, DICT }
