import { MonitorUp } from "lucide-react";
export function Logo({compact=false}:{compact?:boolean}) { return <button className="brand" onClick={()=>location.assign("/")} aria-label="Ir para o início"><span className="brand-mark"><MonitorUp size={20}/></span>{!compact&&<span>Luma<span>Cast</span></span>}</button>; }
