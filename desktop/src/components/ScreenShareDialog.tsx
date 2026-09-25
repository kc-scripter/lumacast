import { Check, MonitorUp, RefreshCw, Volume2, X } from "lucide-react";
import { useEffect,useRef } from "react";
import type { FrameRate,Quality } from "../../../client/src/types";

type Preset={label:string;quality:Quality;fps:FrameRate;detail:string};
const PRESETS:Preset[]=[
  {label:"1080p 60",quality:"1080p",fps:60,detail:"Máxima fluidez"},
  {label:"1080p 30",quality:"1080p",fps:30,detail:"Alta qualidade"},
  {label:"720p 60",quality:"720p",fps:60,detail:"Fluido e leve"},
  {label:"720p 30",quality:"720p",fps:30,detail:"Menor uso de banda"}
];

export function ScreenShareDialog({
  mode,stream,quality,fps,onPreset,onPick,onConfirm,onCancel,busy
}:{
  mode:"start"|"switch";
  stream:MediaStream|null;
  quality:Quality;
  fps:FrameRate;
  onPreset:(quality:Quality,fps:FrameRate)=>void;
  onPick:()=>Promise<void>;
  onConfirm:()=>Promise<void>;
  onCancel:()=>void;
  busy:boolean;
}){
  const videoRef=useRef<HTMLVideoElement>(null);
  useEffect(()=>{if(videoRef.current)videoRef.current.srcObject=stream;},[stream]);
  const track=stream?.getVideoTracks()[0];
  const settings=track?.getSettings();
  const hasAudio=!!stream?.getAudioTracks().length;
  return <div className="screen-picker-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onCancel();}}>
    <section className="screen-picker-dialog" role="dialog" aria-modal="true" aria-label={mode==="switch"?"Trocar fonte da tela":"Compartilhar tela"}>
      <header><div><span>COMPARTILHAMENTO</span><h2>{mode==="switch"?"Trocar tela ou janela":"Escolha o que deseja transmitir"}</h2><p>O seletor seguro do Windows abre primeiro; depois você confirma a fonte vendo a prévia.</p></div><button type="button" aria-label="Fechar" disabled={busy} onClick={onCancel}><X/></button></header>
      <div className="screen-picker-content">
        <div className="screen-picker-preview">
          {stream?<><video ref={videoRef} autoPlay muted playsInline/><div className="screen-picker-source"><span><MonitorUp/><strong>{track?.label||"Fonte selecionada"}</strong></span><small>{settings?.width&&settings?.height?`${settings.width}×${settings.height}`:"Resolução automática"}{settings?.frameRate?` · ${Math.round(settings.frameRate)} FPS`:""}{hasAudio?" · áudio do sistema":""}</small></div></>:<div className="screen-picker-empty"><MonitorUp/><h3>Nenhuma fonte selecionada</h3><p>Escolha um monitor ou uma janela no seletor do sistema. Nada é transmitido antes de você confirmar.</p><button type="button" onClick={()=>void onPick()}><MonitorUp/>Escolher tela ou janela</button></div>}
        </div>
        <aside className="screen-picker-options">
          <div><span className="screen-picker-label">PRESET DE TRANSMISSÃO</span><div className="screen-preset-list">{PRESETS.map(preset=><button type="button" key={preset.label} className={quality===preset.quality&&fps===preset.fps?"active":""} onClick={()=>onPreset(preset.quality,preset.fps)}><span>{preset.label}<small>{preset.detail}</small></span>{quality===preset.quality&&fps===preset.fps&&<Check/>}</button>)}</div></div>
          <div className="screen-picker-note"><Volume2/><div><strong>Áudio do sistema</strong><p>{hasAudio?"A fonte selecionada inclui uma faixa de áudio.":"Marque “Compartilhar áudio” no seletor do Windows quando essa opção estiver disponível."}</p></div></div>
        </aside>
      </div>
      <footer><button type="button" className="secondary" disabled={busy} onClick={stream?()=>void onPick():onCancel}>{stream?<><RefreshCw/>Escolher outra fonte</>:"Cancelar"}</button><button type="button" className="primary" disabled={!stream||busy} onClick={()=>void onConfirm()}>{busy?<RefreshCw className="spin"/>:<MonitorUp/>}{busy?"Preparando…":mode==="switch"?"Trocar sem sair da sala":"Começar transmissão"}</button></footer>
    </section>
  </div>;
}
