import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { tx } from '../i18n'

// Brauzer bir vaqtda juda ko'p video dekoderini (WASM) ko'tarmaydi: shundan ortiq oqim ochilsa qolganlari "Ishga tushirish" tugmasi bilan kutadi
// Kompyuter kuchiga qarab (yadrolar soni), 6 dan 16 gacha
const MAX_ACTIVE = Math.min(16, Math.max(6, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 8))
const activeStreams = new Set()

// Oqim ketayotganda qotib qolishini aniqlash (EZUIKit «oqim uzildi» hodisasini bermaydi): har WATCH_MS da pleyerdan kadr olinadi va ketma-ket
// bir xil kadr (kameradagi vaqt yozuvi har soniya o'zgaradi) bo'lsa — oqim qotgan. Shunda o'zi qayta ulanadi (yangi oqim manzili bilan)
const WATCH_MS = 15000
const WATCH_SAME = 2 // shuncha ketma-ket bir xil kadr = qotgan (~30 s)
const AUTO_RETRY_DELAYS = [20000, 40000, 80000, 120000] // xatodan keyin o'zi qayta urinish kutish vaqtlari (qurilma vaqtincha offline bo'lsa ko'rinish tiklansin)
const AUTO_RETRY_MAX = 4 // shuncha avtomatik qayta ulanishdan keyin foydalanuvchi qo'lda «Qayta urinish» bosadi
const AUTO_RETRY_RESET_MS = 3 * 60 * 1000 // shuncha vaqt barqaror ishlasa urinishlar hisobi nolga tushadi
const sampleHash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i += 61) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) } return `${str.length}:${h >>> 0}` }

// Birinchi kadr shu vaqtgacha kelmasa, oqim "kelmayapti" deb e'lon qilinadi (qurilma bulutdan uzilgan yoki tarmog'i sust)
const STALL_MS = 20000

