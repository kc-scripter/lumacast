import { ArrowLeft, BarChart3, Check, ChevronDown, ChevronUp, Clipboard, Copy, Expand, Link2, Lock, LogOut, MonitorUp, PanelRightClose, PanelRightOpen, Pin, PinOff, RefreshCw, Settings, ShieldCheck, Square, Unlock, UserX, Users, Video, VideoOff, Volume2, VolumeX, WifiOff, Wrench } from "lucide-react";
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
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false);
  const [controlsExpanded,setControlsExpanded]=useState(true);
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
  const stageHasVideo=room.roomState.live&&(screenPlaying||room.isScreenSharer);

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
    if(!room.roomState.live){setScreenPlaying(false);return;}
    const element=room.videoRef.current;
    if(element?.srcObject&&element.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA){
      setScreenPlaying(true);
      void element.play().catch(()=>undefined);
      return;
    }
    setScreenPlaying(false);
  },[room.roomState.live,room.roomState.activeScreenSharerId,room.roomState.screenProvider,room.isScreenSharer,room.videoRef]);

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

  return <main className={"approved-room-page "+(sidebarCollapsed?"participants-collapsed ":"")+(controlsExpanded?"controls-open":"")}>
    <aside className="approved-app-nav approved-room-nav">
      <div className="approved-nav-main">
        <button type="button" className="approved-nav-item active"><Users/>Sala</button>
        <button type="button" className="approved-nav-item" onClick={()=>setShowSettings(true)}><Settings/>Configurações</button>
      </div>
      <button type="button" className="approved-nav-help" onClick={leaveAndBack}><ArrowLeft/>Voltar</button>
    </aside>

    <section className="approved-room-workspace">
      <header className="approved-room-header">
        <div className="approved-room-title">
          <span className="approved-room-cover"><MonitorUp/></span>
          <div>
            <h1>{room.roomState.ownerName?"Sala de "+room.roomState.ownerName:"Sala "+roomCode}</h1>
            <p>{room.roomState.participants.length} {room.roomState.participants.length===1?"pessoa":"pessoas"} na sala <i/> {room.roomState.live?"Transmissão ativa":"Pronto para compartilhar"}</p>
          </div>
        </div>

        <div className="approved-room-header-actions">
          <div className="approved-room-link">
            <Link2/>
            <span>{owner&&invite?invite:roomCode}</span>
            <button type="button" disabled={owner?!invite:!room.roomId} onClick={()=>void(owner?copyInvite():copyRoomCode())}>{copied?<Check/>:<Copy/>}<b>{copied?"Copiado":"Copiar"}</b></button>
          </div>
          {owner&&<button type="button" className={"approved-header-icon "+(room.roomState.locked?"active":"")} disabled={lockBusy||reconnecting||missing||!room.roomId} title={room.roomState.locked?"Permitir novas entradas":"Bloquear novas entradas"} onClick={()=>void toggleRoomLock()}>{room.roomState.locked?<Lock/>:<Unlock/>}</button>}
          {owner&&<button type="button" className="approved-header-icon" title="Gerar novo convite" onClick={()=>void renewInvite()}><RefreshCw/></button>}
        </div>
      </header>

      <div className="approved-room-main">
        <section className="approved-stage-area">
          <div className={"approved-focus-layout "+(expandedCamera?"camera-focused":"screen-focused")} ref={stageRef}>
            {expandedCamera
              ?<section className="approved-focus-card approved-camera-focus">
                <div className="approved-focus-badge"><Pin/>Câmera em foco</div>
                <div className="room-next-stage-status"><span className="quality">{quality==="auto"?"AUTO":quality} · {room.stats?.fps??fps} FPS</span>{room.roomState.live&&<span className="live"><i/>AO VIVO</span>}</div>
                <div className="approved-focus-media"><OptimizedVideoTile track={expandedCamera.track}/></div>
                <div className="approved-focus-footer">
                  <strong>{expandedCamera.displayName}{expandedCamera.mine?" · Você":""}</strong>
                  <div><button type="button" title="Tirar foco" aria-label="Tirar foco da câmera" onClick={()=>setExpandedCameraId(null)}><PinOff/></button><button type="button" title="Tela cheia" aria-label="Tela cheia" onClick={()=>void toggleFullscreen()}><Expand/></button></div>
                </div>
              </section>
              :<section className={"approved-focus-card approved-screen-focus "+(stageHasVideo?"has-video":"")}>
                <div className="approved-focus-badge"><MonitorUp/>{room.roomState.live?"Compartilhamento":"Tela principal"}</div>
                <div className="room-next-stage-status"><span className="quality">{quality==="auto"?"AUTO":quality} · {room.stats?.fps??fps} FPS</span>{room.roomState.live&&<span className="live"><i/>AO VIVO</span>}</div>
                <video ref={room.videoRef} autoPlay playsInline muted={room.isScreenSharer} onPlaying={()=>setScreenPlaying(true)} onWaiting={()=>setScreenPlaying(false)} onStalled={()=>setScreenPlaying(false)} onEmptied={()=>setScreenPlaying(false)}/>
                <div className="approved-screen-empty">
                  <span><MonitorUp/></span>
                  <h2>{stageTitle}</h2>
                  <p>{stageText}</p>
                  {!room.roomState.live&&!starting&&!busy&&<button type="button" disabled={!room.roomId||!canShare||missing} onClick={()=>setShareDialog("start")}><MonitorUp/>Escolher tela para compartilhar</button>}
                </div>
                <div className="approved-focus-footer">
                  <strong>{room.roomState.live?(room.isScreenSharer?"Sua tela":sharer+" · tela"):"Lunira Screen"}</strong>
                  <button type="button" title="Tela cheia" aria-label="Tela cheia" onClick={()=>void toggleFullscreen()}><Expand/></button>
                </div>
              </section>}

            {expandedCamera&&room.roomState.live&&<section className={"approved-secondary-screen "+(stageHasVideo?"has-video":"")}>
              <div className="approved-secondary-head"><span><MonitorUp/>Compartilhamento</span><button type="button" title="Focar compartilhamento" aria-label="Focar compartilhamento" onClick={()=>setExpandedCameraId(null)}><Pin/></button></div>
              <video ref={room.videoRef} autoPlay playsInline muted={room.isScreenSharer} onPlaying={()=>setScreenPlaying(true)} onWaiting={()=>setScreenPlaying(false)} onStalled={()=>setScreenPlaying(false)} onEmptied={()=>setScreenPlaying(false)}/>
              {!stageHasVideo&&<div className="approved-secondary-empty"><MonitorUp/><span>Conectando à tela…</span></div>}
              <footer>{room.isScreenSharer?"Sua tela":sharer}</footer>
            </section>}
          </div>

          {(room.roomState.live||cameraEntries.length>0)&&<section className="approved-media-strip" aria-label="Mídias da sala">
            {room.roomState.live&&<button type="button" className={"approved-media-thumb screen "+(!expandedCamera?"active":"")} onClick={()=>setExpandedCameraId(null)} aria-label="Focar compartilhamento de tela">
              <span className="approved-media-icon"><MonitorUp/></span>
              <span><i/>{room.isScreenSharer?"Sua tela":sharer}</span>
              <b><Pin/></b>
            </button>}
            {cameraEntries.map(camera=><button type="button" className={"approved-media-thumb "+(expandedCamera?.identity===camera.identity?"active":"")} key={camera.identity} onClick={()=>setExpandedCameraId(camera.identity)} aria-label={"Focar câmera de "+camera.displayName}>
              <OptimizedVideoTile track={camera.track}/>
              <span><i/>{camera.displayName}{camera.mine?" · Você":""}</span>
              <b><Pin/></b>
            </button>)}
          </section>}

          <button type="button" className="approved-controls-toggle" aria-expanded={controlsExpanded} aria-label={controlsExpanded?"Recolher controles":"Expandir controles"} onClick={()=>setControlsExpanded(value=>!value)}>
            {controlsExpanded?<ChevronDown/>:<ChevronUp/>}
          </button>

          {controlsExpanded&&<section className="room-next-toolbar" aria-label="Controles da sala">
            <div className="room-next-toolbar-group media">
              <button type="button" className={"room-next-tool "+(room.isScreenSharer&&!room.muted?"active":"")} disabled={!room.isScreenSharer} onClick={()=>void room.toggleScreenAudio()} aria-pressed={room.isScreenSharer&&!room.muted} title="Áudio do sistema">
                {room.isScreenSharer&&!room.muted?<Volume2/>:<VolumeX/>}<span>Áudio da tela</span><i className={room.isScreenSharer&&!room.muted?"on":""}/>
              </button>
              <button type="button" className={"room-next-tool "+(room.cameraOn?"active":"")} disabled={!room.roomId||missing||reconnecting} onClick={()=>void room.toggleCamera()} aria-pressed={room.cameraOn} title="Câmera">
                {room.cameraOn?<Video/>:<VideoOff/>}<span>Câmera</span><i className={room.cameraOn?"on":""}/>
              </button>
              {room.isScreenSharer
                ?<><button type="button" className="room-next-tool share active" onClick={()=>void room.stopScreen()}><Square/><span>Parar tela</span></button><button type="button" className="room-next-tool" onClick={()=>setShareDialog("switch")}><RefreshCw/><span>Trocar fonte</span></button></>
                :<button type="button" className="room-next-tool share" disabled={busy||!canShare||!room.roomId||missing} onClick={()=>setShareDialog("start")}><MonitorUp/><span>{busy?"Tela ocupada":"Compartilhar tela"}</span></button>}
            </div>
            <div className="room-next-toolbar-group actions">
              <button type="button" className={"room-next-tool icon "+(showStats?"active":"")} aria-label="Estatísticas" title="Estatísticas" onClick={()=>setShowStats(value=>!value)}><BarChart3/></button>
              <button type="button" className={"room-next-tool icon "+(showDiagnostics?"active":"")} aria-label="Diagnóstico" title="Diagnóstico" onClick={()=>setShowDiagnostics(true)}><Wrench/></button>
              <button type="button" className="room-next-tool icon" aria-label="Configurações" title="Configurações" onClick={()=>setShowSettings(true)}><Settings/></button>
              <button type="button" className="room-next-tool leave" onClick={leaveAndBack}><LogOut/><span>Sair da sala</span></button>
            </div>
          </section>}
        </section>

        {sidebarCollapsed
          ?<aside className="approved-participants-rail">
            <button type="button" aria-label="Expandir participantes" title="Expandir participantes" onClick={()=>setSidebarCollapsed(false)}><PanelRightOpen/></button>
            <span><Users/><b>{room.roomState.participants.length}</b></span>
          </aside>
          :<aside className="approved-participants-panel">
            <header>
              <div><Users/><span><strong>Participantes</strong><small>{room.roomState.participants.length} na sala</small></span></div>
              <button type="button" aria-label="Recolher participantes" title="Recolher participantes" onClick={()=>setSidebarCollapsed(true)}><PanelRightClose/></button>
            </header>

            <section className="room-next-about">
              <div className="room-next-about-icon"><MonitorUp/></div>
              <div className="room-next-about-copy">
                <span>SALA ATUAL</span>
                <strong>{room.roomState.ownerName?"Sala de "+room.roomState.ownerName:roomCode}</strong>
                <small>{room.roomState.live?"Transmissão ativa":room.roomState.locked?"Sala trancada":"Pronta para transmitir"}</small>
              </div>
              <span className={"room-next-about-state "+(room.roomState.live?"live":"")}><i/>{room.roomState.live?"AO VIVO":"ONLINE"}</span>
            </section>

            <div className="room-next-sidebar-label"><span>NA SALA</span><b>{room.roomState.participants.length}</b></div>
            <div className="approved-member-list">
              {room.roomState.participants.map(person=>{
                const camera=cameraEntries.find(item=>item.identity===person.id);
                const sharing=person.id===room.roomState.activeScreenSharerId;
                const mine=person.id===selfId;
                const isOwner=person.role==="owner"||person.displayName===room.roomState.ownerName;
                return <article className={"approved-member "+(sharing?"sharing":"")} key={person.id}>
                  <div className="approved-member-avatar">{person.displayName.slice(0,1).toUpperCase()}<i className={camera?"online":""}/></div>
                  <div className="approved-member-copy"><strong>{person.displayName}{isOwner&&<em>HOST</em>}</strong><small>{mine?"Você":sharing?"Compartilhando tela":camera?"Câmera ativa":"Na sala"}</small></div>
                  {camera&&<button type="button" className="approved-member-focus" title={"Focar câmera de "+person.displayName} aria-label={"Focar câmera de "+person.displayName} onClick={()=>setExpandedCameraId(person.id)}><Pin/></button>}
                  <span className={"approved-member-camera "+(camera?"on":"")} title={camera?"Câmera ativa":"Câmera desligada"}>{camera?<Video/>:<VideoOff/>}</span>
                  {owner&&!mine&&!isOwner&&<button type="button" className="approved-member-kick" title={"Remover "+person.displayName} aria-label={"Remover "+person.displayName} onClick={()=>void room.kickParticipant(person.id)}><UserX/></button>}
                </article>;
              })}
            </div>

            {owner&&<section className="room-next-invite-card">
              <div><span>CONVIDAR PESSOAS</span><small>{room.roomState.locked?"Destranque a sala para novas entradas":"Compartilhe o link privado da sala"}</small></div>
              <strong>{roomCode}</strong>
              <button type="button" disabled={!invite} onClick={()=>void copyInvite()}><Clipboard/>{copied?"Convite copiado":"Copiar convite"}</button>
            </section>}
          </aside>}
      </div>
    </section>

    {showSettings&&<SettingsDialog onClose={()=>setShowSettings(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps} cameraPreset={room.cameraPreset} setCameraPreset={room.setCameraPreset} sharing={room.isScreenSharer} onApplyQuality={value=>void applyQuality(value)} onApplyFps={value=>void room.updateScreenFrameRate(value)}/>}
    {showStats&&<StatsDrawer title="Estatísticas da transmissão" stats={room.stats} onClose={()=>setShowStats(false)}/>}
    {showDiagnostics&&<DiagnosticsDrawer onClose={()=>setShowDiagnostics(false)} onRecover={room.recoverMedia} recovering={room.recovering} status={room.status} provider={room.roomState.screenProvider} roomId={room.roomId} live={room.roomState.live} stats={room.stats} cameraCount={cameraEntries.length} participantCount={room.roomState.participants.length}/>}
    {shareDialog&&<ScreenShareDialog mode={shareDialog} stream={room.previewStream} quality={quality} fps={fps} onPreset={setPreset} onPick={pickScreen} onConfirm={confirmShare} onCancel={closeShareDialog} busy={shareBusy}/>}
    {room.kicked&&<div className="desktop-toast error persistent" role="alert"><UserX/><span>Você foi removido desta sala pelo anfitrião.</span><button type="button" onClick={leaveAndBack}>Voltar</button></div>}
    {room.error&&<div className="desktop-toast error" role="alert"><WifiOff/><span>{room.error}</span><button type="button" aria-label="Fechar aviso" onClick={()=>room.setError("")}>×</button></div>}
  </main>;
}