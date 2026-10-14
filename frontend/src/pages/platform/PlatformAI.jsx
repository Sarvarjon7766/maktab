import axios from 'axios'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiRefreshCw, FiRotateCcw, FiSave } from 'react-icons/fi'
import { toast } from 'react-toastify'
import { tx } from '../../i18n'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-black outline-none focus:border-blue-400'

// Maydonlar guruhlari: [kalit, tur, sarlavha, izoh, { min, max, step }]
const GROUPS = () => [
	{
		title: tx('Umumiy'), hint: tx("Sinfxona kameralarini sun'iy intellekt bilan tahlil qilish"),
		fields: [
			['enabled', 'bool', tx("AI tahlilni yoqish"), tx("O'chirilsa, sinfxona kameralaridan kadr olinmaydi va hodisa saqlanmaydi")],
			['intervalSec', 'num', tx("Tahlil oralig'i (soniya)"), tx("Har kamera shuncha soniyada bir tahlil qilinadi. Kamera ko'p bo'lsa, haqiqiy oraliq uzayadi"), { min: 15, max: 3600, step: 5 }],
			['classIntervalSec', 'num', tx("Sinfxona kamerasi oralig'i (s)"), tx("0 = umumiy oraliq. Katta tizimda sinfxonalar uchun 180–300 s tavsiya etiladi"), { min: 0, max: 3600, step: 5 }],
			['gateIntervalSec', 'num', tx("Darvoza kamerasi oralig'i (s)"), tx("0 = umumiy oraliq. Chiqishni aniqlash uchun 15–30 s tavsiya etiladi (Hik kadri ~10 s keladi)"), { min: 0, max: 3600, step: 5 }],
			['hallIntervalSec', 'num', tx("Zal/koridor kamerasi oralig'i (s)"), tx("0 = umumiy oraliq"), { min: 0, max: 3600, step: 5 }],
			['poseEveryN', 'num', tx("Skeletni har N-tahlilda hisoblash"), tx("Skelet qimmat (~1 s). 3–5 qilinsa CPU ancha tejaladi, holatlar (tik turgan, qo'l) sekin o'zgargani uchun zarari kam"), { min: 1, max: 20, step: 1 }],
			['shedLagMs', 'num', tx("Yuklama himoyasi (ms)"), tx("Backend kechikishi (event loop) shundan oshsa, darvozadan boshqa kameralar tahlili vaqtincha to'xtaydi. 0 = o'chiq"), { min: 0, max: 5000, step: 50 }],
			['sampleEveryMin', 'num', tx("Avtomatik namuna oralig'i (daqiqa)"), tx("Hodisa bo'lmasa ham shuncha daqiqada bir tahlil namunasi saqlanadi"), { min: 5, max: 720, step: 5 }],
			['deviceParallel', 'num', tx("Bir vaqtda so'raladigan qurilmalar"), tx("Hik-Connect'ga bir paytda nechta qurilma (NVR) bo'yicha so'rov yuboriladi"), { min: 1, max: 64, step: 1 }],
			['deviceGapSec', 'num', tx("Qurilmadagi so'rovlar orasi (soniya)"), tx("Bir qurilmadagi kameralar orasidagi pauza: bulutga yuklamani kamaytiradi"), { min: 2, max: 120, step: 1 }],
			['emptyMin', 'num', tx("«Sinf bo'sh qoldi» (daqiqa)"), tx("Dars vaqtida sinf shuncha daqiqa bo'sh tursa ogohlantirish chiqadi"), { min: 1, max: 120, step: 1 }]
		]
	},
	{
		title: tx('Odam topish'), hint: tx("Kadrdagi odamlarni topuvchi model (yuz tanilmaydi)"),
		fields: [
			['detectorModel', 'model-detector', tx('Model'), tx("backend/ai/models papkasidagi YOLOX formatidagi .onnx fayllar. Katta model aniqroq, lekin sekinroq")],
			['detectorScore', 'num', tx('Ishonch chegarasi'), tx("Past qiymat ko'proq odam topadi (xato ham ko'payadi), yuqori qiymat ehtiyotkor"), { min: 0.1, max: 0.9, step: 0.05 }],
			['tiled', 'bool', tx("Kadrni bo'laklab tahlil qilish"), tx("Orqa qatordagi mayda odamlarni ham topadi, lekin ~5 baravar sekinroq")]
		]
	},
	{
		title: tx('Holatlar (skelet)'), hint: tx("O'tirgan, tik turgan, orqasi bilan, yon tomonga, boshi egilgan, qo'l ko'targan: taxminiy"),
		fields: [
			['poseEnabled', 'bool', tx('Holatlarni aniqlash'), tx("Dalil rasmlarida holatlar soni hisoblanadi (rasmga chizilmaydi)")],
			['poseLive', 'bool', tx("Har tahlilda hisoblash"), tx("O'chirilsa, holatlar faqat hodisa va namuna paytida hisoblanadi (protsessor tejaladi)")],
			['poseModel', 'model-pose', tx('Model'), tx("Odam skeletini topuvchi .onnx model (RTMPose formatida)")],
			['poseConf', 'num', tx('Nuqta ishonch chegarasi'), tx("Yuqori qiymat kamroq, lekin ishonchliroq nuqtalar"), { min: 0.05, max: 0.9, step: 0.05 }]
		]
	},
	{
		title: tx('Qoidalar'), hint: tx("Ogohlantirish chegaralari"),
		fields: [
			['hallCrowd', 'num', tx("Zal «zich» (odam soni)"), tx("Zal kamerasida alohida son berilmagan bo'lsa shu chegara ishlatiladi"), { min: 5, max: 5000, step: 1 }],
			['restlessAct', 'num', tx("«Notinch» harakat darajasi"), tx("0..1: odamlar o'z joyidan siljish ulushi. Shundan yuqori bo'lsa «Sinf notinch» / «Zalda tartibsizlik»"), { min: 0.2, max: 1, step: 0.05 }],
			['restlessMinPeople', 'num', tx("Notinchlik uchun eng kam odam"), tx("Kadrda shuncha odam bo'lmasa harakat hisobga olinmaydi"), { min: 2, max: 200, step: 1 }]
		]
	},
	{
		title: tx('Yuz tanish'), hint: tx("Sinfxona kameralarida o'quvchilar yuzini tanish (YuNet + SFace). Biometrik ma'lumot: yoqishdan oldin ota-ona roziligi va saqlash qoidalari hal qilingan bo'lishi kerak"),
		fields: [
			['faceEnabled', 'bool', tx("Yuz tanishni yoqish"), tx("Dars soatlarida sinfga biriktirilgan kameralarda. Davomat emas, faqat «ko'rindi» dalili saqlanadi")],
			['faceModel', 'face-model', tx("Yuz izi modeli"), tx("Modelni almashtirgandan keyin «Yuz tanish» sahifasida «Qaytadan olish» ni bosing: suratlar yangi modelda qayta olinadi (kameradan o'rganilgan izlar qaytadan yig'iladi). ArcFace CPU'da ~20 marta sekin")],
			['faceAttendance', 'bool', tx("Yuz tanilganda «kirdi» yozish"), tx("Yuz orqali tanilgan o'quvchiga kuniga bir marta kirish yoziladi (chiqish va «kelmagan» yozilmaydi). Xato tanish noto'g'ri davomatga olib kelishi mumkin: avval kichik sinfda sinab ko'ring. Biometrik ma'lumot va ota-ona roziligi hal qilingan bo'lishi kerak")],
			['faceAttendanceScore', 'num', tx("Davomat uchun o'xshashlik"), tx("Davomatga yozish uchun oddiy chegaradan qattiqroq o'xshashlik"), { min: 0.3, max: 0.95, step: 0.01 }],
			['faceGateScore', 'num', tx("Darvoza kamerasi: o'xshashlik"), tx("Sinfsiz (darvoza, koridor) kamerada davomatga yozish uchun o'xshashlik: sinf taxmini yo'q, shuning uchun qattiqroq"), { min: 0.3, max: 0.95, step: 0.01 }],
			['faceGateHits', 'num', tx("Darvoza kamerasi: kadrlar"), tx("Darvoza kamerasida shuncha kadrda tanilsa yoziladi (odam tez o'tadi, 1 kadr ham yetadi)"), { min: 1, max: 10, step: 1 }],
			['faceAttendanceCooldownMin', 'num', tx("Kirdi/chiqdi orasidagi kutish (daqiqa)"), tx("Bir odamning yuz orqali «kirdi» va «chiqdi» holati orasidagi eng kam vaqt: tebranib ketmasligi uchun"), { min: 0, max: 120, step: 1 }],
			['faceAttendanceMinCoverage', 'num', tx("Sinf bazasi qamrovi"), tx("Sinfda yuz izi bor o'quvchilar ulushi shundan past bo'lsa, avtomatik davomat yozilmaydi (izi yo'q o'quvchining o'xshash sinfdoshi unga adashmasligi uchun)"), { min: 0, max: 1, step: 0.05 }],
			['faceAttendanceHits', 'num', tx("Davomat uchun kadrlar"), tx("Shuncha kadrda tanilgandan keyingina «kirdi» yoziladi"), { min: 1, max: 10, step: 1 }],
			['faceNotifyParents', 'bool', tx("Ota-onaga xabar yuborish"), tx("Yuz orqali yozilgan kirishda ota-onaga Telegram xabari boradi (standart o'chiq: xato tanishda noto'g'ri xabar ketmasligi uchun)")],
			['faceAutoLearn', 'bool', tx("Kameradan avto-o'rganish"), tx("Ishonchli tanilgan yuzlar izi o'quvchiga qo'shiladi (rasm saqlanmaydi)")],
			['faceThreshold', 'num', tx("O'xshashlik chegarasi"), tx("Past qiymat ko'proq taniydi (xato ham ko'payadi). Maktabda real sinovdan keyin sozlang"), { min: 0.2, max: 0.8, step: 0.01 }],
			['faceVoteThreshold', 'num', tx("Sinfni aniqlash chegarasi"), tx("Xona qaysi sinfda ekanini aniqlashda ovoz beradigan yuz uchun (qattiqroq)"), { min: 0.25, max: 0.9, step: 0.01 }],
			['faceMargin', 'num', tx("1- va 2-o'quvchi farqi"), tx("O'xshash o'quvchilarni adashtirmaslik uchun eng kam farq"), { min: 0, max: 0.5, step: 0.01 }],
			['faceMinSize', 'num', tx("Eng kichik yuz (px)"), tx("Shundan kichik yuzlar tanishda hisobga olinmaydi"), { min: 8, max: 200, step: 1 }],
			['faceMinHits', 'num', tx("Tasdiqlash uchun kadrlar"), tx("«Ko'rindi» deb tasdiqlash uchun o'quvchi shuncha kadrda tanilishi kerak"), { min: 1, max: 20, step: 1 }],
			['faceUpscale', 'num', tx("Kadrni kattalashtirish"), tx("Kichik yuzlarni topish uchun (1 = asl, 2 = ikki baravar; sekinroq)"), { min: 1, max: 3, step: 0.5 }]
		]
	},
	{
		title: tx('Telefon nomzodlari'), hint: tx("Ishonchsiz: kitob/daftar ham telefon bo'lib chiqishi mumkin, shuning uchun faqat statistikada"),
		fields: [
			['phoneEnabled', 'bool', tx('Telefon nomzodlarini qidirish'), tx("Dalil rasmini chizishda ~3 soniya qo'shadi")],
			['phoneScore', 'num', tx('Ishonch chegarasi'), '', { min: 0.1, max: 0.9, step: 0.05 }]
		]
	},
	{
		title: tx("Ko'rish modeli (Ollama)"), hint: tx("Hodisaga «AI ikkinchi fikri»: sahnani tayyor variantlardan biri bilan belgilaydi. Ollama alohida o'rnatilgan bo'lishi kerak"),
		fields: [
			['vlmEnabled', 'bool', tx('Yoqish'), tx("CPU'da bitta kadr ~1–2 daqiqa; faqat muhim hodisalar uchun ishlaydi")],
			['ollamaUrl', 'text', tx('Ollama manzili'), 'http://localhost:11434'],
			['vlmModel', 'model-vlm', tx('Model'), tx("Ollama'da yuklangan rasm tushunadigan model (masalan qwen2.5vl:3b)")],
			['vlmGpu', 'bool', tx("GPU'da ishlatish"), tx("GPU yo'q yoki yetarli bo'lmasa o'chiq qoldiring (CPU)")]
		]
	}
]

