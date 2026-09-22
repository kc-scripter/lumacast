import { X } from "lucide-react";
import { useEffect } from "react";
import type { StreamStats } from "../types";
import { StatsPanel } from "./StatsPanel";

type Props={
  title:string;
  stats:StreamStats|null;
  onClose:()=>void;
  className?:string;
};

export function StatsDrawer({title,stats,onClose,className=""}:Props){
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape")onClose();
    };
    document.addEventListener("keydown",onKeyDown);
    return()=>document.removeEventListener("keydown",onKeyDown);
  },[onClose]);

  return <section className={`stats-drawer stats-overlay-panel ${className}`.trim()} role="dialog" aria-label={title} aria-live="polite">
    <div className="stats-drawer-head">
      <h3>{title}</h3>
      <button type="button" className="stats-drawer-close" onClick={onClose} aria-label="Fechar estatísticas" title="Fechar estatísticas"><X/></button>
    </div>
    <StatsPanel stats={stats}/>
  </section>;
}
