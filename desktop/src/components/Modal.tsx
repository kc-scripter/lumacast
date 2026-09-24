import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Modal({title,eyebrow,onClose,children,className=""}:{title:string;eyebrow?:string;onClose:()=>void;children:ReactNode;className?:string}){
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className={"modal "+className} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head">
        <div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X/></button>
      </header>
      {children}
    </section>
  </div>;
}