// Hik-Connect kamerasining jonli oqimi (EZUIKit) — bosishsiz, o'zi ochiladi.
// `lazy` bo'lsa oqim faqat kartochka ko'rinish oynasiga kirganda boshlanadi va
// chiqib ketganda to'xtatiladi (bir sahifada ko'p kamera bo'lganda tarmoq/CPU tejaydi).
// `tokenKey` — localStorage'dagi qaysi token bilan so'rov yuborilishi.
// Holatlar: loading -> waiting (pleyer yaratildi, birinchi kadr kutilmoqda) -> live | stalled | error
const HikLivePlayer = ({ cameraId, tokenKey = 'token', lazy = false, onStatus, domId, playerRef }) => {
	const containerId = useRef(domId || `hik-live-${Math.random().toString(36).slice(2)}`).current
	const boxRef = useRef(null)
	const [layoutKey, setLayoutKey] = useState(0) // panel o'lchami o'zgarganda pleyer yangi o'lcham bilan qayta yaratiladi
	const [visible, setVisible] = useState(!lazy)
	const [attempt, setAttempt] = useState(0)
	const autoRetry = useRef({ n: 0, lastOkAt: 0 })
	const [state, setState] = useState({ status: 'loading', message: '' })
	const [still, setStill] = useState({ loading: false, url: null, message: '' })
	const [tabHidden, setTabHidden] = useState(typeof document !== 'undefined' && document.hidden)
	const [forced, setForced] = useState(false) // chegaradan oshganda foydalanuvchi qo'lda ishga tushirdi

	// Oyna yashirin bo'lsa oqim to'xtatiladi (CPU, tarmoq va Hik so'rovlari tejaladi), qaytganda o'zi davom etadi
	useEffect(() => {
		const onVis = () => setTabHidden(document.hidden)
		document.addEventListener('visibilitychange', onVis)
		return () => document.removeEventListener('visibilitychange', onVis)
	}, [])

	useEffect(() => {
		if (!lazy) return
		const el = boxRef.current
		const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '150px' })
		observer.observe(el)
		return () => observer.disconnect()
	}, [lazy])

	// Panel kengligi o'zgarsa (2/3/4 ustunli tur, oyna o'lchami) pleyer yangi o'lcham bilan qayta yaratiladi: u yaratilgan o'lchamini o'zgartirmagani uchun
	// aks holda qora maydon yoki qirqilgan kadr qoladi
	useEffect(() => {
		const el = boxRef.current
		if (!el || typeof ResizeObserver === 'undefined') return
		let timer = null
		let last = { w: el.clientWidth, h: el.clientHeight }
		const observer = new ResizeObserver(() => {
			clearTimeout(timer)
			timer = setTimeout(() => {
				const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight)
				if (!w || !h || (Math.abs(w - last.w) < 8 && Math.abs(h - last.h) < 8)) return
				last = { w, h }
				setLayoutKey(k => k + 1)
			}, 400)
		})
		observer.observe(el)
		return () => { clearTimeout(timer); observer.disconnect() }
	}, [])

	const active = visible && !tabHidden

	useEffect(() => {
		// Ko'rinishdan chiqqan yoki yashirin: oldingi "live" holati qolib, bo'sh qora oyna ko'rinmasin
		if (!active) { setState({ status: 'loading', message: '' }); return }
		if (activeStreams.size >= MAX_ACTIVE && !forced) { setState({ status: 'limit', message: '' }); return }
		activeStreams.add(containerId)
		let player = null
		let cancelled = false
		let stallTimer = null
		let watchTimer = null
		let retryTimer = null
		// Xato/uzilishdan keyin foydalanuvchi tugma bosmasdan ham qayta uriniladi (cheklangan: AUTO_RETRY_MAX marta, orasi uzayib boradi)
		const scheduleRetry = () => {
			const r = autoRetry.current
			if (cancelled || retryTimer || r.n >= AUTO_RETRY_MAX) return
			const delay = AUTO_RETRY_DELAYS[r.n] || 120000
			r.n += 1
			retryTimer = setTimeout(() => { retryTimer = null; if (!cancelled) setAttempt(a => a + 1) }, delay)
		}
		// Tashqi holat (modal sarlavhasi): waiting -> loading, stalled -> error
		const outer = { loading: 'loading', waiting: 'loading', live: 'live', stalled: 'error', error: 'error' }
		const report = (next) => { setState(next); onStatus?.(outer[next.status] || 'loading') }
		report({ status: 'loading', message: '' })
		setStill({ loading: false, url: null, message: '' })

		const start = async () => {
			try {
				const token = localStorage.getItem(tokenKey)
				if (!token) throw new Error("Sessiya topilmadi — qayta kiring")
				const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/cameras/${cameraId}/live`, {
					headers: { Authorization: `Bearer ${token}` },
					params: attempt > 0 ? { fresh: 1 } : undefined // "Qayta urinish": serverdagi xato keshi va eski token tashlanadi
				})
				if (cancelled) return
				const { streamToken, url, domain } = res.data
				// Pleyer kutubxonasi og'ir (WASM) — faqat kerak bo'lganda yuklanadi
				const { EZUIKitPlayer } = await import('ezuikit-js')
				if (cancelled) return
				const box = boxRef.current
				player = new EZUIKitPlayer({
					id: containerId,
					accessToken: streamToken,
					url,
					template: 'pcLive',
					width: box.clientWidth,
					height: box.clientHeight,
					staticPath: '/ezuikit_static',
					env: { domain },
					scaleMode: 1,
					language: 'en',
					handleError: (e) => { if (!cancelled) { report({ status: 'error', message: `Pleyer xatosi: ${e?.msg || e?.message || JSON.stringify(e)}` }); scheduleRetry() } }
				})
				if (playerRef) playerRef.current = player // tashqaridan kadr olish (yuz tanish) uchun
				if (player.eventEmitter?.on) {
					// Pleyer xato bermasdan jim qolishi mumkin: birinchi kadrni kutamiz, kelmasa aniq xabar beramiz
					report({ status: 'waiting', message: '' })
					player.eventEmitter.on(EZUIKitPlayer.EVENTS?.firstFrameDisplay || 'firstFrameDisplay', () => {
						clearTimeout(stallTimer)
						if (cancelled) return
						report({ status: 'live', message: '' })
						if (watchTimer || typeof player.capturePicture !== 'function') return
						autoRetry.current.lastOkAt = Date.now()
						let lastHash = null, same = 0, waiting = false
						watchTimer = setInterval(() => {
							if (cancelled || waiting) return
							waiting = true
							let answered = false
							const noAnswer = setTimeout(() => { if (!answered) { waiting = false } }, 5000) // pleyer javob bermasa keyingi tekshiruvda yana uriniladi
							try {
								player.capturePicture('watch', (d) => {
									answered = true; clearTimeout(noAnswer); waiting = false
									if (cancelled) return
									const b = d && (d.base64 || d.data || d)
									const h = typeof b === 'string' ? sampleHash(b) : null
									if (!h) return
									same = h === lastHash ? same + 1 : 0
									lastHash = h
									if (same === 0 && Date.now() - autoRetry.current.lastOkAt > AUTO_RETRY_RESET_MS) autoRetry.current.n = 0
									if (same >= WATCH_SAME) {
										clearInterval(watchTimer); watchTimer = null
										if (autoRetry.current.n < AUTO_RETRY_MAX) {
											autoRetry.current.n += 1
											report({ status: 'waiting', message: '' }) // «Oqim kutilmoqda...» ko'rsatiladi
											setAttempt(a => a + 1) // yangi oqim manzili bilan qayta ulanadi
										} else report({ status: 'stalled', message: "Jonli oqim to'xtab qoldi va qayta ulanmadi. Qurilma Hik-Connect bulutidan uzilgan bo'lishi mumkin" })
									}
								})
							} catch { answered = true; clearTimeout(noAnswer); waiting = false }
						}, WATCH_MS)
					})
					stallTimer = setTimeout(() => {
						if (!cancelled) { report({ status: 'stalled', message: "Jonli oqim kelmayapti. Qurilma Hik-Connect bulutidan uzilgan yoki tarmog'i sust bo'lishi mumkin" }); scheduleRetry() }
					}, STALL_MS)
				} else {
					report({ status: 'live', message: '' }) // hodisalarsiz eski pleyer: avvalgi xatti-harakat
				}
			} catch (e) {
				if (!cancelled) { report({ status: 'error', message: e.response?.data?.message || e.message || "Jonli oqimni ochib bo'lmadi" }); scheduleRetry() }
			}
		}
		start()

		return () => {
			cancelled = true
			activeStreams.delete(containerId)
			clearTimeout(stallTimer)
			clearInterval(watchTimer)
			clearTimeout(retryTimer)
			if (playerRef) playerRef.current = null
			try { player?.destroy?.() } catch { /* pleyer allaqachon yopilgan */ }
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, cameraId, containerId, tokenKey, attempt, forced, layoutKey])

	// Oxirgi kadr — faqat foydalanuvchi so'rasa (qurilmaga qo'shimcha yuk tushirmaslik uchun avtomatik emas)
	const showStill = async () => {
		setStill({ loading: true, url: null, message: '' })
		try {
			const token = localStorage.getItem(tokenKey)
				if (!token) throw new Error("Sessiya topilmadi — qayta kiring")
			const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/hik/cameras/${cameraId}/snapshot`, { headers: { Authorization: `Bearer ${token}` } })
			if (!res.data?.success) setStill({ loading: false, url: null, message: res.data?.message || 'Kadr olinmadi' })
			else if (res.data.encrypted) setStill({ loading: false, url: null, message: 'Kadr shifrlangan: uni bu yerda ko\'rsatib bo\'lmaydi' })
			else setStill({ loading: false, url: res.data.url, message: '' })
		} catch (e) {
			setStill({ loading: false, url: null, message: e.response?.data?.message || e.message || 'Kadr olinmadi' })
		}
	}

	const problem = state.status === 'stalled' || state.status === 'error'
	return (
		<div ref={boxRef} className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
			<div id={containerId} className="absolute inset-0" />
			{state.status !== 'live' && (
				<div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-xs text-slate-300 ${state.status === 'stalled' ? 'bg-slate-900/85' : 'bg-slate-900'}`}>
					{!visible ? <span className="text-slate-500">{tx("Kutilmoqda...")}</span>
						: state.status === 'limit' ? (
							<>
								<p className="max-w-xs text-slate-300">{tx("Bir vaqtda juda ko'p oqim ochiq ({{n}} ta). Brauzer sekinlashmasligi uchun bu kamera kutmoqda", { n: MAX_ACTIVE })}</p>
								<button onClick={() => setForced(true)} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-medium hover:bg-slate-100">{tx("Ishga tushirish")}</button>
							</>
						)
						: problem ? (
							<>
								{still.url ? <img src={still.url} alt="" className="absolute inset-0 w-full h-full object-contain opacity-60" /> : null}
								<p className="relative max-w-sm text-amber-300">{state.message}</p>
								{still.message && <p className="relative max-w-sm text-slate-300">{still.message}</p>}
								<div className="relative flex flex-wrap items-center justify-center gap-2">
									<button onClick={() => setAttempt(a => a + 1)} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-medium hover:bg-slate-100">{tx("Qayta urinish")}</button>
									<button onClick={showStill} disabled={still.loading} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">{still.loading ? tx("Olinmoqda...") : tx("Oxirgi kadrni ko'rsatish")}</button>
								</div>
							</>
						)
							: (
								<>
									<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
									{state.status === 'waiting' && <p className="text-slate-400">{tx("Oqim kutilmoqda...")}</p>}
								</>
							)}
				</div>
			)}
		</div>
	)
}

export default HikLivePlayer
