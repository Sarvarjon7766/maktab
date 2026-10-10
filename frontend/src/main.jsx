import { StrictMode } from 'react'
import { createRoot } from "react-dom/client"
import { initI18n } from './i18n'
import './i18n/setup'
import "./index.css"
import './api/authInterceptor'
import { preloadLogo } from './utils/brandLogo'

preloadLogo()

// Avval tarjima lug'ati yuklanadi, so'ng ilova modullari import qilinadi: modul darajasidagi tx("...") chaqiruvlari
// ham tanlangan tilda hisoblanishi uchun. Til almashganda sahifa qayta yuklanadi.
const start = async () => {
  await initI18n()
  const [{ default: App }, { OrgProvider }, { default: ErrorBoundary }] = await Promise.all([
    import("./App.jsx"),
    import('./context/OrgContext'),
    import('./components/ErrorBoundary')
  ])
  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <OrgProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </OrgProvider>
    </StrictMode>
  )
}
start()
