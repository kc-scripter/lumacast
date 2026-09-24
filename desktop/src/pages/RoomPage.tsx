import { BarChart3, Check, Clipboard, MonitorUp, Settings, Square, Users, Video, VideoOff, Volume2, VolumeX, WifiOff } from "lucide-react";
import { useState } from "react";
import { OptimizedVideo, OptimizedVideoTile } from "../../../client/src/components/OptimizedVideo";
import { StatsDrawer } from "../../../client/src/components/StatsDrawer";
import { useAdaptiveScreenQuality } from "../../../client/src/hooks/useAdaptiveScreenQuality";
import { copyText, safeSessionGet } from "../../../client/src/services/browser";
import { useCollaborativeRoom } from "../../../client/src/services/useCollaborativeRoom";
import type { Quality } from "../../../client/src/types";
import { SettingsDialog } from "../components/SettingsDialog";
import { useDesktopMediaPreferences } from "../hooks/useDesktopMediaPreferences";

export function RoomPage({owner,roomId:requestedRoomId,onBack}:{owner:boolean;roomId?:string;onBack:()=>void}){
  const room=useCollaborativeRoom(owner,requestedRoomId);
  const {quality,setQuality,fps,setFps}=useDesktopMediaPreferences();
  const [showSettings,setShowSettings]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const [copied,setCopied]=useState(false);
  useAdaptiveScreenQuality({enabled:quality==="auto"&&room.isScreenSharer&&room.roomState.screenProvider==="agora",stats:room.stats,preferredFps:fps,updateQuality:room.updateScreenQuality,updateFrameRate:room.updateScreenFrameRate});
  const selfName=safeSessionGet("lumacast-display-name")||"Você";
  const webBase=(import.meta.env.VITE_PUBLIC_WEB_URL||"https://lunira-screen.onrender.com").replace(/\/$/,"");
  const invite=room.roomId?webBase+"/?room="+encodeURIComponent(room.roomId):"";
  const canShare=typeof navigator.mediaDevices?.getDisplayMedia==="function";
  const busy=!!room.roomState.activeScreenSharerId&&!room.ownsScreenLock;
  const starting=!!room.roomState.activeScreenSharerId&&!room.roomState.live;
  const sharer=room.roomState.activeScreenSharerName||room.roomState.ownerName||"Participante";

  const stageTitle=room.switching?"Trocando rota de mídia…":starting?(room.ownsScreenLock?"Preparando sua tela…":sharer+" está preparando a tela…"):room.roomState.live?"Conectando à transmissão":"Pronto para compartilhar";
  const stageText=room.roomState.live?"A transmissão aparecerá aqui assim que a faixa de vídeo estiver pronta.":starting?"Aguarde alguns segundos.":"Qualquer participante pode assumir a tela quando ela estiver livre.";

  const copyInvite=async()=>{
    try{
      await copyText(invite);
      setCopied(true);
      setTimeout(()=>setCopied(false),1600);
    }catch{
      room.setError("Não foi possível copiar o convite.");
    }
  };

  const applyQuality=async(next:Quality)=>{
    await room.updateScreenQuality(next);
    if(next!=="auto")await room.updateScreenFrameRate(fps);
  };

  return <main className="room-page">
    <section className="room-header">
      <button type="button" className="back-button" onClick={onBack}>← <span>Início</span></button>
      <div className="room-heading"><span>SALA</span><strong>{room.roomId||requestedRoomId||"--------"}</strong></div>
      <div className="room-header-actions">
        <span className={"room-status "+(room.roomState.live?"live":room.status==="Conectado"?"online":"")}><i/>{room.roomState.live?"Ao vivo":room.status}</span>
        <span className="participant-count"><Users/>{room.roomState.participants.length}</span>
        <button type="button" className="copy-room" disabled={!invite} onClick={()=>void copyInvite()}>{copied?<Check/>:<Clipboard/>}<span>{copied?"Copiado":"Copiar convite"}</span></button>
      </div>
    </section>

    <section className="room-layout">
      <div className="stage-panel">
        <div className="stage-topline">
          <span><i className={room.roomState.live?"live":""}/> Tela principal</span>
          <small>{room.roomState.screenProvider==="livekit"?"Fallback LiveKit":"Agora RTC"} · {quality==="auto"?"AUTO":quality} · {room.stats?.fps??fps} FPS</small>
        </div>
        <div className={"stage "+(room.roomState.live?"has-video":"")}>
          <OptimizedVideo videoRef={room.videoRef} muted={room.isScreenSharer}/>
          <div className="stage-empty">
            <span className="stage-orb"><MonitorUp/></span>
            <h2>{stageTitle}</h2>
            <p>{stageText}</p>
            {!room.roomState.live&&!starting&&!busy&&<button type="button" className="stage-cta" disabled={!room.roomId||!canShare} onClick={()=>void room.startScreen(quality,fps)}><MonitorUp/>Compartilhar tela</button>}
          </div>
        </div>
      </div>

      <aside className="participants-panel">
        <div className="panel-title"><div><span>PARTICIPANTES</span><h3>{room.roomState.participants.length} na sala</h3></div><span className="panel-count">{room.roomState.participants.length}</span></div>
        <div className="participant-list">
          {room.roomState.participants.map(person=>{
            const camera=room.cameras.find(item=>item.identity===person.id);
            const sharing=person.id===room.roomState.activeScreenSharerId;
            const mine=person.displayName===selfName;
            return <article className="participant-card" key={person.id}>
              <div className="participant-media">
                {camera?<OptimizedVideoTile track={camera.track}/>:<span>{person.displayName.slice(0,1).toUpperCase()}</span>}
                {sharing&&<i className="sharing-badge">TELA</i>}
              </div>
              <div className="participant-meta"><div><strong>{person.displayName}</strong><small>{mine?"Você":sharing?"Compartilhando":"Na sala"}</small></div>{camera?<Video/>:<VideoOff/>}</div>
            </article>;
          })}
        </div>
        {room.roomState.participants.length<=1&&<div className="participant-empty"><Users/><strong>Nenhum convidado ainda</strong><p>Envie o código da sala para alguém no Lunira Web.</p><button type="button" disabled={!invite} onClick={()=>void copyInvite()}><Clipboard/>Copiar convite</button></div>}
      </aside>
    </section>

    <div className="room-toolbar" aria-label="Controles da sala">
      {room.isScreenSharer
        ?<button type="button" className="tool active danger-on-hover" onClick={()=>void room.stopScreen()}><Square/><span>Parar tela</span></button>
        :<button type="button" className="tool" disabled={busy||!canShare||!room.roomId} onClick={()=>void room.startScreen(quality,fps)}><MonitorUp/><span>{busy?"Tela ocupada":"Compartilhar"}</span></button>}
      {room.isScreenSharer&&<button type="button" className={"tool "+(room.muted?"":"active")} onClick={()=>void room.toggleScreenAudio()}>{room.muted?<VolumeX/>:<Volume2/>}<span>{room.muted?"Áudio off":"Áudio"}</span></button>}
      <button type="button" className={"tool "+(room.cameraOn?"active":"")} onClick={()=>void room.toggleCamera()}>{room.cameraOn?<Video/>:<VideoOff/>}<span>Câmera</span></button>
      <button type="button" className={"tool "+(showStats?"active":"")} onClick={()=>setShowStats(value=>!value)}><BarChart3/><span>Estatísticas</span></button>
      <button type="button" className="tool" onClick={()=>setShowSettings(true)}><Settings/><span>Configurações</span></button>
    </div>

    {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps} cameraPreset={room.cameraPreset} setCameraPreset={room.setCameraPreset} sharing={room.isScreenSharer} onApplyQuality={value=>void applyQuality(value)} onApplyFps={value=>void room.updateScreenFrameRate(value)}/>}
    {showStats&&<StatsDrawer title="Estatísticas da transmissão" stats={room.stats} onClose={()=>setShowStats(false)}/>}
    {room.error&&<div className="desktop-toast error" role="alert"><WifiOff/><span>{room.error}</span><button type="button" aria-label="Fechar aviso" onClick={()=>room.setError("")}>×</button></div>}
  </main>;
}
