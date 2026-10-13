const cron = require("node-cron");
const userService = require("../services/user.service");
const hikService = require("../services/hikconnect.service");
const hikEvents = require("../services/hikevents.service");
const vision = require("../services/vision.service");
const reports = require("../services/report.service");
const parents = require("../services/parent.service");
const retention = require("../services/retention.service");
const hikPersons = require("../services/hik.person.service");

// Har bir vazifa uchun: oldingisi tugamagan bo'lsa qayta ishga tushmaydi, xato esa faqat log qilinadi
const guarded = (name, fn) => {
  let running = false;
  return async () => {
    if (running) {
      console.log(`Cron "${name}": oldingi ishga tushish hali tugamadi, o'tkazib yuborildi`);
      return;
    }
    running = true;
    try {
      await fn();
    } catch (err) {
      console.error(`Cron "${name}" xatosi:`, err.message);
    } finally {
      running = false;
    }
  };
};

// Cron job funksiyasi. To'xtatish uchun { stop } qaytaradi (graceful shutdown)
const startCronJobs = () => {
  const tasks = [];

  // Hik-Connect yuz aniqlash hodisalarini olib turadi (FaceControl kameralari bo'lsagina ish qiladi)
  hikEvents.start();

  // Xodim/o'quvchilarni Hik-Connect bulutiga yuborish: qo'shish, yangilash, rasm, o'chirish (navbat — adduser/deleteuser)
  hikPersons.start();

  // Sinfxona kameralarida odamlarni sanash (faqat visionEnabled kameralar)
  vision.start();

  // Aqlli kuzatuv hisobotlarini avtomatik yaratish (kunlik / haftalik, Excel)
  reports.start();

  // Ota-onalar uchun Telegram bot (TELEGRAM_BOT_TOKEN bo'lsa): ro'yxatga olish va kirdi/chiqdi xabarlari
  parents.start().catch((e) => console.log('Ota-onalar boti:', e.message));

  // Har kuni soat 23:59 da ishga tushadi
  tasks.push(cron.schedule("59 23 * * *", guarded("closeLog", async () => {
    console.log("⏰ Cron job ishladi: Loglarni yopayapti...");
    const result = await userService.closeLog();
    console.log("Natija:", result);
  }), {
    timezone: "Asia/Tashkent", // vaqt zonasi
  }));

  // Kalitlari kiritilgan maktablarning Hik-Connect kameralari holatini har 5 daqiqada bulutdan yangilaydi
  tasks.push(cron.schedule("*/5 * * * *", guarded("hikSync", () => hikService.syncAll())));

  // Har kuni 03:30 da: saqlash muddati o'tgan isbot rasmlari/lavhalari va eski kamera hodisalarini o'chirish (muddatlar platforma sozlamalarida)
  tasks.push(cron.schedule("30 3 * * *", guarded("retention", async () => {
    const r = await retention.run();
    if (r.success) console.log(`Saqlash muddati: ${r.events.alerts + r.events.samples + r.events.events} hodisa, ${r.files} fayl (${Math.round(r.bytes / 1048576)} MB), ${r.metrics} o'lchov o'chirildi${r.more ? " (yana bor, ertaga davom etadi)" : ""}`);
  }), { timezone: "Asia/Tashkent" }));

  // Ota-onalar boti: "kelmadi" xabari (5 daqiqa), tinch soat xabarlarini yuborish (1 daqiqa), haftalik xulosa (yakshanba 19:00)
  tasks.push(...parents.scheduleJobs(cron));

  return {
    stop() {
      for (const t of tasks) { try { t.stop(); } catch { /* ignore */ } }
      for (const svc of [hikEvents, vision, reports, parents, hikPersons]) { try { svc.stop && svc.stop(); } catch { /* ignore */ } }
    },
  };
};

module.exports = startCronJobs;

