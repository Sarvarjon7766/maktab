import { pdfLogo } from './brandLogo'
// Tahlil (Analytics) sahifalari uchun umumiy Excel/PDF eksport funksiyalari.
// AdminHome.jsx / AdminAttandance.jsx dagi mavjud, murakkab davlat-hisoboti
// formatidagi eksportlar ATAYLAB bu yerga ko'chirilmadi (juda maxsus
// sessiya-katakcha formatiga ega, qayta ishlash regressiya xavfini
// oshiradi) — bu fayl faqat YANGI Tahlil sahifalari uchun.
import * as XLSX from 'xlsx-js-style'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatUzDate, formatUzShortDate, formatUzTime, formatShortDateFromDateString } from './formatDate'

const HEADER_FILL = '2A78D6'
const HEADER_STYLE = {
	font: { bold: true, color: { rgb: 'FFFFFF' } },
	fill: { fgColor: { rgb: HEADER_FILL } },
	alignment: { horizontal: 'center' },
}

function styleHeaderRow(ws, colCount) {
	for (let c = 0; c < colCount; c++) {
		const ref = XLSX.utils.encode_cell({ r: 0, c })
		if (ws[ref]) ws[ref].s = HEADER_STYLE
	}
}

function sheetFromRows(rows, colWidths) {
	const ws = XLSX.utils.json_to_sheet(rows)
	if (colWidths) ws['!cols'] = colWidths.map((wch) => ({ wch }))
	if (rows.length) styleHeaderRow(ws, Object.keys(rows[0]).length)
	return ws
}

// Bitta xodim uchun oddiy davomat eksporti (UserAttendanceModal.jsx dagi
// exportToExcel bilan bir xil ustunlar/uslub — shu yerdan qayta ishlatiladi).
export function exportEmployeeExcel({ fullName, history, workDuration, fmtTime }) {
	if (!history?.length) return false
	const rows = history.map((r) => ({
		Sana: formatUzShortDate(new Date(r.dateString)),
		Holat: r.arrivalTime ? (r.status === 'tashqarida' ? 'Tashqarida' : 'Kelgan') : 'Kelmadi',
		Kelish: fmtTime ? fmtTime(r.arrivalTime) : r.arrivalTime ? formatUzTime(new Date(r.arrivalTime)) : '--:--',
		Ketish: fmtTime ? fmtTime(r.departureTime) : r.departureTime ? formatUzTime(new Date(r.departureTime)) : '--:--',
		'Ish vaqti': workDuration ? workDuration(r.hoursWorked) : String(r.hoursWorked ?? ''),
	}))
	const ws = sheetFromRows(rows, [14, 12, 10, 10, 12])
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, 'Davomat')
	XLSX.writeFile(wb, `${fullName || 'Xodim'}_davomat.xlsx`)
	return true
}

// Bugungi holat bo'yicha bir varaqli "kunlik hisobot" (AdminHome.jsx /
// AdminReports.jsx bir xil funksiyani chaqiradi — avval AdminHome.jsx
// ichida qo'lda (hand-rolled) qurilar edi).
export function exportDailySnapshotExcel(users, statusLabel) {
	if (!users?.length) return false
	const rows = users.map((u, i) => ({
		'№': i + 1,
		"F.I.Sh": u.fullName,
		"Sinf": u.sinf?.name || "Sinfsiz",
		'Holati': statusLabel(u.attendanceStatus),
		'Birinchi kirish': u.firstCheckInTime ? formatUzTime(new Date(u.firstCheckInTime)) : '--:--',
		'Oxirgi chiqish': u.lastCheckOutTime ? formatUzTime(new Date(u.lastCheckOutTime)) : '--:--',
	}))
	const ws = sheetFromRows(rows, [5, 28, 20, 14, 14, 14])
	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, "Bugungi davomat")
	XLSX.writeFile(wb, `davomat_${new Date().toISOString().slice(0, 10)}.xlsx`)
	return true
}

