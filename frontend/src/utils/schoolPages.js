// Maktab paneli sahifalari (navbar sarlavhasi va qidiruvdagi "Sahifalar" guruhi uchun). base: '/user' | '/admin' | '/platform/schools/:id'
export const schoolPages = (base) => [
	{ path: base, label: 'Bosh sahifa' },
	{ path: `${base}/grades`, label: 'Umumiy statistika' },
	{ path: `${base}/alerts`, label: 'Ogohlantirishlar' },
	{ path: `${base}/late`, label: 'Kech qolganlar' },
	{ path: `${base}/leaves`, label: 'Sababli kelmaganlar' },
	{ path: `${base}/risk`, label: 'Xavf guruhi' },
	{ path: `${base}/trend`, label: 'Kunlik dinamika' },
	{ path: `${base}/users`, label: 'Xodimlar' },
	{ path: `${base}/students`, label: "O'quvchilar" },
	{ path: `${base}/classrooms`, label: 'Sinfxonalar' },
	{ path: `${base}/sinf`, label: 'Sinflar' },
	{ path: `${base}/camera`, label: 'Kameralar' },
	{ path: `${base}/facecontrol`, label: 'FaceControl' },
	{ path: `${base}/reports`, label: 'Hisobotlar' },
	{ path: `${base}/analytics`, label: 'Tahlil' },
	{ path: `${base}/attandance`, label: 'Nazorat' },
	{ path: `${base}/entry-exit`, label: 'Kirish–Chiqish' },
	{ path: `${base}/settings`, label: 'Sozlamalar' },
	{ path: `${base}/profile`, label: 'Profil' }
]

// Joriy sahifa nomi: eng uzun mos yo'l
export const schoolPageTitle = (base, pathname) => {
	const hit = schoolPages(base).filter(p => pathname === p.path || (p.path !== base && pathname.startsWith(p.path))).sort((a, b) => b.path.length - a.path.length)[0]
	return hit?.label || 'Boshqaruv paneli'
}
