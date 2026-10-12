import { tx } from '../i18n'
import axios from 'axios'
import { useState } from 'react'
import { toast } from 'react-toastify'
import SearchableSelect from './SearchableSelect'

export const statusOf = (c) => (c.inCloud === false ? { text: "Bulutda yo'q", dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-700' }
	: c.online === true ? { text: 'Online', dot: 'bg-green-500', chip: 'bg-green-50 text-green-700' }
		: c.online === false ? { text: 'Offline', dot: 'bg-red-500', chip: 'bg-red-50 text-red-700' }
			: { text: "Noma'lum", dot: 'bg-gray-300', chip: 'bg-gray-100 text-gray-600' })

export const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Hik kamerasining sozlamasi: qaysi sinfga tegishli (ixtiyoriy). Vazifasini (oddiy / FaceControl
// kirish / chiqish) tizim egasi belgilaydi
export const CameraSettings = ({ camera, sinfs, onSaved }) => {
	const [saving, setSaving] = useState(false)
	const save = async (sinfId) => {
		setSaving(true)
		try {
			await axios.put(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras/${camera._id}`, { sinfId }, authHeaders())
			toast.success(sinfId ? 'Kamera sinfga biriktirildi' : 'Sinfdan ajratildi')
			onSaved()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Saqlashda xatolik')
		} finally {
			setSaving(false)
		}
	}
	const toggleVision = async (value) => {
		setSaving(true)
		try {
			await axios.put(`${import.meta.env.VITE_BASE_URL}/api/hik/my-cameras/${camera._id}`, { visionEnabled: value }, authHeaders())
			toast.success(value ? "Odam sanash yoqildi. Birinchi natija 1–2 daqiqada chiqadi" : "Odam sanash o'chirildi")
			onSaved()
		} catch (e) {
			toast.error(e.response?.data?.message || 'Saqlashda xatolik')
		} finally {
			setSaving(false)
		}
	}
	return (
		<div className="space-y-2">
		<div className={saving ? 'pointer-events-none opacity-60' : ''}><span className="text-[11px] text-gray-500">{tx("Sinfxona (ixtiyoriy)")}</span>
					<SearchableSelect variant="outline" icon={false} className="mt-1 w-full" searchPlaceholder={tx("Sinf qidirish...")} value={camera.sinfId || ''} onChange={v => save(v || null)}
						options={[{ value: '', label: 'Umumiy kamera' }, ...sinfs.map(s => ({ value: s._id, label: s.name }))]} />
				</div>
		{camera.sinfId && (camera.role || 'monitor') === 'monitor' && (
			<label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
				<input type="checkbox" className="mt-0.5" disabled={saving} checked={!!camera.visionEnabled} onChange={e => toggleVision(e.target.checked)} />
				<span>{tx("Sinfdagi odamlar sonini sanash")} <span className="text-gray-400">{tx("(yuz tanilmaydi, faqat son; kadr har daqiqada olinadi)")}</span></span>
			</label>
		)}
		</div>
	)
}
