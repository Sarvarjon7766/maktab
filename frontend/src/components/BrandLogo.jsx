// Tizim logotipi (public/logo-256.png) — shaffof fonli. Qorong'i panellarda to'q ko'k yozuv yaxshi ko'rinishi uchun
// atrofida yengil oq nur (glow) bor; och fonda glow=false qiling. tile=true — oq plitka ustida.
const GLOW = '[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.95))_drop-shadow(0_0_5px_rgba(255,255,255,0.45))]'

const BrandLogo = ({ className = '', glow = true, tile = false, alt = 'School Supervision' }) => (
	<img src="/logo-256.png" alt={alt} draggable={false} className={`object-contain ${tile ? 'bg-white p-0.5' : ''} ${glow && !tile ? GLOW : ''} ${className}`} />
)

export default BrandLogo
