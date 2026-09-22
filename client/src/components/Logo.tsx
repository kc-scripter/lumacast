import { MonitorUp } from "lucide-react";
import { navigate } from "../services/navigation";

export function BrandMark({small=false}:{small?:boolean}){
  return <span className={`brand-mark ${small?"brand-mark-small":""}`} aria-hidden="true">
    <MonitorUp/>
    <i/>
  </span>;
}

export function Logo({compact=false}:{compact?:boolean}){
  return <a
    className="brand"
    href="/"
    aria-label="Ir para o início"
    onClick={event=>{event.preventDefault();navigate("/");}}
  >
    <BrandMark/>
    {!compact&&<span className="brand-name">
      <span className="brand-name-main">Lunira</span>
      <span className="brand-name-accent">Screen</span>
    </span>}
  </a>;
}
