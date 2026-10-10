// Tizim logotipi (public/logo*.png) hisobotlarga (PDF, Word, Excel) joylash uchun yordamchilar.
// Eksport funksiyalarining ko'pi sinxron, shuning uchun logotip ilova ochilishida oldindan yuklab qo'yiladi (preloadLogo).
export const LOGO_URL = '/logo-256.png' // shaffof fon (oq sahifa uchun)
export const LOGO_TILE_URL = '/logo-tile.png' // oq fonli kvadrat (rangli fon, Excel sarlavhasi uchun)

let cachedDataUrl = null

const toDataUrl = (blob) => new Promise((resolve, reject) => {
	const fr = new FileReader()
	fr.onload = () => resolve(fr.result)
	fr.onerror = reject
	fr.readAsDataURL(blob)
})

export const preloadLogo = () => {
	if (cachedDataUrl) return
	fetch(LOGO_URL).then(r => r.blob()).then(toDataUrl).then(d => { cachedDataUrl = d }).catch(() => { /* logotipsiz ham ishlaydi */ })
}

// jsPDF.addImage uchun (yuklanmagan bo'lsa null — hisobot logotipsiz chiqadi)
export const logoDataUrlSync = () => cachedDataUrl

// docx / exceljs uchun bayt massivi
export const logoBytes = async (url = LOGO_TILE_URL) => {
	try {
		const r = await fetch(url)
		if (!r.ok) return null
		return new Uint8Array(await r.arrayBuffer())
	} catch { return null }
}

// PDF sarlavhasi: logotip chapda (14,8) 16x16 mm; matn x koordinatasi qaytariladi
export const pdfLogo = (doc, x = 14, y = 8, size = 16) => {
	const data = cachedDataUrl
	if (!data) return x
	try { doc.addImage(data, 'PNG', x, y, size, size); return x + size + 4 } catch { return x }
}
