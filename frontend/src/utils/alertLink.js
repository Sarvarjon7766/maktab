// Ogohlantirishning manba sahifasi. Server havolalari monitor panelining yo'llari (/monitor/...); maktab panelida
// (/user, /admin, /platform/schools/:id) bunday yo'llar yo'q va foydalanuvchi bosh sahifaga tushib qolardi.
// Shuning uchun maktab panelida ogohlantirish turiga mos o'z sahifasiga yo'naltiriladi.
// base — panel prefiksi, scoped — bitta maktab rejimi (maktab paneli)
export const alertLink = (alert, { base = '/monitor', scoped = false } = {}) => {
	if (!scoped) return alert.link
	const root = base.replace(/\/$/, '')
	switch (alert.type) {
		case 'no-data': // bugun birorta o'quvchi qayd etilmagan
		case 'low-students': // o'quvchi davomati past
			return `${root}/entry-exit?view=student&status=kelmagan`
		case 'low-staff': // xodimlar davomati past
			return `${root}/entry-exit?status=kelmagan`
		case 'drop': // davomat keskin pasaygan
			return `${root}/trend`
		case 'cameras': // kameralarning yarmi offline
			return `${root}/camera`
		case 'vision': // aqlli kuzatuv hodisalari (bo'sh sinf, notinchlik, zich)
			return `${root}/kuzatuv`
		case 'late': // kech qolganlar ko'p
			return `${root}/late`
		default:
			return root
	}
}
