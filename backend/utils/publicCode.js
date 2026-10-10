// Xodimning hodimID si Mongo _id bilan bir xil (24 belgili hex) — uni foydalanuvchiga ko'rsatmaymiz.
// Haqiqiy inson o'qiydigan kod (masalan o'quvchi ID raqami) o'zgarishsiz qaytadi.
const MONGO_ID = /^[a-f0-9]{24}$/i
const publicCode = (v) => (v && !MONGO_ID.test(String(v)) ? v : null)
module.exports = { publicCode }