const Switch = ({ on, onChange }) => (
	<button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-blue-600' : 'bg-slate-300'}`}>
		<span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
	</button>
)

const PlatformAI = () => {
	const [form, setForm] = useState(null)
	const [saved, setSaved] = useState(null)
	const [models, setModels] = useState({ detectors: [], poses: [], vlm: [], vlmError: '' })
	const [busy, setBusy] = useState(false)

	const loadModels = useCallback(async (url) => {
		try { const r = await api.get('/api/platform-settings/ai/models', { ...auth(), params: url ? { ollamaUrl: url } : {} }); setModels(r.data) } catch { /* ro'yxat bo'sh qoladi */ }
	}, [])
	const load = useCallback(async () => {
		try {
			const r = await api.get('/api/platform-settings/ai', auth())
			setForm(r.data.settings); setSaved(r.data.settings); loadModels()
		} catch (e) { toast.error(tx(e.response?.data?.message || 'Server xatosi')) }
	}, [loadModels])
	useEffect(() => { load() }, [load])

	const dirty = useMemo(() => form && saved && Object.keys(form).some(k => form[k] !== saved[k]), [form, saved])
	const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

	const save = async () => {
		setBusy(true)
		try {
			const r = await api.put('/api/platform-settings/ai', form, auth())
			setForm(r.data.settings); setSaved(r.data.settings); toast.success(tx('Sozlamalar saqlandi'))
		} catch (e) { toast.error(tx(e.response?.data?.message || 'Server xatosi')) } finally { setBusy(false) }
	}
	const reset = async () => {
		if (!window.confirm(tx("Hamma AI sozlamalari standart qiymatga qaytarilsinmi?"))) return
		setBusy(true)
		try { const r = await api.delete('/api/platform-settings/ai', auth()); setForm(r.data.settings); setSaved(r.data.settings); toast.success(tx('Standart qiymatlar tiklandi')) } catch (e) { toast.error(tx(e.response?.data?.message || 'Server xatosi')) } finally { setBusy(false) }
	}

	if (!form) return <div className="max-w-4xl animate-pulse rounded-2xl bg-white p-6 shadow-sm"><div className="h-5 w-48 rounded bg-slate-100" /><div className="mt-4 h-64 rounded bg-slate-50" /></div>

	const renderField = ([key, type, label, hint, range]) => {
		const value = form[key]
		let control
		if (type === 'bool') control = <Switch on={!!value} onChange={v => set(key, v)} />
		else if (type === 'num') control = <input type="number" min={range?.min} max={range?.max} step={range?.step} value={value} onChange={e => set(key, e.target.value === '' ? '' : Number(e.target.value))} className={`${inputCls} w-28 text-center`} />
		else if (type === 'face-model') control = (
			<select value={value || 'sface'} onChange={e => set(key, e.target.value)} className={`${inputCls} w-72`}>
				<option value="sface">{tx("SFace (yengil, 128 o'lcham)")}</option>
				<option value="arcface">{tx("ArcFace R100 (kuchli, GPU kerak)")}</option>
			</select>
		)
		else if (type === 'text') control = <input value={value || ''} onChange={e => set(key, e.target.value)} className={`${inputCls} w-72`} />
		else {
			const list = type === 'model-detector' ? models.detectors : type === 'model-pose' ? models.poses : models.vlm
			const options = list.map(m => m.name)
			if (value && !options.includes(value)) options.unshift(value)
			control = (
				<select value={value || ''} onChange={e => set(key, e.target.value)} className={`${inputCls} w-72`}>
					{options.map(o => { const m = list.find(x => x.name === o); return <option key={o} value={o}>{o}{m ? ` · ${m.mb !== undefined ? `${m.mb} MB` : `${m.gb} GB`}` : ''}</option> })}
				</select>
			)
		}
		return (
			<div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
				<div className="min-w-0 flex-1 basis-64"><p className="text-sm font-medium text-slate-900">{label}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
				<div className="flex items-center gap-2">{control}{type === 'model-vlm' && <button type="button" onClick={() => loadModels(form.ollamaUrl)} title={tx("Ro'yxatni yangilash")} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><FiRefreshCw size={14} /></button>}</div>
			</div>
		)
	}

	return (
		<div className="max-w-4xl space-y-5 pb-20">
			{GROUPS().map(g => (
				<section key={g.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
					<h2 className="text-base font-semibold text-slate-900">{g.title}</h2>
					{g.hint && <p className="mt-1 text-sm text-slate-500">{g.hint}</p>}
					<div className="mt-2 divide-y divide-slate-100">{g.fields.map(renderField)}</div>
					{g.title === tx("Ko'rish modeli (Ollama)") && models.vlmError && form.vlmEnabled && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{tx(models.vlmError)}</p>}
				</section>
			))}
			<div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
				{dirty && <span className="mr-auto text-xs font-medium text-amber-600">{tx("Saqlanmagan o'zgarishlar bor")}</span>}
				<button onClick={reset} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRotateCcw size={14} /> {tx('Standartga qaytarish')}</button>
				<button onClick={save} disabled={!dirty || busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"><FiSave size={14} /> {busy ? tx('Saqlanmoqda...') : tx('Saqlash')}</button>
			</div>
		</div>
	)
}

export default PlatformAI
