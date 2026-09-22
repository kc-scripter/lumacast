import { MonitorUp } from "lucide-react";
import { navigate } from "../services/navigation";

export function Logo({compact=false}:{compact?:boolean}){
  return <button className="brand" onClick={()=>navigate("/")} aria-label="Ir para o início">
    <span className="brand-mark"><MonitorUp size={20}/></span>
    {!compact&&<span className="brand-name">Lunira <span>Screen</span></span>}
  </button>;
}