// Tahlil sahifasining davr bo'yicha ko'p-varaqli Excel hisoboti.
export function exportAnalyticsExcel({ range, trend, bySinf, lateLeaderboard, topPerformers, avgWorkHoursTrend }) {
	const wb = XLSX.utils.book_new()

	const trendRows = (trend || []).map((t) => ({
		Sana: formatShortDateFromDateString(t.date),
		Keldi: t.present,
		Kelmadi: t.absent,
	}))
	if (trendRows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(trendRows, [12, 10, 10]), 'Trend')

	const deptRows = (bySinf || []).map((d) => ({
		"Sinf": d.name,
		'Xodimlar soni': d.headcount,
		'Davomat foizi': `${d.rate}%`,
	}))
	if (deptRows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(deptRows, [28, 14, 14]), "Sinflar")

	const lateRows = (lateLeaderboard || []).map((r, i) => ({
		'№': i + 1,
		'F.I.Sh': r.fullName,
		"Sinf": r.sinf,
		'Kechikkan kunlar': r.lateCount,
		'Kelgan kunlar': r.presentCount,
	}))
	if (lateRows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(lateRows, [5, 26, 20, 16, 14]), 'Kechikuvchilar')

	const topRows = (topPerformers || []).map((r, i) => ({
		'№': i + 1,
		'F.I.Sh': r.fullName,
		"Sinf": r.sinf,
		"O'z vaqtida (%)": r.onTimeRate,
		'Kelgan kunlar': r.presentCount,
	}))
	if (topRows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(topRows, [5, 26, 20, 16, 14]), 'Intizomlilar')

	const hoursRows = (avgWorkHoursTrend || []).map((h) => ({
		Sana: formatShortDateFromDateString(h.date),
		"O'rtacha soat": h.avgHours,
	}))
	if (hoursRows.length) XLSX.utils.book_append_sheet(wb, sheetFromRows(hoursRows, [12, 16]), 'Ish soati')

	if (wb.SheetNames.length === 0) return false
	XLSX.writeFile(wb, `tahlil_${range}kun_${formatUzShortDate(new Date()).replace(/\./g, '-')}.xlsx`)
	return true
}

// Tahlil sahifasining davr bo'yicha PDF xulosasi (KPI + jadvallar).
export function exportAnalyticsPDF({ range, bySinf, lateLeaderboard, topPerformers, orgName }) {
	const doc = new jsPDF()
	let y = 14

	const tx0 = pdfLogo(doc)
	y = 14
	doc.setFontSize(14)
	doc.text(orgName || 'School Supervision — Kadrlar tahlili', tx0, y)
	y += 6
	doc.setFontSize(10)
	doc.text(`Davr: so'nggi ${range} kun · Shakllantirildi: ${formatUzDate(new Date())}`, tx0, y)
	y = Math.max(y + 8, 28)

	if (bySinf?.length) {
		doc.setFontSize(11)
		doc.text("Sinflar bo'yicha davomat", 14, y)
		autoTable(doc, {
			startY: y + 3,
			head: [["Sinf", 'Xodimlar', 'Davomat %']],
			body: bySinf.map((d) => [d.name, String(d.headcount), `${d.rate}%`]),
			theme: 'grid',
			headStyles: { fillColor: [42, 120, 214] },
			styles: { fontSize: 9 },
		})
		y = doc.lastAutoTable.finalY + 8
	}

	if (lateLeaderboard?.length) {
		doc.setFontSize(11)
		doc.text('Eng ko\'p kechikkan xodimlar', 14, y)
		autoTable(doc, {
			startY: y + 3,
			head: [['F.I.Sh', "Sinf", 'Kechikkan kunlar']],
			body: lateLeaderboard.map((r) => [r.fullName, r.sinf, String(r.lateCount)]),
			theme: 'grid',
			headStyles: { fillColor: [211, 59, 59] },
			styles: { fontSize: 9 },
		})
		y = doc.lastAutoTable.finalY + 8
	}

	if (topPerformers?.length) {
		if (y > 250) { doc.addPage(); y = 14 }
		doc.setFontSize(11)
		doc.text('Eng intizomli xodimlar', 14, y)
		autoTable(doc, {
			startY: y + 3,
			head: [['F.I.Sh', "Sinf", "O'z vaqtida %"]],
			body: topPerformers.map((r) => [r.fullName, r.sinf, `${r.onTimeRate}%`]),
			theme: 'grid',
			headStyles: { fillColor: [12, 163, 12] },
			styles: { fontSize: 9 },
		})
	}

	doc.save(`tahlil_${range}kun_${formatUzShortDate(new Date()).replace(/\./g, '-')}.pdf`)
	return true
}


// json_to_sheet natijasini jadval ko'rinishiga keltiradi: sarlavha qatori uslubi + ustun kengliklari. Varaqning o'zini qaytaradi.
export function styleWorkbookSheet(ws) {
	const ref = ws['!ref']
	if (!ref) return ws
	const range = XLSX.utils.decode_range(ref)
	const widths = []
	for (let c = range.s.c; c <= range.e.c; c++) {
		let max = 8
		for (let r = range.s.r; r <= range.e.r; r++) {
			const cell = ws[XLSX.utils.encode_cell({ r, c })]
			if (cell && cell.v !== undefined && cell.v !== null) max = Math.max(max, Math.min(50, String(cell.v).length + 2))
		}
		widths.push({ wch: max })
		const head = ws[XLSX.utils.encode_cell({ r: range.s.r, c })]
		if (head) head.s = HEADER_STYLE
	}
	ws['!cols'] = widths
	return ws
}
