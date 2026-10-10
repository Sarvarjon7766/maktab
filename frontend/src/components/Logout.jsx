import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearSession } from '../api/sessionCleanup'

const Logout = () => {
	const navigate = useNavigate()

	useEffect(() => {
		let cancelled = false
		clearSession().then(() => { if (!cancelled) navigate('/') })
		return () => { cancelled = true }
	}, [navigate])

	return null
}

export default Logout
