import { BarChart3,LoaderCircle,Radio,RefreshCw,Signal,Square,Video,VideoOff,Volume2,VolumeX } from "lucide-react";
import { useState } from "react";
import { BrowserCompatibilityNotice } from "../components/BrowserCompatibilityNotice";
import { Logo } from "../components/Logo";
import { NameDialog } from "../components/NameDialog";
import { RoomParticipantsMenu } from "../components/RoomParticipantsMenu";
import { RoomStage } from "../components/RoomStage";
import { ScreenStageFrame } from "../components/ScreenStageFrame";
import { StatsDrawer } from "../components/StatsDrawer";
import { StatusPill } from "../components/StatusPill";
import { VideoStage } from "../components/VideoStage";
import { useAdaptiveScreenQuality } from "../hooks/useAdaptiveScreenQuality";
import { useMediaPreferences } from "../hooks/useMediaPreferences";
import { safeSessionGet,safeSessionSet } from "../services/browser";
import { navigate } from "../services/navigation";
import { useCollaborativeRoom } from "../services/useCollaborativeRoom";
import type { CameraPreset,Quality } from "../types";

export function ViewerPage({roomId}:{roomId:string}){
  const [nameReady,setNameReady]=useState(()=>!!safeSessionGet("lumacast-display-name"));
  if(!nameReady)return <main className="viewer-shell"><NameDialog eyebrow={`Entrar na sala ${roomId}`} submitLabel="Entrar" onSubmit={value=>{safeSessionSet("lumacast-display-name",value);setNameReady(true);}} onCancel={()=>navigate("/")}/></main>;
  return <ViewerRoomPage roomId={roomId}/>;
}

