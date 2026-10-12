// Jonli ma'lumot yangilash yordamchilari.
// setVisibleInterval: setInterval o'rniga — brauzer oynasi yashirin (boshqa tab / minimallashgan) bo'lsa so'rov yubormaydi va
// oldingi so'rov hali tugamagan bo'lsa yangisini boshlamaydi (sust tarmoqda so'rovlar uyilib qolmasin). clearInterval bilan to'xtatiladi.
export const setVisibleInterval = (fn, ms) => {
	let busy = false
	return setInterval(async () => {
		if (busy || (typeof document !== 'undefined' && document.hidden)) return
		busy = true
		try { await fn() } catch { /* xatoni chaqiruvchi o'zi ushlaydi */ } finally { busy = false }
	}, ms)
}

// Eskirgan javob himoyasi: sana/filtr almashganda sekin kelgan eski javob yangisini bosib ketmasin.
// const guard = makeGuard(); ... const id = guard.next(); await ...; if (!guard.ok(id)) return
export const makeGuard = () => {
	let n = 0
	return { next: () => ++n, ok: (id) => id === n }
}
