import { MonitorUp } from "lucide-react";

export function Brand({compact=false}:{compact?:boolean}){
  return <div className="brand" aria-label="Lunira Screen">
    <span className="brand-mark" aria-hidden="true"><MonitorUp/><i/></span>
    {!compact&&<div className="brand-copy"><strong><span className="brand-name-main">Lunira</span> <span className="brand-name-accent">Screen</span></strong><small>DESKTOP</small></div>}
  </div>;
}
