const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronAPI", {
	// Token saqlash
	saveToken: (token) => ipcRenderer.send("save-token", token),
	getToken: () => ipcRenderer.invoke("get-token"),
	clearToken: () => ipcRenderer.send("clear-token")
})

