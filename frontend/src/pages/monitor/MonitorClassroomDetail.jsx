import { useParams } from 'react-router-dom'
import ClassroomDetail from '../../components/ClassroomDetail'

// Monitor: bitta sinfxonaning to'liq tahlili (istalgan maktab)
const MonitorClassroomDetail = () => {
	const { schoolId, sinfId } = useParams()
	return <ClassroomDetail schoolId={schoolId} sinfId={sinfId} backTo="/monitor/classrooms" personBase="/monitor/people/student" />
}

export default MonitorClassroomDetail