function ViewerRoomPage({roomId}:{roomId:string}){
  const room=useCollaborativeRoom(false,roomId),[showStats,setShowStats]=useState(false),[focused,setFocused]=useState(false),{quality,setQuality,fps,setFps}=useMediaPreferences(),canShare=typeof navigator.mediaDevices?.getDisplayMedia==="function";
  useAdaptiveScreenQuality({enabled:quality==="auto"&&room.isScreenSharer&&room.roomState.screenProvider==="agora",stats:room.stats,preferredFps:fps,updateQuality:room.updateScreenQuality,updateFrameRate:room.updateScreenFrameRate});
  const selfName=safeSessionGet("lumacast-display-name")||"Você",sharerName=room.roomState.activeScreenSharerName||room.roomState.ownerName||"Participante",qualityLabel=`${quality==="auto"?"AUTO":quality} · ${room.stats?.fps??fps} FPS`,providerLabel=room.roomState.screenProvider==="agora"?"Agora":"LiveKit";
  const live=room.roomState.live,screenStarting=!!room.roomState.activeScreenSharerId&&!live,busy=!!room.roomState.activeScreenSharerId&&!room.ownsScreenLock,missing=room.status==="missing",reconnecting=room.status==="Reconectando",emptyTitle=room.switching?"Trocando servidor de transmissão…":screenStarting?(room.ownsScreenLock?"Preparando sua transmissão…":(room.roomState.activeScreenSharerName||"Alguém")+" está iniciando uma transmissão…"):live?"Conectando à transmissão":"Nenhuma tela sendo compartilhada",emptyText=screenStarting?(room.ownsScreenLock?"Escolha a tela ou janela que deseja compartilhar.":"Aguarde enquanto a tela é preparada."):live?"Conectando à distribuição segura de vídeo.":"Você está na sala certa. Qualquer participante pode começar.";
  return <main className="viewer-shell viewer-compact"><header className="viewer-nav room-v2-nav"><Logo/><div className="viewer-nav-actions"><StatusPill label={live?"AO VIVO":reconnecting?"RECONECTANDO":"AGUARDANDO"} tone={live?"live":reconnecting?"warn":"neutral"}/><RoomParticipantsMenu participants={room.roomState.participants} activeScreenSharerId={room.roomState.activeScreenSharerId}/><span className="room-self-avatar" title={selfName}>{selfName.slice(0,1).toUpperCase()}</span></div></header><BrowserCompatibilityNotice/>
    <section className={`watch-area collaborative-layout viewer-compact-layout room-v2-layout ${focused?"room-layout-focused":""}`}><div className="watch-main"><ScreenStageFrame sharerName={sharerName} live={live} focused={focused} onToggleFocus={()=>setFocused(value=>!value)} qualityLabel={qualityLabel} providerLabel={providerLabel}><RoomStage cameras={room.cameras} participants={room.roomState.participants}><VideoStage videoRef={room.videoRef} active={live&&!room.switching} muted={room.isScreenSharer} emptyTitle={emptyTitle} emptyText={emptyText}/></RoomStage></ScreenStageFrame>{reconnecting&&<div className="reconnect-line" role="status"><LoaderCircle/> Tentando reconectar</div>}{missing&&<button type="button" className="back-home" onClick={()=>navigate("/")}><RefreshCw/> Digitar outro código</button>}
      <div className="control-dock collaborative-controls"><button type="button" className="control" onClick={()=>void room.toggleCamera()}>{room.cameraOn?<Video/>:<VideoOff/>}<span>Câmera</span></button>{room.isScreenSharer?<button type="button" className="stop-live" onClick={()=>void room.stopScreen()}><Square/>Parar transmissão</button>:<button type="button" className="go-live" onClick={()=>void room.startScreen(quality,fps)} disabled={busy||missing||!canShare} title={!canShare?"Compartilhamento de tela não é suportado neste navegador.":undefined}>{!canShare?"Tela indisponível":busy?"Tela ocupada":"Compartilhar minha tela"}</button>}{room.isScreenSharer&&<button type="button" className="control" onClick={()=>void room.toggleScreenAudio()}>{room.muted?<VolumeX/>:<Volume2/>}<span>{room.muted?"Ativar áudio da tela":"Silenciar áudio da tela"}</span></button>}</div><div className="viewer-share-options"><select aria-label="Qualidade da câmera" value={room.cameraPreset} onChange={e=>room.setCameraPreset(e.target.value as CameraPreset)}><option value="720p40">Câmera 720p · 40 FPS</option><option value="480p60">Câmera 480p · 60 FPS</option></select><select aria-label="Resolução da tela" value={quality} onChange={e=>{const next=e.target.value as Quality;setQuality(next);if(room.isScreenSharer){void room.updateScreenQuality(next);if(next!=="auto")void room.updateScreenFrameRate(fps);}}}><option value="auto">Automática</option><option value="720p">720p HD</option><option value="1080p">1080p Full HD</option></select><button type="button" aria-pressed={fps===30} onClick={()=>{setFps(30);if(room.isScreenSharer){if(quality==="auto")void room.updateScreenQuality("auto").then(()=>room.updateScreenFrameRate(30));else void room.updateScreenFrameRate(30);}}} className={fps===30?"active":""}>30 FPS</button><button type="button" aria-pressed={fps===60} onClick={()=>{setFps(60);if(room.isScreenSharer){if(quality==="auto")void room.updateScreenQuality("auto").then(()=>room.updateScreenFrameRate(60));else void room.updateScreenFrameRate(60);}}} className={fps===60?"active":""}>60 FPS</button></div></div></section>
    <footer className="viewer-foot"><span><Signal/> Conexão WebRTC via SFU</span><span>O conteúdo não é gravado pelo Lunira Screen</span></footer>
    {showStats&&<StatsDrawer title="Estatísticas da transmissão" stats={room.stats} onClose={()=>setShowStats(false)} className="viewer-stats"/>}
    {room.error&&<div className="toast-error" role="alert">{room.error}<button type="button" aria-label="Fechar aviso" onClick={()=>room.setError("")}>×</button></div>}

  </main>;
}
