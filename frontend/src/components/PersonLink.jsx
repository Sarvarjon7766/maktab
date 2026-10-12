import { Link } from 'react-router-dom'
import useSchoolBase from './useSchoolBase'

// Xodim/o'quvchi qatorini uning to'liq "davomat" sahifasiga (kalendar, kirish-chiqishlar, statistika) bog'laydi.
// Maktab admini va o'rinbosari ikkala turni, sinf rahbari (viewer) faqat o'z o'quvchilarini ochadi; boshqa panelda oddiy blok.
const PersonLink = ({ kind, id, className = '', children }) => {
	const base = useSchoolBase()
	const ok = id && (base === '/user' || base === '/admin' || (base === '/viewer' && kind === 'student'))
	if (!ok) return <div className={className}>{children}</div>
	return <Link to={`${base}/people/${kind}/${id}`} title="To'liq davomat sahifasi" className={`${className} rounded-lg transition-opacity hover:opacity-75`}>{children}</Link>
}

export default PersonLink
