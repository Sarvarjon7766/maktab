import axios from 'axios'
import { toast } from 'react-toastify'
import { getLang, tm } from './index'

// Barcha so'rovlarga til sarlavhasi (server Excel va xabarlarni shu tilda tayyorlaydi)
axios.defaults.headers.common['Accept-Language'] = getLang()

// Toast xabarlari (jumladan serverdan kelgan o'zbekcha matnlar) tanlangan tilga o'giriladi
for (const kind of ['success', 'error', 'warn', 'warning', 'info']) {
	const original = toast[kind]
	if (typeof original !== 'function') continue
	toast[kind] = (content, options) => original(tm(content), options)
}
const base = toast
export default base
