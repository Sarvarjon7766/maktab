const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("settingsAPI", {
	getServerUrl: () => ipcRenderer.invoke("get-server-url"),
	setServerUrl: (url) => ipcRenderer.invoke("set-server-url", url),
	close: () => window.close()
})

