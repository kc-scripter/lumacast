import { Minus, Square, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Brand } from "./Brand";

async function windowAction(action:"minimize"|"maximize"|"close"){
  try{
    const win=getCurrentWindow();
    if(action==="minimize")await win.minimize();
    if(action==="maximize")await win.toggleMaximize();
    if(action==="close")await win.close();
  }catch{
    // Browser preview intentionally has no native window actions.
  }
}

export function Titlebar({status="Pronto",tone="ready"}:{status?:string;tone?:"ready"|"online"|"warn"|"live"}){
  return <header className="titlebar" data-tauri-drag-region>
    <div data-tauri-drag-region className="titlebar-brand"><Brand/><span className="titlebar-divider"/></div>
    <div data-tauri-drag-region className={"connection-pill "+tone}><i/>{status}</div>
    <div className="window-controls">
      <button type="button" aria-label="Minimizar" onClick={()=>void windowAction("minimize")}><Minus/></button>
      <button type="button" aria-label="Maximizar ou restaurar" onClick={()=>void windowAction("maximize")}><Square/></button>
      <button type="button" className="window-close" aria-label="Fechar" onClick={()=>void windowAction("close")}><X/></button>
    </div>
  </header>;
}
