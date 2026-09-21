import { ArrowRight, Cast, ChevronRight, LockKeyhole, MonitorPlay, RadioTower, Zap } from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/Logo";

export function HomePage(){
  const [code,setCode]=useState("");
  const watch=()=>{const id=code.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12);if(id) location.assign(`/watch/${id}`);};
  return <main className="home-shell">
    <header className="home-nav"><Logo/><div className="secure-note"><LockKeyhole/>Conexão protegida</div></header>
    <section className="home-content">
      <div className="eyebrow"><span/> COMPARTILHAMENTO EM TEMPO REAL</div>
      <h1>Sua tela, ao vivo.<br/><em>Sem complicação.</em></h1>
      <p className="lede">Compartilhe uma janela, aba ou monitor com qualquer pessoa. Direto do navegador, com baixa latência e sem instalar nada.</p>
      <div className="action-grid">
        <button className="choice-card primary-card" onClick={()=>location.assign("/broadcast")}><span className="choice-icon"><MonitorPlay/></span><div><strong>Transmitir tela</strong><small>Crie uma sala e convide pessoas</small></div><ChevronRight/></button>
        <div className="choice-card viewer-card"><span className="choice-icon"><Cast/></span><div className="viewer-copy"><strong>Assistir transmissão</strong><small>Entre com o código compartilhado</small><form onSubmit={e=>{e.preventDefault();watch();}}><input value={code} onChange={e=>setCode(e.target.value)} placeholder="CÓDIGO DA SALA" maxLength={12} aria-label="Código da sala"/><button disabled={!code.trim()} aria-label="Entrar"><ArrowRight/></button></form></div></div>
      </div>
      <div className="benefit-row"><span><Zap/>Latência ultrabaixa</span><span><LockKeyhole/>Conexão protegida</span><span><RadioTower/>Até 1080p · 60 FPS</span></div>
    </section>
    <aside className="home-visual" aria-hidden="true"><div className="glow"/><div className="screen-mock"><div className="mock-top"><span/><span/><span/><i>AO VIVO</i></div><div className="mock-canvas"><div className="mock-window"><div/><div/><div/><div/></div><div className="cursor">↖</div></div><div className="mock-foot"><span><i/> Você está transmitindo</span><b>8 espectadores</b></div></div><div className="float-card secure"><LockKeyhole/><span><b>Privado por padrão</b><small>A sessão é temporária</small></span></div><div className="float-card signal"><span className="bars"><i/><i/><i/></span><span><b>Conexão excelente</b><small>32 ms · 6.2 Mbps</small></span></div></aside>
    <footer>© {new Date().getFullYear()} LumaCast <span>Privacidade <i>·</i> <button type="button" className="footer-link" onClick={()=>location.assign("/como-funciona")}>Como funciona</button></span></footer>
  </main>;
}
