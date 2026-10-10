import { useParams } from 'react-router-dom'
import ClassroomDetail from '../../components/ClassroomDetail'

// Maktab admini: o'z sinfxonasining to'liq tahlili (maktab tokendan aniqlanadi)
const AdminClassroomDetail = () => {
	const { sinfId } = useParams()
	return <ClassroomDetail sinfId={sinfId} backTo="../classrooms" />
}

export default AdminClassroomDetail
