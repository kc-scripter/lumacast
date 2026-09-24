import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("luniraDesktop",{
  platform:"electron",
  listCaptureSources:()=>ipcRenderer.invoke("lunira:capture:list"),
  selectCaptureSource:sourceId=>ipcRenderer.invoke("lunira:capture:select",sourceId),
  windowControl:action=>ipcRenderer.invoke("lunira:window:control",action)
});
