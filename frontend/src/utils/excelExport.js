import { logoBytes } from './brandLogo'
import { tx } from '../i18n'
// Chiroyli Excel hisobotlar: sarlavha, ustun kengliklari, rangli jadval sarlavhasi, chiziqlar, zebra, foizlar uchun rangli katakchalar,
// qotirilgan sarlavha qatori va filtr. exceljs faqat yuklab olish bosilganda yuklanadi (asosiy bundle kichik qoladi)
const NAVY = 'FF0F172A'
const BLUE = 'FF2563EB'
const BORDER = { style: 'thin', color: { argb: 'FFE2E8F0' } }
const FILLS = { good: 'FFDCFCE7', mid: 'FFFEF3C7', bad: 'FFFEE2E2' }
const FONTS = { good: 'FF166534', mid: 'FF92400E', bad: 'FF991B1B' }

const stamp = () => new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date())
const isPercent = (h) => /%/.test(h)
// "Kech", "Kelmagan", "Offline" kabi ustunlarda yuqori qiymat yomon hisoblanadi
const inverse = (h) => /kech|kechik|kelmagan|offline/i.test(h)

function level(header, value) {
	if (typeof value !== 'number') return null
	const v = inverse(header) ? 100 - value : value
	return v >= 85 ? 'good' : v >= 60 ? 'mid' : 'bad'
}

function widthOf(header, rows) {
	const longest = rows.reduce((m, r) => Math.max(m, String(r[header] ?? '').length), String(header).length)
	return Math.min(Math.max(longest + 3, 10), 46)
}

/**
 * sheets: [{ name, rows: [{ustun: qiymat}], title?, note? }]
 * Har varaq: 1-qator sarlavha, 2-qator izoh (yaratilgan vaqt va qatorlar soni), 4-qator jadval sarlavhasi
 */
