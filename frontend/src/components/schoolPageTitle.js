// Maktab admini panelida navbar sarlavhasi: joriy sahifaning menyudagi nomi (eng uzun mos yo'l)
import { useLocation } from 'react-router-dom'
import { schoolMenuGroups } from './schoolMenu'
import { tx } from '../i18n'

const EXTRA = [
	[/\/profile$/, 'Profil'],
	[/\/users\/[^/]+\/analytics$/, 'Xodim tahlili'],
	[/\/people\/[^/]+\/[^/]+$/, 'Shaxs davomati'],
	[/\/grades\/.+/, 'Umumiy statistika'],
]

export const useSchoolPageTitle = (base) => {
	const { pathname } = useLocation()
	const items = schoolMenuGroups(base).flatMap(g => g.items)
	const hit = items
		.filter(i => pathname === i.path || pathname.startsWith(i.path + '/'))
		.sort((a, b) => b.path.length - a.path.length)[0]
	if (hit && hit.path !== base) return hit.label
	const extra = EXTRA.find(([re]) => re.test(pathname))
	if (extra) return tx(extra[1])
	return hit ? hit.label : tx('Bosh sahifa')
}
