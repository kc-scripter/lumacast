import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export function Modal({title,eyebrow,onClose,children,className=""}:{title:string;eyebrow?:string;onClose:()=>void;children:ReactNode;className?:string}){
  const dialogRef=useRef<HTMLElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);

  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    closeRef.current?.focus();

    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){onClose();return;}
      if(event.key!=="Tab")return;
      const nodes=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')||[])];
      if(!nodes.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };

    document.addEventListener("keydown",onKey);
    return()=>{
      document.removeEventListener("keydown",onKey);
      previous?.focus?.();
    };
  },[onClose]);

  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={dialogRef} className={"modal "+className} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-head">
        <div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
        <button ref={closeRef} type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X/></button>
      </header>
      {children}
    </section>
  </div>;
}
