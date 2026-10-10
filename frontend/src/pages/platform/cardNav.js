// Butun kartani bosiladigan qilish: ichidagi a/button/input/select bosilsa karta navigatsiya qilmaydi
export const cardNav = (navigate, to, extraClass = '') => ({
	role: 'link',
	tabIndex: 0,
	onClick: (e) => { if (e.target.closest('a,button,input,select,label')) return; navigate(to) },
	onKeyDown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) navigate(to) },
	className: `cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${extraClass}`
})
