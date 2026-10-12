import { tx } from '../../i18n'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiSave } from 'react-icons/fi'
import { toast } from 'react-toastify'

const api = axios.create({ baseURL: import.meta.env.VITE_BASE_URL })
const authHeaders = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })

// Login-oldi sahifada (GET /api/config) ko'rinadigan neytral platforma
// nomi/aloqa raqami — avval .env'da qattiq yozilgan edi, endi shu yerdan
// tahrirlanadi (backend/models/platform.settings.model.js — singleton)
const PlatformBranding = () => {
	const [form, setForm] = useState({ platformName: '', supportPhone: '' })
	const [isLoading, setIsLoading] = useState(true)
	const [saving, setSaving] = useState(false)

	useEffect(() => {
		api.get('/api/platform-settings', authHeaders())
			.then(res => {
				if (res.data.success) {
					setForm({
						platformName: res.data.settings.platformName || '',
						supportPhone: res.data.settings.supportPhone || ''
					})
				}
			})
			.catch(() => toast.error("Sozlamalarni yuklashda xatolik"))
			.finally(() => setIsLoading(false))
	}, [])

	const handleSubmit = async (e) => {
		e.preventDefault()
		setSaving(true)
		try {
			const res = await api.put('/api/platform-settings/update', form, authHeaders())
			if (res.data.success) {
				toast.success("Sozlamalar saqlandi")
			} else {
				toast.error(tx(res.data.message || "Xatolik"))
			}
		} catch (error) {
			toast.error(tx(error.response?.data?.message || "Server xatosi"))
		} finally {
			setSaving(false)
		}
	}

	if (isLoading) {
		return <div className="p-6 text-sm text-gray-400">{tx("Yuklanmoqda...")}</div>
	}

	return (
		<div className="md:p-6 bg-gray-50 min-h-full">
			<div className="bg-white rounded-xl shadow p-6 mx-4 md:mx-0 max-w-lg">
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">{tx("Platforma nomi")}</label>
						<input
							type="text"
							value={form.platformName}
							onChange={e => setForm({ ...form, platformName: e.target.value })}
							placeholder={tx("FaceID")}
							className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
							required
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1.5">{tx("Aloqa telefoni")}</label>
						<input
							type="text"
							value={form.supportPhone}
							onChange={e => setForm({ ...form, supportPhone: e.target.value })}
							placeholder="+998 90 123 45 67"
							className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
						/>
					</div>
					<button
						type="submit"
						disabled={saving}
						className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
					>
						<FiSave size={16} />
						{saving ? tx("Saqlanmoqda...") : tx("Saqlash")}
					</button>
				</form>
			</div>
		</div>
	)
}

export default PlatformBranding
