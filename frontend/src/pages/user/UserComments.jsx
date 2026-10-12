import axios from 'axios'
import { useEffect, useState } from 'react'
import { FiAlertCircle, FiCheckCircle, FiX } from 'react-icons/fi'
import { toast } from 'react-toastify'
import GlobalCommentModal, { typeColor, typeLabel } from '../../components/GlobalCommentModal'
import { getTashkentDateString } from '../../utils/formatDate'

const STUDENT_TYPES = { kasallik: 'Kasallik', oilaviy: 'Oilaviy sabab', musobaqa: 'Musobaqa / tadbir', boshqa: 'Boshqa sabab' }
const STUDENT_TYPE_COLORS = { kasallik: 'bg-orange-50 text-orange-700', oilaviy: 'bg-violet-50 text-violet-700', musobaqa: 'bg-blue-50 text-blue-700', boshqa: 'bg-gray-100 text-gray-700' }

const UserComments = () => {
  const token = localStorage.getItem('token')
  const [users, setUsers] = useState([])
  const [allComments, setAllComments] = useState([])
  const [students, setStudents] = useState([])
  const [studentExcuses, setStudentExcuses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [personType, setPersonType] = useState('employee')
  const [modal, setModal] = useState(null) // { employeeId, employeeName, existing? }
  const [studentModal, setStudentModal] = useState(false)
  const [studentSaving, setStudentSaving] = useState(false)
  const [studentForm, setStudentForm] = useState({ studentId: '', type: 'kasallik', startDate: getTashkentDateString(), endDate: '', comment: '' })
  const [deletingId, setDeletingId] = useState(null)
  const [closingId, setClosingId] = useState(null)
  const [tab, setTab] = useState('active') // 'active' | 'all'
  // confirmModal: null | { type: 'close'|'delete', id, name }
  const [confirmModal, setConfirmModal] = useState(null)

  const headers = { Authorization: `Bearer ${token}` }

  const fetchData = async () => {
    setLoading(true)
    try {
      const [usersRes, commentsRes, studentsRes, excusesRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, { headers }),
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/comment/map`, { headers }),
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/student/getAll`, { headers }),
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/student/excuse/all`, { headers }),
      ])
      if (usersRes.data.success) setUsers(usersRes.data.users)
      if (commentsRes.data.success) setAllComments(Object.values(commentsRes.data.data))
      if (studentsRes.data.success) setStudents(studentsRes.data.students)
      if (excusesRes.data.success) setStudentExcuses(excusesRes.data.excuses)
    } catch {
      toast.error("Ma'lumotlarni yuklashda xato")
    } finally {
      setLoading(false)
    }
  }

  // Barcha kommentlar ro'yxati uchun alohida so'rov
  const [historyComments, setHistoryComments] = useState([])
  const fetchHistory = async () => {
    try {
      const [usersRes, excusesRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/user/getAll`, { headers }),
        axios.get(`${import.meta.env.VITE_BASE_URL}/api/student/excuse/all`, { headers }),
      ])
      if (!usersRes.data.success) return
      if (excusesRes.data.success) setStudentExcuses(excusesRes.data.excuses)
      const all = []
      await Promise.all(usersRes.data.users.map(async u => {
        try {
          const res = await axios.get(`${import.meta.env.VITE_BASE_URL}/api/comment/employee/${u._id}`, { headers })
          if (res.data.success) {
            res.data.data.forEach(c => all.push({ ...c, employeeName: u.fullName, employeePosition: u.position }))
          }
        } catch { /* skip */ }
      }))
      all.sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
      setHistoryComments(all)
    } catch { /* skip */ }
  }

  useEffect(() => { fetchData() }, [])
  useEffect(() => { if (tab === 'all') fetchHistory() }, [tab])

  const handleClose = (id, employeeName, scope = 'employee') => {
    setConfirmModal({ type: 'close', id, name: employeeName, scope })
  }

  const handleDelete = (id, employeeName = '', scope = 'employee') => {
    setConfirmModal({ type: 'delete', id, name: employeeName, scope })
  }

  const confirmAction = async () => {
    if (!confirmModal) return
    const { type, id, scope = 'employee' } = confirmModal
    setConfirmModal(null)
    if (type === 'close') {
      setClosingId(id)
      try {
        const path = scope === 'student' ? `/api/student/excuse/${id}/close` : `/api/comment/${id}/close`
        await axios.put(`${import.meta.env.VITE_BASE_URL}${path}`, {}, { headers })
        toast.success(scope === 'student' ? "O'quvchi qaytdi deb belgilandi" : "Xodim qaytdi deb belgilandi")
        await fetchData()
        if (tab === 'all') await fetchHistory()
      } catch (err) { toast.error(err.response?.data?.message || "Xatolik") }
      finally { setClosingId(null) }
    } else {
      setDeletingId(id)
      try {
        const path = scope === 'student' ? `/api/student/excuse/${id}` : `/api/comment/${id}`
        await axios.delete(`${import.meta.env.VITE_BASE_URL}${path}`, { headers })
        toast.success("O'chirildi")
        await fetchData()
        if (tab === 'all') await fetchHistory()
      } catch (err) { toast.error(err.response?.data?.message || "Xatolik") }
      finally { setDeletingId(null) }
    }
  }

  const today = getTashkentDateString()
  const commentMapById = {}
  allComments.forEach(c => { if (c.employee) commentMapById[c.employee._id || c.employee] = c })

  const filteredUsers = users.filter(u =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.position?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredStudentExcuses = studentExcuses.filter(c =>
    c.studentName?.toLowerCase().includes(search.toLowerCase()) ||
    c.sinfName?.toLowerCase().includes(search.toLowerCase()) ||
    c.comment?.toLowerCase().includes(search.toLowerCase())
  )
  const historyRows = personType === 'employee'
    ? historyComments.map(c => ({ ...c, personName: c.employeeName, subtitle: c.employeePosition }))
    : studentExcuses.map(c => ({ ...c, personName: c.studentName, subtitle: c.sinfName }))
  const filteredHistory = historyRows.filter(c =>
    c.personName?.toLowerCase().includes(search.toLowerCase()) ||
    c.subtitle?.toLowerCase().includes(search.toLowerCase()) ||
    c.comment?.toLowerCase().includes(search.toLowerCase())
  )
  const availableStudents = students.filter(s => s.sinf && !studentExcuses.some(c => c.active && String(c.student?._id) === String(s._id)))

  const openStudentModal = () => {
    setStudentForm({ studentId: '', type: 'kasallik', startDate: getTashkentDateString(), endDate: '', comment: '' })
    setStudentModal(true)
  }

  const saveStudentExcuse = async (e) => {
    e.preventDefault()
    if (!studentForm.studentId) return toast.error("O'quvchini tanlang")
    if (studentForm.endDate && studentForm.startDate > studentForm.endDate) return toast.error("Boshlanish sanasi tugash sanasidan keyin bo'lolmaydi")
    setStudentSaving(true)
    try {
      await axios.post(`${import.meta.env.VITE_BASE_URL}/api/student/excuse`, { ...studentForm, endDate: studentForm.endDate || null }, { headers })
      toast.success("O'quvchining sababi saqlandi")
      setStudentModal(false)
      await fetchData()
      if (tab === 'all') await fetchHistory()
    } catch (err) { toast.error(err.response?.data?.message || 'Saqlashda xatolik') }
    finally { setStudentSaving(false) }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Global Kommentlar</h1>
          <p className="text-sm text-gray-500 mt-0.5">Xodimlar va o'quvchilarning sababli kelmaganligi</p>
        </div>
        <button
          onClick={() => personType === 'student' ? openStudentModal() : setModal({ employeeId: null, employeeName: '', existing: null, pickUser: true })}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition shadow-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {personType === 'student' ? 'Yangi sabab' : 'Yangi komment'}
        </button>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1">
          {[{ key: 'employee', label: 'Xodimlar' }, { key: 'student', label: "O'quvchilar" }].map(x => (
            <button key={x.key} onClick={() => setPersonType(x.key)} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${personType === x.key ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{x.label}</button>
          ))}
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1">
          {[
            { key: 'active', label: personType === 'student' ? 'Faol sabablar' : 'Faol kommentlar' },
            { key: 'all', label: 'Barcha tarix' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.key
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={personType === 'student' ? "O'quvchi yoki izoh bo'yicha qidirish..." : "Xodim yoki izoh bo'yicha qidirish..."}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm text-black placeholder-gray-400 focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'active' && personType === 'employee' ? (
        /* ---- FAOL KOMMENTLAR: xodimlar ro'yxati ---- */
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {filteredUsers.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">Xodim topilmadi</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredUsers.map(user => {
                const comment = commentMapById[user._id]
                return (
                  <div key={user._id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-gray-50 transition">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {user.photo
                          ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${user.photo}`} className="w-full h-full object-cover" alt="" />
                          : user.fullName?.charAt(0)
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{user.fullName}</p>
                        <p className="text-xs text-gray-400 truncate">{user.position}</p>
                        {comment && (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColor(comment.type)}`}>
                              {typeLabel(comment.type)}
                            </span>
                            <span className="text-xs text-gray-500 break-words">{comment.comment}</span>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                              {comment.startDate}{comment.endDate ? ` → ${comment.endDate}` : ' (muddatsiz)'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                      {/* Qaytdi tugmasi — faqat faol komment bo'lganda */}
                      {comment && (
                        <button
                          onClick={() => handleClose(comment._id, user.fullName)}
                          disabled={closingId === comment._id}
                          title="Xodim qaytdi — kommentni yopish"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition text-xs font-medium disabled:opacity-40"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Qaytdi
                        </button>
                      )}
                      <button
                        onClick={() => setModal({ employeeId: user._id, employeeName: user.fullName, existing: comment || null })}
                        className={`p-2 rounded-lg text-sm transition ${comment
                          ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                          : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
                          }`}
                        title={comment ? "Tahrirlash" : "Komment qo'shish"}
                      >
                        {comment ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                        )}
                      </button>
                      {comment && (
                        <button
                          onClick={() => handleDelete(comment._id, user.fullName)}
                          disabled={deletingId === comment._id}
                          className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition disabled:opacity-40"
                          title="O'chirish"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : tab === 'active' ? (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {filteredStudentExcuses.filter(c => c.active).length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">Faol sababli kelmagan o'quvchi topilmadi</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredStudentExcuses.filter(c => c.active).map(excuse => (
                <div key={excuse._id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden">
                      {excuse.student?.photo ? <img src={`${import.meta.env.VITE_BASE_URL}/uploads/${excuse.student.photo}`} className="w-full h-full object-cover" alt="" /> : excuse.studentName?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{excuse.studentName}</p>
                      <p className="text-xs text-gray-400 truncate">{excuse.sinfName}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STUDENT_TYPE_COLORS[excuse.type] || STUDENT_TYPE_COLORS.boshqa}`}>{STUDENT_TYPES[excuse.type] || excuse.label || 'Boshqa sabab'}</span>
                        {excuse.comment && <span className="text-xs text-gray-500 break-words">{excuse.comment}</span>}
                        <span className="text-xs text-gray-400 whitespace-nowrap">{excuse.startDate}{excuse.endDate ? ` → ${excuse.endDate}` : ' (qaytguncha)'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    <button onClick={() => handleClose(excuse._id, excuse.studentName, 'student')} disabled={closingId === excuse._id} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition text-xs font-medium disabled:opacity-40" title="O'quvchi qaytdi — sababni yopish">Qaytdi</button>
                    <button onClick={() => handleDelete(excuse._id, excuse.studentName, 'student')} disabled={deletingId === excuse._id} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition disabled:opacity-40" title="Sababni o'chirish">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a1.995 1.995 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ---- BARCHA TARIX ---- */
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {filteredHistory.length === 0 ? (
            <p className="text-center text-gray-400 py-16 text-sm">Kommentlar topilmadi</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredHistory.map(c => (
                <div key={c._id} className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-gray-50 transition">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className={`shrink-0 mt-0.5 text-xs px-2.5 py-1 rounded-full font-medium ${personType === 'student' ? STUDENT_TYPE_COLORS[c.type] || STUDENT_TYPE_COLORS.boshqa : typeColor(c.type)}`}>
                      {personType === 'student' ? STUDENT_TYPES[c.type] || c.label || 'Boshqa sabab' : typeLabel(c.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.personName}</p>
                      <p className="text-xs text-gray-400">{c.subtitle}</p>
                      <p className="text-sm text-gray-600 mt-1 break-words">{c.comment}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.startDate}{c.endDate ? ` → ${c.endDate}` : ' (muddatsiz)'}
                        {c.endDate && c.endDate < today && <span className="ml-2 text-gray-300">· tugagan</span>}
                        {personType === 'student' && c.active && <span className="ml-2 text-sky-600">· faol</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    {personType === 'employee' && <button
                      onClick={() => setModal({ employeeId: c.employee?._id || c.employee, employeeName: c.personName, existing: c })}
                      className="p-2 rounded-lg bg-gray-100 text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition"
                      title="Tahrirlash"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>}
                    <button
                      onClick={() => handleDelete(c._id, c.personName, personType === 'student' ? 'student' : 'employee')}
                      disabled={deletingId === c._id}
                      className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition disabled:opacity-40"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Confirm Modal ── */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-slide-up">
            {/* Icon header */}
            <div className={`px-6 pt-6 pb-4 flex flex-col items-center text-center`}>
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${confirmModal.type === 'close' ? 'bg-emerald-100' : 'bg-rose-100'
                }`}>
                {confirmModal.type === 'close'
                  ? <FiCheckCircle size={28} className="text-emerald-600" />
                  : <FiAlertCircle size={28} className="text-rose-500" />
                }
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {confirmModal.type === 'close' ? (confirmModal.scope === 'student' ? "O'quvchi qaytdi?" : 'Xodim qaytdi?') : "O'chirishni tasdiqlang"}
              </h3>
              <p className="text-sm text-slate-500 mt-1.5">
                {confirmModal.type === 'close'
                  ? <><strong className="text-slate-700">{confirmModal.name}</strong> qaytdi deb belgilansinmi? Sabab bugundan yopiladi.</>
                  : <><strong className="text-slate-700">{confirmModal.name || 'Bu'}</strong> {confirmModal.scope === 'student' ? "o'quvchining sababini" : 'xodimning kommentini'} o'chirishni xohlaysizmi?</>
                }
              </p>
            </div>
            {/* Buttons */}
            <div className="flex gap-2.5 px-6 pb-6">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition flex items-center justify-center gap-1.5"
              >
                <FiX size={15} />
                Bekor
              </button>
              <button
                onClick={confirmAction}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition flex items-center justify-center gap-1.5 ${confirmModal.type === 'close'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
                  }`}
              >
                {confirmModal.type === 'close'
                  ? <><FiCheckCircle size={15} /> Tasdiqlash</>
                  : <><FiAlertCircle size={15} /> O'chirish</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && !modal.pickUser && (
        <GlobalCommentModal
          employeeId={modal.employeeId}
          employeeName={modal.employeeName}
          existingComment={modal.existing}
          onClose={() => setModal(null)}
          onSaved={() => { fetchData(); if (tab === 'all') fetchHistory() }}
        />
      )}

      {/* Xodim tanlash (yangi komment uchun) */}
      {modal?.pickUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-bold text-gray-800">Xodimni tanlang</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><FiX size={18} /></button>
            </div>
            <div className="p-3 border-b">
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Qidirish..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-black outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredUsers.map(u => (
                <button
                  key={u._id}
                  onClick={() => setModal({ employeeId: u._id, employeeName: u.fullName, existing: null })}
                  className="w-full text-left px-5 py-3 hover:bg-indigo-50 transition flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center shrink-0">
                    {u.fullName?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">{u.fullName}</p>
                    <p className="text-xs text-gray-400">{u.position}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {studentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={e => e.target === e.currentTarget && !studentSaving && setStudentModal(false)}>
          <form onSubmit={saveStudentExcuse} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-bold text-gray-800">O'quvchiga sabab qo'shish</h2><p className="text-sm text-gray-500">Sababli kunlar davomat foiziga kirmaydi</p></div>
              <button type="button" onClick={() => setStudentModal(false)} disabled={studentSaving} className="text-gray-400 hover:text-gray-600"><FiX size={18} /></button>
            </div>
            <SearchableSelect variant="outline" icon={false} value={studentForm.studentId} onChange={studentId => setStudentForm(f => ({ ...f, studentId }))} placeholder="O'quvchini tanlang" searchPlaceholder="O'quvchini qidirish..." options={[{ value: '', label: "O'quvchini tanlang" }, ...availableStudents.map(s => ({ value: s._id, label: `${s.fullName} · ${s.sinf?.name || ''}` }))]} />
            <select value={studentForm.type} onChange={e => setStudentForm(f => ({ ...f, type: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black bg-white">
              {Object.entries(STUDENT_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-gray-700">Boshlanish sanasi<input type="date" required value={studentForm.startDate} onChange={e => setStudentForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black" /></label>
              <label className="text-sm text-gray-700">Tugash sanasi<input type="date" min={studentForm.startDate} value={studentForm.endDate} onChange={e => setStudentForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black" /></label>
            </div>
            <textarea value={studentForm.comment} onChange={e => setStudentForm(f => ({ ...f, comment: e.target.value }))} maxLength={300} rows={3} placeholder="Izoh (ixtiyoriy)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black resize-none" />
            <div className="flex gap-3 pt-1">
              <button type="button" disabled={studentSaving} onClick={() => setStudentModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">Bekor</button>
              <button type="submit" disabled={studentSaving || !availableStudents.length} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60">{studentSaving ? 'Saqlanmoqda...' : 'Saqlash'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default UserComments
