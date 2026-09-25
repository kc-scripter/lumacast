import { ArrowLeft, ArrowRight, CircleHelp, Clock3, Gauge, Link2, MonitorUp, RotateCcw, Server, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";
import { parseRoomInvite } from "../../../client/src/services/invite";
import type { BackendWakeState } from "../services/backendWake";
import { readRecentRooms } from "../services/recentRooms";

type Mode="create"|"join";

export function HomePage({onCreate,onJoin,onResume,onHow,onSettings,backendState,backendMessage,onRetry,onBack}:{
  onCreate:(name:string)=>Promise<boolean>;
  onJoin:(roomId:string,inviteToken:string,name:string)=>Promise<boolean>;
  onResume:(roomId:string,owner:boolean,name:string)=>Promise<boolean>;
  onHow:()=>void;
  onSettings:()=>void;
  backendState:BackendWakeState;
  backendMessage:string;
  onRetry:()=>void;
  onBack:()=>void;
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

  return <main className="home-page home-v3">
    <nav className="home-actions" aria-label="Ações">
      <button type="button" className="home-back" onClick={onBack}><ArrowLeft/>Voltar</button>
      <span className="home-actions-spacer"/>
      <button type="button" onClick={onHow}><CircleHelp/>Como funciona</button>
      <button type="button" onClick={onSettings}><Settings/>Configurações</button>
    </nav>
    <section className="home-main">
      <div className="home-story">
        <span className="hero-kicker"><i/> TRANSMISSÃO EM TEMPO REAL</span>
        <h1 className="hero-flow-title"><span>Compartilhe sua tela</span><br/><span>com mais facilidade.</span></h1>
        <p>Crie uma sala no desktop e conecte quem está no navegador usando um convite privado compatível entre Web e Desktop.</p>
      </div>

      <section className="home-control-card" aria-label="Acessar uma sala">
        <div className="home-mode-tabs" role="tablist" aria-label="Modo">
          <button type="button" role="tab" aria-selected={mode==="create"} className={mode==="create"?"active":""} onClick={()=>selectMode("create")}><MonitorUp/>Criar uma sala</button>
          <button type="button" role="tab" aria-selected={mode==="join"} className={mode==="join"?"active":""} onClick={()=>selectMode("join")}><Users/>Entrar com convite</button>
        </div>
        <form className="home-control-body" onSubmit={event=>{event.preventDefault();void(mode==="create"?create():join());}} noValidate>
          <label className="home-field" htmlFor="display-name"><span>SEU NOME</span><div><UserRound/><input id="display-name" value={name} maxLength={20} onChange={event=>{setName(event.target.value);setFormError("");}} placeholder="Como você quer aparecer?" autoComplete="nickname"/></div></label>
          {mode==="join"&&<label className="home-field room-field" htmlFor="room-code"><span>LINK DE CONVITE</span><div><Link2/><input id="room-code" value={inviteValue} onChange={event=>{setInviteValue(event.target.value.slice(0,512));setFormError("");}} maxLength={512} placeholder="Cole o link privado da sala" autoComplete="off"/></div></label>}
          {formError&&<p className="home-form-error" role="alert">{formError}</p>}
          <button type="submit" className={"home-primary-cta "+(waking?"loading":"")} disabled={!!pending}>
            <span className="cta-leading">{waking?<Server/>:mode==="create"?<MonitorUp/>:<Users/>}</span>
            <span>{waking?"Acordando servidor…":mode==="create"?"Criar sala e começar a transmitir":"Entrar na sala"}</span>
            <ArrowRight className="cta-arrow"/>
          </button>
          <p className="home-control-hint">{mode==="create"?"A sala será criada e você poderá compartilhar sua tela quando estiver pronto.":"Use o link privado enviado pelo anfitrião para entrar na sala."}</p>
          <div className={"backend-state "+backendState} role={backendState==="error"?"alert":"status"}>
            <span className="backend-state-dot"/>
            <div><strong>{backendState==="ready"?"Servidor disponível":backendState==="error"?"Não foi possível conectar":"Preparando servidor"}</strong><small>{backendMessage}</small></div>
            {backendState==="error"&&<button type="button" onClick={onRetry}><RotateCcw/>Tentar novamente</button>}
          </div>
          <div className="home-inline-meta"><span><MonitorUp/>Auto / 720p / 1080p</span><span><Gauge/>30 / 60 FPS</span></div>
          {resumableRooms.length>0&&<div className="recent-rooms"><span className="recent-rooms-label"><Clock3/>SALAS RECENTES</span><div>{resumableRooms.slice(0,3).map(room=><button type="button" key={room.roomId} disabled={!!pending} onClick={()=>void resume(room.roomId,room.owner)}><span><strong>{room.roomId}</strong><small>{room.owner?"Sua sala":"Sala visitada"}</small></span><ArrowRight/></button>)}</div></div>}
        </form>
      </section>
    </section>
  </main>;
}
