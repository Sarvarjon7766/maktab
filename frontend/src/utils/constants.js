// Xodim/qorovul admin panelidan qo'lda kirish-chiqish belgilaganda (kamera
// hodisasi orqali emas) `checkInAttendance`ga yuboriladigan tekshiruv nuqtasi
// (checkpoint/post) identifikatori. '0' — haqiqiy kamera checkpoint raqamlari
// (1, 2, 3, ...) bilan to'qnashmasligi uchun tanlangan. Barcha qo'lda-belgilash
// ekranlarida (AdminUserEntryExit, AdminEntryExit, PostUsers) bir xil qiymat
// ishlatiladi.
export const MANUAL_ENTRY_CHECKPOINT_ID = '0'


// Eski nom (qo'lda kirish-chiqish ekranlari uchun): MANUAL_ENTRY_CHECKPOINT_ID bilan bir xil
export const MANUAL_ENTRY_POST_ID = MANUAL_ENTRY_CHECKPOINT_ID
