import { useEffect } from 'react'

// Tizimdagi barcha jadvallarda sarlavha qatori (thead) sahifa aylantirilganda navbarga yetganda qotib qoladi.
//
// CSS (index.css) thead'ni `position: sticky; top: 0` qiladi. Sticky ishlashi uchun jadval bilan aylantiriladigan
// konteyner (<main>) orasida overflow (hidden/auto) bo'lgan ota-element bo'lmasligi kerak, aks holda sticky shu elementga
// "yopishadi". Bu komponent jadval ota-elementlarini tekshiradi:
//  - o'zining balandlik chegarasi bor (max-height) aylantiriladigan blok (modal, ichki ro'yxat) — tegilmaydi, sticky ichida ishlaydi;
//  - jadval gorizontal siljish talab qilsa (keng jadval) — overflow saqlanadi, jadval yon tomonga aylantiriladi;
//  - qolgan hollarda overflow `clip` ga almashtiriladi (kesish saqlanadi, lekin aylantirish konteyneri bo'lmaydi).
//
// Tezlik: avval har DOM o'zgarishida (jonli video, grafik animatsiyasi, soat) HAMMA jadval qayta tekshirilar va o'qish/yozish
// aralashib majburiy qayta joylashtirish (layout thrashing) kuchli sekinlashtirardi. Endi:
//  - faqat jadval qo'shilganda yoki oyna o'lchami o'zgarganda ishlaydi (boshqa o'zgarishlar e'tiborsiz);
//  - avval hamma o'lchovlar o'qiladi, keyin hammasi yoziladi (bitta qayta joylashtirish);
//  - brauzer bo'sh turganda (requestIdleCallback) bajariladi.
const MARK = 'stickyOverflow'

const scrolls = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'overlay'

// O'qish bosqichi: qaysi elementga nima qilish kerakligini yig'adi (DOM'ga yozmaydi)
function plan(tables) {
	const actions = new Map() // element -> 'clip:...' | 'release'
	for (const table of tables) {
		let el = table.parentElement
		while (el && el.tagName !== 'MAIN' && el !== document.body) {
			if (!actions.has(el)) {
				const cs = getComputedStyle(el)
				const clipped = el.dataset[MARK] !== undefined
				const ox = clipped ? el.dataset[MARK].split('|')[0] : cs.overflowX
				const oy = clipped ? el.dataset[MARK].split('|')[1] : cs.overflowY
				const needsX = el.scrollWidth > el.clientWidth + 1
				const needsY = el.scrollHeight > el.clientHeight + 1
				if (clipped) {
					// Avval kesilgan blok: kontent kengayib (yoki qator qo'shilib) aylantirish kerak bo'lib qolsa, aylantirish qaytariladi
					if (needsX || needsY) actions.set(el, 'release')
					if (needsY) break // endi bu blok o'zi aylantirgich
				} else if (scrolls(ox) || scrolls(oy)) {
					// O'zining balandlik chegarasi bor aylantirgich: max-height, haqiqatan vertikal aylanadigan, yoki flex ichidagi `min-h-0` blok
					// (sahifaning qolgan balandligini egallaydigan jadval konteyneri). Unga TEGILMAYDI: aks holda jadval aylanmay qoladi
					const parentDisplay = el.parentElement ? getComputedStyle(el.parentElement).display : ''
					const flexScroller = /flex|grid/.test(parentDisplay) && cs.minHeight === '0px'
					const ownScroller = (oy === 'auto' || oy === 'scroll') && (cs.maxHeight !== 'none' || needsY || flexScroller)
					if (ownScroller) break // ichki aylantirgich: sticky shu ichida ishlaydi
					if (!needsX) actions.set(el, `clip:${ox}|${oy}`) // faqat kontentga teng, aylantirish kerak bo'lmagan overflow-x-auto/hidden o'ramlar
				}
			}
			el = el.parentElement
		}
	}
	return actions
}

// Yozish bosqichi
function apply(actions) {
	for (const [el, act] of actions) {
		if (act === 'release') { el.style.overflow = ''; delete el.dataset[MARK] }
		else { el.dataset[MARK] = act.slice(5); el.style.overflow = 'clip' }
	}
}

const run = (root) => {
	const tables = root ? [...(root.matches?.('table') ? [root] : []), ...(root.querySelectorAll ? root.querySelectorAll('table') : [])] : document.querySelectorAll('table')
	if (!tables.length) return
	apply(plan(tables))
}

const idle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 500 }) : setTimeout(fn, 0))

const StickyTables = () => {
	useEffect(() => {
		let t = null
		let all = false
		const pending = new Set()
		const flush = () => {
			const full = all
			const nodes = [...pending]
			all = false
			pending.clear()
			idle(() => { if (full) run(null); else nodes.forEach(n => n.isConnected && run(n)) })
		}
		const schedule = () => { clearTimeout(t); t = setTimeout(flush, 120) }
		const mo = new MutationObserver((records) => {
			let found = false
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (n.nodeType !== 1) continue
					if (n.nodeName === 'TABLE' || (n.querySelector && n.querySelector('table'))) { pending.add(n); found = true }
					else if (n.closest) { const tb = n.closest('table'); if (tb) { pending.add(tb); found = true } } // jadvalga qator qo'shildi: kengligi o'zgargan bo'lishi mumkin
				}
			}
			if (found) schedule()
		})
		const onResize = () => { all = true; schedule() }
		mo.observe(document.body, { childList: true, subtree: true })
		window.addEventListener('resize', onResize)
		all = true
		schedule()
		return () => { mo.disconnect(); window.removeEventListener('resize', onResize); clearTimeout(t) }
	}, [])
	return null
}

export default StickyTables
