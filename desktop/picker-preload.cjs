const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("luniraPicker", {
  onSources(callback) {
    const listener = (_event, sources) => callback(sources);
    ipcRenderer.on("lunira:capture-picker:sources", listener);
    return () => ipcRenderer.removeListener("lunira:capture-picker:sources", listener);
  },
  choose(sourceId) {
    ipcRenderer.send("lunira:capture-picker:choose", sourceId);
  },
  cancel() {
    ipcRenderer.send("lunira:capture-picker:cancel");
  }
});
