// Isbot kadrlari va lavhalari: nima uchun olingani kadr ustiga chiziladi (sabab yozuvi, belgilangan odamlar,
// odam sonining oxirgi soatlik chizmasi). Yozuvlar loyihadagi shrift bilan chiziladi (serverda tizim shrifti shart emas).
const path = require('path')
const sharp = require('sharp')

const FONT = path.join(__dirname, 'fonts', 'NotoSans-Bold.ttf')
const TZ = 'Asia/Tashkent'
const TONES = { vision_empty: '#dc2626', vision_surge: '#ea580c', vision_overcrowd: '#7c3aed', vision_restless: '#d97706', vision_commotion: '#be123c', vision_sample: '#2563eb' }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const hhmm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(d))
const stamp = (d) => `${new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d))} ${hhmm(d)}`

// Matn -> shaffof PNG. maxW dan keng chiqsa kichraytiriladi
async function text(str, { size = 28, color = '#ffffff', maxW = null } = {}) {
	let buf = await sharp({ text: { text: `<span foreground="${color}">${esc(str)}</span>`, font: `Noto Sans Bold ${size}`, fontfile: FONT, rgba: true, dpi: 72 } }).png().toBuffer()
	const meta = await sharp(buf).metadata()
	if (maxW && meta.width > maxW) {
		buf = await sharp(buf).resize({ width: Math.round(maxW) }).png().toBuffer()
		return { input: buf, width: Math.round(maxW), height: Math.round(meta.height * (maxW / meta.width)) }
	}
	return { input: buf, width: meta.width, height: meta.height }
}

const boxRects = (boxes, scale, color, stroke) => boxes.map((b) => `<rect x="${Math.round(b.x1 * scale)}" y="${Math.round(b.y1 * scale)}" width="${Math.round((b.x2 - b.x1) * scale)}" height="${Math.round((b.y2 - b.y1) * scale)}" fill="none" stroke="${color}" stroke-width="${stroke}"/>`).join('')

// Tahlil kadri: odamlar qutilari, kichraytirilgan (lavha kadrlari va jonli panel uchun)
async function smallFrame(buf, result, width = 640, color = '#22c55e', quality = 62) {
	const scale = width / result.width
	const H = Math.round(result.height * scale)
	return sharp(buf).resize(width, H)
		.composite([{ input: Buffer.from(`<svg width="${width}" height="${H}" xmlns="http://www.w3.org/2000/svg">${boxRects(result.boxes, scale, color, 2)}</svg>`) }])
		.jpeg({ quality }).toBuffer()
}

// Odam soni chizmasi: history = [{ t, count }]. Oxirgi nuqta hodisa lahzasi (belgilanadi)
function sparkline(history, x, y, w, h, color) {
	const pts = history.slice(-60)
	if (pts.length < 2) return { svg: '', maxY: 0, spanMin: 0 }
	const t0 = new Date(pts[0].t).getTime(), t1 = new Date(pts[pts.length - 1].t).getTime()
	const span = Math.max(t1 - t0, 5 * 60 * 1000)
	const maxY = Math.max(5, ...pts.map((p) => p.count))
	const px = (p) => x + 10 + ((new Date(p.t).getTime() - t0) / span) * (w - 20)
	const py = (p) => y + h - 14 - (p.count / maxY) * (h - 48)
	const line = pts.map((p) => `${Math.round(px(p))},${Math.round(py(p))}`).join(' ')
	const last = pts[pts.length - 1]
	const base = y + h - 14
	const svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#000" fill-opacity="0.6"/>`
		+ `<line x1="${x + 10}" y1="${base}" x2="${x + w - 10}" y2="${base}" stroke="#fff" stroke-opacity="0.35"/>`
		+ `<polygon points="${Math.round(x + 10)},${base} ${line} ${Math.round(px(last))},${base}" fill="#60a5fa" fill-opacity="0.25"/>`
		+ `<polyline points="${line}" fill="none" stroke="#93c5fd" stroke-width="3" stroke-linejoin="round"/>`
		+ `<circle cx="${Math.round(px(last))}" cy="${Math.round(py(last))}" r="8" fill="${color}" stroke="#fff" stroke-width="2"/>`
	return { svg, maxY, spanMin: Math.round(span / 60000), lastY: py(last) }
}

