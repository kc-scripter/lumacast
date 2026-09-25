import { ArrowLeft, ArrowRight, CircleHelp, Gauge, KeyRound, MonitorUp, RotateCcw, Server, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";
import { parseRoomInvite } from "../../../client/src/services/invite";
import type { BackendWakeState } from "../services/backendWake";

type Mode="create"|"join";

export function HomePage({onCreate,onJoin,onHow,onSettings,backendState,backendMessage,onRetry,onBack}:{
  onCreate:(name:string)=>Promise<boolean>;
  onJoin:(roomId:string,inviteToken:string,name:string)=>Promise<boolean>;
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
  const [pending,setPending]=useState<Mode|null>(null);
  const [formError,setFormError]=useState("");
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
          {mode==="join"&&<label className="home-field room-field" htmlFor="room-code"><span>LINK DE CONVITE</span><div><KeyRound/><input id="room-code" value={inviteValue} onChange={event=>{setInviteValue(event.target.value.slice(0,512));setFormError("");}} maxLength={512} placeholder="Cole o link privado da sala" autoComplete="off"/></div></label>}
          {formError&&<p className="home-form-error" role="alert">{formError}</p>}
          <button type="submit" className={"home-primary-cta "+(waking?"loading":"")} disabled={!!pending}>
            <span className="cta-leading">{waking?<Server/>:mode==="create"?<MonitorUp/>:<Users/>}</span>
            <span>{waking?"Acordando servidor…":mode==="create"?"Criar sala e começar a transmitir":"Entrar na sala"}</span>
            <ArrowRight className="cta-arrow"/>
          </button>
          <p className="home-control-hint">{mode==="create"?"A sala será criada e você poderá compartilhar sua tela quando estiver pronto.":"Use o link de convite completo criado no navegador ou no desktop."}</p>
          <div className={"backend-state "+backendState} role={backendState==="error"?"alert":"status"}>
            <span className="backend-state-dot"/>
            <div><strong>{backendState==="ready"?"Servidor disponível":backendState==="error"?"Não foi possível conectar":"Preparando servidor"}</strong><small>{backendMessage}</small></div>
            {backendState==="error"&&<button type="button" onClick={onRetry}><RotateCcw/>Tentar novamente</button>}
          </div>
          <div className="home-inline-meta"><span><MonitorUp/>Auto / 720p / 1080p</span><span><Gauge/>30 / 60 FPS</span></div>
        </form>
      </section>
    </section>
  </main>;
}
