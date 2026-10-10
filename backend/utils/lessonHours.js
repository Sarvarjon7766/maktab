// Dars soatlari (Toshkent vaqti): sinfxona tahlili va avtomatik kuzatuv shu oraliqda "dars vaqti" deb hisoblaydi.
// Ikkinchi smena ham bor, shuning uchun standart 08:00-18:00. Sozlash: VISION_LESSON_START / VISION_LESSON_END
const LESSON_START = Number(process.env.VISION_LESSON_START) || 8
const LESSON_END = Number(process.env.VISION_LESSON_END) || 18
module.exports = { LESSON_START, LESSON_END }
