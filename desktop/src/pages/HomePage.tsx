import { ArrowRight, CircleHelp, Clock3, Link2, MonitorUp, RotateCcw, Server, Settings, UserRound, Users, Video } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";
import { parseRoomInvite } from "../../../client/src/services/invite";
import type { BackendWakeState } from "../services/backendWake";
import { readRecentRooms } from "../services/recentRooms";

type Mode="create"|"join";

export function HomePage({onCreate,onJoin,onResume,onHow,onSettings,backendState,backendMessage,onRetry}:{
  onCreate:(name:string)=>Promise<boolean>;
  onJoin:(roomId:string,inviteToken:string,name:string)=>Promise<boolean>;
  onResume:(roomId:string,owner:boolean,name:string)=>Promise<boolean>;
  onHow:()=>void;
  onSettings:()=>void;
  backendState:BackendWakeState;
  backendMessage:string;
  onRetry:()=>void;
}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [inviteValue,setInviteValue]=useState("");
  const [mode,setMode]=useState<Mode>("create");
  const [pending,setPending]=useState<Mode|"resume"|null>(null);
  const [formError,setFormError]=useState("");
  const [recentRooms]=useState(readRecentRooms);
  const resumableRooms=recentRooms.filter(room=>{
    if(!room.owner)return !!safeSessionGet("lumacast-participant-"+room.roomId);
    const saved=safeSessionGet("lumacast-broadcaster");
    try{return !!saved&&(JSON.parse(saved) as {roomId?:string}).roomId===room.roomId;}catch{return false;}
  });
  const validName=name.trim().length>=2&&name.trim().length<=20;
  const invite=parseRoomInvite(inviteValue);
  const waking=backendState==="waking";

  const create=async()=>{
    if(pending)return;
    if(!validName){setFormError("Digite um nome entre 2 e 20 caracteres.");return;}
    setFormError("");setPending("create");
    try{if(!await onCreate(name.trim()))setFormError("Não foi possível conectar ao servidor. Tente novamente.");}
    finally{setPending(null);}
  };
  const join=async()=>{
    if(pending)return;
    if(!validName){setFormError("Digite um nome entre 2 e 20 caracteres.");return;}
    if(!invite){setFormError("Cole o link de convite completo da sala.");return;}
    setFormError("");setPending("join");
    try{if(!await onJoin(invite.roomId,invite.inviteToken,name.trim()))setFormError("Não foi possível conectar ao servidor. Confira o convite e tente novamente.");}
    finally{setPending(null);}
  };
  const selectMode=(next:Mode)=>{setMode(next);setFormError("");};
  const resume=async(roomId:string,owner:boolean)=>{
    if(pending)return;
    setFormError("");setPending("resume");
    try{if(!await onResume(roomId,owner,name))setFormError("Essa sessão recente expirou. Entre novamente com um convite.");}
    finally{setPending(null);}
  };

  return <main className="approved-lobby-page">
    <aside className="approved-app-nav">
      <div className="approved-nav-main">
        <button type="button" className="approved-nav-item active"><Users/>Sala</button>
        <button type="button" className="approved-nav-item" onClick={onSettings}><Settings/>Configurações</button>
      </div>
      <button type="button" className="approved-nav-help" onClick={onHow}><CircleHelp/>Como funciona</button>
    </aside>

    <section className="approved-lobby-workspace">
      <header className="approved-lobby-header">
        <div>
          <span className="approved-eyebrow">LUNIRA SCREEN</span>
          <h1>Entre, crie e compartilhe.</h1>
          <p>A mesma sala funciona no desktop e no navegador.</p>
        </div>
        <div className={"approved-backend-pill "+backendState}>
          <i/>
          <span>{backendState==="ready"?"Servidor disponível":backendState==="error"?"Servidor offline":"Preparando servidor"}</span>
          {backendState==="error"&&<button type="button" onClick={onRetry}><RotateCcw/></button>}
        </div>
      </header>

      <div className="approved-lobby-grid">
        <section className="approved-lobby-preview" aria-label="Prévia da sala">
          <div className="approved-preview-screen">
            <span className="approved-preview-badge"><MonitorUp/> Lunira Screen</span>
            <div className="approved-preview-wave"/>
            <div className="approved-preview-stars"/>
            <span className="approved-preview-caption">Sua transmissão aparece aqui</span>
          </div>
          <div className="approved-preview-meta">
            <div><strong>Desktop ↔ Web</strong><span>Uma sala, os mesmos participantes.</span></div>
            <div className="approved-preview-pills"><span><Video/>Câmera</span><span><MonitorUp/>Tela</span></div>
          </div>
        </section>

        <section className="approved-lobby-card" aria-label="Acessar uma sala">
          <div className="approved-mode-tabs" role="tablist" aria-label="Modo">
            <button type="button" role="tab" aria-selected={mode==="create"} className={mode==="create"?"active":""} onClick={()=>selectMode("create")}><MonitorUp/>Criar sala</button>
            <button type="button" role="tab" aria-selected={mode==="join"} className={mode==="join"?"active":""} onClick={()=>selectMode("join")}><Users/>Entrar com convite</button>
          </div>

          <form className="approved-lobby-form" onSubmit={event=>{event.preventDefault();void(mode==="create"?create():join());}} noValidate>
            <label className="approved-field" htmlFor="display-name"><span>SEU NOME</span><div><UserRound/><input id="display-name" value={name} maxLength={20} onChange={event=>{setName(event.target.value);setFormError("");}} placeholder="Como você quer aparecer?" autoComplete="nickname"/></div></label>
            {mode==="join"&&<label className="approved-field" htmlFor="room-code"><span>LINK DE CONVITE</span><div><Link2/><input id="room-code" value={inviteValue} onChange={event=>{setInviteValue(event.target.value.slice(0,512));setFormError("");}} maxLength={512} placeholder="Cole o link privado da sala" autoComplete="off"/></div></label>}
            {formError&&<p className="approved-form-error" role="alert">{formError}</p>}

            <button type="submit" className="approved-primary" disabled={!!pending}>
              <span>{waking?<Server/>:mode==="create"?<MonitorUp/>:<Users/>}</span>
              <strong>{waking?"Acordando servidor…":mode==="create"?"Criar sala":"Entrar na sala"}</strong>
              <ArrowRight/>
            </button>

            <div className={"approved-server-note "+backendState}>
              <i/>
              <div><strong>{backendState==="ready"?"Pronto para conectar":backendState==="error"?"Não foi possível conectar":"Preparando conexão"}</strong><small>{backendMessage}</small></div>
            </div>

            {resumableRooms.length>0&&<div className="approved-recent">
              <span><Clock3/>SALAS RECENTES</span>
              <div>{resumableRooms.slice(0,3).map(room=><button type="button" key={room.roomId} disabled={!!pending} onClick={()=>void resume(room.roomId,room.owner)}><span><strong>{room.roomId}</strong><small>{room.owner?"Sua sala":"Sala visitada"}</small></span><ArrowRight/></button>)}</div>
            </div>}
          </form>
        </section>
      </div>
    </section>
  </main>;
}
