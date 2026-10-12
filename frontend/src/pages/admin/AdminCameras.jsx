import CameraSetup from "../../components/CameraSetup"

// Kamera sozlamalari: tizim egasi maktabga biriktirgan Hik-Connect kameralarini sinfga biriktirish,
// vazifasini belgilash va odam sanashni yoqish (kamera qo'shish/tahrirlash yo'q)
export default function AdminCameras() {
	return (
		<div className="min-h-full bg-slate-50 p-4 md:p-6">
			<div className="mx-auto max-w-[1600px]">
				<CameraSetup />
			</div>
		</div>
	)
}
