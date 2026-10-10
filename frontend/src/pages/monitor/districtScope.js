import { useSyncExternalStore } from 'react'

// Viloyat monitori tanlagan tuman (sessiya davomida saqlanadi). Tanlangan bo'lsa, monitor sahifalari so'rovlariga
// avtomatik ?district=Nomi qo'shiladi va butun panel shu tuman maktablari bilan cheklanadi ("tumanga kirish").
const KEY = 'monitorDistrict'
let value = ''
try { value = sessionStorage.getItem(KEY) || '' } catch { /* saqlanmasa ham ishlaydi */ }
const subs = new Set()

export const getDistrict = () => value
export const setDistrict = (v) => {
	value = v || ''
	try { if (value) sessionStorage.setItem(KEY, value); else sessionStorage.removeItem(KEY) } catch { /* ixtiyoriy */ }
	subs.forEach((f) => f())
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
export const useDistrict = () => [useSyncExternalStore(subscribe, getDistrict), setDistrict]
