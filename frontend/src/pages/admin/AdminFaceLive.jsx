import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FiArrowLeft, FiCheckCircle, FiPause, FiPlay, FiSearch, FiXCircle } from 'react-icons/fi'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import HikLivePlayer from '../../components/HikLivePlayer'
import { tx } from '../../i18n'

const BASE = import.meta.env.VITE_BASE_URL
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const iou = (a, b) => {
	const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3])
	const i = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
	return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i || 1)
}
const KEEP_MS = 2500 // tanilgan ism yuz tutib turilgan vaqt: yuz bir kadrda tanilmay qolsa ham yorliq yo'qolmasin (miltillamasin)
const hhmmss = (d) => d.toLocaleTimeString('uz-UZ', { hour12: false })

// Bitta kamerani uzluksiz kuzatish: chapda kameraning jonli videosi (real vaqt), o'ngda yuz tanish natijasi.
// Hik-Connect kadri ~10–15 soniyada olinadi, shuning uchun tanish natijasi videodan shuncha ortda qoladi — bu bulut API'ning cheklovi.
// Hech narsa saqlanmaydi (davomat yoki "ko'rindi" yozuvi yo'q), faqat ko'rish uchun.
const AdminFaceLive = () => {
	const [cameras, setCameras] = useState([])
	const [camera, setCamera] = useState('')
	const [q, setQ] = useState('')
	const [found, setFound] = useState([])
	const [student, setStudent] = useState(null)
	const [running, setRunning] = useState(false)
	const [busy, setBusy] = useState(false)
	const [res, setRes] = useState(null)
	const [log, setLog] = useState([])
	const [rtOn, setRtOn] = useState(true)
	const [snapOn, setSnapOn] = useState(true)
	const [rt, setRt] = useState(null) // real vaqt natijasi: { faces, at, ms }
	const [now, setNow] = useState(Date.now())
	const [stats, setStats] = useState({ cycles: 0, ms: 0, seen: {} })
	const runningRef = useRef(false)
	const cycleRef = useRef(0)
	const playerRef = useRef(null)
	const tracksRef = useRef([]) // [{ box, who, at }]
	const seqRef = useRef({ sent: 0, shown: 0 })

	useEffect(() => {
		axios.get(`${BASE}/api/hik/faces/status`, auth()).then(r => { setCameras(r.data.cameras || []); if (r.data.cameras?.length) setCamera(c => c || r.data.cameras[0]._id) }).catch(() => {})
	}, [])

	useEffect(() => {
		if (student || q.trim().length < 2) { setFound([]); return }
		const t = setTimeout(async () => {
			try { const r = await axios.get(`${BASE}/api/hik/faces/students`, { ...auth(), params: { q } }); setFound(r.data.items || []) } catch { setFound([]) }
		}, 300)
		return () => clearTimeout(t)
	}, [q, student])

	const cycle = useCallback(async (cam, stu) => {
		setBusy(true)
		try {
			const r = await axios.post(`${BASE}/api/hik/faces/diagnose`, { cameraId: cam, studentId: stu?._id || null }, { ...auth(), timeout: 90000 })
			if (!r.data.success) { toast.error(tx(r.data.message || 'Xatolik')); runningRef.current = false; setRunning(false); return }
			const d = r.data, now = new Date()
			setRes(d)
			cycleRef.current += 1
			const names = stu ? (d.verdict?.status === 'found' ? [stu.fullName] : []) : (d.recognized || []).map(x => x.name)
			setStats(s => {
				const seen = { ...s.seen }
				names.forEach(n => { seen[n] = (seen[n] || 0) + 1 })
				return { cycles: s.cycles + 1, ms: s.ms + d.timings.total, seen }
			})
			setLog(l => [{ at: now, faces: d.faces.length, text: d.verdict?.text, ok: d.verdict?.status === 'found' }, ...l].slice(0, 30))
		} catch (e) {
			toast.error(tx(e.response?.data?.message || 'Xatolik')); runningRef.current = false; setRunning(false)
		} finally { setBusy(false) }
	}, [])

	// Navbatma-navbat: oldingi sinov tugagach keyingisi boshlanadi (Hik so'rovlari to'planib qolmasin)
	useEffect(() => {
		if (!running || !snapOn) return
		runningRef.current = true
		let stop = false
		;(async () => {
			while (runningRef.current && !stop) {
				await cycle(camera, student)
				await new Promise(r => setTimeout(r, 1000))
			}
		})()
		return () => { stop = true; runningRef.current = false }
	}, [running, snapOn, camera, student, cycle])

	// Real vaqt: jonli video kadri (pleyerning o'zidan) serverga yuboriladi, ramkalar videoning ustiga chiziladi. Hik bulutidan kadr olinmaydi
	useEffect(() => {
		if (!running || !rtOn) return
		let stop = false
		const grab = () => new Promise((resolve, reject) => {
			const p = playerRef.current
			if (!p?.capturePicture) return reject(new Error('pleyer tayyor emas'))
			let done = false
			const to = setTimeout(() => { if (!done) reject(new Error('kadr kelmadi')) }, 4000)
			try { p.capturePicture('frame', d => { done = true; clearTimeout(to); const b = d?.base64 || d?.data || d; resolve(typeof b === 'string' ? b : null) }) } catch (e) { clearTimeout(to); reject(e) }
		})
		// Ikkita parallel navbat: bir kadr serverda tahlil qilinayotganda keyingisi allaqachon yuborilgan (kechikish ~yarmiga tushadi).
		// Eskirib kelgan javob yangisini bosib ketmasligi uchun kadrlar raqamlanadi
		const lane = async (offset) => {
			let fails = 0
			await new Promise(r => setTimeout(r, offset))
			while (!stop) {
				const t0 = Date.now(), n = ++seqRef.current.sent
				try {
					const data = await grab()
					if (!data) throw new Error("bo'sh kadr")
					const blob = await (await fetch(data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`)).blob()
					const fd = new FormData()
					fd.append('image', blob, 'frame.jpg'); fd.append('cameraId', camera); if (student) fd.append('studentId', student._id)
					const r = await axios.post(`${BASE}/api/hik/faces/frame`, fd, { ...auth(), timeout: 20000 })
					if (stop) break
					if (r.data.success) {
						fails = 0
						if (n < seqRef.current.shown) continue // eskirgan javob
						seqRef.current.shown = n
						const at = Date.now()
						// Izdosh: yuz tanilgan bo'lsa saqlanadi; tanilmagan yuz oldingi tanilgan yuz ustiga tushsa, ism davom etadi
						tracksRef.current = tracksRef.current.filter(t => at - t.at < KEEP_MS)
						const faces = r.data.faces.map(f => {
							if (f.who) { tracksRef.current.push({ box: f.box, who: f.who, at }); return f }
							const t = tracksRef.current.find(t => iou(t.box, f.box) > 0.3)
							return t ? { ...f, who: t.who, held: true } : f
						})
						setRt({ people: r.data.people, faces, verdict: r.data.verdict, at, ms: at - t0, frame: r.data.frame, server: r.data.timings })
					} else { setRt({ error: r.data.message || r.data.verdict?.text, at: Date.now() }); fails++ }
				} catch (e) { fails++; setRt({ error: e.response?.data?.message || e.message, at: Date.now() }) }
				await new Promise(r => setTimeout(r, fails ? Math.min(5000, 800 * fails) : 250))
			}
		}
		lane(0); lane(250)
		return () => { stop = true }
	}, [running, rtOn, camera, student])

	useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [running])

	const reset = () => { setRt(null); setRes(null); setLog([]); setStats({ cycles: 0, ms: 0, seen: {} }) }
	const cam = cameras.find(c => c._id === camera)
	const rtFresh = rt && !rt.error && now - rt.at < 3000
	const v = res?.verdict
	const verdictCls = v?.status === 'found' ? 'border-green-300 bg-green-50 text-green-800' : v?.status === 'not_found' || v?.status === 'no_faces' ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-800'
	const seenList = Object.entries(stats.seen).sort((a, b) => b[1] - a[1])

	return (
		<div className="space-y-4 p-4 md:p-6">
			<div>
				<Link to=".." relative="path" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"><FiArrowLeft /> {tx("Yuz tanish")}</Link>
				<h1 className="text-xl font-bold text-gray-900">{tx("Jonli yuz tanish sinovi")}</h1>
				<p className="max-w-4xl text-sm text-gray-500">{tx("Chapda kameraning jonli videosi, o'ngda yuz tanish natijasi. Kadr Hik-Connect bulutidan ~10–15 soniyada olinadi, shuning uchun natija videodan shuncha orqada. Hech narsa saqlanmaydi.")}</p>
			</div>

			<div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_1fr_auto_auto]">
				<label className="text-sm">
					<span className="mb-1 block text-gray-600">{tx("Kamera")}</span>
					<select value={camera} onChange={e => { setCamera(e.target.value); reset() }} className="w-full rounded-lg border border-gray-300 px-3 py-2">
						{cameras.map(c => <option key={c._id} value={c._id}>{c.name}{c.sinf ? ` · ${c.sinf}` : ''}</option>)}
					</select>
				</label>
				<div className="relative text-sm">
					<span className="mb-1 block text-gray-600">{tx("Kimni izlaymiz")}</span>
					{student ? (
						<div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-3 py-2">
							<span><b>{student.fullName}</b> · {student.sinf} · {tx("{{n}} ta rasm", { n: student.templates })}</span>
							<button type="button" onClick={() => { setStudent(null); reset() }} className="text-gray-500 hover:text-gray-800">✕</button>
						</div>
					) : (
						<>
							<div className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2"><FiSearch className="text-gray-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={tx("Butun sinf (yoki ism / ID yozing)")} className="w-full outline-none" /></div>
							{found.length > 0 && (
								<ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
									{found.map(s => <li key={s._id}><button type="button" onClick={() => { setStudent(s); setFound([]); reset() }} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50"><span>{s.fullName} · {s.sinf} · {s.idNumber}</span><span className={`text-xs ${s.templates ? 'text-green-600' : 'text-red-500'}`}>{tx("{{n}} ta rasm", { n: s.templates })}</span></button></li>)}
								</ul>
							)}
						</>
					)}
				</div>
				<div className="flex flex-col items-start justify-end gap-1 text-xs text-gray-700">
					<label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={rtOn} onChange={e => setRtOn(e.target.checked)} /> {tx("Real vaqt (videodan, tez, kichik yuzlar tanilmasligi mumkin)")}</label>
					<label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} /> {tx("Aniq tahlil (Hik kadri, ~10 s)")}</label>
				</div>
				<div className="flex items-end">
					<button type="button" disabled={!camera} onClick={() => setRunning(r => !r)} className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50 ${running ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
						{running ? <><FiPause /> {tx("To'xtatish")}</> : <><FiPlay /> {tx("Boshlash")}</>}
					</button>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-2">
				<div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
					<p className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> {tx("Jonli video")}{cam ? ` · ${cam.name}` : ''}</p>
					<div className="relative aspect-video overflow-hidden rounded-xl bg-black">
						{camera ? <HikLivePlayer key={camera} cameraId={camera} domId="face-live-player" playerRef={playerRef} /> : null}
						<div className="pointer-events-none absolute inset-0">
							{rtFresh && rt.people?.boxes.map((b, i) => (
								<div key={`p${i}`} className="absolute rounded-sm border border-dashed border-sky-300/80" style={{ left: `${b[0] * 100}%`, top: `${b[1] * 100}%`, width: `${(b[2] - b[0]) * 100}%`, height: `${(b[3] - b[1]) * 100}%` }} />
							))}
							{rtFresh && rt.faces.map(f => {
								const c = f.who || f.decision === 'target' ? '#22c55e' : f.decision === 'weak' ? '#f59e0b' : '#ef4444'
								const label = f.who ? `${f.who.name} ${f.who.score.toFixed(2)}${f.held ? ' ~' : ''}` : f.decision === 'target' ? `${student?.fullName || ''} ${f.own.toFixed(2)}` : `? ${f.bestClass ? f.bestClass.score.toFixed(2) : ''}`
								return (
									<div key={f.n} className="absolute" style={{ left: `${f.box[0] * 100}%`, top: `${f.box[1] * 100}%`, width: `${(f.box[2] - f.box[0]) * 100}%`, height: `${(f.box[3] - f.box[1]) * 100}%`, border: `2px solid ${c}` }}>
										<span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[11px] font-semibold text-white" style={{ background: c }}>{label}</span>
									</div>
								)
							})}
						</div>
					</div>
					{rtOn && running && rtFresh && (
						<div className="mt-2 grid grid-cols-3 gap-2 text-center">
							<div className="rounded-lg bg-sky-50 p-2"><p className="text-xl font-bold text-sky-800">{rt.people ? rt.people.count : '—'}</p><p className="text-[11px] text-sky-700">{tx("Odamlar (kadrda)")}</p></div>
							<div className="rounded-lg bg-gray-50 p-2"><p className="text-xl font-bold text-gray-800">{rt.faces.length}</p><p className="text-[11px] text-gray-600">{tx("Topilgan yuzlar")}</p></div>
							<div className="rounded-lg bg-green-50 p-2"><p className="text-xl font-bold text-green-800">{rt.faces.filter(f => f.who || f.decision === 'target').length}</p><p className="text-[11px] text-green-700">{tx("Tanilgan o'quvchilar")}</p></div>
						</div>
					)}
					{rtOn && running && (
						<p className="mt-1 text-xs text-gray-500">
							{rt?.error ? <span className="text-red-600">{tx("Real vaqt xatosi")}: {tx(rt.error)}</span>
								: rt ? <>{tx("Real vaqt")}: {rt.faces.length} {tx("yuz")} · {rt.ms} ms · {tx("kadr")} {rt.frame?.width}×{rt.frame?.height} · {rt.verdict?.text}</> : tx("Real vaqt: birinchi kadr kutilmoqda...")}
						</p>
					)}
				</div>

				<div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
					<p className="mb-2 flex items-center justify-between text-sm font-semibold text-gray-800">
						<span>{tx("Tanish natijasi")}</span>
						<span className="text-xs font-normal text-gray-500">{busy ? tx("Kadr olinmoqda va tahlil qilinmoqda...") : running ? tx("Keyingi kadr kutilmoqda") : tx("To'xtatilgan")}</span>
					</p>
					<div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100">
						{res?.image ? <img src={res.image} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">{tx("«Boshlash» ni bosing: birinchi natija ~15 soniyada chiqadi")}</div>}
						{busy && <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white">{tx("yangilanmoqda...")}</div>}
					</div>
					{res && <p className="mt-1 text-xs text-gray-500">{hhmmss(log[0]?.at || new Date())} · {res.camera.width}×{res.camera.height} · {tx("Kadr olish")} {(res.timings.capture / 1000).toFixed(1)} s · {tx("Yuz topish")} {(res.timings.detect / 1000).toFixed(1)} s · {tx("Model")}: {res.settings.model}</p>}
				</div>
			</div>

			{v && <div className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-medium ${verdictCls}`}>{v.status === 'found' ? <FiCheckCircle className="mt-0.5 shrink-0" /> : <FiXCircle className="mt-0.5 shrink-0" />}<span>{v.text}</span></div>}

			<div className="grid gap-4 lg:grid-cols-3">
				<div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
					<p className="text-sm font-semibold text-gray-800">{tx("Hisob")}</p>
					<div className="mt-2 grid grid-cols-3 gap-2 text-center">
						<div className="rounded-lg bg-gray-50 p-2"><p className="text-lg font-bold">{stats.cycles}</p><p className="text-[11px] text-gray-500">{tx("Kadrlar")}</p></div>
						<div className="rounded-lg bg-gray-50 p-2"><p className="text-lg font-bold">{stats.cycles ? (stats.ms / stats.cycles / 1000).toFixed(1) : '—'}<span className="text-xs"> s</span></p><p className="text-[11px] text-gray-500">{tx("O'rtacha vaqt")}</p></div>
						<div className="rounded-lg bg-gray-50 p-2"><p className="text-lg font-bold">{seenList.length}</p><p className="text-[11px] text-gray-500">{tx("Tanilgan")}</p></div>
					</div>
					{res?.sinf && <p className="mt-2 text-xs text-gray-500">{tx("Baza")}: {res.sinf.name} — {res.sinf.students} {tx("o'quvchi")}, {res.sinf.templates} {tx("iz")}</p>}
					{seenList.length > 0 && (
						<ul className="mt-2 space-y-1 text-sm">{seenList.map(([n, c]) => <li key={n} className="flex justify-between rounded bg-green-50 px-2 py-1 text-green-800"><span>{n}</span><span className="text-xs">{c} {tx("kadrda")}</span></li>)}</ul>
					)}
				</div>

				<div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:col-span-2">
					<p className="text-sm font-semibold text-gray-800">{tx("Jurnal")}</p>
					{log.length === 0 ? <p className="mt-2 text-sm text-gray-400">{tx("Hali natija yo'q")}</p> : (
						<ul className="mt-2 max-h-64 space-y-1 overflow-auto text-xs">
							{log.map((l, i) => <li key={i} className={`rounded px-2 py-1 ${l.ok ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'}`}><span className="font-mono">{hhmmss(l.at)}</span> · {l.text}</li>)}
						</ul>
					)}
				</div>
			</div>

			{res?.faces?.length > 0 && (
				<div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
					<p className="mb-2 text-sm font-semibold text-gray-800">{tx("Oxirgi kadrdagi yuzlar")}</p>
					<table className="w-full text-left text-xs">
						<thead className="text-gray-500"><tr><th className="py-1 pr-3">№</th><th className="pr-3">{tx("Yuz (px)")}</th><th className="pr-3">{tx("Tiniqlik")}</th><th className="pr-3">{tx("Eng yaqin o'quvchi")}</th><th>{tx("Qaror")}</th></tr></thead>
						<tbody>{res.faces.slice(0, 40).map(f => (
							<tr key={f.n} className="border-t border-gray-100 align-top">
								<td className="py-1 pr-3 font-semibold">{f.n}</td>
								<td className="pr-3">{f.size}</td>
								<td className="pr-3">{f.quality?.sharp}</td>
								<td className="pr-3">{f.bestClass ? `${f.bestClass.name} (${f.bestClass.score.toFixed(2)} / ${f.threshold.toFixed(2)})` : '—'}</td>
								<td>{f.who ? <b className="text-green-700">{f.who.name} ✓</b> : f.decision === 'target' ? <b className="text-green-700">✓</b> : <span className="text-gray-500">{f.reason}</span>}</td>
							</tr>
						))}</tbody>
					</table>
				</div>
			)}
		</div>
	)
}

export default AdminFaceLive
