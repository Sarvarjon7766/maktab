import {
	FaBell,
	FaChalkboard,
	FaChartBar,
	FaChartLine,
	FaClipboardCheck,
	FaClock,
	FaCogs,
	FaComments,
	FaDesktop,
	FaDoorOpen,
	FaFileAlt,
	FaHome,
	FaLayerGroup,
	FaRobot,
	FaSitemap,
	FaTelegramPlane,
	FaUmbrellaBeach,
	FaUserCheck,
	FaUserCog,
	FaUserGraduate,
	FaUserSlash,
	FaUsers,
	FaVideo
} from 'react-icons/fa'
import { tx } from '../i18n'

// Maktab admini (/user va /admin) uchun yagona menyu: bo'limlar vazifasiga qarab guruhlangan.
// `base` — '/user' yoki '/admin'. Sozlamalar faqat /user da bor.
export const schoolMenuGroups = (base) => [
	{
		label: tx('Asosiy'),
		items: [{ path: base, icon: FaHome, label: tx('Bosh sahifa') }],
	},
	{
		label: tx('Kunlik nazorat'),
		items: [
			{ path: `${base}/attandance`, icon: FaClipboardCheck, label: tx('Xodimlar nazorati') },
			{ path: `${base}/entry-exit`, icon: FaDoorOpen, label: tx('Kirish–Chiqish') },
			{ path: `${base}/late`, icon: FaClock, label: tx('Kech qolganlar') },
			{ path: `${base}/leaves`, icon: FaUmbrellaBeach, label: tx('Sababli kelmaganlar') },
			{ path: `${base}/alerts`, icon: FaBell, label: tx('Ogohlantirishlar') },
		],
	},
	{
		label: tx('Kameralar va kuzatuv'),
		items: [
			{ path: `${base}/live`, icon: FaDesktop, label: tx('Jonli kuzatuv') },
			{ path: `${base}/classrooms`, icon: FaChalkboard, label: tx('Sinfxonalar') },
			{ path: `${base}/kuzatuv`, icon: FaRobot, label: tx('Aqlli kuzatuv') },
			{ path: `${base}/facecontrol`, icon: FaUserCheck, label: tx('FaceControl') },
			{ path: `${base}/camera`, icon: FaVideo, label: tx('Kamera sozlamalari') },
		],
	},
	{
		label: tx('Statistika va hisobot'),
		items: [
			{ path: `${base}/grades`, icon: FaLayerGroup, label: tx('Umumiy statistika') },
			{ path: `${base}/trend`, icon: FaChartLine, label: tx('Kunlik dinamika') },
			{ path: `${base}/risk`, icon: FaUserSlash, label: tx('Xavf guruhi') },
			{ path: `${base}/analytics`, icon: FaChartBar, label: tx('Tahlil') },
			{ path: `${base}/reports`, icon: FaFileAlt, label: tx('Hisobotlar') },
		],
	},
	{
		label: tx("Ro'yxatlar"),
		items: [
			{ path: `${base}/students`, icon: FaUserGraduate, label: tx("O'quvchilar") },
			{ path: `${base}/sinf`, icon: FaSitemap, label: tx('Sinflar') },
			{ path: `${base}/users`, icon: FaUsers, label: tx('Xodimlar') },
			{ path: `${base}/regulation`, icon: FaUserCog, label: tx('Xodimlarni tartiblash') },
		],
	},
	{
		label: tx('Aloqa'),
		items: [
			{ path: `${base}/parents`, icon: FaTelegramPlane, label: tx('Ota-onalar boti') },
			{ path: `${base}/comments`, icon: FaComments, label: tx('Kommentlar') },
		],
	},
	...(base === '/user' ? [{ label: tx('Tizim'), items: [{ path: `${base}/settings`, icon: FaCogs, label: tx('Sozlamalar') }] }] : []),
]