export async function buildWorkbook(fileName, sheets, org = 'School Supervision', opts = {}) {
	const ExcelJS = (await import('exceljs')).default
	const wb = new ExcelJS.Workbook()
	wb.creator = org
	wb.created = new Date()
	const logoBuf = await logoBytes()
	const logoId = logoBuf ? wb.addImage({ buffer: logoBuf, extension: 'png' }) : null

	// Ko'p varaqli fayllar uchun birinchi "Mundarija" varag'i: sarlavha, izoh va har bir varaqqa havola
	if (sheets.length > 1 && opts.cover !== false) {
		const ws = wb.addWorksheet('Mundarija', { properties: { tabColor: { argb: NAVY } }, views: [{ showGridLines: false }] })
		ws.columns = [{ width: 6 }, { width: 44 }, { width: 14 }, { width: 60 }]
		ws.mergeCells(1, 1, 1, 4)
		const t = ws.getCell(1, 1)
		t.value = opts.title || fileName
		t.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFFFFFFF' } }
		t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
		t.alignment = { vertical: 'middle', horizontal: 'left', indent: logoId === null ? 1 : 6 }
		ws.getRow(1).height = 44
		if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 52, height: 52 }, editAs: 'oneCell' })
		ws.mergeCells(2, 1, 2, 4)
		const n = ws.getCell(2, 1)
		n.value = `${org} · Yaratilgan: ${stamp()}${opts.subtitle ? ` · ${opts.subtitle}` : ''} · ${sheets.length} ta varaq`
		n.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } }
		n.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
		n.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
		ws.getRow(2).height = 22
		ws.getRow(3).height = 8
		;['№', 'Varaq', 'Qatorlar', 'Izoh'].forEach((h, i) => {
			const c = ws.getRow(4).getCell(i + 1)
			c.value = h
			c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
			c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
			c.alignment = { vertical: 'middle', horizontal: 'center' }
			c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
		})
		ws.getRow(4).height = 26
		sheets.forEach((sh, i) => {
			const r = ws.getRow(5 + i)
			const sheetName = String(sh.name).slice(0, 31)
			const vals = [i + 1, { text: sheetName, hyperlink: `#'${sheetName.replace(/'/g, "''")}'!A1` }, sh.rows.length, sh.note || sh.title || '']
			vals.forEach((v, k) => {
				const c = r.getCell(k + 1)
				c.value = v
				c.font = { name: 'Calibri', size: 11, color: { argb: k === 1 ? 'FF2563EB' : 'FF0F172A' }, underline: k === 1 }
				c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? 'FFF8FAFC' : 'FFFFFFFF' } }
				c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
				c.alignment = { vertical: 'middle', horizontal: k === 1 || k === 3 ? 'left' : 'center', wrapText: true }
			})
			r.height = 22
		})
	}

	sheets.forEach(({ name, rows, title, note, totals }, si) => {
		const ws = wb.addWorksheet(String(name).slice(0, 31), { properties: { tabColor: { argb: si % 2 ? 'FF0EA5E9' : BLUE } }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
		const headers = rows.length ? Object.keys(rows[0]) : ["Ma'lumot yo'q"]
		const cols = headers.length

		ws.columns = headers.map(h => ({ width: widthOf(h, rows) }))
		ws.mergeCells(1, 1, 1, cols)
		const t = ws.getCell(1, 1)
		t.value = title || name
		t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
		t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
		t.alignment = { vertical: 'middle', horizontal: 'left', indent: logoId === null ? 1 : 4 }
		ws.getRow(1).height = logoId === null ? 30 : 40
		if (logoId !== null) ws.addImage(logoId, { tl: { col: 0.12, row: 0.08 }, ext: { width: 34, height: 34 }, editAs: 'oneCell' })

		ws.mergeCells(2, 1, 2, cols)
		const n = ws.getCell(2, 1)
		n.value = `${org} · Yaratilgan: ${stamp()} · ${rows.length} ta qator${note ? ` · ${note}` : ''}`
		n.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } }
		n.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
		n.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
		ws.getRow(2).height = 20
		ws.getRow(3).height = 6

		const head = ws.getRow(4)
		headers.forEach((h, i) => {
			const c = head.getCell(i + 1)
			c.value = h
			c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
			c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
			c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
			c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
		})
		head.height = 28

		rows.forEach((row, ri) => {
			const r = ws.getRow(5 + ri)
			headers.forEach((h, i) => {
				const v = row[h]
				const c = r.getCell(i + 1)
				c.value = v === undefined || v === null ? '' : v
				c.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } }
				c.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }
				c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ri % 2 ? 'FFF8FAFC' : 'FFFFFFFF' } }
				if (typeof v === 'number') {
					c.alignment = { vertical: 'middle', horizontal: 'right' }
					c.numFmt = isPercent(h) ? '0.0"%"' : Number.isInteger(v) ? '#,##0' : '#,##0.0'
					const lv = isPercent(h) ? level(h, v) : null
					if (lv) { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILLS[lv] } }; c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: FONTS[lv] } } }
				} else {
					c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
				}
			})
			r.height = 20
		})

		// Jami qatori: sonlar yig'indisi, foizlar o'rtachasi (totals: true)
		if (totals && rows.length > 1) {
			const tr = ws.getRow(5 + rows.length)
			const TOP = { style: 'medium', color: { argb: 'FF2563EB' } }
			headers.forEach((h, i) => {
				const c = tr.getCell(i + 1)
				const nums = rows.map(r => r[h]).filter(v => typeof v === 'number')
				c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } }
				c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
				c.border = { top: TOP, bottom: BORDER, left: BORDER, right: BORDER }
				if (i === 0) { c.value = tx("JAMI / O'RTACHA"); c.alignment = { vertical: 'middle', horizontal: 'left' } } else if (nums.length > rows.length / 2 && !/\bo'rin\b|^№$/i.test(h)) {
					const sum = nums.reduce((a, b) => a + b, 0)
					const v = isPercent(h) ? sum / nums.length : sum
					c.value = Math.round(v * 10) / 10
					c.numFmt = isPercent(h) ? '0.0"%"' : Number.isInteger(c.value) ? '#,##0' : '#,##0.0'
					c.alignment = { vertical: 'middle', horizontal: 'right' }
				}
			})
			tr.height = 24
		}

		if (rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: cols } }
		ws.pageSetup = { orientation: cols > 7 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
		ws.headerFooter = { oddFooter: '&L&8' + org + '&R&8&P / &N' }
	})
	return wb
}

export async function downloadWorkbook(fileName, sheets, org, opts) {
	const [wb, { saveAs }] = await Promise.all([buildWorkbook(fileName, sheets, org, opts), import('file-saver')])
	const buffer = await wb.xlsx.writeBuffer()
	saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`)
}

