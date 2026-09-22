import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Clipboard,
  Eye,
  LockKeyhole,
  MonitorPlay,
  Radio,
  RadioTower,
  Users,
  VideoOff,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { NameDialog } from "../components/NameDialog";
import { navigate } from "../services/navigation";

const normalizeRoomCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);

function StudioPreview(){
  return <aside className="home-visual product-preview" aria-label="Prévia ilustrativa da sala de transmissão LumaCast">
    <div className="landing-preview">
      <div className="landing-preview-chrome" aria-hidden="true"><i/><i/><i/></div>
      <div className="landing-preview-appbar">
        <div className="landing-preview-brand"><span><MonitorPlay/></span><b>Luma<span>Cast</span></b></div>
        <div className="landing-preview-room"><small>SALA</small><strong>00000000</strong></div>
        <div className="landing-preview-statuses">
          <span className="preview-ready"><i/>PRONTO</span>
          <span className="preview-online"><i/>Conectado</span>
          <span className="preview-count"><Users/>0</span>
        </div>
      </div>

      <div className="landing-preview-workspace">
        <div className="landing-preview-stage">
          <div className="landing-stage-empty">
            <span><MonitorPlay/></span>
            <b>Nenhuma tela sendo compartilhada</b>
            <small>Qualquer participante pode começar a transmitir.</small>
          </div>
        </div>

        <div className="landing-preview-card preview-invite">
          <div className="preview-card-title"><span><Eye/></span><div><b>Convide espectadores</b><small>Compartilhe este link</small></div></div>
          <div className="preview-code"><strong>00000000</strong><span><Clipboard/></span></div>
          <p>O código também pode ser digitado na página inicial.</p>
        </div>

        <div className="landing-preview-card preview-people">
          <div className="preview-people-title"><Users/><span>1 PESSOA NA SALA</span></div>
          <div className="preview-person"><span>V</span><div><b>Você</b><small>Dono da sala</small></div><i/></div>
        </div>

        <div className="landing-preview-card preview-quality">
          <div className="preview-card-title"><span><Radio/></span><div><b>Qualidade</b><small>Defina antes de iniciar</small></div></div>
          <label>RESOLUÇÃO<div className="preview-select"><span>1080p Full HD</span><ChevronDown/></div></label>
          <label>QUADROS POR SEGUNDO<div className="preview-segment"><span>30 FPS</span><span className="active">60 FPS</span></div></label>
          <label>CÂMERA<div className="preview-select"><span>720p · 40 FPS</span><ChevronDown/></div></label>
        </div>

        <div className="landing-preview-card preview-controls">
          <div className="preview-card-title"><span><MonitorPlay/></span><div><b>Controles</b><small>Tela, câmera e estatísticas</small></div></div>
          <div className="preview-control"><VideoOff/>Câmera</div>
          <div className="preview-control primary"><Radio/>Compartilhar tela</div>
          <div className="preview-control"><BarChart3/>Estatísticas</div>
        </div>
      </div>
    </div>
  </aside>;
}

export function HomePage(){
  const [code,setCode]=useState("");
  const [codeError,setCodeError]=useState("");
  const [intent,setIntent]=useState<"broadcast"|"watch"|null>(null);
  const [viewerOpen,setViewerOpen]=useState(false);

  const openViewer=()=>{
    if(!/^[A-Z2-9]{8}$/.test(code)){setCodeError("Digite o código de 8 caracteres.");return;}
    setIntent("watch");
  };

  const continueWithName=(name:string)=>{
    sessionStorage.setItem("lumacast-display-name",name);
    if(intent==="broadcast"){
      sessionStorage.removeItem("lumacast-broadcaster");
      navigate("/broadcast");
      return;
    }
    sessionStorage.removeItem(`lumacast-participant-${code}`);
    navigate(`/watch/${code}`);
  };

  return <main className="home-shell">
    <header className="home-nav">
      <Logo/>
      <nav className="home-nav-links" aria-label="Navegação principal">
        <a href="/como-funciona" onClick={event=>{event.preventDefault();navigate("/como-funciona");}}>Como funciona</a>
        <div className="secure-note"><LockKeyhole/>Conexão protegida</div>
      </nav>
    </header>

    <section className="home-content">
      <div className="eyebrow"><span/> COMPARTILHAMENTO EM TEMPO REAL</div>
      <h1>Sua tela, ao vivo.<br/><em>Sem complicação.</em></h1>
      <p className="lede">Compartilhe uma janela, aba ou monitor com qualquer pessoa.<br className="home-lede-break"/> Direto do navegador, com baixa latência e sem instalar nada.</p>

      <div className="home-action-stack">
        <button type="button" className="home-primary-action" onClick={()=>setIntent("broadcast")}>
          <span className="home-action-icon"><MonitorPlay/></span>
          <span className="home-action-copy"><strong>Transmitir tela</strong><small>Crie uma sala e convide pessoas</small></span>
          <ArrowRight className="home-action-arrow"/>
        </button>

        <div className={`home-viewer-action ${viewerOpen?"expanded":""}`}>
          <button type="button" className="home-viewer-toggle" aria-expanded={viewerOpen} onClick={()=>{setViewerOpen(value=>!value);setCodeError("");}}>
            <span className="home-action-icon"><Users/></span>
            <span className="home-action-copy"><strong>Assistir transmissão</strong><small>Entre com o código compartilhado</small></span>
            <ArrowRight className="home-action-arrow"/>
          </button>
          <form className="home-viewer-form" onSubmit={event=>{event.preventDefault();openViewer();}}>
            <input
              value={code}
              onChange={event=>{setCode(normalizeRoomCode(event.target.value));setCodeError("");}}
              placeholder="CÓDIGO DA SALA"
              maxLength={8}
              aria-label="Código da sala"
              aria-invalid={!!codeError}
              aria-describedby={codeError?"room-code-error":undefined}
              autoComplete="off"
            />
            <button type="submit" disabled={code.length!==8} aria-label="Entrar na sala"><ArrowRight/></button>
          </form>
          {codeError&&<small id="room-code-error" className="room-code-error" role="alert">{codeError}</small>}
        </div>
      </div>

      <div className="benefit-row">
        <span><Zap/>Latência ultrabaixa</span>
        <span><LockKeyhole/>Conexão protegida</span>
        <span><RadioTower/>Até 1080p · 60 FPS</span>
      </div>
    </section>

    <StudioPreview/>

    <footer>
      © {new Date().getFullYear()} LumaCast
      <span>Privacidade <i>·</i> <button type="button" className="footer-link" onClick={()=>navigate("/termos")}>Termos</button> <i>·</i> <button type="button" className="footer-link" onClick={()=>navigate("/como-funciona")}>Como funciona</button></span>
    </footer>

    {intent&&<NameDialog eyebrow={intent==="broadcast"?"Como quer ser chamado?":`Entrar na sala ${code}`} submitLabel={intent==="broadcast"?"Criar sala":"Entrar na sala"} onSubmit={continueWithName} onCancel={()=>setIntent(null)}/>}
  </main>;
}
