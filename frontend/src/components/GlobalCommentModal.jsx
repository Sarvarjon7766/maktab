import { FiX } from 'react-icons/fi'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { getTashkentDateString } from '../utils/formatDate'

const TYPE_OPTIONS = [
  { value: 'tatil',    label: "Mehnat ta'tili",   color: 'bg-green-100 text-green-800' },
  { value: 'safar',    label: 'Xizmat safari',     color: 'bg-blue-100 text-blue-800'  },
  { value: 'kasallik', label: 'Kasallik',           color: 'bg-orange-100 text-orange-800' },
  { value: 'boshqa',   label: 'Boshqa sabab',      color: 'bg-gray-100 text-gray-800'  },
]

export const typeLabel = (type) =>
  TYPE_OPTIONS.find(t => t.value === type)?.label || type

export const typeColor = (type) =>
  TYPE_OPTIONS.find(t => t.value === type)?.color || 'bg-gray-100 text-gray-700'

const today = () => getTashkentDateString()

const GlobalCommentModal = ({ employeeId, employeeName, existingComment, onClose, onSaved }) => {
  const token = localStorage.getItem('token')
  const isEdit = !!existingComment

  const [form, setForm] = useState({
    type:      existingComment?.type      || 'boshqa',
    startDate: existingComment?.startDate || today(),
    endDate:   existingComment?.endDate   || '',
    comment:   existingComment?.comment   || '',
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.comment.trim()) return toast.error("Izoh matni kiriting")
    if (form.endDate && form.startDate > form.endDate) return toast.error("Boshlanish sanasi tugash sanasidan keyin bo'lolmaydi")

    setSaving(true)
    try {
      if (isEdit) {
        await axios.put(
          `${import.meta.env.VITE_BASE_URL}/api/comment/${existingComment._id}`,
          form,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        toast.success("Komment yangilandi")
      } else {
        await axios.post(
          `${import.meta.env.VITE_BASE_URL}/api/comment`,
          { ...form, employeeId },
          { headers: { Authorization: `Bearer ${token}` } }
        )
        toast.success("Komment saqlandi")
      }
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.message || "Xatolik yuz berdi")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">
              {isEdit ? "Kommentni tahrirlash" : "Komment qo'shish"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">{employeeName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100"
          >
            <FiX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sabab turi</label>
            <div className="grid grid-cols-2 gap-2">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: opt.value }))}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                    form.type === opt.value
                      ? 'border-indigo-500 ' + opt.color
                      : 'border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Boshlanish sanasi</label>
              <input
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tugash sanasi
                <span className="ml-1 text-xs text-gray-400 font-normal">(ixtiyoriy)</span>
              </label>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                min={form.startDate}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none"
              />
              {!form.endDate && (
                <p className="text-xs text-amber-600 mt-1">Muddatsiz — belgilangunga qadar amal qiladi</p>
              )}
            </div>
          </div>

          {/* Comment text */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Izoh</label>
            <textarea
              name="comment"
              value={form.comment}
              onChange={handleChange}
              rows={3}
              required
              placeholder="Masalan: Xizmat safarida, qaytish 15-iyul..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-black focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition"
            >
              Bekor
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {saving ? "Saqlanmoqda..." : isEdit ? "Yangilash" : "Saqlash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default GlobalCommentModal
