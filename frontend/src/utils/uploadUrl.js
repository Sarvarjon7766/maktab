// /uploads rasmlari himoyalangan: <img> sarlavha yubora olmagani uchun kirish tokeni `?t=` bilan beriladi.
// file — uploads ichidagi fayl nomi (yoki "/uploads/nom")
export const uploadUrl = (file) => {
	let token = ''
	try { token = localStorage.getItem('token') || '' } catch { /* brauzer xotirasi yopiq */ }
	const name = String(file || '').replace(/^\/?uploads\//, '')
	return `${import.meta.env.VITE_BASE_URL}/uploads/${name}${token ? `?t=${encodeURIComponent(token)}` : ''}`
}
