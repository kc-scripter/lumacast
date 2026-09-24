import { ArrowRight, CircleHelp, Gauge, KeyRound, MonitorUp, RotateCcw, Server, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";
import type { BackendWakeState } from "../services/backendWake";

const normalizeCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);
type Mode="create"|"join";

export function HomePage({onCreate,onJoin,onHow,onSettings,backendState,backendMessage,onRetry}:{
  onCreate:(name:string)=>Promise<void>;
  onJoin:(roomId:string,name:string)=>Promise<void>;
  onHow:()=>void;
  onSettings:()=>void;
  backendState:BackendWakeState;
  backendMessage:string;
  onRetry:()=>void;
}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [code,setCode]=useState("");
  const [mode,setMode]=useState<Mode>("create");
  const [pending,setPending]=useState<Mode|null>(null);
  const validName=name.trim().length>=2&&name.trim().length<=20;
  const validCode=/^[A-Z2-9]{8}$/.test(code);
  const waking=backendState==="waking";

  const create=async()=>{if(!validName||pending)return;setPending("create");try{await onCreate(name.trim());}finally{setPending(null);}};
  const join=async()=>{if(!validName||!validCode||pending)return;setPending("join");try{await onJoin(code,name.trim());}finally{setPending(null);}};

  return <main className="home-page home-v3">
    <nav className="home-actions" aria-label="Ações">
      <button type="button" onClick={onHow}><CircleHelp/>Como funciona</button>
      <button type="button" onClick={onSettings}><Settings/>Configurações</button>
    </nav>
    <section className="home-main">
      <div className="home-story">
        <span className="hero-kicker"><i/> TRANSMISSÃO EM TEMPO REAL</span>
        <h1 className="hero-flow-title"><span>Compartilhe sua tela</span><br/><span>com mais facilidade.</span></h1>
        <p>Crie uma sala no desktop e conecte quem está no navegador. O mesmo código funciona entre Web e Desktop.</p>
      </div>

      <section className="home-control-card" aria-label="Acessar uma sala">
        <div className="home-mode-tabs" role="tablist" aria-label="Modo">
          <button type="button" role="tab" aria-selected={mode==="create"} className={mode==="create"?"active":""} onClick={()=>setMode("create")}><MonitorUp/>Criar uma sala</button>
          <button type="button" role="tab" aria-selected={mode==="join"} className={mode==="join"?"active":""} onClick={()=>setMode("join")}><Users/>Entrar com código</button>
        </div>
        <div className="home-control-body">
          <label className="home-field" htmlFor="display-name"><span>SEU NOME</span><div><UserRound/><input id="display-name" value={name} maxLength={20} onChange={event=>setName(event.target.value)} placeholder="Como você quer aparecer?" autoComplete="nickname"/></div></label>
          {mode==="join"&&<label className="home-field room-field"><span>CÓDIGO DA SALA</span><div><KeyRound/><input value={code} onChange={event=>setCode(normalizeCode(event.target.value))} maxLength={8} placeholder="AB12CD34" autoComplete="off" onKeyDown={event=>{if(event.key==="Enter")void join();}}/></div></label>}
          <button type="button" className={"home-primary-cta "+(waking?"loading":"")} disabled={mode==="create"?!validName||!!pending:!validName||!validCode||!!pending} onClick={()=>void(mode==="create"?create():join())}>
            <span className="cta-leading">{waking?<Server/>:mode==="create"?<MonitorUp/>:<Users/>}</span>
            <span>{waking?"Acordando servidor…":mode==="create"?"Criar sala e começar a transmitir":"Entrar na sala"}</span>
            <ArrowRight className="cta-arrow"/>
          </button>
          <p className="home-control-hint">{mode==="create"?"A sala será criada e você poderá compartilhar sua tela quando estiver pronto.":"Use o mesmo código de 8 caracteres criado no navegador ou no desktop."}</p>
          <div className={"backend-state "+backendState} role={backendState==="error"?"alert":"status"}>
            <span className="backend-state-dot"/>
            <div><strong>{backendState==="ready"?"Servidor disponível":backendState==="error"?"Não foi possível conectar":"Preparando servidor"}</strong><small>{backendMessage}</small></div>
            {backendState==="error"&&<button type="button" onClick={onRetry}><RotateCcw/>Tentar novamente</button>}
          </div>
          <div className="home-inline-meta"><span><MonitorUp/>Auto / 720p / 1080p</span><span><Gauge/>30 / 60 FPS</span></div>
        </div>
      </section>
    </section>
  </main>;
}
