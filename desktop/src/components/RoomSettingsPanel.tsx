import { useState } from "react";
import { Gauge, MonitorUp, Video } from "lucide-react";
import type { CameraPreset, FrameRate, Quality } from "../../../client/src/types";

export function RoomSettingsPanel({quality,setQuality,fps,setFps,cameraPreset,setCameraPreset,sharing,onApplyQuality,onApplyFps}:{
  quality:Quality;setQuality:(value:Quality)=>void;fps:FrameRate;setFps:(value:FrameRate)=>void;
  cameraPreset:CameraPreset;setCameraPreset:(value:CameraPreset)=>void;sharing:boolean;
  onApplyQuality:(value:Quality)=>void;onApplyFps:(value:FrameRate)=>void;
}){
  const [section,setSection]=useState<"screen"|"camera">("screen");
  const changeQuality=(value:Quality)=>{setQuality(value);if(sharing)onApplyQuality(value);};
  const changeFps=(value:FrameRate)=>{setFps(value);if(sharing)onApplyFps(value);};
  return <section className="room-settings-board" aria-label="Configurações da sala">
    <header><span>CONFIGURAÇÕES</span><h1>Settings</h1><p>Preferências reais de transmissão e câmera.</p></header>
    <div className="room-settings-body">
      <nav aria-label="Seções de configurações">
        <button type="button" className={section==="screen"?"active":""} onClick={()=>setSection("screen")}><MonitorUp/>Transmissão</button>
        <button type="button" className={section==="camera"?"active":""} onClick={()=>setSection("camera")}><Video/>Câmera</button>
      </nav>
      <div className="room-settings-content">
        {section==="screen"?<><div className="room-settings-title"><MonitorUp/><div><h2>Transmissão</h2><p>Qualidade aplicada à sua tela compartilhada.</p></div></div>
          <label className="room-settings-field"><span><strong>Resolução da tela</strong><small>{sharing?"Atualizada durante a transmissão, quando possível.":"Usada na próxima transmissão."}</small></span><select value={quality} onChange={event=>changeQuality(event.target.value as Quality)}><option value="auto">Automática</option><option value="720p">720p HD</option><option value="1080p">1080p Full HD</option></select></label>
          <div className="room-settings-field"><span><strong>Taxa de quadros</strong><small>Escolha 30 ou 60 FPS.</small></span><div className="segmented"><button type="button" className={fps===30?"active":""} aria-pressed={fps===30} onClick={()=>changeFps(30)}>30 FPS</button><button type="button" className={fps===60?"active":""} aria-pressed={fps===60} onClick={()=>changeFps(60)}>60 FPS</button></div></div>
          <div className="room-settings-foot"><Gauge/> Essas opções usam a mídia já suportada pela sala.</div>
        </>:<><div className="room-settings-title"><Video/><div><h2>Câmera</h2><p>Escolha a qualidade solicitada à câmera.</p></div></div>
          <label className="room-settings-field"><span><strong>Preset da câmera</strong><small>Depende da câmera conectada ao dispositivo.</small></span><select value={cameraPreset} onChange={event=>setCameraPreset(event.target.value as CameraPreset)}><option value="1080p50">1080p · 50 FPS</option><option value="720p40">720p · 40 FPS</option><option value="480p60">480p · 60 FPS</option></select></label>
        </>}
      </div>
    </div>
  </section>;
}
