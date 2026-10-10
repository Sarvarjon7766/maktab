import jsPDF from 'jspdf'
import html2canvas from 'html2canvas-pro'
import { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, BorderStyle } from 'docx'
import * as XLSX from 'xlsx-js-style'
import { logoBytes } from './brandLogo'

// file-saver'ning saveAs()'i ba'zi muhitlarda yuklashni jimgina boshlamasligi kuzatilgan (AdminHome.jsx Word eksporti), shuning uchun <a download> ishlatiladi
export function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	document.body.appendChild(a)
	a.click()
	document.body.removeChild(a)
	URL.revokeObjectURL(url)
}

// html2canvas EMAS, html2canvas-pro ishlatiladi — vanilla html2canvas Tailwind v4'ning oklch() rangini tushunmay xato beradi (AdminHome.jsx'da topilgan)
export async function exportElementToPdf(element, filename) {
	const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
	const imgData = canvas.toDataURL('image/png')
	const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
	const pageWidth = pdf.internal.pageSize.getWidth()
	const pageHeight = pdf.internal.pageSize.getHeight()
	const imgWidth = pageWidth
	const imgHeight = (canvas.height * imgWidth) / canvas.width

	let heightLeft = imgHeight
	let position = 0
	pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
	heightLeft -= pageHeight
	while (heightLeft > 0) {
		position -= pageHeight
		pdf.addPage()
		pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
		heightLeft -= pageHeight
	}
	pdf.save(filename)
}

// docx/xlsx-js-style konvensiyasi: "#"siz, katta harfli 6 xonali hex kerak
const DEFAULT_TABLE_COLOR = '2A78D6'
export function toDocxColor(cssHexColor) {
	const hex = (cssHexColor || '').replace('#', '').toUpperCase()
	return /^[0-9A-F]{6}$/.test(hex) ? hex : DEFAULT_TABLE_COLOR
}

const TABLE_BORDER = 'E1E0D9'

const docxHeaderCell = (text, color) => new TableCell({
	shading: { fill: color },
	children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(text), bold: true, color: 'FFFFFF' })] })],
})
const docxBodyCell = (text) => new TableCell({
	children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(text ?? '') })] })],
})

export function docxTable(headerRow, rows, headerColor = DEFAULT_TABLE_COLOR) {
	return new Table({
		width: { size: 100, type: WidthType.PERCENTAGE },
		borders: {
			top: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
			bottom: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
			left: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
			right: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
			insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
			insideVertical: { style: BorderStyle.SINGLE, size: 1, color: TABLE_BORDER },
		},
		rows: [
			new TableRow({ children: headerRow.map(h => docxHeaderCell(h, headerColor)) }),
			...rows.map(r => new TableRow({ children: r.map(docxBodyCell) })),
		],
	})
}

// Har sahifada takrorlanuvchi Excel sarlavha-bo'yash kodini almashtiradi
export function styleExcelHeaderRow(ws, rowIndex, colCount, headerColor = DEFAULT_TABLE_COLOR) {
	for (let C = 0; C < colCount; C++) {
		const ref = XLSX.utils.encode_cell({ r: rowIndex, c: C })
		if (!ws[ref]) continue
		ws[ref].s = {
			font: { bold: true, color: { rgb: 'FFFFFF' } },
			fill: { fgColor: { rgb: toDocxColor(headerColor) } },
			alignment: { horizontal: 'center' }
		}
	}
}

export async function buildAndDownloadDocx({ title, subtitle, dateText, sections, filename }) {
	const logo = await logoBytes()
	const children = []
	if (logo) children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 72, height: 72 } })] }))
	children.push(
		new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title })] })
	)
	if (subtitle) {
		children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: subtitle, italics: true, color: '52514E' })] }))
	}
	if (dateText) {
		children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: dateText, color: '898781' })] }))
	}
	children.push(new Paragraph({ text: '' }))

	for (const section of sections) {
		children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: section.heading })] }))
		if (section.table) {
			children.push(section.table)
		} else if (section.text) {
			children.push(new Paragraph({ children: [new TextRun({ text: section.text })] }))
		}
		children.push(new Paragraph({ text: '' }))
	}

	const doc = new Document({ sections: [{ children }] })
	const blob = await Packer.toBlob(doc)
	downloadBlob(blob, filename)
}
