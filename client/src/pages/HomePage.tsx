import { ArrowRight, Cast, ChevronRight, LockKeyhole, MonitorPlay, RadioTower, Zap } from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { NameDialog } from "../components/NameDialog";

const normalizeRoomCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);

export function HomePage(){
  const [code,setCode]=useState("");
  const [codeError,setCodeError]=useState("");
  const [intent,setIntent]=useState<"broadcast"|"watch"|null>(null);

  const openViewer=()=>{
    if(!/^[A-Z2-9]{8}$/.test(code)){setCodeError("Digite o código de 8 caracteres.");return;}
    setIntent("watch");
  };
  const continueWithName=(name:string)=>{
    sessionStorage.setItem("lumacast-display-name",name);
    if(intent==="broadcast"){
      sessionStorage.removeItem("lumacast-broadcaster");
      location.assign("/broadcast");
      return;
    }
    sessionStorage.removeItem(`lumacast-participant-${code}`);
    location.assign(`/watch/${code}`);
  };

  return <main className="home-shell">
    <header className="home-nav"><Logo/><div className="secure-note"><LockKeyhole/>Conexão protegida</div></header>
    <section className="home-content">
      <div className="eyebrow"><span/> COMPARTILHAMENTO EM TEMPO REAL</div>
      <h1>Sua tela, ao vivo.<br/><em>Sem complicação.</em></h1>
      <p className="lede">Compartilhe uma janela, aba ou monitor com qualquer pessoa. Direto do navegador, com baixa latência e sem instalar nada.</p>
      <div className="action-grid">
        <button type="button" className="choice-card primary-card" onClick={()=>setIntent("broadcast")}><span className="choice-icon"><MonitorPlay/></span><div><strong>Transmitir tela</strong><small>Crie uma sala e convide pessoas</small></div><ChevronRight/></button>
        <div className="choice-card viewer-card"><span className="choice-icon"><Cast/></span><div className="viewer-copy"><strong>Assistir transmissão</strong><small>Entre com o código compartilhado</small><form onSubmit={event=>{event.preventDefault();openViewer();}}><input value={code} onChange={event=>{setCode(normalizeRoomCode(event.target.value));setCodeError("");}} placeholder="CÓDIGO DA SALA" maxLength={8} aria-label="Código da sala" aria-invalid={!!codeError} aria-describedby={codeError?"room-code-error":undefined}/><button type="submit" disabled={code.length!==8} aria-label="Entrar na sala"><ArrowRight/></button></form>{codeError&&<small id="room-code-error" className="room-code-error" role="alert">{codeError}</small>}</div></div>
      </div>
      <div className="benefit-row"><span><Zap/>Latência ultrabaixa</span><span><LockKeyhole/>Conexão protegida</span><span><RadioTower/>Até 1080p · 60 FPS</span></div>
    </section>
    <aside className="home-visual" aria-hidden="true"><div className="glow"/><div className="screen-mock"><div className="mock-top"><span/><span/><span/><i>AO VIVO</i></div><div className="mock-canvas"><div className="mock-window"><div/><div/><div/><div/></div><div className="cursor">↖</div></div><div className="mock-foot"><span><i/> Você está transmitindo</span><b>8 espectadores</b></div></div><div className="float-shell secure"><div className="float-card"><LockKeyhole/><span><b>Privado por padrão</b><small>A sessão é temporária</small></span></div></div><div className="float-shell signal"><div className="float-card"><span className="bars"><i/><i/><i/></span><span><b>Conexão excelente</b><small>32 ms · 6.2 Mbps</small></span></div></div></aside>
    <footer>© {new Date().getFullYear()} LumaCast <span>Privacidade <i>·</i> <button type="button" className="footer-link" onClick={()=>location.assign("/como-funciona")}>Como funciona</button></span></footer>
    {intent&&<NameDialog eyebrow={intent==="broadcast"?"Como quer ser chamado?":`Entrar na sala ${code}`} submitLabel={intent==="broadcast"?"Criar sala":"Entrar na sala"} onSubmit={continueWithName} onCancel={()=>setIntent(null)}/>}
  </main>;
}
