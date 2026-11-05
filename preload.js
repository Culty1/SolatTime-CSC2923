
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("solatAPI", {
  zones: () => ipcRenderer.invoke("zones"),

  prayers: (zone, year, month) =>
    ipcRenderer.invoke("prayers", zone, year, month)
});