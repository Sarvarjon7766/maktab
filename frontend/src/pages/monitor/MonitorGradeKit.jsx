import { FiChevronRight } from 'react-icons/fi'
import { Link, useSearchParams } from 'react-router-dom'
import { fmt, shiftDate, todayStr } from './monitorKit'

export const barColor = (p, avg) => (p === null || p === undefined ? '#e5e7eb' : p >= avg + 2 ? '#16a34a' : p <= avg - 2 ? '#dc2626' : '#2563eb')
export const tone = (p, avg) => (p === null || p === undefined ? 'text-gray-300' : p >= avg + 2 ? 'text-green-600' : p <= avg - 2 ? 'text-red-600' : 'text-gray-900')

// Tanlangan davr URL'da saqlanadi (?from=&to=), shunda sahifadan sahifaga o'tganda o'zgarmaydi
export const useGradeRange = () => {
	const [params, setParams] = useSearchParams()
	const range = { from: params.get('from') || shiftDate(todayStr(), -29), to: params.get('to') || todayStr() }
	const qs = `?from=${range.from}&to=${range.to}`
	const setRange = (r) => { const n = new URLSearchParams(params); n.set('from', r.from); n.set('to', r.to); setParams(n, { replace: true }) }
	return { range, setRange, qs }
}

// Raqam qanday hisoblangani: kelgan kunlar / mumkin bo'lgan kunlar
export const Formula = ({ present, possible, note }) => (
	<div className="rounded-xl bg-white border border-gray-100 shadow-sm px-4 py-3 text-sm text-gray-600">
		<span className="font-medium text-gray-800">Davomat</span> = kelgan kunlar ÷ mumkin bo'lgan kunlar = <b className="text-gray-900">{fmt(present)}</b> ÷ <b className="text-gray-900">{fmt(possible)}</b>{note && <span className="text-gray-400"> ({note})</span>}
	</div>
)

export const Crumbs = ({ items }) => (
	<nav className="flex flex-wrap items-center gap-1.5 text-sm text-gray-500 mb-4">
		{items.map((it, i) => (
			<span key={i} className="inline-flex items-center gap-1.5">
				{i > 0 && <FiChevronRight size={14} />}
				{it.to ? <Link to={it.to} className="hover:text-blue-600">{it.label}</Link> : <span className="font-semibold text-gray-900">{it.label}</span>}
			</span>
		))}
	</nav>
)

export const Kpi = ({ label, value, sub, cls = 'text-gray-900', to }) => {
	const body = (
	<div className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 h-full ${to ? 'hover:border-blue-200 hover:shadow-md transition' : ''}`}><p className="text-xs text-gray-500">{label}</p><p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>{sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}</div>
	)
	return to ? <Link to={to} className="block">{body}</Link> : body
}
