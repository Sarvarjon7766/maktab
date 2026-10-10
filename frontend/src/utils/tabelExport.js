import { pdfLogo } from './brandLogo'
import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"
import * as XLSX from "xlsx-js-style"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { typeLabel } from '../components/GlobalCommentModal'
import { formatUzDate } from './formatDate'

dayjs.extend(utc)
dayjs.extend(timezone)

// AdminAttandance.jsx'ning handleDownload()'idan ATAYLAB ajratib olingan —
// "davlat-hisoboti" formatidagi 2-varaqli tabel (Davomat + Ish soatlari).
// Kod o'zi o'zgartirilmagan, faqat parametrlashtirilgan: `stats` shakli
// (backend'dan LogStatistiks javobi) xodim va o'quvchi uchun bir xil —
// [{ user, position, details: [{ date, sessions, leave }] }] — shu sabab
// bu funksiya ikkalasida ham bevosita ishlatiladi.
//
// personColumnLabel — 3-ustun sarlavhasi ("Ish joyi va lavozimi" xodim
// uchun, "Sinfi" o'quvchi uchun)
export function buildTabelWorkbook(stats, { personColumnLabel = "Ish joyi va lavozimi" } = {}) {
	// Barcha sanalarni yig'ish
	const allDates = Array.from(
		new Set(
			stats.flatMap((s) =>
				s.details.map((d) =>
					dayjs(d.date).tz("Asia/Tashkent").format("YYYY-MM-DD")
				)
			)
		)
	).sort((a, b) => new Date(a) - new Date(b))

	// Har bir sana uchun maksimal sessiyalar
	const maxSessionsPerDate = {}
	allDates.forEach((date) => {
		const max = Math.max(
			0,
			...stats.map((s) => {
				const day = s.details.find(
					(d) => dayjs(d.date).tz("Asia/Tashkent").format("YYYY-MM-DD") === date
				)
				return day?.sessions?.length || 0
			})
		)
		maxSessionsPerDate[date] = Math.max(1, max)
	})

	const timeFromISO = (v) => {
		if (!v) return ""
		return dayjs(v).tz("Asia/Tashkent").format("HH:mm:ss")
	}

	// "Ish soatlari" sheeti uchun: kunning BIRINCHI kirishi va OXIRGI
	// chiqishi asosida ish vaqtini hisoblaydi. Chiqish 19:00 dan keyin
	// bo'lsa 19:00 deb olinadi; tushlik (13:00-14:00) bilan kesishgan
	// vaqt (maksimal 1 soat) ayiriladi.
	const WORK_END_CAP = "19:00"
	const LUNCH_START = "13:00"
	const LUNCH_END = "14:00"

	const computeCappedWorkedMinutes = (dateString, checkInISO, checkOutISO) => {
		const start = dayjs(checkInISO).tz("Asia/Tashkent")
		let end = dayjs(checkOutISO).tz("Asia/Tashkent")

		const cap = dayjs.tz(`${dateString} ${WORK_END_CAP}`, "Asia/Tashkent")
		const wasCapped = end.isAfter(cap)
		if (wasCapped) end = cap

		if (!end.isAfter(start)) return { minutes: 0, wasCapped, lunchDeducted: 0 }

		const lunchStart = dayjs.tz(`${dateString} ${LUNCH_START}`, "Asia/Tashkent")
		const lunchEnd = dayjs.tz(`${dateString} ${LUNCH_END}`, "Asia/Tashkent")
		const overlapStart = start.isAfter(lunchStart) ? start : lunchStart
		const overlapEnd = end.isBefore(lunchEnd) ? end : lunchEnd
		const lunchOverlap = overlapEnd.isAfter(overlapStart) ? overlapEnd.diff(overlapStart, "minute") : 0
		const lunchDeducted = Math.min(lunchOverlap, 60)

		const minutes = Math.max(end.diff(start, "minute") - lunchDeducted, 0)
		return { minutes, wasCapped, lunchDeducted }
	}

	const formatHM = (totalMinutes) => {
		const h = Math.floor(totalMinutes / 60)
		const m = Math.round(totalMinutes % 60)
		return `${h}:${String(m).padStart(2, "0")}`
	}

	// Header (2 qatorli)
	const headerRow1 = ["T/r", "F.I.SH.", personColumnLabel]
	const headerRow2 = ["", "", ""]

	allDates.forEach((date) => {
		const n = maxSessionsPerDate[date]
		for (let i = 1; i <= n; i++) {
			headerRow1.push(date, "", "")
			headerRow2.push(`Kelgan vaqti ${i}`, `Ketgan vaqti ${i}`, `Davomiyligi ${i}`)
		}
	})

	headerRow1.push("Umumiy ish soati")
	headerRow2.push("")

	// Ma'lumot qatorlari
	const rows = stats.map((stat, idx) => {
		const row = [idx + 1, stat.user, stat.position || ""]
		let totalHours = 0

		allDates.forEach((date) => {
			const day = stat.details.find(
				(d) => dayjs(d.date).tz("Asia/Tashkent").format("YYYY-MM-DD") === date
			)
			const sessions = day?.sessions || []
			const maxN = maxSessionsPerDate[date]

			for (let i = 0; i < maxN; i++) {
				const s = sessions[i]
				if (s) {
					row.push(timeFromISO(s.checkIn), timeFromISO(s.checkOut), s.duration ?? "")
					if (s.duration) totalHours += Number(s.duration)
				} else {
					row.push("-", "-", "-")
				}
			}
		})

		row.push(totalHours.toFixed(2))
		return row
	})

	// Worksheet
	const wsData = [headerRow1, headerRow2, ...rows]
	const ws = XLSX.utils.aoa_to_sheet(wsData)

	const merges = []
	let c = 3
	allDates.forEach((date) => {
		const width = maxSessionsPerDate[date] * 3
		merges.push({ s: { r: 0, c }, e: { r: 0, c: c + width - 1 } })
		c += width
	})
	ws["!merges"] = merges

	ws["!cols"] = [
		{ wch: 6 },
		{ wch: 25 },
		{ wch: 30 },
		...allDates.flatMap((date) => Array(maxSessionsPerDate[date] * 3).fill({ wch: 14 })),
		{ wch: 18 },
	]

	const range = XLSX.utils.decode_range(ws["!ref"])
	for (let C = range.s.c; C <= range.e.c; ++C) {
		for (let R = 0; R <= 1; ++R) {
			const cellAddress = XLSX.utils.encode_cell({ r: R, c: C })
			if (ws[cellAddress]) {
				ws[cellAddress].s = {
					font: { bold: true, color: { rgb: "FFFFFF" } },
					fill: { fgColor: { rgb: "2563EB" } },
					alignment: { horizontal: "center", vertical: "center", wrapText: true },
					border: {
						top: { style: "thin", color: { rgb: "000000" } },
						bottom: { style: "thin", color: { rgb: "000000" } },
						left: { style: "thin", color: { rgb: "000000" } },
						right: { style: "thin", color: { rgb: "000000" } },
					},
				}
			}
		}
	}

	for (let R = 2; R <= range.e.r; ++R) {
		const cellAddress = XLSX.utils.encode_cell({ r: R, c: 1 })
		if (ws[cellAddress]) {
			ws[cellAddress].s = {
				font: { bold: true },
				alignment: { wrapText: true, vertical: "center" },
			}
		}
	}

	const wb = XLSX.utils.book_new()
	XLSX.utils.book_append_sheet(wb, ws, "Davomat")

	// ============ IKKINCHI SHEET: "Ish soatlari" ============
	const getDayCells = (day) => {
		if (!day) return { kirish: "-", chiqish: "-", ishSoati: "-", izoh: "", minutes: 0 }
		if (day.leave) {
			return { kirish: "-", chiqish: "-", ishSoati: "-", izoh: `${typeLabel(day.leave.type)}: ${day.leave.comment}`, minutes: 0 }
		}
		if (!day.sessions.length) {
			return { kirish: "-", chiqish: "-", ishSoati: "0:00", izoh: "Kelmagan", minutes: 0 }
		}

		const firstIn = day.sessions[0].checkIn
		const lastOut = day.sessions[day.sessions.length - 1].checkOut
		const kirishStr = timeFromISO(firstIn).slice(0, 5)

		if (!lastOut) {
			return { kirish: kirishStr, chiqish: "-", ishSoati: "-", izoh: "Chiqish qayd etilmagan", minutes: 0 }
		}

		const chiqishStr = timeFromISO(lastOut).slice(0, 5)
		const { minutes, wasCapped, lunchDeducted } = computeCappedWorkedMinutes(day.date, firstIn, lastOut)

		const notes = []
		if (wasCapped) notes.push("chiqish 19:00 deb hisoblandi")
		if (lunchDeducted > 0) notes.push(`tushlik ${lunchDeducted} daq. ayirildi`)

		return { kirish: kirishStr, chiqish: chiqishStr, ishSoati: formatHM(minutes), izoh: notes.join("; "), minutes }
	}

	const hoursHeaderRow1 = ["№", "F.I.Sh"]
	const hoursHeaderRow2 = ["", ""]
	allDates.forEach((date) => {
		hoursHeaderRow1.push(date, "", "", "")
		hoursHeaderRow2.push("Kirish", "Chiqish", "Ish soati", "Izoh")
	})
	hoursHeaderRow1.push("Jami")
	hoursHeaderRow2.push("")

	const hoursDataRows = stats.map((stat, idx) => {
		const row = [idx + 1, stat.user]
		let totalMinutes = 0

		allDates.forEach((date) => {
			const day = stat.details.find(
				(d) => dayjs(d.date).tz("Asia/Tashkent").format("YYYY-MM-DD") === date
			)
			const cells = getDayCells(day)
			totalMinutes += cells.minutes
			row.push(cells.kirish, cells.chiqish, cells.ishSoati, cells.izoh)
		})

		row.push(formatHM(totalMinutes))
		return row
	})

	const hoursWsData = [hoursHeaderRow1, hoursHeaderRow2, ...hoursDataRows]
	const ws2 = XLSX.utils.aoa_to_sheet(hoursWsData)

	const hoursMerges = []
	let hc = 2
	allDates.forEach((date) => {
		hoursMerges.push({ s: { r: 0, c: hc }, e: { r: 0, c: hc + 3 } })
		hc += 4
	})
	ws2["!merges"] = hoursMerges

	ws2["!cols"] = [
		{ wch: 5 },
		{ wch: 25 },
		...allDates.flatMap(() => [{ wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 32 }]),
		{ wch: 10 },
	]

	const range2 = XLSX.utils.decode_range(ws2["!ref"])
	for (let R = range2.s.r; R <= range2.e.r; ++R) {
		for (let C = range2.s.c; C <= range2.e.c; ++C) {
			const addr = XLSX.utils.encode_cell({ r: R, c: C })
			if (!ws2[addr]) continue
			if (R <= 1) {
				ws2[addr].s = {
					font: { bold: true, color: { rgb: "FFFFFF" } },
					fill: { fgColor: { rgb: "2563EB" } },
					alignment: { horizontal: "center", vertical: "center", wrapText: true },
					border: {
						top: { style: "thin", color: { rgb: "000000" } },
						bottom: { style: "thin", color: { rgb: "000000" } },
						left: { style: "thin", color: { rgb: "000000" } },
						right: { style: "thin", color: { rgb: "000000" } },
					},
				}
			} else if (C === 1 || C === range2.e.c) {
				ws2[addr].s = {
					font: { bold: true },
					alignment: { wrapText: true, vertical: "center" },
				}
			}
		}
	}

	XLSX.utils.book_append_sheet(wb, ws2, "Ish soatlari")

	return wb
}

