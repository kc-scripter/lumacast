const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopBridge", Object.freeze({
  windowAction: (action) => ipcRenderer.invoke("lunira:window-action", action),
  listCaptureSources: () => ipcRenderer.invoke("lunira:list-sources"),
  selectCaptureSource: (id) => ipcRenderer.invoke("lunira:select-source", id),
  togglePip: (enabled) => ipcRenderer.invoke("lunira:pip", enabled),
  getPerformanceMetrics: () => ipcRenderer.invoke("lunira:metrics")
}));
