import { useEffect } from 'react'

// Tizimdagi barcha jadvallarda sarlavha qatori (thead) sahifa aylantirilganda navbarga yetganda qotib qoladi.
//
// CSS (index.css) thead'ni `position: sticky; top: 0` qiladi. Sticky ishlashi uchun jadval bilan aylantiriladigan
// konteyner (<main>) orasida overflow (hidden/auto) bo'lgan ota-element bo'lmasligi kerak, aks holda sticky shu elementga
// "yopishadi". Bu komponent jadval ota-elementlarini tekshiradi:
//  - o'zining balandlik chegarasi bor (max-height) aylantiriladigan blok (modal, ichki ro'yxat) — tegilmaydi, sticky ichida ishlaydi;
//  - jadval gorizontal siljish talab qilsa (keng jadval) — overflow saqlanadi, jadval yon tomonga aylantiriladi;
//  - qolgan hollarda overflow `clip` ga almashtiriladi (kesish saqlanadi, lekin aylantirish konteyneri bo'lmaydi).
// Oyna o'lchami yoki ma'lumot o'zgarganda qayta tekshiriladi.
const MARK = 'stickyOverflow'

const scrolls = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'overlay'

function process() {
	document.querySelectorAll('table').forEach(table => {
		let el = table.parentElement
		while (el && el.tagName !== 'MAIN' && el !== document.body) {
			const cs = getComputedStyle(el)
			const clipped = el.dataset[MARK] !== undefined
			const ox = clipped ? el.dataset[MARK].split('|')[0] : cs.overflowX
			const oy = clipped ? el.dataset[MARK].split('|')[1] : cs.overflowY
			if (scrolls(ox) || scrolls(oy)) {
				const ownScroller = !clipped && (oy === 'auto' || oy === 'scroll') && cs.maxHeight !== 'none'
				if (ownScroller) break // ichki aylantirgich: sticky shu ichida ishlaydi
				const needsX = el.scrollWidth > el.clientWidth + 1
				if (needsX && clipped) { el.style.overflow = ''; delete el.dataset[MARK] } // keng jadval: yon tomonga aylantirish kerak
				else if (!needsX && !clipped) { el.dataset[MARK] = `${ox}|${oy}`; el.style.overflow = 'clip' }
			}
			el = el.parentElement
		}
	})
}

const StickyTables = () => {
	useEffect(() => {
		let t = null
		const schedule = () => { clearTimeout(t); t = setTimeout(process, 120) }
		const mo = new MutationObserver(schedule)
		mo.observe(document.body, { childList: true, subtree: true })
		window.addEventListener('resize', schedule)
		schedule()
		return () => { mo.disconnect(); window.removeEventListener('resize', schedule); clearTimeout(t) }
	}, [])
	return null
}

export default StickyTables