// Hodisa kadri (1280 px): sabab yozuvi, qutilar va chizma. kind — vision_*
async function renderEvidence({ buf, result, kind, title, detail, history, cameraName, sinfName, at, phones = [] }) {
	const W = 1280
	const scale = W / result.width
	const H = Math.round(result.height * scale)
	const color = TONES[kind] || '#dc2626'
	const BH = 104
	const panel = { x: 16, y: H - 176, w: 440, h: 160 }
	const chart = sparkline(history, panel.x, panel.y, panel.w, panel.h, color)

	const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
		+ boxRects(result.boxes, scale, color, 4)
		+ require('./phone').svgOf(phones, scale)
		+ `<rect x="0" y="0" width="${W}" height="${BH}" fill="${color}" fill-opacity="0.93"/>`
		+ `<rect x="0" y="${H - 44}" width="${W}" height="44" fill="#000" fill-opacity="0.55"/>`
		+ (chart.svg || `<rect x="${panel.x}" y="${panel.y}" width="${panel.w}" height="${panel.h}" rx="10" fill="#000" fill-opacity="0.6"/>`)
		+ `</svg>`

	const [tTitle, tDetail, tCount, tUnit, tChartTitle, tMax, tFooter] = await Promise.all([
		text(title, { size: 38, maxW: W - 360 }),
		text(detail, { size: 22, maxW: W - 360 }),
		text(String(result.count), { size: 60 }),
		text('odam', { size: 22 }),
		text(chart.svg ? `Odam soni · oxirgi ${chart.spanMin} daqiqa` : "Odam soni (tarix yo'q)", { size: 18, maxW: panel.w - 20 }),
		text(chart.svg ? `${chart.maxY}` : '', { size: 16 }).catch(() => null),
		text(`${stamp(at)}  ·  ${cameraName || 'Kamera'}${sinfName ? `  ·  ${sinfName}` : ''}`, { size: 22, maxW: W - 40 })
	])
	const layers = [
		{ input: Buffer.from(svg), left: 0, top: 0 },
		{ input: tTitle.input, left: 24, top: 12 },
		{ input: tDetail.input, left: 24, top: 12 + tTitle.height + 4 },
		{ input: tCount.input, left: W - 24 - tCount.width - tUnit.width - 8, top: 14 },
		{ input: tUnit.input, left: W - 24 - tUnit.width, top: 14 + tCount.height - tUnit.height - 6 },
		{ input: tChartTitle.input, left: panel.x + 12, top: panel.y + 8 },
		{ input: tFooter.input, left: 20, top: H - 40 }
	]
	if (tMax && chart.svg) layers.push({ input: tMax.input, left: panel.x + panel.w - 14 - tMax.width, top: panel.y + 8 })
	return sharp(buf).resize(W, H).composite(layers).jpeg({ quality: 80 }).toBuffer()
}

// Qisqa lavha: frames = [{ jpeg (qutilar chizilgan), t, count }] — oxirgi tahlil kadrlari (hodisagacha va hodisa lahzasi).
// Animatsiyali WebP (ffmpeg shart emas); oxirgi kadr sabab yozuvi bilan uzoqroq ushlanadi
async function renderClip(frames, { kind, title }) {
	const color = TONES[kind] || '#dc2626'
	const first = await sharp(frames[0].jpeg).metadata()
	const W = first.width, H = first.height
	const out = []
	for (let i = 0; i < frames.length; i++) {
		const f = frames[i]
		const isLast = i === frames.length - 1
		const [tCap, tTag, tTitle] = await Promise.all([
			text(`${hhmm(f.t)}  ·  ${f.count} odam`, { size: 20, maxW: W - 24 }),
			text(`ISBOT ${i + 1}/${frames.length}`, { size: 16 }),
			isLast ? text(title, { size: 24, maxW: W - 24 }) : Promise.resolve(null)
		])
		const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`
			+ `<rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" fill-opacity="0.6"/>`
			+ `<rect x="8" y="8" width="${tTag.width + 16}" height="${tTag.height + 8}" rx="6" fill="#000" fill-opacity="0.6"/>`
			+ (isLast ? `<rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="${color}" stroke-width="8"/><rect x="0" y="${H - 34 - (tTitle.height + 14)}" width="${W}" height="${tTitle.height + 14}" fill="${color}" fill-opacity="0.9"/>` : '')
			+ `</svg>`
		const layers = [{ input: Buffer.from(svg), left: 0, top: 0 }, { input: tCap.input, left: 12, top: H - 32 }, { input: tTag.input, left: 16, top: 12 }]
		if (isLast) layers.push({ input: tTitle.input, left: 12, top: H - 34 - (tTitle.height + 14) + 7 })
		out.push(await sharp(f.jpeg).resize(W, H, { fit: 'fill' }).composite(layers).jpeg({ quality: 65 }).toBuffer())
	}
	const delay = out.map((_, i) => (i === out.length - 1 ? 3000 : 1100))
	return sharp(out, { join: { animated: true } }).webp({ quality: 58, delay, loop: 0 }).toBuffer()
}

module.exports = { renderEvidence, renderClip, smallFrame, TONES }
