import HikCameraList from "../../components/HikCameraList"

// Kameralar sahifasi: tizim egasi maktabga biriktirgan Hik-Connect kameralari
// (jonli oqimlar sahifa ochilishi bilan boshlanadi). Kamera qo'shish/tahrirlash yo'q.
export default function AdminCameras() {
	return (
		<div className="min-h-screen bg-slate-50 p-4 md:p-6">
			<div className="mx-auto">
				<HikCameraList />
			</div>
		</div>
	)
}

