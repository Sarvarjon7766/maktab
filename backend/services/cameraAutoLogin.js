// require bilan import qilish
const { Builder, By, Key } = require("selenium-webdriver")
const chrome = require("selenium-webdriver/chrome")

// chromedriver ni yuklash
require("chromedriver")

async function cameraAutoLogin({ ip, username, password }) {
	let driver

	// Oldingi chaqiruvdan qolgan ochiq Chrome jarayoni bo'lsa, uni
	// yopmasdan turib global.cameraDriver'ni ustidan yozish driver
	// jarayonlarining tugamasligiga (resurs sizishi) olib kelardi.
	if (global.cameraDriver) {
		try {
			await global.cameraDriver.quit()
		} catch { }
		global.cameraDriver = null
	}

	try {
		/* ================= CHROME OPTIONS ================= */
		const options = new chrome.Options()

		options.addArguments(
			"--no-sandbox",
			"--disable-dev-shm-usage",
			"--ignore-certificate-errors",
			"--allow-running-insecure-content",
			"--disable-blink-features=AutomationControlled",
			"--window-size=1280,900",
			"--log-level=3",
			"--disable-logging"
		)

		// GUI ko‘rinsin (headless YO‘Q)
		options.excludeSwitches("enable-automation")
		options.setUserPreferences({
			"credentials_enable_service": false,
			"profile.password_manager_enabled": false
		})

		driver = await new Builder()
			.forBrowser("chrome")
			.setChromeOptions(options)
			.build()

		console.log(`🎥 Kamera: ${ip}`)

		/* ================= 1️⃣ CAMERA PAGE ================= */
		await driver.get(`http://${ip}`)
		await driver.sleep(5000)

		/* ================= 2️⃣ LOGIN ================= */
		try {
			let usernameInput
			let passwordInput

			// ID orqali
			try {
				usernameInput = await driver.findElement(By.id("username"))
				passwordInput = await driver.findElement(By.id("password"))
			} catch {
				// name orqali
				try {
					usernameInput = await driver.findElement(By.name("username"))
					passwordInput = await driver.findElement(By.name("password"))
				} catch {
					// CSS orqali
					usernameInput = await driver.findElement(
						By.css('input[type="text"], input[placeholder*="user"], input[placeholder*="name"]')
					)
					passwordInput = await driver.findElement(By.css('input[type="password"]'))
				}
			}

			await usernameInput.clear()
			await passwordInput.clear()

			await usernameInput.sendKeys(username)
			await passwordInput.sendKeys(password, Key.RETURN)

			console.log("✅ Kamera GUI ga avtomatik login bo‘ldi")
			await driver.sleep(3000)

		} catch (loginError) {
			console.log("⚠️ Login formasi topilmadi yoki allaqachon login qilingan")
			console.log("Login error:", loginError.message)
		}

		/* ================= 3️⃣ LOGIN TEKSHIRISH ================= */
		const currentUrl = await driver.getCurrentUrl()
		console.log(`🔗 Login dan keyingi URL: ${currentUrl}`)

		if (currentUrl.includes("login") || currentUrl.includes("auth")) {
			// Login muvaffaqiyatsiz bo'lgan holatda ham driver'ni yopish shart —
			// aks holda bu Chrome jarayoni global.cameraDriver'ga yozilmasdan
			// (u faqat muvaffaqiyatli bo'lganda pastda o'rnatiladi) ochiq qolib,
			// har qayta urinishda yana bitta zombie Chrome jarayoni qo'shilardi
			try {
				await driver.quit()
			} catch { }
			return {
				success: false,
				error: "Login muvaffaqiyatsiz (login sahifada qoldi)"
			}
		}

		/* ================= 4️⃣ PEOPLE MANAGE GA O‘TISH ================= */
		console.log("➡️ PeopleManage sahifasiga yo‘naltirilmoqda...")

		// SPA uchun ENG ISHONCHLI USUL
		await driver.executeScript(`
			window.location.hash = '#/home/peopleManage'
		`)

		await driver.sleep(4000)

		const finalUrl = await driver.getCurrentUrl()
		console.log(`✅ Yakuniy URL: ${finalUrl}`)

		/* ================= 5️⃣ BROWSER OCHIQ QOLADI ================= */
		global.cameraDriver = driver

		return {
			success: true,
			message: "Kamera GUI ochildi va PeopleManage sahifasiga o'tildi",
			url: finalUrl
		}

	} catch (err) {
		console.error("❌ Auto-login xatosi:", err)

		if (driver) {
			try {
				await driver.quit()
			} catch { }
		}

		return {
			success: false,
			error: err.message
		}
	}
}

module.exports = { cameraAutoLogin }

