import { Outlet, useLocation } from 'react-router-dom'
import { PanelContext } from '../pages/monitor/monitorKit'

// Monitor sahifalarini bitta maktab (yoki bitta sinf rahbari) rejimida ishlatish. Ma'lumot tokendan aniqlanadi,
// havolalar joriy panel prefiksi bilan (/user, /admin, /viewer, /platform/schools/:id)
const PREFIX = /\/(grades|late|leaves|risk|alerts|trend|people)(\/.*)?$/

// Maktab paneli: butun maktab (/api/school-stats)
export const SchoolStatsProvider = ({ children }) => {
	const { pathname } = useLocation()
	return <PanelContext.Provider value={{ api: 'school-stats', base: pathname.replace(PREFIX, ''), scoped: true }}>{children}</PanelContext.Provider>
}

// O'qituvchi paneli: o'zi va o'z sinflari (/api/viewer-stats)
export const ViewerStatsProvider = ({ children }) => {
	const { pathname } = useLocation()
	return <PanelContext.Provider value={{ api: 'viewer-stats', base: pathname.replace(PREFIX, ''), scoped: true, viewer: true }}>{children}</PanelContext.Provider>
}

export const ViewerStatsShell = () => <ViewerStatsProvider><Outlet /></ViewerStatsProvider>

const SchoolStatsShell = () => <SchoolStatsProvider><Outlet /></SchoolStatsProvider>

export default SchoolStatsShell
