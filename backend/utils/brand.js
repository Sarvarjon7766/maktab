// Tizim logotipi (assets/logo-tile.png: oq fonli kvadrat) — Excel hisobotlarga joylash uchun
const fs = require('fs')
const path = require('path')

const LOGO_PATH = path.join(__dirname, '..', 'assets', 'logo-tile.png')
let buffer = null
try { buffer = fs.readFileSync(LOGO_PATH) } catch { /* logotipsiz ham ishlaydi */ }

// Ish kitobiga logotipni (bir marta) qo'shadi va varaqqa joylaydi. pos: { col, row, size } (ExcelJS tl/ext)
function addLogo(wb, ws, { col = 0.12, row = 0.08, size = 34 } = {}) {
	if (!buffer) return false
	if (wb.__logoId === undefined) wb.__logoId = wb.addImage({ buffer, extension: 'png' })
	ws.addImage(wb.__logoId, { tl: { col, row }, ext: { width: size, height: size }, editAs: 'oneCell' })
	return true
}

module.exports = { addLogo, LOGO_PATH }
