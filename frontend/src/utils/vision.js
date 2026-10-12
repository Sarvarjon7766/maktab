// Aqlli kuzatuv hodisa turlari: muhim ogohlantirishlar (backend/ai/kinds.js bilan bir xil)
export const ALERT_KINDS = ['vision_empty', 'vision_surge', 'vision_overcrowd', 'vision_restless', 'vision_commotion']

// Odam holatlari (skelet bo'yicha, TAXMINIY): kalit, yorliq, rang
export const POSE_ITEMS = [
	['standing', 'Tik turgan', 'bg-red-50 text-red-700'],
	['headDown', 'Boshi egilgan', 'bg-amber-50 text-amber-700'],
	['raised', "Qo'l ko'targan", 'bg-fuchsia-50 text-fuchsia-700'],
	['seated', "O'tirgan", 'bg-green-50 text-green-700'],
	['backTurned', 'Orqasi bilan', 'bg-slate-100 text-slate-600'],
	['sideTurned', 'Yon tomonga', 'bg-slate-100 text-slate-600']
]
