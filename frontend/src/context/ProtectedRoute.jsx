import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useOrg } from './OrgContext'

const ProtectedRoute = ({ children, allowedRoles }) => {
	const role = localStorage.getItem('content-type')
	const { refresh } = useOrg()
	// refresh har renderda yangi funksiya — ref orqali ushlab, effekt faqat role o'zgarganda ishlaydi
	const refreshRef = useRef(refresh)
	refreshRef.current = refresh
	const allowed = !!role && allowedRoles.includes(role)

	// Login-keyingi maktab brendini yuklaydi (login-oldi platforma nomidan
	// farqli) — har safar himoyalangan bo'limga kirilganda
	useEffect(() => {
		if (allowed) Promise.resolve(refreshRef.current()).catch(() => { /* jim */ })
	}, [role, allowed])

	if (!role) {
		return <Navigate to="/" />
	}

	if (!allowedRoles.includes(role)) {
		return <Navigate to="/" />
	}
	return children
}

export default ProtectedRoute