// Tabelning PDF xulosasi — Excel'dagi to'liq kalendar-jadval o'rniga har bir
// kishi uchun BITTA qator (kelgan/kelmagan kunlar soni + jami soat).
// Ataylab qisqartirilgan: kechikish hisoblanmaydi (buning uchun
// Settings'dan workStartTime kerak bo'lardi, `stats" bu ma'lumotni
// olib kelmaydi — yangi backend so'rovsiz ishlashi shart).
export function buildTabelPdf(stats, { personColumnLabel = "Ish joyi va lavozimi", startDate, endDate, orgName } = {}) {
	if (!stats?.length) return false

	const rows = stats.map((stat, idx) => {
		const kelgan = stat.details.filter((d) => d.sessions?.length > 0).length
		const kelmagan = stat.details.filter((d) => !d.sessions?.length && !d.leave).length
		const jamiSoat = stat.details.reduce((sum, d) => {
			const daySoat = (d.sessions || []).reduce((s, sess) => s + (Number(sess.duration) || 0), 0)
			return sum + daySoat
		}, 0)
		return [idx + 1, stat.user, stat.position || "", String(kelgan), String(kelmagan), jamiSoat.toFixed(1)]
	})

	const doc = new jsPDF()
	let y = 14
	const tx0 = pdfLogo(doc)
	doc.setFontSize(14)
	doc.text(orgName || 'School Supervision — Tabel', tx0, y)
	y += 6
	doc.setFontSize(10)
	doc.text(`Davr: ${startDate} — ${endDate} · Shakllantirildi: ${formatUzDate(new Date())}`, tx0, y)
	y = Math.max(y + 8, 28)

	autoTable(doc, {
		startY: y,
		head: [['№', 'F.I.Sh', personColumnLabel, 'Kelgan kunlar', 'Kelmagan kunlar', 'Jami soat']],
		body: rows,
		theme: 'grid',
		headStyles: { fillColor: [42, 120, 214] },
		styles: { fontSize: 9 },
	})

	doc.save(`tabel_${startDate}_${endDate}.pdf`)
	return true
}

