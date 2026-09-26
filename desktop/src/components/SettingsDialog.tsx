import { useState } from "react";
import type { CameraPreset, FrameRate, Quality } from "../../../client/src/types";
import { Modal } from "./Modal";

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

  return <Modal title="Configurações" eyebrow="LUNIRA SCREEN" onClose={onClose} className="settings-modal">
    <div className="settings-layout">
      <aside className="settings-nav" aria-label="Seções de configurações">
        <button className={tab==="stream"?"active":""} type="button" onClick={()=>setTab("stream")}>Transmissão</button>
        {hasCamera&&<button className={tab==="camera"?"active":""} type="button" onClick={()=>setTab("camera")}>Câmera</button>}
      </aside>
      <div className="settings-content">
        {tab==="stream"&&<section className="settings-section">
          <div><h3>Transmissão</h3><p>As mesmas opções que já são suportadas pelo Lunira Screen web.</p></div>
          <label className="setting-field"><span><b>Resolução da tela</b><small>{sharing?"Aplicada ao vivo quando possível.":"Usada na próxima transmissão."}</small></span><select value={quality} onChange={event=>qualityChange(event.target.value as Quality)}><option value="auto">Automática — recomendada</option><option value="720p">720p HD</option><option value="1080p">1080p Full HD</option></select></label>
          <div className="setting-field"><span><b>Taxa de quadros</b><small>30 FPS usa menos banda; 60 FPS prioriza movimento.</small></span><div className="segmented"><button type="button" className={fps===30?"active":""} aria-pressed={fps===30} onClick={()=>fpsChange(30)}>30 FPS</button><button type="button" className={fps===60?"active":""} aria-pressed={fps===60} onClick={()=>fpsChange(60)}>60 FPS</button></div></div>
          <div className="settings-note"><strong>Uso eficiente de mídia</strong><p>O desktop não abre uma segunda transmissão para o mesmo vídeo. A rota alternativa só entra quando a sala realmente precisa dela.</p></div>
        </section>}
        {tab==="camera"&&hasCamera&&<section className="settings-section">
          <div><h3>Câmera</h3><p>Os mesmos presets disponíveis no cliente web.</p></div>
          <label className="setting-field"><span><b>Preset da câmera</b><small>1080p50 pede 1920×1080 a 50 FPS quando a câmera suportar.</small></span><select value={cameraPreset} onChange={event=>setCameraPreset?.(event.target.value as CameraPreset)}><option value="1080p50">1080p · 50 FPS</option><option value="720p40">720p · 40 FPS</option><option value="480p60">480p · 60 FPS</option></select></label>
        </section>}
      </div>
    </div>
  </Modal>;
}
