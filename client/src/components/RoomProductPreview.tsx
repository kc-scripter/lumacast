import { BrandMark } from "./Logo";
import {
  BarChart3,
  ChevronDown,
  Clipboard,
  Eye,
  LockKeyhole,
  Maximize2,
  MonitorUp,
  Radio,
  Settings2,
  Users,
  VideoOff,
} from "lucide-react";

type Props={className?:string;compact?:boolean};

export function RoomProductPreview({className="",compact=false}:Props){
  return <aside className={`room-product-preview ${compact?"compact":""} ${className}`.trim()} aria-label="Prévia ilustrativa da interface atual da sala Lunira Screen">
    <div className="rpp-browser" aria-hidden="true"><i/><i/><i/></div>
    <div className="rpp-appbar">
      <div className="rpp-brand"><BrandMark small/><b>Lunira <em>Screen</em></b></div>
      <div className="rpp-statuses">
        <span className="rpp-ready"><i/>PRONTO</span>
        <span className="rpp-online"><i/>Conectado</span>
        <span className="rpp-people"><Users/>1<ChevronDown/></span>
        <span className="rpp-avatar">N</span>
      </div>
    </div>
    <div className="rpp-workspace">
      <section className="rpp-stage-card">
        <header className="rpp-stage-toolbar">
          <div className="rpp-stage-title">
            <span><MonitorUp/></span>
            <div><b>Tela da sala</b><small>Aguardando alguém compartilhar a tela</small></div>
          </div>
          <button type="button" tabIndex={-1}><Maximize2/>Focar tela</button>
        </header>
        <div className="rpp-stage-screen">
          <div className="rpp-empty">
            <span><MonitorUp/></span>
            <b>Nenhuma tela sendo compartilhada</b>
            <small>Qualquer participante pode começar a transmitir.</small>
          </div>
        </div>
      </section>
      <aside className="rpp-sidebar">
        <section className="rpp-card rpp-invite">
          <div className="rpp-card-title"><span><Eye/></span><div><b>Convide espectadores</b><small>Compartilhe este link ou código</small></div></div>
          <div className="rpp-code"><strong>00000000</strong><span><Clipboard/></span></div>
          <p>O código também pode ser digitado na página inicial.</p>
        </section>
        <section className="rpp-card rpp-quality">
          <div className="rpp-card-title"><span><Settings2/></span><div><b>Qualidade</b><small>Defina antes de iniciar</small></div></div>
          <label>RESOLUÇÃO<div className="rpp-select"><span>1080p Full HD</span><ChevronDown/></div></label>
          <label>QUADROS POR SEGUNDO<div className="rpp-segment"><span>30 FPS</span><span className="active">60 FPS</span></div></label>
          <label>CÂMERA<div className="rpp-select"><span>720p · 40 FPS</span><ChevronDown/></div></label>
        </section>
        <section className="rpp-card rpp-controls">
          <div className="rpp-card-title"><span><MonitorUp/></span><div><b>Controles</b><small>Tela, câmera e estatísticas</small></div></div>
          <div className="rpp-control"><VideoOff/>Câmera</div>
          <div className="rpp-control primary"><Radio/>Compartilhar tela</div>
          <div className="rpp-control"><BarChart3/>Estatísticas</div>
        </section>
      </aside>
    </div>
    <div className="rpp-secure"><LockKeyhole/>Interface ilustrativa · conexão protegida</div>
  </aside>;
}
