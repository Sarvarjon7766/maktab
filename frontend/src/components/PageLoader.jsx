// Sahifa yuklanayotganda: logotip va aylanuvchi indikator
import BrandLogo from './BrandLogo'

const PageLoader = () => (
	<div className="flex h-64 flex-col items-center justify-center gap-4">
		<BrandLogo glow={false} className="h-16 w-16 animate-pulse" />
		<div className="h-6 w-6 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
	</div>
)

export default PageLoader
