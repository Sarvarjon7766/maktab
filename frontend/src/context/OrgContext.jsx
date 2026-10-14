import { createContext, useContext, useEffect, useState } from 'react'
import axios from 'axios'

const DEFAULT_ORG = {
  orgName: 'School Supervision',
  phone: '',
  region: '',
  district: '',
  itCenter: '',
  logoPath: null,
  // true = login-oldi / superadmin (hali biror maktabga bog'lanmagan) —
  // shu holatda faqat platforma nomi ko'rsatiladi, maktab brendi emas
  isPlatform: true
}

const OrgContext = createContext({ ...DEFAULT_ORG, refresh: () => {} })

export function OrgProvider({ children }) {
  const [org, setOrg] = useState(DEFAULT_ORG)
  // Server rejimi (district | region): /api/config dan bir marta olinadi; sahifalar (masalan federatsiya) shunga qarab ko'rinadi
  const [mode, setMode] = useState('district')
  useEffect(() => { axios.get(`${import.meta.env.VITE_BASE_URL}/api/config`).then(r => { if (r.data?.mode) setMode(r.data.mode) }).catch(() => { }) }, [])

  // Login-oldi: GET /api/config (neytral platforma nomi).
  // Login-keyingi: GET /api/school/me (joriy foydalanuvchining maktabi) —
  // superadmin uchun ham bo'sh qaytadi (schoolId yo'q), shu holda platforma
  // nomida qoladi.
  const refresh = async () => {
    const token = localStorage.getItem('token')
    try {
      if (!token) {
        const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/config`)
        const next = { ...DEFAULT_ORG, orgName: res.data.platformName || DEFAULT_ORG.orgName, phone: res.data.supportPhone || '' }
        setOrg(next)
        document.title = next.orgName
        return
      }

      const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/school/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const school = res.data?.school
      if (school) {
        const next = {
          orgName: school.name,
          phone: school.phone || '',
          region: school.region || '',
          district: school.district || '',
          itCenter: school.itCenter || '',
          logoPath: school.logoPath || null,
          isPlatform: false
        }
        setOrg(next)
        document.title = next.orgName
      } else {
        // superadmin — biror maktabga bog'lanmagan
        setOrg(DEFAULT_ORG)
        document.title = DEFAULT_ORG.orgName
      }
    } catch {
      // tarmoq xatosida oldingi holatni saqlab qolamiz
    }
  }

  useEffect(() => { refresh() }, [])

  return <OrgContext.Provider value={{ ...org, mode, refresh }}>{children}</OrgContext.Provider>
}

export const useOrg = () => useContext(OrgContext)

