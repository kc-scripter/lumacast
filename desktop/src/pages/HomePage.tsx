import { ArrowRight, MonitorUp, Settings, Users } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";

const normalizeCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);

export function HomePage({
  onCreate,onJoin,onHow,onSettings
}:{
  onCreate:(name:string)=>void;
  onJoin:(roomId:string,name:string)=>void;
  onHow:()=>void;
  onSettings:()=>void;
}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [code,setCode]=useState("");
  const validName=name.trim().length>=2&&name.trim().length<=20;
  const validCode=/^[A-Z2-9]{8}$/.test(code);

  return <main className="home-page">
    <nav className="home-actions"><button type="button" onClick={onHow}>Como funciona</button><button type="button" onClick={onSettings}><Settings/>Configurações</button></nav>
    <section className="home-hero">
      <span className="hero-kicker"><i/> TRANSMISSÃO EM TEMPO REAL</span>
      <h1>Sua tela, ao vivo.<br/><em>Sem complicação.</em></h1>
      <p>Compartilhe pelo desktop com quem está no navegador, ou entre em uma sala web sem trocar de plataforma.</p>
    </section>

    <section className="identity-block">
      <label htmlFor="display-name">SEU NOME</label>
      <input id="display-name" value={name} maxLength={20} onChange={event=>setName(event.target.value)} placeholder="Como você quer aparecer na sala?" autoComplete="nickname"/>
    </section>

    <section className="action-grid">
      <article className="action-card action-card-primary">
        <div className="card-icon"><MonitorUp/></div>
        <div className="card-copy"><span>CRIAR UMA SALA</span><h2>Compartilhar tela</h2><p>Abra uma sala compatível com o Lunira web e comece quando estiver pronto.</p></div>
        <button type="button" className="primary-button" disabled={!validName} onClick={()=>onCreate(name.trim())}>Começar a transmitir<ArrowRight/></button>
        <small>Auto / 720p / 1080p · 30 / 60 FPS</small>
      </article>

      <article className="action-card">
        <div className="card-icon"><Users/></div>
        <div className="card-copy"><span>ENTRAR EM UMA SALA</span><h2>Usar um código</h2><p>Entre na mesma sala criada no site ou em outro desktop.</p></div>
        <label className="room-code-field"><span>CÓDIGO DA SALA</span><div><input value={code} onChange={event=>setCode(normalizeCode(event.target.value))} maxLength={8} placeholder="AB12CD34" autoComplete="off" onKeyDown={event=>{if(event.key==="Enter"&&validName&&validCode)onJoin(code,name.trim());}}/><button type="button" disabled={!validName||!validCode} aria-label="Entrar na sala" onClick={()=>onJoin(code,name.trim())}><ArrowRight/></button></div></label>
        <small>8 caracteres · letras maiúsculas e números</small>
      </article>
    </section>

    <footer className="home-foot"><span><i/> Compatível com Lunira Web</span><span>Desktop · conexão em tempo real</span></footer>
  </main>;
}
