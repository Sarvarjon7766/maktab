require('dotenv').config({ path: 'C:/Users/AKTRM/AppData/Local/Temp/claude/e--Maktab/b1d8504c-0ff0-47ce-a097-0105be4026c7/scratchpad/sbx13/faceid/backend/.env' })
const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const dayjs = require('dayjs')
const timezone = require('dayjs/plugin/timezone')
const utc = require('dayjs/plugin/utc')
dayjs.extend(utc)
dayjs.extend(timezone)

process.chdir('C:/Users/AKTRM/AppData/Local/Temp/claude/e--Maktab/b1d8504c-0ff0-47ce-a097-0105be4026c7/scratchpad/sbx13/faceid/backend')

async function main() {
  await mongoose.connect(process.env.MONGO_URI || process.env.DB_URI)

  const School = require('./models/school.model')
  const User = require('./models/user.model')
  const Sinf = require('./models/sinf.model')
  const Attendance = require('./models/attandance.model')
  const AttendanceLog = require('./models/attandance.log.model')

  const school = await School.create({
    name: 'QA Dashboard Maktabi',
    code: 'qa-dashboard-school',
    region: 'Toshkent viloyati',
    district: 'Chilonzor tumani',
    phone: '+998901234567',
    itCenter: 'Test IT markazi',
  })
  console.log('School:', school._id.toString())

  const hash = await bcrypt.hash('TestPass123!', 10)

  const moderator = await User.create({
    schoolId: school._id,
    fullName: 'QA Moderator',
    position: 'Maktab administratori',
    role: 'user',
    username: 'qa_dashboard_moderator',
    password: hash,
    isActive: true,
  })
  moderator.hodimID = moderator._id.toString()
  await moderator.save()
  console.log('Moderator: qa_dashboard_moderator / TestPass123!')

  const sinfA = await Sinf.create({ schoolId: school._id, name: '5-A', description: 'Test sinf A' })
  const sinfB = await Sinf.create({ schoolId: school._id, name: '5-B', description: 'Test sinf B' })

  const names = [
    'Aliyev Vali', 'Karimova Nodira', 'Yusupov Sardor', 'Tosheva Malika',
    'Rashidov Bekzod', 'Nazarova Gulnora', 'Ergashev Jasur', 'Saidova Feruza',
  ]
  const sinfs = [sinfA, sinfA, sinfA, sinfA, sinfB, sinfB, sinfB, sinfB]

  const employees = []
  for (let i = 0; i < names.length; i++) {
    const emp = await User.create({
      schoolId: school._id,
      fullName: names[i],
      position: i % 2 === 0 ? "O'qituvchi" : 'Tarbiyachi',
      role: 'viewer',
      sinf: sinfs[i]._id,
      username: `qa_emp_${i + 1}`,
      password: hash,
      isActive: true,
    })
    emp.hodimID = emp._id.toString()
    await emp.save()
    employees.push(emp)
  }
  console.log('Employees created:', employees.length)

  // 35 kunlik davomat tarixi — turli xil holat/kechikish bilan, grafiklar
  // mazmunli chiqishi uchun (hamma kun 100% emas)
  const attendanceDocs = []
  const logDocs = []
  const now = dayjs().tz('Asia/Tashkent')

  for (let dayOffset = 34; dayOffset >= 0; dayOffset--) {
    const day = now.subtract(dayOffset, 'day')
    const dateString = day.format('YYYY-MM-DD')
    const isToday = dayOffset === 0
    const weekday = day.day() // 0=yakshanba,6=shanba

    // Dam olish kunlari (yakshanba) — davomat past bo'lsin (haftalik naqsh uchun)
    const isWeekend = weekday === 0

    employees.forEach((emp, idx) => {
      // Tasodifiy, lekin idx+day bo'yicha takrorlanadigan psevdo-tasodifiylik
      const seed = (dayOffset * 7 + idx * 13) % 10
      const absentChance = isWeekend ? 6 : 1 // dam olish kunida ko'proq yo'q
      const isAbsent = seed < absentChance

      if (isAbsent) return // shu kun uchun Attendance yozuvi yo'q = kelmagan

      const isLate = !isWeekend && seed >= 7 // ba'zan kechikadi
      const checkInHour = isLate ? 9 : 8
      const checkInMinute = isLate ? 15 + (seed % 30) : 40 + (seed % 15)
      const checkIn = day.startOf('day').hour(checkInHour).minute(checkInMinute)

      const isStillIn = isToday && idx % 3 === 0 // bugun ba'zilari hali "ishda"
      const checkOut = isStillIn ? null : day.startOf('day').hour(17).minute(30 + (seed % 20))

      const workHours = checkOut ? (checkOut.diff(checkIn, 'minute') / 60) : 0
      const totalH = Math.floor(workHours)
      const totalM = Math.round((workHours - totalH) * 60)

      attendanceDocs.push({
        schoolId: school._id,
        user: emp._id,
        date: checkIn.toDate(),
        dateString,
        status: isStillIn ? 'ishda' : 'tashqarida',
        totalTime: isStillIn ? '0:00' : `${totalH}:${String(totalM).padStart(2, '0')}`,
        totalEntries: 1,
      })

      // MUHIM: haqiqiy tizimda (attandance.service.js) bitta AttendanceLog
      // hujjati kirish PAYTIDA yaratiladi (checkInTime bilan), keyin chiqish
      // PAYTIDA O'SHA HUJJAT findOneAndUpdate orqali yangilanadi (checkOutTime
      // qo'shiladi) — ikkita alohida hujjat EMAS. LogStatistiks xuddi shu
      // shaklni kutadi (checkInTime+checkOutTime bitta hujjatda).
      logDocs.push({
        schoolId: school._id,
        user: emp._id,
        date: checkOut ? checkOut.toDate() : checkIn.toDate(),
        dateString,
        checkin: true,
        checkout: !!checkOut,
        checkInTime: checkIn.toDate(),
        checkOutTime: checkOut ? checkOut.toDate() : null,
        createdAt: checkIn.toDate(),
      })
    })
  }

  await Attendance.insertMany(attendanceDocs)
  await AttendanceLog.insertMany(logDocs)
  console.log('Attendance docs:', attendanceDocs.length, '| Log docs:', logDocs.length)

  // Bugungi so'nggi bir necha hodisani HOZIRGI vaqtga yaqinlashtirish —
  // jonli oqim (live-feed) va avto-yangilanish sinovi uchun
  const recentLogs = await AttendanceLog.find({ schoolId: school._id, dateString: now.format('YYYY-MM-DD') })
    .sort({ createdAt: -1 })
    .limit(3)
  for (const log of recentLogs) {
    const t = dayjs().subtract(Math.floor(Math.random() * 5), 'minute').toDate()
    log.createdAt = t
    if (log.checkin) log.checkInTime = t
    if (log.checkout) log.checkOutTime = t
    await log.save()
  }
  console.log('Recent live-feed events refreshed:', recentLogs.length)

  console.log('\n--- QA TEST DATA READY ---')
  console.log('School ID:', school._id.toString())
  console.log('Login: qa_dashboard_moderator / TestPass123!')

  await mongoose.disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
