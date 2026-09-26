import { ArrowRight, CircleHelp, Clock3, Gauge, Link2, MonitorUp, RotateCcw, Server, Settings, ShieldCheck, UserRound, Users, Zap } from "lucide-react";
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

  return <main className="home-next-page">
    <aside className="approved-app-nav home-next-nav">
      <div className="approved-nav-main">
        <button type="button" className="approved-nav-item active"><MonitorUp/>Início</button>
        <button type="button" className="approved-nav-item" onClick={onSettings}><Settings/>Configurações</button>
      </div>
      <button type="button" className="approved-nav-help" onClick={onHow}><CircleHelp/>Como funciona</button>
    </aside>

    <section className="home-next-workspace">
      <div className="home-next-topline">
        <div className={"home-next-server "+backendState}>
          <i/>
          <span>{backendState==="ready"?"Servidor disponível":backendState==="error"?"Servidor offline":"Preparando servidor"}</span>
          {backendState==="error"&&<button type="button" aria-label="Tentar conectar novamente" onClick={onRetry}><RotateCcw/></button>}
        </div>
      </div>

      <div className="home-next-grid">
        <section className="home-next-hero">
          <span className="home-next-kicker"><i/> MAIS CONEXÃO, MENOS BARREIRAS</span>
          <h1>Compartilhe sua tela<br/><em>com quem importa.</em></h1>
          <p>Transmissão em alta qualidade, direto do seu desktop. Sem complicação, sem interrupções.</p>

          <form className="home-next-form" onSubmit={event=>{event.preventDefault();void(mode==="create"?create():join());}} noValidate>
            <label className="home-next-field" htmlFor="display-name">
              <span>SEU NOME</span>
              <div><UserRound/><input id="display-name" value={name} maxLength={20} onChange={event=>{setName(event.target.value);setFormError("");}} placeholder="Como você quer aparecer?" autoComplete="nickname"/></div>
            </label>

            {mode==="join"&&<label className="home-next-field home-next-invite" htmlFor="room-code">
              <span>LINK DE CONVITE</span>
              <div><Link2/><input id="room-code" value={inviteValue} onChange={event=>{setInviteValue(event.target.value.slice(0,512));setFormError("");}} maxLength={512} placeholder="Cole o link privado da sala" autoComplete="off"/></div>
            </label>}

            {formError&&<p className="home-next-error" role="alert">{formError}</p>}

            <button type="submit" className="home-next-primary" disabled={!!pending}>
              <span>{waking?<Server/>:mode==="create"?<MonitorUp/>:<Users/>}</span>
              <strong>{waking?"Preparando servidor…":mode==="create"?"Criar sala":"Entrar na sala"}</strong>
              <ArrowRight/>
            </button>

            <button type="button" className="home-next-secondary" onClick={()=>selectMode(mode==="create"?"join":"create")}>
              {mode==="create"?<><Users/><span>Entrar em uma sala</span></>:<><MonitorUp/><span>Voltar para criar uma sala</span></>}
            </button>

            <div className={"home-next-backend-note "+backendState}>
              <i/>
              <span>{backendMessage}</span>
            </div>
          </form>

          <div className="home-next-features">
            <span><Gauge/><b>1080p · 60 FPS</b></span>
            <span><Zap/><b>Baixa latência</b></span>
            <span><ShieldCheck/><b>Conexão segura</b></span>
          </div>

          {resumableRooms.length>0&&<section className="home-next-recent">
            <span className="home-next-recent-title"><Clock3/>SALAS RECENTES</span>
            <div>{resumableRooms.slice(0,3).map(room=><button type="button" key={room.roomId} disabled={!!pending} onClick={()=>void resume(room.roomId,room.owner)}>
              <span><strong>{room.roomId}</strong><small>{room.owner?"Sua sala":"Sala visitada"}</small></span><ArrowRight/>
            </button>)}</div>
          </section>}
        </section>

        <section className="home-next-visual" aria-label="Prévia do Lunira Screen">
          <div className="home-next-visual-top">
            <span><MonitorUp/>Lunira Screen</span>
            <b>1080p · 60 FPS</b>
          </div>
          <div className="home-next-moon"/>
          <div className="home-next-mountain mountain-back"/>
          <div className="home-next-mountain mountain-mid"/>
          <div className="home-next-mountain mountain-front"/>
          <div className="home-next-lake"/>
          <div className="home-next-stars"/>
          <div className="home-next-visual-copy">
            <span>TRANSMITA</span>
            <strong>Jogos, trabalho,<br/>estudos e muito mais.</strong>
            <small>Desktop ↔ Web na mesma sala</small>
          </div>
          <div className="home-next-live-card">
            <i/><span>Pronto para compartilhar</span>
          </div>
        </section>
      </div>
    </section>
  </main>;
}
