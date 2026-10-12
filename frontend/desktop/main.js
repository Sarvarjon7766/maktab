const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require("electron")
const path = require("path")
const Store = require("electron-store")
const fs = require("fs")
const https = require("https")
const crypto = require("crypto")
const os = require("os")

// Token/parolni shu kompyuterga bog'langan, oddiy matn bo'lmagan kalit bilan
// shifrlash uchun — konfiguratsiya fayli (%APPDATA%\facecontrol\config.json)
// endi oddiy o'qiladigan JSON emas. Diqqat: bu chuqur kriptografik himoya
// emas (kalit ilovaning o'zida hisoblanadi), balki faylni tasodifan ochib
// o'qishning oldini oluvchi qo'shimcha himoya qatlami (defense-in-depth).
function getEncryptionKey() {
	return crypto.createHash("sha256").update(`faceid-facecontroldesk::${os.hostname()}`).digest("hex")
}

// Config fayl (mashina nomiga bog'liq kalit bilan shifrlangan) ochilmasa —
// masalan kompyuter nomi o'zgargan (qayta nomlangan/reimage qilingan)
// bo'lsa — quyidagi createStore() uni jimgina o'chirib, bo'sh holda qayta
// boshlaydi (saqlangan server manzili/token abadiy yo'qoladi). Foydalanuvchi
// buni HECH QACHON bilmasdi, chunki bu jarayon console'ga yozadi, xolos —
// oddiy foydalanuvchi konsolni ko'rmaydi. Shu bayroq orqali app tayyor
// bo'lgach (dialog.showMessageBox app.whenReady()dan OLDIN ishlamaydi,
// shu sabab bu yerda emas, pastda ko'rsatiladi) foydalanuvchiga ogohlantirish
// ko'rsatiladi.
let configWasReset = false

// ⚙️ Electron-store xavfsiz yaratish
function createStore() {
	const options = { encryptionKey: getEncryptionKey(), clearInvalidConfig: true }
	try {
		return new Store(options)
	} catch (err) {
		console.error("❌ Config fayl buzilgan. Yangi config yaratilmoqda:", err)
		const configPath = path.join(app.getPath("userData"), "config.json")
		if (fs.existsSync(configPath)) fs.unlinkSync(configPath)
		configWasReset = true
		return new Store(options)
	}
}
const store = createStore()

// 🌍 Sayt manzili (standart) — sozlamalar oynasidan o'zgartirish mumkin
const DEFAULT_SERVER_URL = "https://faceid-paxtachi.uz/"

// 🏷️ Frontendga "bu desktop ilovadan kirilyapti" belgisi — bu ICHKI
// backend/server_proxy sirining o'zi EMAS, faqat zararsiz belgi. Frontend
// hozircha buni o'qimaydi, lekin kelajakda desktopga xos xulq-atvor uchun
// tayyor turadi.
const APP_CLIENT_FLAG = "faceid-desktop-client"

function getServerUrl() {
	return store.get("serverUrl", DEFAULT_SERVER_URL)
}

let mainWindow
let settingsWindow

function createWindow() {
	const win = new BrowserWindow({
		width: 1200,
		height: 800,
		icon: path.join(__dirname, "assets", "icon.ico"),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			devTools: false
		}
	})

	// 🌐 Saytni yuklash
	win.loadURL(getServerUrl())

	// 🔑 Sayt yuklangandan keyin localStorage'ga (zararsiz) belgini yozish
	win.webContents.on("did-finish-load", () => {
		win.webContents.executeJavaScript(`
			localStorage.setItem("app_key", "${APP_CLIENT_FLAG}");
		`)
	})

	// 🔗 Tashqi linklarni brauzerda ochish
	win.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url)
		return { action: "deny" }
	})

	// 🛡️ Asosiy oyna faqat sozlangan server domenida qolishi kerak — sayt
	// ichidagi zararli/buzilgan skript yoki tashqi havola oynani boshqa
	// (soxta) domenga olib ketishga (navigatsiya qilishga) urinsa, bloklab,
	// o'rniga tizim brauzerida ochamiz (Electron xavfsizlik tavsiyasi:
	// "Only load secure content" / "Verify webContents navigation")
	win.webContents.on("will-navigate", (event, url) => {
		try {
			const target = new URL(url)
			const allowed = new URL(getServerUrl())
			if (target.origin !== allowed.origin) {
				event.preventDefault()
				shell.openExternal(url)
			}
		} catch {
			event.preventDefault()
		}
	})

	// 🏷️ Oyna nomi
	win.setTitle("FaceControl")

	// 🔍 Zoom boshqaruv
	let zoomFactor = store.get("zoomFactor", 1.0)
	win.webContents.setZoomFactor(zoomFactor)

	win.webContents.on("before-input-event", (event, input) => {
		if (input.control && input.type === "mouseWheel") {
			if (input.deltaY < 0) zoomFactor = Math.min(3.0, zoomFactor + 0.1)
			else if (input.deltaY > 0) zoomFactor = Math.max(0.5, zoomFactor - 0.1)
			win.webContents.setZoomFactor(zoomFactor)
			store.set("zoomFactor", zoomFactor)
			event.preventDefault()
		}
		if (input.control && input.type === "keyDown") {
			if (input.key === "=" || input.key === "+") zoomFactor = Math.min(3.0, zoomFactor + 0.1)
			else if (input.key === "-") zoomFactor = Math.max(0.5, zoomFactor - 0.1)
			else if (input.key === "0") zoomFactor = 1.0
			else return
			win.webContents.setZoomFactor(zoomFactor)
			store.set("zoomFactor", zoomFactor)
			event.preventDefault()
		}
	})

	mainWindow = win
}

