import { useEffect, useMemo, useState } from 'react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

// Katta ro'yxatlar (maktabda 2000 tagacha o'quvchi) uchun mijoz tomonida sahifalash: DOM kichik qoladi, qidiruv va aylantirish tez ishlaydi.
// Ro'yxat uzunligi o'zgarganda (qidiruv, filtr) 1-sahifaga qaytadi
export const usePaged = (list, size = 50) => {
	const [page, setPage] = useState(1)
	const pages = Math.max(1, Math.ceil(list.length / size))
	useEffect(() => { setPage(1) }, [list.length, size])
	const current = Math.min(page, pages)
	const items = useMemo(() => list.slice((current - 1) * size, current * size), [list, current, size])
	return { page: current, setPage, pages, items, total: list.length, size, offset: (current - 1) * size }
}

const range = (page, pages) => {
	const set = new Set([1, pages, page - 1, page, page + 1])
	const arr = [...set].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)
	return arr.flatMap((n, i) => (i && n - arr[i - 1] > 1 ? ['…', n] : [n]))
}

export const ListPager = ({ page, pages, total, size, setPage, className = '' }) => {
	if (pages <= 1) return null
	const from = (page - 1) * size + 1, to = Math.min(page * size, total)
	return (
		<div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-gray-600 ${className}`}>
			<span>{from}–{to} / {total} ta</span>
			<div className="flex items-center gap-1">
				<button onClick={() => setPage(page - 1)} disabled={page <= 1} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Oldingi"><FiChevronLeft size={14} /></button>
				{range(page, pages).map((n, i) => n === '…' ? <span key={`d${i}`} className="px-1 text-gray-400">…</span> : (
					<button key={n} onClick={() => setPage(n)} className={`h-8 min-w-8 rounded-lg border px-2 ${n === page ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 hover:bg-gray-50'}`}>{n}</button>
				))}
				<button onClick={() => setPage(page + 1)} disabled={page >= pages} className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40" aria-label="Keyingi"><FiChevronRight size={14} /></button>
			</div>
		</div>
	)
}
