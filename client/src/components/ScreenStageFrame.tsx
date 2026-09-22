import { Maximize2,Minimize2,MonitorUp,Radio,Signal } from "lucide-react";
import type { ReactNode } from "react";

type Props={
  children:ReactNode;
  sharerName:string;
  live:boolean;
  focused:boolean;
  onToggleFocus:()=>void;
  qualityLabel:string;
  providerLabel:string;
};

export function ScreenStageFrame({children,sharerName,live,focused,onToggleFocus,qualityLabel,providerLabel}:Props){
  return <section className={`screen-stage-frame ${focused?"focused":""}`}>
    <header className="screen-stage-toolbar">
      <div className="screen-stage-identity">
        <span className="screen-stage-icon"><MonitorUp/></span>
        <div>
          <div className="screen-stage-title-line">
            <b>{live?sharerName:"Tela da sala"}</b>
            {live&&<span className="screen-stage-live-tag"><Radio/>Transmitindo agora</span>}
          </div>
          <small>{live?"Compartilhando agora":"Aguardando alguém compartilhar a tela"}</small>
        </div>
      </div>
      <button type="button" className="screen-focus-button" onClick={onToggleFocus} aria-pressed={focused} title={focused?"Sair do foco":"Focar tela"}>
        {focused?<Minimize2/>:<Maximize2/>}
        <span>{focused?"Sair do foco":"Focar tela"}</span>
      </button>
    </header>

    <div className="screen-stage-media">{children}</div>

    {live&&<footer className="screen-stage-meta">
      <div className="screen-sharer-summary">
        <Signal/>
        <span><b>{sharerName}</b><small>Compartilhando via {providerLabel}</small></span>
      </div>
      <span className="screen-quality-badge">{qualityLabel}</span>
    </footer>}
  </section>;
}
