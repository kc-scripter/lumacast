import type { CaptureSource, DesktopMetrics } from "./types";
export {};
declare global { interface Window { desktopBridge?: { windowAction(action:"minimize"|"maximize"|"close"):Promise<void>; listCaptureSources():Promise<CaptureSource[]>; selectCaptureSource(id:string):Promise<boolean>; togglePip(enabled:boolean):Promise<boolean>; getPerformanceMetrics():Promise<DesktopMetrics>; }; } }
