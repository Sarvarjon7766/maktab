import { resetMonitorLevel } from '../pages/monitor/monitorLevel'

// Sessiyani to'liq tozalash (logout / 401). Electron tokeni tozalanishini kutadi.
export const clearSession = async () => {
	try { localStorage.clear() } catch { /* ixtiyoriy */ }
	try { sessionStorage.clear() } catch { /* ixtiyoriy */ }
	resetMonitorLevel()
	try {
		if (window.electronAPI) await window.electronAPI.clearToken()
	} catch { /* ixtiyoriy */ }
}
