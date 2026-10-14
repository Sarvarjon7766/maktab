import { toast } from 'react-toastify'

// Bir xil xabar ketma-ket chiqmasin (polling/qayta so'rov xatolari ustma-ust yig'ilmasin): matn bo'yicha toastId beriladi
let patched = false
let staleUntil = 0
// Boshqa sahifada boshlangan so'rov xato bilan tugasa, uning catch'idagi xato xabari ko'rsatilmaydi (foydalanuvchi allaqachon boshqa joyda)
export const markStaleFailure = () => { staleUntil = Date.now() + 80 }
export const setupToasts = () => {
	if (patched) return
	patched = true
	for (const kind of ['success', 'error', 'info', 'warn', 'warning']) {
		const orig = toast[kind]
		if (typeof orig !== 'function') continue
		toast[kind] = (content, opts) => {
			if ((kind === 'error' || kind === 'warn' || kind === 'warning') && Date.now() < staleUntil) return null
			if (typeof content === 'string' && !(opts && opts.toastId)) return orig(content, { ...opts, toastId: `${kind}:${content}` })
			return orig(content, opts)
		}
	}
}
