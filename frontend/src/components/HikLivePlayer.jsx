import axios from 'axios'
import { useEffect, useRef, useState } from 'react'
import { FiMic } from 'react-icons/fi'
import { tx } from '../i18n'
import { activeCount, dequeue, enqueue, forceAcquire, getMax, getQuality, getSliceMs, release, tryAcquire, waitingCount } from '../utils/hikStreams'

// Brauzer bir vaqtda juda ko'p video dekoderini (WASM) ko'tarmaydi: limit (utils/hikStreams.js) to'lsa qolganlari NAVBATda kutadi,
// joy bo'shaganda o'zi ochiladi; navbat bo'lsa jonli oqimlar vaqt bo'yicha almashinadi (kutayotgan kamera oxirgi kadrini ko'rsatadi)

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
// Pleyerdan joriy kadrni base64 qilib oladi, FAYLGA YUKLAMAYDI. EZUIKit'da capturePicture(nom, ?, yuklash): 3-argument berilmasa standart
// holatda kadr foydalanuvchi kompyuteriga "nom.jpeg" bo'lib saqlanadi (callback shakli ham shunday) — shuning uchun Promise shaklida, yuklash=false
const grabFrame = (player) => new Promise((resolve) => {
	try {
		const r = player.capturePicture(`f${Date.now()}`, false, false)
		if (r && typeof r.then === 'function') r.then((c) => { const b = c?.data?.base64 || c?.base64; resolve(typeof b === 'string' ? b : null) }, () => resolve(null))
		else resolve(null)
	} catch { resolve(null) }
})