// ⚙️ Sozlamalar oynasi — server manzilini o'zgartirish uchun
function openSettingsWindow() {
	if (settingsWindow) {
		settingsWindow.focus()
		return
	}
	settingsWindow = new BrowserWindow({
		width: 480,
		height: 320,
		resizable: false,
		minimizable: false,
		maximizable: false,
		parent: mainWindow,
		modal: true,
		title: "Sozlamalar",
		icon: path.join(__dirname, "assets", "icon.ico"),
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "settings-preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
			devTools: false
		}
	})
	settingsWindow.loadFile(path.join(__dirname, "settings.html"))
	settingsWindow.on("closed", () => { settingsWindow = null })
}

// 📋 Native menyu — Alt tugmasi orqali ("Fayl → Sozlamalar") va Ctrl+,
function buildMenu() {
	const template = [
		{
			label: "Fayl",
			submenu: [
				{ label: "Sozlamalar", accelerator: "CommandOrControl+,", click: () => openSettingsWindow() },
				{ type: "separator" },
				{ label: "Chiqish", role: "quit" }
			]
		}
	]
	Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// 💾 Token saqlash
ipcMain.on("save-token", (event, token) => store.set("token", token))
ipcMain.handle("get-token", () => store.get("token"))
ipcMain.on("clear-token", () => store.delete("token"))

// ⚙️ Server manzili sozlamalari
ipcMain.handle("get-server-url", () => getServerUrl())
ipcMain.handle("set-server-url", (event, url) => {
	const trimmed = (url || "").trim()
	if (!/^https?:\/\/.+/i.test(trimmed)) {
		return { success: false, message: "Manzil http:// yoki https:// bilan boshlanishi kerak" }
	}
	const normalized = trimmed.endsWith("/") ? trimmed : `${trimmed}/`
	store.set("serverUrl", normalized)
	if (mainWindow) mainWindow.loadURL(normalized)
	return { success: true }
})

// 🔄 Yangilanishni tekshirish. Eslatma: avval bu yerda electron-updater'ning
// autoUpdater.setFeedURL/downloadUpdate() ishlatilardi, lekin `provider`
// ko'rsatilmagani uchun (va version.json'dagi url to'g'ridan-to'g'ri .exe
// faylga, GenericProvider esa katalogga ishora qilishi kerakligi uchun)
// bu chaqiruv har doim xato berib, hech qachon ishlamas edi (.then() ichida
// tashlangan xato .catch() bilan tutilmagani uchun jim sodir bo'lardi).
// Eng oddiy va ishonchli yechim: foydalanuvchiga o'rnatuvchi faylni
// tizim brauzerida ochib berish, o'zi yuklab qo'lda o'rnatadi.
const VERSION_CHECK_TIMEOUT_MS = 10000

function checkForUpdate() {
	const versionUrl = "https://faceid-paxtachi.uz/desktop/version.json"
	const req = https.get(versionUrl, (res) => {
		let data = ""
		res.on("data", (chunk) => data += chunk)
		res.on("end", () => {
			try {
				const remote = JSON.parse(data)
				const localVersion = app.getVersion()

				if (remote.version !== localVersion) {
					dialog.showMessageBox(mainWindow, {
						type: "info",
						buttons: ["Yuklab olish", "Bekor"],
						defaultId: 0,
						cancelId: 1,
						title: "Yangilanish mavjud",
						message: `Yangi versiya: ${remote.version}`,
						detail: remote.changelog || ""
					}).then(({ response }) => {
						if (response === 0 && remote.url) {
							shell.openExternal(remote.url)
						}
					})
				}
			} catch (err) {
				console.error("Version parse error:", err)
			}
		})
	}).on("error", (err) => console.error("Version check error:", err))

	// Server ulanishni qabul qilib, lekin HECH QACHON javob bermasa (osilib
	// qolgan/juda sekin server, tarmoq bloklashi va h.k.), yuqoridagi
	// "error" hodisasi HECH QACHON otilmaydi — so'rov abadiy ochiq qoladi
	// (leaked socket, hech qanday log/xabar chiqmasdan). Qat'iy vaqt
	// chegarasi bilan so'rovni majburan bekor qilamiz, bu esa "error"
	// hodisasini (yuqoridagi handler orqali) tabiiy ishga tushiradi.
	req.setTimeout(VERSION_CHECK_TIMEOUT_MS, () => {
		req.destroy(new Error(`Versiyani tekshirish ${VERSION_CHECK_TIMEOUT_MS}ms ichida javob bermadi`))
	})
}

// 🧠 Dastur ishga tushganda
app.whenReady().then(() => {
	buildMenu()
	createWindow()
	if (configWasReset) {
		// createStore() konfiguratsiyani o'qiy olmagani uchun uni o'chirib,
		// bo'sh holda qayta boshlagan (server manzili/token yo'qolgan) —
		// foydalanuvchi buni bilishi kerak, aks holda nega qayta sozlamalar
		// so'ralayotganini tushunmay qoladi
		dialog.showMessageBox(mainWindow, {
			type: "warning",
			title: "Sozlamalar tiklandi",
			message: "Saqlangan sozlamalar (server manzili) o'qib bo'lmadi va qayta tiklandi.",
			detail: "Iltimos, \"Fayl → Sozlamalar\" orqali server manzilini qayta kiriting."
		})
	}
	if (app.isPackaged) checkForUpdate()
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow()
	})
})

// ❌ Barcha oynalar yopilganda
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit()
})

