import { ArrowLeft, BarChart3, Check, Clipboard, Copy, Expand, Lock, LogOut, Maximize2, MonitorUp, RefreshCw, Settings, ShieldCheck, Square, Unlock, UserX, Users, Video, VideoOff, Volume2, VolumeX, WifiOff, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { OptimizedVideoTile } from "../../../client/src/components/OptimizedVideo";
import { StatsDrawer } from "../../../client/src/components/StatsDrawer";
import { useAdaptiveScreenQuality } from "../../../client/src/hooks/useAdaptiveScreenQuality";
import { copyText } from "../../../client/src/services/browser";
import { buildRoomInvite } from "../../../client/src/services/invite";
import { connectSocket, getSocket } from "../../../client/src/services/socket";
import { useCollaborativeRoom } from "../../../client/src/services/useCollaborativeRoom";
import type { Quality } from "../../../client/src/types";
import { SettingsDialog } from "../components/SettingsDialog";
import { DiagnosticsDrawer } from "../components/DiagnosticsDrawer";
import { ScreenShareDialog } from "../components/ScreenShareDialog";
import { useDesktopMediaPreferences } from "../hooks/useDesktopMediaPreferences";
import { rememberRecentRoom } from "../services/recentRooms";

export function RoomPage({owner,roomId:requestedRoomId,inviteToken:requestedInviteToken,onBack}:{owner:boolean;roomId?:string;inviteToken?:string;onBack:()=>void}){
  const room=useCollaborativeRoom(owner,requestedRoomId,requestedInviteToken);
  const {quality,setQuality,fps,setFps}=useDesktopMediaPreferences();
  const [showSettings,setShowSettings]=useState(false);
  const [showStats,setShowStats]=useState(false);
  const [showDiagnostics,setShowDiagnostics]=useState(false);
  const [copied,setCopied]=useState(false);
  const [screenPlaying,setScreenPlaying]=useState(false);
  const [expandedCameraId,setExpandedCameraId]=useState<string|null>(null);
  const [shareDialog,setShareDialog]=useState<"start"|"switch"|null>(null);
  const [shareBusy,setShareBusy]=useState(false);
  const [lockBusy,setLockBusy]=useState(false);
  const stageRef=useRef<HTMLDivElement>(null);

  useAdaptiveScreenQuality({
    enabled:quality==="auto"&&room.isScreenSharer&&room.roomState.screenProvider==="agora",
    stats:room.stats,
    preferredFps:fps,
    updateQuality:room.updateScreenQuality,
    updateFrameRate:room.updateScreenFrameRate
  });

  const selfId=getSocket().id||"";
  const webBase=(import.meta.env.VITE_PUBLIC_WEB_URL||"https://lunirascreen.onrender.com").replace(/\/$/,"");
  const invite=owner&&room.roomId&&room.inviteToken?buildRoomInvite(webBase,room.roomId,room.inviteToken):"";
  const roomCode=room.roomId||requestedRoomId||"--------";
  const canShare=typeof navigator.mediaDevices?.getDisplayMedia==="function";
  const missing=room.status==="missing";
  const reconnecting=room.status==="Reconectando";
  const busy=!!room.roomState.activeScreenSharerId&&!room.ownsScreenLock;
  const starting=!!room.roomState.activeScreenSharerId&&!room.roomState.live;
  const sharer=room.roomState.activeScreenSharerName||room.roomState.ownerName||"Participante";
  const stageHasVideo=room.roomState.live&&screenPlaying;

  const cameraEntries=useMemo(()=>room.cameras.map(camera=>{
    const participant=room.roomState.participants.find(person=>person.id===camera.identity);
    return {
      ...camera,
      displayName:participant?.displayName||"Participante",
      mine:camera.identity===selfId
    };
  }),[room.cameras,room.roomState.participants,selfId]);

  const expandedCamera=cameraEntries.find(camera=>camera.identity===expandedCameraId)||null;

  useEffect(()=>{
    setScreenPlaying(false);
  },[room.roomState.live,room.roomState.activeScreenSharerId,room.roomState.screenProvider]);

  useEffect(()=>{
    if(room.status!=="Conectado"||!room.roomId)return;
    rememberRecentRoom({roomId:room.roomId,owner});
  },[owner,requestedInviteToken,room.inviteToken,room.roomId,room.status]);

  useEffect(()=>{
    if(expandedCameraId&&!cameraEntries.some(camera=>camera.identity===expandedCameraId))setExpandedCameraId(null);
  },[cameraEntries,expandedCameraId]);

  useEffect(()=>{
    if(!expandedCameraId)return;
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setExpandedCameraId(null);};
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[expandedCameraId]);

  const stageTitle=missing?"Sala não encontrada":room.switching?"Trocando rota de mídia…":starting?(room.ownsScreenLock?"Preparando sua tela…":sharer+" está preparando a tela…"):room.roomState.live?"Conectando à transmissão":"Pronto para compartilhar";
  const stageText=missing?"Confira o código e volte ao início para tentar novamente.":room.roomState.live?"A transmissão aparecerá aqui assim que a faixa de vídeo estiver pronta.":starting?"Aguarde alguns segundos.":"Qualquer participante pode assumir a tela quando ela estiver livre.";

  const copyInvite=async()=>{
    try{
      await copyText(invite);
      setCopied(true);
      setTimeout(()=>setCopied(false),1600);
    }catch{
      room.setError("Não foi possível copiar o convite.");
    }
  };

  const copyRoomCode=async()=>{
    if(!room.roomId)return;
    try{
      await copyText(room.roomId);
      setCopied(true);
      setTimeout(()=>setCopied(false),1600);
    }catch{
      room.setError("Não foi possível copiar o código da sala.");
    }
  };

  const applyQuality=async(next:Quality)=>{
    await room.updateScreenQuality(next);
    if(next!=="auto")await room.updateScreenFrameRate(fps);
  };

  const pickScreen=async()=>{await room.prepareScreen(quality,fps);};
  const closeShareDialog=()=>{if(shareBusy)return;room.cancelScreenPreview();setShareDialog(null);};
  const confirmShare=async()=>{
    if(!shareDialog)return;
    setShareBusy(true);
    try{
      const ok=shareDialog==="switch"?await room.switchPreparedScreen(quality,fps):await room.startScreen(quality,fps);
      if(ok)setShareDialog(null);
    }finally{setShareBusy(false);}
  };
  const setPreset=(nextQuality:Quality,nextFps:30|60)=>{setQuality(nextQuality);setFps(nextFps);};
  const toggleFullscreen=async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    }catch{room.setError("Não foi possível abrir a transmissão em tela cheia.");}
  };
  const renewInvite=async()=>{
    const token=await room.rotateInvite();
    if(!token)return;
    setCopied(false);
  };
  const toggleRoomLock=async()=>{
    if(lockBusy||!room.roomId)return;
    setLockBusy(true);
    try{await room.setRoomLocked(!room.roomState.locked);}
    finally{setLockBusy(false);}
  };

  const leaveAndBack=()=>{
    if(!owner&&room.roomId)connectSocket().emit("leave-room",{roomId:room.roomId});
    onBack();
  };

  return <main className="room-v2-page">
    <section className="room-v2-header">
      <div className="room-v2-header-left">
        <button type="button" className="room-v2-back" aria-label="Voltar ao início" onClick={leaveAndBack}><ArrowLeft/></button>
        <div className="room-v2-code-block">
          <span>SALA</span>
          <div><strong>{roomCode}</strong><button type="button" disabled={!room.roomId} aria-label="Copiar código da sala" onClick={()=>void copyRoomCode()}>{copied?<Check/>:<Copy/>}</button></div>
        </div>
        <span className="room-v2-divider"/>
        <div className="room-v2-connection">
          <span className={"room-v2-status "+(reconnecting?"warn":room.roomState.live?"live":room.status==="Conectado"?"online":"")}><i/>{missing?"Sala inválida":reconnecting?"Reconectando":room.roomState.live?"Ao vivo":room.status}</span>
          <small>{missing?"Aguardando sala válida":(room.roomState.screenProvider==="livekit"?"Fallback LiveKit":"Agora RTC")+" · "+(quality==="auto"?"AUTO":quality)+" · "+(room.stats?.fps??fps)+" FPS"}</small>
        </div>
      </div>
      <div className="room-v2-header-right">
        <span className="room-v2-people"><Users/>{room.roomState.participants.length} {room.roomState.participants.length===1?"participante":"participantes"}</span>
        {owner&&<button type="button" className={"room-v2-security "+(room.roomState.locked?"locked":"")} disabled={lockBusy||reconnecting||missing||!room.roomId} title={room.roomState.locked?"Permitir novas entradas":"Bloquear novas entradas"} onClick={()=>void toggleRoomLock()}>{room.roomState.locked?<Lock/>:<Unlock/>}{lockBusy?"Salvando…":room.roomState.locked?"Sala trancada":"Trancar sala"}</button>}
        {owner&&<button type="button" className="room-v2-security icon-only" title="Invalidar o convite atual e gerar outro" aria-label="Gerar novo convite temporário" onClick={()=>void renewInvite()}><RefreshCw/></button>}
        {owner&&<button type="button" className="room-v2-invite" disabled={!invite} onClick={()=>void copyInvite()}><Clipboard/>{copied?"Copiado":"Copiar convite"}</button>}
      </div>
    </section>

    <section className="room-v2-layout">
      <section className="room-v2-stage-shell" ref={stageRef}>
        <div className="room-v2-stage-chips">
          <span className="room-v2-stage-label"><MonitorUp/>Tela principal</span>
          <div>
            {room.isScreenSharer&&<span className="room-v2-you-share"><ShieldCheck/>Você está compartilhando</span>}
            {room.roomState.live&&<span className="room-v2-live-chip"><i/>Ao vivo</span>}
            <span className="room-v2-fps-chip">{room.stats?.fps??fps} FPS</span>
            <button type="button" className="room-v2-stage-action" aria-label="Tela cheia" title="Tela cheia" onClick={()=>void toggleFullscreen()}><Expand/></button>
          </div>
        </div>
        <div className={"room-v2-stage "+(stageHasVideo?"has-video":"")}>
          <video ref={room.videoRef} autoPlay playsInline muted={room.isScreenSharer} onPlaying={()=>setScreenPlaying(true)} onWaiting={()=>setScreenPlaying(false)} onStalled={()=>setScreenPlaying(false)} onEmptied={()=>setScreenPlaying(false)}/>
          <div className="room-v2-stage-empty">
            <span className="room-v2-stage-icon"><MonitorUp/></span>
            <h2>{stageTitle}</h2>
            <p>{stageText}</p>
            {!room.roomState.live&&!starting&&!busy&&<button type="button" className="room-v2-share-primary" disabled={!room.roomId||!canShare||missing} onClick={()=>setShareDialog("start")}><MonitorUp/>Escolher tela para compartilhar</button>}
          </div>
        </div>
      </section>

      <aside className="room-v2-sidebar">
        <header className="room-v2-sidebar-head"><h2>Participantes</h2><span>{room.roomState.participants.length} na sala</span></header>

        <section className="room-v2-members">
          <span className="room-v2-section-label">NA SALA ({room.roomState.participants.length})</span>
          <div className="room-v2-member-list">
            {room.roomState.participants.map(person=>{
              const camera=cameraEntries.find(item=>item.identity===person.id);
              const sharing=person.id===room.roomState.activeScreenSharerId;
              const mine=person.id===selfId;
              const isOwner=person.role==="owner"||person.displayName===room.roomState.ownerName;
              return <div className="room-v2-member" key={person.id}>
                <div className="room-v2-avatar">{person.displayName.slice(0,1).toUpperCase()}<i className={camera?"online":""}/></div>
                <div className="room-v2-member-copy"><strong>{person.displayName}{isOwner&&<em>HOST</em>}</strong><small>{mine?"Você":sharing?"Compartilhando":"Na sala"}</small></div>
                <span className={"room-v2-camera-state "+(camera?"on":"")} title={camera?"Câmera ativa":"Câmera desligada"}>{camera?<Video/>:<VideoOff/>}</span>
                {owner&&!mine&&!isOwner&&<button type="button" className="room-v2-kick" title={"Remover "+person.displayName} aria-label={"Remover "+person.displayName} onClick={()=>void room.kickParticipant(person.id)}><UserX/></button>}
              </div>;
            })}
          </div>
        </section>

        <section className="room-v2-cameras">
          <div className="room-v2-section-head"><span className="room-v2-section-label">CÂMERAS ({cameraEntries.length})</span></div>
          {cameraEntries.length>0
            ?<div className="room-v2-camera-grid">{cameraEntries.map(camera=><button type="button" className="room-v2-camera-tile" key={camera.identity} onClick={()=>setExpandedCameraId(camera.identity)} aria-label={"Expandir câmera de "+camera.displayName}>
              <OptimizedVideoTile track={camera.track}/>
              <span className="room-v2-camera-name"><i/>{camera.displayName}{camera.mine?" (Você)":""}</span>
              <span className="room-v2-expand"><Maximize2/></span>
            </button>)}</div>
            :<div className="room-v2-camera-empty"><VideoOff/><strong>Nenhuma câmera ativa</strong><small>As câmeras ligadas aparecem aqui.</small></div>}
        </section>

        {owner&&room.roomState.participants.length<=1&&<section className="room-v2-invite-panel">
          <Users/>
          <strong>Ninguém convidado ainda</strong>
          <p>Envie o link privado de convite para alguém no Lunira Web.</p>
          <div className="room-v2-code-copy"><span>{roomCode}</span><button type="button" disabled={!room.roomId} aria-label="Copiar código" onClick={()=>void copyRoomCode()}><Copy/></button></div>
          <button type="button" className="room-v2-copy-invite" disabled={!invite} onClick={()=>void copyInvite()}><Clipboard/>{copied?"Copiado":"Copiar convite"}</button>
        </section>}
      </aside>
    </section>

    <div className="room-v2-toolbar" aria-label="Controles da sala">
      {room.isScreenSharer
        ?<><button type="button" className="room-v2-tool active share" title="Parar compartilhamento" aria-pressed="true" onClick={()=>void room.stopScreen()}><Square/><span>Parar tela</span></button><button type="button" className="room-v2-tool" title="Trocar tela ou janela sem sair da sala" onClick={()=>setShareDialog("switch")}><RefreshCw/><span>Trocar fonte</span></button></>
        :<button type="button" className="room-v2-tool share" title={busy?"Outra pessoa está compartilhando":"Compartilhar tela"} disabled={busy||!canShare||!room.roomId||missing} onClick={()=>setShareDialog("start")}><MonitorUp/><span>{busy?"Tela ocupada":"Compartilhar"}</span></button>}
      <span className="room-v2-tool-divider"/>
      {room.isScreenSharer&&<button type="button" className={"room-v2-tool "+(room.muted?"":"active")} title={room.muted?"Ativar áudio da tela":"Silenciar áudio da tela"} aria-pressed={!room.muted} onClick={()=>void room.toggleScreenAudio()}>{room.muted?<VolumeX/>:<Volume2/>}<span>{room.muted?"Áudio off":"Áudio da tela"}</span></button>}
      <button type="button" className={"room-v2-tool "+(room.cameraOn?"active":"")} title={room.cameraOn?"Desativar câmera":"Ativar câmera"} aria-pressed={room.cameraOn} disabled={!room.roomId||missing||reconnecting} onClick={()=>void room.toggleCamera()}>{room.cameraOn?<Video/>:<VideoOff/>}<span>Câmera</span></button>
      <button type="button" className={"room-v2-tool "+(showStats?"active":"")} title="Estatísticas da transmissão" aria-pressed={showStats} onClick={()=>setShowStats(value=>!value)}><BarChart3/><span>Estatísticas</span></button>
      <button type="button" className={"room-v2-tool "+(showDiagnostics?"active":"")} title="Diagnóstico e recuperação" aria-pressed={showDiagnostics} onClick={()=>setShowDiagnostics(true)}><Wrench/><span>Diagnóstico</span></button>
      <button type="button" className="room-v2-tool" title="Configurações" onClick={()=>setShowSettings(true)}><Settings/><span>Configurações</span></button>
      <span className="room-v2-tool-divider"/>
      <button type="button" className="room-v2-tool leave" title="Sair da sala" onClick={leaveAndBack}><LogOut/><span>Sair da sala</span></button>
    </div>

    {expandedCamera&&<div className="camera-focus-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setExpandedCameraId(null);}}>
      <section className="camera-focus-dialog" role="dialog" aria-modal="true" aria-label={"Câmera de "+expandedCamera.displayName}>
        <header><div><span>CÂMERA</span><strong>{expandedCamera.displayName}{expandedCamera.mine?" · Você":""}</strong></div><button type="button" aria-label="Fechar câmera expandida" onClick={()=>setExpandedCameraId(null)}><X/></button></header>
        <div className="camera-focus-video"><OptimizedVideoTile track={expandedCamera.track}/></div>
      </section>
    </div>}

    {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps} cameraPreset={room.cameraPreset} setCameraPreset={room.setCameraPreset} sharing={room.isScreenSharer} onApplyQuality={value=>void applyQuality(value)} onApplyFps={value=>void room.updateScreenFrameRate(value)}/>}
    {showStats&&<StatsDrawer title="Estatísticas da transmissão" stats={room.stats} onClose={()=>setShowStats(false)}/>}
    {showDiagnostics&&<DiagnosticsDrawer onClose={()=>setShowDiagnostics(false)} onRecover={room.recoverMedia} recovering={room.recovering} status={room.status} provider={room.roomState.screenProvider} roomId={room.roomId} live={room.roomState.live} stats={room.stats} cameraCount={cameraEntries.length} participantCount={room.roomState.participants.length}/>}
    {shareDialog&&<ScreenShareDialog mode={shareDialog} stream={room.previewStream} quality={quality} fps={fps} onPreset={setPreset} onPick={pickScreen} onConfirm={confirmShare} onCancel={closeShareDialog} busy={shareBusy}/>}
    {room.kicked&&<div className="desktop-toast error persistent" role="alert"><UserX/><span>Você foi removido desta sala pelo anfitrião.</span><button type="button" onClick={leaveAndBack}>Voltar</button></div>}
    {room.error&&<div className="desktop-toast error" role="alert"><WifiOff/><span>{room.error}</span><button type="button" aria-label="Fechar aviso" onClick={()=>room.setError("")}>×</button></div>}
  </main>;
}
