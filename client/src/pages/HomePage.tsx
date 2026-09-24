import {
  ArrowRight,
  LockKeyhole,
  MonitorPlay,
  RadioTower,
  Users,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "../components/Logo";
import { NameDialog } from "../components/NameDialog";
import { RoomProductPreview } from "../components/RoomProductPreview";
import { navigate } from "../services/navigation";
import { safeSessionRemove,safeSessionSet } from "../services/browser";

const normalizeRoomCode=(value:string)=>value.toUpperCase().replace(/[^A-Z2-9]/g,"").slice(0,8);

export function HomePage(){
  const androidApp=import.meta.env.VITE_ANDROID_APP==="true";
  const [code,setCode]=useState("");
  const [codeError,setCodeError]=useState("");
  const [intent,setIntent]=useState<"broadcast"|"watch"|null>(null);
  const [viewerOpen,setViewerOpen]=useState(false);

  const openViewer=()=>{
    if(!/^[A-Z2-9]{8}$/.test(code)){setCodeError("Digite o código de 8 caracteres.");return;}
    setIntent("watch");
  };

  const continueWithName=(name:string)=>{
    safeSessionSet("lumacast-display-name",name);
    if(intent==="broadcast"){
      safeSessionRemove("lumacast-broadcaster");
      navigate("/broadcast");
      return;
    }
    safeSessionRemove(`lumacast-participant-${code}`);
    navigate(`/watch/${code}`);
  };

  return <main className="home-shell">
    <div className="home-ambient" aria-hidden="true"><i/><i/><i/></div>
    <header className="home-nav">
      <Logo/>
      <nav className="home-nav-links" aria-label="Navegação principal">
        <a href="/como-funciona" onClick={event=>{event.preventDefault();navigate("/como-funciona");}}>Como funciona</a>
        <div className="secure-note"><LockKeyhole/>Conexão protegida</div>
      </nav>
    </header>

    <section className="home-content">
      <div className="eyebrow"><span/> {androidApp?"LUNIRA SCREEN · ANDROID":"COMPARTILHAMENTO EM TEMPO REAL"}</div>
      <h1>{androidApp?<>Suas salas,<br/><em>onde você estiver.</em></>:<>Sua tela, ao vivo.<br/><em>Sem complicação.</em></>}</h1>
      <p className="lede">{androidApp?<>Crie ou entre em salas do Lunira pelo celular. Assista transmissões, use câmera e áudio e continue conectado em tempo real.</>:<>Compartilhe uma janela, aba ou monitor com qualquer pessoa.<br className="home-lede-break"/> Direto do navegador, com baixa latência e sem instalar nada.</>}</p>

      <div className="home-action-stack">
        <button type="button" className="home-primary-action" onClick={()=>setIntent("broadcast")}>
          <span className="home-action-icon"><MonitorPlay/></span>
          <span className="home-action-copy"><strong>{androidApp?"Criar sala":"Transmitir tela"}</strong><small>{androidApp?"Abra uma sala e conecte seus dispositivos":"Crie uma sala e convide pessoas"}</small></span>
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
        <span><RadioTower/>{androidApp?"Câmera e áudio em tempo real":"Até 1080p · 60 FPS"}</span>
      </div>
    </section>

    <div className="home-visual-zone">
      <RoomProductPreview className="home-visual product-preview"/>
    </div>

    <footer>
      © {new Date().getFullYear()} Lunira Screen
      <span>Privacidade <i>·</i> <button type="button" className="footer-link" onClick={()=>navigate("/termos")}>Termos</button> <i>·</i> <button type="button" className="footer-link" onClick={()=>navigate("/como-funciona")}>Como funciona</button></span>
    </footer>

    {intent&&<NameDialog eyebrow={intent==="broadcast"?"Como quer ser chamado?":`Entrar na sala ${code}`} submitLabel={intent==="broadcast"?"Criar sala":"Entrar na sala"} onSubmit={continueWithName} onCancel={()=>setIntent(null)}/>}
  </main>;
}
