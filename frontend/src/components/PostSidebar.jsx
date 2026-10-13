import {
  FaClipboardCheck,
  FaEye,
  FaUsers
} from 'react-icons/fa'
import { FiLogOut, FiX } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { tx } from '../i18n'

const PostSidebar = ({ collapsed = false, onClose }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) =>
    location.pathname === path ||
    location.pathname.startsWith(path)

  const menu = [
    { path: '/post/users', icon: FaUsers, label: 'Xodimlar' },
    { path: '/post/attandance', icon: FaClipboardCheck, label: 'Nazorat' },
    { path: '/manitor', icon: FaEye, label: 'Post Monitor' },
  ]

  return (
    <aside className="h-full flex flex-col text-white">
      {/* MOBILE HEADER */}
      {onClose && (
        <div className="lg:hidden p-4 border-b border-slate-700 flex justify-between">
          <span className="font-bold">
            {tx("FACE")}<span className="text-cyan-300">{tx("ID")}</span>
          </span>
          <button onClick={onClose}><FiX /></button>
        </div>
      )}

      {/* DESKTOP HEADER */}
      {!collapsed && !onClose && (
        <div className="hidden lg:flex p-6 border-b border-slate-700">
          <h1 className="font-bold text-xl">
            {tx("FACE")}<span className="text-cyan-300">{tx("ID")}</span>
          </h1>
        </div>
      )}

      {collapsed && !onClose && (
        <div className="hidden lg:flex h-20 items-center justify-center border-b border-slate-700">
          <span className="font-bold">{tx("ID")}</span>
        </div>
      )}

      {/* MENU */}
      <nav className="flex-1 p-3 space-y-1">
        {menu.map(({ path, icon: Icon, label }) => (
          <Link
            key={path}
            to={path}
            onClick={onClose}
            className={`group relative flex items-center gap-3 p-3 rounded-lg
              ${isActive(path)
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Icon className="text-xl" />
            {!collapsed && <span>{label}</span>}
          
          </Link>
        ))}
      </nav>

      {/* LOGOUT */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={() => navigate('/logout')}
          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800"
        >
          <FiLogOut />
          {!collapsed && <span>{tx("Chiqish")}</span>}
        </button>
      </div>
    </aside>
  )
}

export default PostSidebar

