import { useLocation } from 'react-router-dom'

// Joriy panel prefiksi: /admin, /user, /leader, /viewer yoki /platform/schools/:id.
// Umumiy sahifalar (bir nechta rolda ishlatiladigan) kartochkalardan to'g'ri yo'lga o'tishi uchun.
const useSchoolBase = () => {
	const { pathname } = useLocation()
	const m = pathname.match(/^\/platform\/schools\/[^/]+/) || pathname.match(/^\/(admin|user|leader|viewer|monitor)/)
	return m ? m[0] : '/admin'
}

export default useSchoolBase
