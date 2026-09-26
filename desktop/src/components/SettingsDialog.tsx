import { ArrowLeft, MonitorUp, Settings, Video, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { CameraPreset, FrameRate, Quality } from "../../../client/src/types";

type Tab="stream"|"camera";

export function SettingsDialog({
  onClose,quality,setQuality,fps,setFps,cameraPreset,setCameraPreset,sharing,onApplyQuality,onApplyFps
}:{
  onClose:()=>void;
  quality:Quality;
  setQuality:(value:Quality)=>void;
  fps:FrameRate;
  setFps:(value:FrameRate)=>void;
  cameraPreset?:CameraPreset;
  setCameraPreset?:(value:CameraPreset)=>void;
  sharing?:boolean;
  onApplyQuality?:(value:Quality)=>void;
  onApplyFps?:(value:FrameRate)=>void;
}){
  const [tab,setTab]=useState<Tab>("stream");
  const hasCamera=!!cameraPreset&&!!setCameraPreset;
  const qualityChange=(value:Quality)=>{setQuality(value);if(sharing)onApplyQuality?.(value);};
  const fpsChange=(value:FrameRate)=>{setFps(value);if(sharing)onApplyFps?.(value);};

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose();};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[onClose]);

  return <section className="approved-settings-page" role="dialog" aria-modal="true" aria-label="Configurações">
    <aside className="approved-app-nav approved-settings-app-nav">
      <div className="approved-nav-main">
        <button type="button" className="approved-nav-item" onClick={onClose}><ArrowLeft/>Sala</button>
        <button type="button" className="approved-nav-item active"><Settings/>Configurações</button>
      </div>
    </aside>

    <div className="approved-settings-workspace">
      <header className="approved-settings-header">
        <div><span className="approved-eyebrow">LUNIRA SCREEN</span><h2>Configurações</h2><p>Ajuste apenas os recursos disponíveis no app.</p></div>
        <button type="button" aria-label="Fechar configurações" onClick={onClose}><X/></button>
      </header>

      <div className="approved-settings-layout">
        <nav className="approved-settings-sections" aria-label="Seções de configurações">
          <button type="button" className={tab==="stream"?"active":""} onClick={()=>setTab("stream")}><MonitorUp/><span><strong>Transmissão</strong><small>Qualidade e FPS</small></span></button>
          {hasCamera&&<button type="button" className={tab==="camera"?"active":""} onClick={()=>setTab("camera")}><Video/><span><strong>Câmera</strong><small>Preset de captura</small></span></button>}
        </nav>

        <main className="approved-settings-content">
          {tab==="stream"&&<section>
            <div className="approved-settings-title"><h3>Transmissão</h3><p>Configurações usadas pelo compartilhamento de tela.</p></div>

            <div className="approved-setting-card">
              <div><strong>Resolução da tela</strong><small>{sharing?"Aplicada ao vivo quando possível.":"Usada na próxima transmissão."}</small></div>
              <select value={quality} onChange={event=>qualityChange(event.target.value as Quality)}>
                <option value="auto">Automática — recomendada</option>
                <option value="720p">720p HD</option>
                <option value="1080p">1080p Full HD</option>
              </select>
            </div>

            <div className="approved-setting-card">
              <div><strong>Taxa de quadros</strong><small>30 FPS usa menos banda; 60 FPS prioriza movimento.</small></div>
              <div className="approved-settings-segmented">
                <button type="button" className={fps===30?"active":""} aria-pressed={fps===30} onClick={()=>fpsChange(30)}>30 FPS</button>
                <button type="button" className={fps===60?"active":""} aria-pressed={fps===60} onClick={()=>fpsChange(60)}>60 FPS</button>
              </div>
            </div>

            <div className="approved-settings-note"><MonitorUp/><div><strong>Desktop e Web na mesma sala</strong><p>Essas opções usam o mesmo fluxo de mídia e signaling já suportado pelo Lunira Screen.</p></div></div>
          </section>}

          {tab==="camera"&&hasCamera&&<section>
            <div className="approved-settings-title"><h3>Câmera</h3><p>Escolha o preset usado pela câmera quando ela estiver ligada.</p></div>
            <div className="approved-setting-card">
              <div><strong>Preset da câmera</strong><small>O dispositivo usa a melhor combinação suportada próxima ao preset escolhido.</small></div>
              <select value={cameraPreset} onChange={event=>setCameraPreset?.(event.target.value as CameraPreset)}>
                <option value="1080p50">1080p · 50 FPS</option>
                <option value="720p40">720p · 40 FPS</option>
                <option value="480p60">480p · 60 FPS</option>
              </select>
            </div>
          </section>}
        </main>
      </div>
    </div>
  </section>;
}
