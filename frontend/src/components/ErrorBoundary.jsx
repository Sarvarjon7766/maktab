import PageLoader from './PageLoader'
import { Component, Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { tx } from '../i18n'

// Kutilmagan render xatosi butun ilovani oq ekranga aylantirmasligi uchun.
// resetKey o'zgarganda (masalan marshrut almashganda) xato holati tozalanadi.
class ErrorBoundary extends Component {
	state = { error: null }

	static getDerivedStateFromError(error) {
		return { error }
	}

	componentDidUpdate(prevProps) {
		if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
			this.setState({ error: null })
		}
	}

	componentDidCatch(error, info) {
		console.error('ErrorBoundary:', error, info?.componentStack)
	}

	render() {
		if (!this.state.error) return this.props.children
		return (
			<div className="flex flex-col items-center justify-center py-16 px-4 gap-4 text-center">
				<p className="text-lg font-semibold text-slate-800">{tx("Kutilmagan xatolik yuz berdi")}</p>
				{import.meta.env.DEV && (
					<pre className="max-w-full overflow-auto text-xs text-red-600 bg-red-50 rounded-lg p-3">
						{String(this.state.error?.message || this.state.error)}
					</pre>
				)}
				<div className="flex gap-3">
					<button onClick={() => window.location.reload()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">{tx("Qayta yuklash")}</button>
					<a href="/" className="px-5 py-2.5 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">{tx("Bosh sahifaga")}</a>
				</div>
			</div>
		)
	}
}

export const OutletBoundary = () => {
	const { pathname } = useLocation()
	return (
		<ErrorBoundary resetKey={pathname}>
			<Suspense fallback={<PageLoader />}>
				<Outlet />
			</Suspense>
		</ErrorBoundary>
	)
}

export default ErrorBoundary