// `talk` — ikki tomonlama aloqa: brauzer mikrofonidan ovoz kamera dinamigiga yuboriladi (faqat HTTPS yoki localhost sahifada)
const HikLivePlayer = ({ cameraId, tokenKey = 'token', lazy = false, onStatus, domId, playerRef, talk = false }) => {
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
	const [slot, setSlot] = useState(0) // navbat uyg'otganda oshadi: pleyer joy olishga qayta uriniladi
	const skipOnce = useRef(false) // almashinish: keyingi ishga tushishda joy olmasdan navbat oxiriga turish
	const livePlayer = useRef(null) // joriy pleyer nusxasi (suhbat tugmasi uchun)
	const talkTimer = useRef(null)
	const [talkState, setTalkState] = useState({ status: 'off', message: '' }) // off | connecting | on | error
	const [restImg, setRestImg] = useState(null) // almashinishdan oldingi oxirgi kadr (navbatda kutayotganda ko'rsatiladi)

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
		const quality = getQuality(lazy)
		const wake = () => setSlot(n => n + 1)
		// Navbat: joy bo'lmasa (yoki almashinishdan keyin) kutadi, bo'shaganda o'zi ishga tushadi
		if (skipOnce.current) { skipOnce.current = false; enqueue(containerId, wake); setState({ status: 'limit', message: '' }); return () => dequeue(containerId) }
		if (forced) forceAcquire(containerId)
		else if (!tryAcquire(containerId, quality)) { enqueue(containerId, wake); setState({ status: 'limit', message: '' }); return () => dequeue(containerId) }
		let player = null
		let sliceTimer = null
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
					// Panel (lazy) ko'rinishida yengil SD oqim: brauzer dasturiy dekodlaydi, ko'p HD oqim kompyuterni bo'g'adi. Yirik ko'rish va yuz tanish — HD
					params: { ...(attempt > 0 ? { fresh: 1 } : {}), quality } // "Qayta urinish": serverdagi xato keshi va eski token tashlanadi
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
					muted: true, // kamera ovozi standart holatda o'chiq (EZUIKit 9: `muted`; `audio` parametri o'qilmaydi). Pleyer panelidagi tugma bilan yoqiladi
					volumeOptions: { muted: true },
					width: box.clientWidth,
					height: box.clientHeight,
					...(talk ? { plugin: ['talk'] } : {}),
					staticPath: '/ezuikit_static',
					env: { domain },
					scaleMode: 1,
					language: 'en',
					handleError: (e) => {
						if (cancelled) return
						// Dekoder xatosi 5 = oqim shifrlangan (DEVICE_ENCRYPTED): tekshiruv kodi (verification code) yo'q yoki noto'g'ri. Qayta urinish foydasiz
						if (e?.type === 'handleRunTimeInfoError' && e?.data?.nErrorCode === 5) {
							report({ status: 'error', message: "Video oqimi shifrlangan: Hik-Connect akkauntidagi tekshiruv kodi (verification code) noto'g'ri yoki bu qurilma uchun boshqa. Platforma → Hik-Connect akkauntlar bo'limida kodni tekshiring yoki qurilmada «Video shifrlash»ni o'chiring" })
							return
						}
						const code = e?.data?.nErrorCode
						report({ status: 'error', message: `Pleyer xatosi${code !== undefined ? ` (kod ${code})` : ''}: ${e?.msg || e?.message || e?.type || 'video dekod qilinmadi'}` })
						scheduleRetry()
					}
				})
				livePlayer.current = player
				if (playerRef) playerRef.current = player // tashqaridan kadr olish (yuz tanish) uchun
				if (talk && player.eventEmitter?.on) {
					const E = EZUIKitPlayer.EVENTS || {}
					player.eventEmitter.on(E.talkSuccess || 'talkSuccess', () => { clearTimeout(talkTimer.current); setTalkState({ status: 'on', message: '' }) })
					player.eventEmitter.on(E.stopTalk || 'stopTalk', () => { clearTimeout(talkTimer.current); setTalkState({ status: 'off', message: '' }) })
					player.eventEmitter.on(E.talkError || 'talkError', (err) => {
						clearTimeout(talkTimer.current)
						setTalkState({ status: 'error', message: `Suhbat ochilmadi${err?.msg || err?.message ? `: ${err.msg || err.message}` : ''}. Kamerada dinamik (ikki tomonlama audio) yoqilganini tekshiring` })
					})
				}
				if (player.eventEmitter?.on) {
					// Pleyer xato bermasdan jim qolishi mumkin: birinchi kadrni kutamiz, kelmasa aniq xabar beramiz
					report({ status: 'waiting', message: '' })
					player.eventEmitter.on(EZUIKitPlayer.EVENTS?.firstFrameDisplay || 'firstFrameDisplay', () => {
						clearTimeout(stallTimer)
						if (cancelled) return
						report({ status: 'live', message: '' })
						setRestImg(null)
						// Almashinish: navbatda kutayotgan kamera bo'lsa, SLICE dan keyin joyni berib, oxirgi kadrni qoldirib navbat oxiriga turamiz (qo'lda ochilganlar almashmaydi)
						if (!forced) {
							const liveAt = Date.now()
							const rotate = () => {
								let done = false
								const go = () => { if (done) return; done = true; skipOnce.current = true; setSlot(n => n + 1) }
								const to = setTimeout(go, 1500)
								grabFrame(player).then((b) => { if (done) return; clearTimeout(to); if (b) setRestImg(b.startsWith('data:') ? b : `data:image/jpeg;base64,${b}`); go() })
							}
							sliceTimer = setInterval(() => { if (!cancelled && waitingCount() > 0 && Date.now() - liveAt >= getSliceMs()) { clearInterval(sliceTimer); sliceTimer = null; rotate() } }, 3000)
						}
						if (watchTimer || typeof player.capturePicture !== 'function') return
						autoRetry.current.lastOkAt = Date.now()
						let lastHash = null, same = 0, waiting = false
						watchTimer = setInterval(() => {
							if (cancelled || waiting) return
							if (activeCount() > getMax(quality)) { same = 0; return } // limitdan oshib bo'g'ilgan: kadrlar sustligi qotish emas, qayta ulanish holatni yomonlashtiradi
							waiting = true
							let answered = false
							const noAnswer = setTimeout(() => { if (!answered) { waiting = false } }, 5000) // pleyer javob bermasa keyingi tekshiruvda yana uriniladi
							grabFrame(player).then((b) => {
								answered = true; clearTimeout(noAnswer); waiting = false
								if (cancelled) return
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
			release(containerId)
			clearTimeout(stallTimer)
			clearInterval(sliceTimer)
			clearInterval(watchTimer)
			clearTimeout(retryTimer)
			clearTimeout(talkTimer.current)
			setTalkState({ status: 'off', message: '' })
			livePlayer.current = null
			if (playerRef) playerRef.current = null
			try { player?.destroy?.() } catch { /* pleyer allaqachon yopilgan */ }
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [active, cameraId, containerId, tokenKey, attempt, forced, layoutKey, slot])

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

	// Suhbat: tugma bosilganda yoqiladi, yana bosilganda o'chadi. Mikrofon ruxsatini avval o'zimiz so'raymiz — rad etilsa aniq sabab ko'rsatiladi
	const toggleTalk = async () => {
		const p = livePlayer.current
		if (!p) return
		if (talkState.status === 'on' || talkState.status === 'connecting') {
			clearTimeout(talkTimer.current)
			try { p.stopTalk() } catch { /* allaqachon to'xtagan */ }
			setTalkState({ status: 'off', message: '' })
			return
		}
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			setTalkState({ status: 'error', message: "Mikrofon faqat himoyalangan (HTTPS) sahifada ishlaydi. Saytni https:// manzil bilan oching" })
			return
		}
		setTalkState({ status: 'connecting', message: '' })
		try {
			const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
			mic.getTracks().forEach(t => t.stop())
		} catch (e) {
			const why = e?.name === 'NotAllowedError' ? "Brauzerda mikrofonga ruxsat berilmagan: manzil satridagi qulf belgisi orqali ruxsat bering"
				: e?.name === 'NotFoundError' ? "Kompyuterda mikrofon topilmadi" : e?.name === 'NotReadableError' ? "Mikrofon boshqa dastur tomonidan band" : "Mikrofonni ochib bo'lmadi"
			setTalkState({ status: 'error', message: why })
			return
		}
		try { p.startTalk() } catch (e) { setTalkState({ status: 'error', message: `Suhbat ochilmadi: ${e?.message || ''}` }); return }
		// Qurilma javob bermasa jim qolmaslik uchun
		talkTimer.current = setTimeout(() => setTalkState(st => (st.status === 'connecting' ? { status: 'error', message: "Kamera suhbatga javob bermadi: unda mikrofon/dinamik yo'q yoki ikki tomonlama audio o'chirilgan bo'lishi mumkin" } : st)), 12000)
	}

	const problem = state.status === 'stalled' || state.status === 'error'
	return (
		<div ref={boxRef} className="relative w-full bg-black overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
			<div id={containerId} className="absolute inset-0" />
			{talk && state.status === 'live' && (
				<div className="absolute bottom-2 right-2 z-10 flex max-w-[80%] flex-col items-end gap-1">
					{talkState.status === 'error' && <p className="rounded-lg bg-red-600/90 px-2 py-1 text-[11px] text-white">{tx(talkState.message)}</p>}
					<button onClick={toggleTalk} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow ${talkState.status === 'on' ? 'bg-red-600 hover:bg-red-700' : 'bg-black/60 hover:bg-black/80'}`}>
						<FiMic /> {talkState.status === 'on' ? tx("Gaplashish yoqiq: to'xtatish") : talkState.status === 'connecting' ? tx("Ulanmoqda...") : tx("Kameraga gapirish")}
					</button>
				</div>
			)}
			{state.status !== 'live' && (
				<div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-xs text-slate-300 ${state.status === 'stalled' ? 'bg-slate-900/85' : 'bg-slate-900'}`}>
					{!visible ? <span className="text-slate-500">{tx("Kutilmoqda...")}</span>
						: state.status === 'limit' ? (
								<>
									{restImg && <img src={restImg} alt="" className="absolute inset-0 h-full w-full object-contain opacity-50" />}
									<p className="relative max-w-xs text-slate-300">{tx("Navbat kutilmoqda: bir vaqtda {{n}} ta oqim ochiq. Navbati kelganda avtomatik jonli bo'ladi", { n: getMax(getQuality(lazy)) })}</p>
									<button onClick={() => setForced(true)} className="relative px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-medium hover:bg-slate-100">{tx("Hozir ochish")}</button>
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
