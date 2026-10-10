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
