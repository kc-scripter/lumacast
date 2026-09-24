import { ArrowRight, CircleHelp, Gauge, KeyRound, MonitorUp, Settings, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { safeSessionGet } from "../../../client/src/services/browser";

const normalizeCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);
type Mode="create"|"join";

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
  const [mode,setMode]=useState<Mode>("create");
  const validName=name.trim().length>=2&&name.trim().length<=20;
  const validCode=/^[A-Z2-9]{8}$/.test(code);

  return <main className="home-page home-v2">
    <nav className="home-actions" aria-label="Ações">
      <button type="button" onClick={onHow}><CircleHelp/>Como funciona</button>
      <button type="button" onClick={onSettings}><Settings/>Configurações</button>
    </nav>

    <section className="home-main">
      <div className="home-story">
        <span className="hero-kicker"><i/> TRANSMISSÃO EM TEMPO REAL</span>
        <h1 className="hero-flow-title"><span>Compartilhe sua tela</span><br/><span>com mais facilidade.</span></h1>
        <p>Crie uma sala no desktop e conecte quem está no navegador. O mesmo código funciona entre Web e Desktop.</p>

        <div className="home-benefits">
          <div><span><Gauge/></span><p><strong>Tempo real</strong><small>Compartilhamento direto e responsivo.</small></p></div>
          <div><span><Users/></span><p><strong>Web + Desktop</strong><small>Todos entram na mesma sala.</small></p></div>
          <div><span><MonitorUp/></span><p><strong>Até 1080p · 60 FPS</strong><small>Qualidade ajustável na transmissão.</small></p></div>
        </div>

        <div className="share-visual" aria-hidden="true">
          <div className="share-monitor">
            <div className="share-monitor-bar"><span/><span/><span/><b>AO VIVO</b></div>
            <div className="share-monitor-body">
              <div className="share-stage">
                <div className="share-wave"/>
                <div className="share-cursor"/>
              </div>
              <div className="share-rail"><i/><i/><i/></div>
            </div>
          </div>
          <div className="share-mini"><MonitorUp/><span>Você está compartilhando</span></div>
          <div className="share-link"/>
        </div>
      </div>

      <section className="home-control-card" aria-label="Acessar uma sala">
        <div className="home-mode-tabs" role="tablist" aria-label="Modo">
          <button type="button" role="tab" aria-selected={mode==="create"} className={mode==="create"?"active":""} onClick={()=>setMode("create")}><MonitorUp/>Criar uma sala</button>
          <button type="button" role="tab" aria-selected={mode==="join"} className={mode==="join"?"active":""} onClick={()=>setMode("join")}><Users/>Entrar com código</button>
        </div>

        <div className="home-control-body">
          <label className="home-field" htmlFor="display-name">
            <span>SEU NOME</span>
            <div><UserRound/><input id="display-name" value={name} maxLength={20} onChange={event=>setName(event.target.value)} placeholder="Como você quer aparecer?" autoComplete="nickname"/></div>
          </label>

          {mode==="create"?<>
            <button type="button" className="home-primary-cta" disabled={!validName} onClick={()=>onCreate(name.trim())}><MonitorUp/><span>Criar sala e começar a transmitir</span><ArrowRight/></button>
            <p className="home-control-hint">A sala será criada e você poderá compartilhar sua tela quando estiver pronto.</p>
            <div className="home-inline-meta"><span><MonitorUp/>Auto / 720p / 1080p</span><span><Gauge/>30 / 60 FPS</span></div>
          </>:<>
            <label className="home-field room-field">
              <span>CÓDIGO DA SALA</span>
              <div><KeyRound/><input value={code} onChange={event=>setCode(normalizeCode(event.target.value))} maxLength={8} placeholder="AB12CD34" autoComplete="off" onKeyDown={event=>{if(event.key==="Enter"&&validName&&validCode)onJoin(code,name.trim());}}/></div>
            </label>
            <button type="button" className="home-primary-cta" disabled={!validName||!validCode} onClick={()=>onJoin(code,name.trim())}><Users/><span>Entrar na sala</span><ArrowRight/></button>
            <p className="home-control-hint">Use o mesmo código de 8 caracteres criado no navegador ou no desktop.</p>
          </>}
        </div>
      </section>
    </section>

    <footer className="home-feature-strip">
      <div><span><MonitorUp/></span><p><strong>Tela em tempo real</strong><small>Compartilhe quando estiver pronto.</small></p></div>
      <div><span><Gauge/></span><p><strong>Até 1080p · 60 FPS</strong><small>Qualidade e FPS configuráveis.</small></p></div>
      <div><span><Users/></span><p><strong>Web e Desktop</strong><small>Compatíveis na mesma sala.</small></p></div>
      <div><span><KeyRound/></span><p><strong>Sala por código</strong><small>Entre usando 8 caracteres.</small></p></div>
    </footer>
  </main>;
}
