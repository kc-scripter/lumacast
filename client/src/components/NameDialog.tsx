import { useEffect, useId, useState } from "react";

type Props={eyebrow:string;submitLabel:string;onSubmit:(name:string)=>void;onCancel?:()=>void};

export function NameDialog({eyebrow,submitLabel,onSubmit,onCancel}:Props){
  const [name,setName]=useState("");
  const [error,setError]=useState("");
  const titleId=useId(),inputId=useId(),errorId=useId();

  useEffect(()=>{
    if(!onCancel)return;
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape")onCancel();};
    addEventListener("keydown",close);
    return()=>removeEventListener("keydown",close);
  },[onCancel]);

  const submit=()=>{
    const value=name.trim().replace(/\s+/g," ");
    if(value.length<2||value.length>20||/[\u0000-\u001f\u007f]/.test(value)){
      setError("Use um nome entre 2 e 20 caracteres.");
      return;
    }
    onSubmit(value);
  };

  return <div className="name-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <form onSubmit={event=>{event.preventDefault();submit();}}>
      <span>{eyebrow}</span><h2 id={titleId}>Seu nome</h2>
      <label className="sr-only" htmlFor={inputId}>Nome de exibição</label>
      <input id={inputId} name="displayName" autoFocus autoComplete="nickname" value={name} onChange={event=>{setName(event.target.value);setError("");}} maxLength={20} aria-invalid={!!error} aria-describedby={error?errorId:undefined}/>
      {error&&<small id={errorId} role="alert">{error}</small>}
      <div className="name-modal-actions">{onCancel&&<button type="button" className="modal-cancel" onClick={onCancel}>Cancelar</button>}<button type="submit">{submitLabel}</button></div>
    </form>
  </div>;
}
