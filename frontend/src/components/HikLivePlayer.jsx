import axios from 'axios'
import { useEffect, useRef, useState } from 'react'

// Birinchi kadr shu vaqtgacha kelmasa, oqim "kelmayapti" deb e'lon qilinadi (qurilma bulutdan uzilgan yoki tarmog'i sust)
const STALL_MS = 20000

// Hik-Connect kamerasining jonli oqimi (EZUIKit) — bosishsiz, o'zi ochiladi.
// `lazy` bo'lsa oqim faqat kartochka ko'rinish oynasiga kirganda boshlanadi va
// chiqib ketganda to'xtatiladi (bir sahifada ko'p kamera bo'lganda tarmoq/CPU tejaydi).
// `tokenKey` — localStorage'dagi qaysi token bilan so'rov yuborilishi.
// Holatlar: loading -> waiting (pleyer yaratildi, birinchi kadr kutilmoqda) -> live | stalled | error
const HikLivePlayer = ({ cameraId, tokenKey = 'token', lazy = false, onStatus }) => {
	const containerId = useRef(`hik-live-${Math.random().toString(36).slice(2)}`).current
	const boxRef = useRef(null)
	const [visible, setVisible] = useState(!lazy)
	const [attempt, setAttempt] = useState(0)
	const [state, setState] = useState({ status: 'loading', message: '' })
	const [still, setStill] = useState({ loading: false, url: null, message: '' })

	useEffect(() => {
		if (!lazy) return
		const el = boxRef.current
		const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '150px' })
		observer.observe(el)
		return () => observer.disconnect()
	}, [lazy])

	useEffect(() => {
		if (!visible) return
		let player = null
		let cancelled = false
		let stallTimer = null
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
					headers: { Authorization: `Bearer ${token}` }
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
					handleError: (e) => { if (!cancelled) report({ status: 'error', message: `Pleyer xatosi: ${e?.msg || e?.message || JSON.stringify(e)}` }) }
				})
				if (player.eventEmitter?.on) {
					// Pleyer xato bermasdan jim qolishi mumkin: birinchi kadrni kutamiz, kelmasa aniq xabar beramiz
					report({ status: 'waiting', message: '' })
					player.eventEmitter.on(EZUIKitPlayer.EVENTS?.firstFrameDisplay || 'firstFrameDisplay', () => {
						clearTimeout(stallTimer)
						if (!cancelled) report({ status: 'live', message: '' })
					})
					stallTimer = setTimeout(() => {
						if (!cancelled) report({ status: 'stalled', message: "Jonli oqim kelmayapti. Qurilma Hik-Connect bulutidan uzilgan yoki tarmog'i sust bo'lishi mumkin" })
					}, STALL_MS)
				} else {
					report({ status: 'live', message: '' }) // hodisalarsiz eski pleyer: avvalgi xatti-harakat
				}
			} catch (e) {
				if (!cancelled) report({ status: 'error', message: e.response?.data?.message || e.message || "Jonli oqimni ochib bo'lmadi" })
			}
		}
		start()

		return () => {
			cancelled = true
			clearTimeout(stallTimer)
			try { player?.destroy?.() } catch { /* pleyer allaqachon yopilgan */ }
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [visible, cameraId, containerId, tokenKey, attempt])

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
					{!visible ? <span className="text-slate-500">Kutilmoqda...</span>
						: problem ? (
							<>
								{still.url ? <img src={still.url} alt="" className="absolute inset-0 w-full h-full object-contain opacity-60" /> : null}
								<p className="relative max-w-sm text-amber-300">{state.message}</p>
								{still.message && <p className="relative max-w-sm text-slate-300">{still.message}</p>}
								<div className="relative flex flex-wrap items-center justify-center gap-2">
									<button onClick={() => setAttempt(a => a + 1)} className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-medium hover:bg-slate-100">Qayta urinish</button>
									<button onClick={showStill} disabled={still.loading} className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs hover:bg-white/20 disabled:opacity-50">{still.loading ? 'Olinmoqda...' : 'Oxirgi kadrni ko\'rsatish'}</button>
								</div>
							</>
						)
							: (
								<>
									<div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-600 border-t-cyan-400" />
									{state.status === 'waiting' && <p className="text-slate-400">Oqim kutilmoqda...</p>}
								</>
							)}
				</div>
			)}
		</div>
	)
}

export default HikLivePlayer
