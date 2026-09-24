/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL?: string;
  readonly VITE_PUBLIC_WEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopCaptureSource {
  id:string;
  name:string;
  kind:"screen"|"window";
  thumbnail:string|null;
  appIcon:string|null;
}

interface Window {
  luniraDesktop?:{
    platform:"electron";
    listCaptureSources:()=>Promise<DesktopCaptureSource[]>;
    selectCaptureSource:(sourceId:string)=>Promise<boolean>;
    windowControl:(action:"minimize"|"maximize"|"close")=>Promise<boolean>;
  };
}
