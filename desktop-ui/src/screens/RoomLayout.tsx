import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, ChevronDown, Monitor, Settings2, X } from "lucide-react";
import { useCollaborativeRoom } from "../../../client/src/services/useCollaborativeRoom";
import { copyText, safeSessionGet } from "../../../client/src/services/browser";
import { getSocket } from "../../../client/src/services/socket";
import { CaptureSourceDialog } from "../components/CaptureSourceDialog";
import { RoomDock } from "../components/RoomDock";
import { RoomSidebar } from "../components/RoomSidebar";
import { StatsPanel } from "../components/StatsPanel";
import { StreamStage } from "../components/StreamStage";
import type { CaptureSource, DesktopMetrics, FrameRate, Quality } from "../types";

type SessionState={owner:boolean;roomId?:string};
const cx=(...values:Array<string|false|null|undefined>)=>values.filter(Boolean).join(" ");

export const RoomLayout=memo(function RoomLayout({session,onLeave}:{session:SessionState;onLeave():void}){
  const room=useCollaborativeRoom(session.owner,session.roomId);

  const [sources,setSources]=useState<CaptureSource[]>([]);
  const [selectedSource,setSelectedSource]=useState<CaptureSource>();
  const [sourceOpen,setSourceOpen]=useState(false);
  const [quality,setQuality]=useState<Quality>("1080p");
  const [fps,setFps]=useState<FrameRate>(60);
  const [systemAudio,setSystemAudio]=useState(true);
  const [pip,setPip]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [statsOpen,setStatsOpen]=useState(false);
  const [sidebarOpen,setSidebarOpen]=useState(true);
  const [copied,setCopied]=useState(false);
  const [desktopMetrics,setDesktopMetrics]=useState<DesktopMetrics>({cpu:0,memoryMb:0});

  const copyTimerRef=useRef<number|null>(null);
  const selfName=safeSessionGet("lumacast-display-name")||"Você";
  const participants=useMemo(()=>room.roomState.participants||[],[room.roomState.participants]);
  const roomCode=room.roomId||session.roomId||"—";
  const sharing=room.isScreenSharer;
  const busy=!!room.roomState.activeScreenSharerId&&!room.ownsScreenLock;

  const refreshSources=useCallback(async()=>{
    const next=await window.desktopBridge?.listCaptureSources().catch(()=>[])||[];
    setSources(next);
    if(!selectedSource&&next[0]){
      setSelectedSource(next[0]);
      await window.desktopBridge?.selectCaptureSource(next[0].id);
    }
  },[selectedSource]);

  useEffect(()=>{void refreshSources();},[refreshSources]);

  useEffect(()=>{
    let active=true;
    const update=async()=>{
      const next=await window.desktopBridge?.getPerformanceMetrics().catch(()=>null);
      if(active&&next)setDesktopMetrics(next);
    };
    void update();
    const timer=window.setInterval(()=>void update(),1000);
    return()=>{active=false;window.clearInterval(timer);};
  },[]);

  useEffect(()=>{
    if(sharing)setSystemAudio(!room.muted);
  },[sharing,room.muted]);

  useEffect(()=>()=>{
    if(copyTimerRef.current!==null)window.clearTimeout(copyTimerRef.current);
    void window.desktopBridge?.togglePip(false).catch(()=>undefined);
  },[]);

  const chooseSource=useCallback(async(source:CaptureSource)=>{
    setSelectedSource(source);
    await window.desktopBridge?.selectCaptureSource(source.id);
    if(sharing){
      await room.stopScreen();
      await new Promise(resolve=>window.setTimeout(resolve,120));
      await room.startScreen(quality,fps);
      if(!systemAudio)await room.toggleScreenAudio();
    }
  },[fps,quality,room,sharing,systemAudio]);

  const toggleShare=useCallback(async()=>{
    if(sharing){
      await room.stopScreen();
      return;
    }
    if(busy){
      room.setError("Outra pessoa já está compartilhando.");
      return;
    }
    if(!selectedSource){
      await refreshSources();
      setSourceOpen(true);
      return;
    }
    await window.desktopBridge?.selectCaptureSource(selectedSource.id);
    await room.startScreen(quality,fps);
    if(!systemAudio)await room.toggleScreenAudio();
  },[busy,fps,quality,refreshSources,room,selectedSource,sharing,systemAudio]);

  const toggleAudio=useCallback(async()=>{
    if(!sharing){
      setSystemAudio(value=>!value);
      return;
    }
    const nextEnabled=room.muted;
    await room.toggleScreenAudio();
    setSystemAudio(nextEnabled);
  },[room,sharing]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(!event.ctrlKey||!event.shiftKey)return;
      if(event.key.toLowerCase()==="s"){
        event.preventDefault();
        void toggleShare();
      }
      if(event.key.toLowerCase()==="a"){
        event.preventDefault();
        void toggleAudio();
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[toggleAudio,toggleShare]);

  const changeQuality=useCallback(async(next:Quality)=>{
    setQuality(next);
    if(sharing)await room.updateScreenQuality(next);
  },[room,sharing]);

  const changeFps=useCallback(async(next:FrameRate)=>{
    setFps(next);
    if(sharing)await room.updateScreenFrameRate(next);
  },[room,sharing]);

  const togglePip=useCallback(async()=>{
    const next=!pip;
    setPip(next);
    await window.desktopBridge?.togglePip(next);
  },[pip]);

  const copyCode=useCallback(async()=>{
    if(roomCode==="—")return;
    await copyText(roomCode);
    setCopied(true);
    if(copyTimerRef.current!==null)window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current=window.setTimeout(()=>setCopied(false),1200);
  },[roomCode]);

  const leave=useCallback(async()=>{
    try{if(sharing)await room.stopScreen();}catch{}
    await window.desktopBridge?.togglePip(false).catch(()=>undefined);
    getSocket().disconnect();
    onLeave();
  },[onLeave,room,sharing]);

  const latency=room.stats?.rttMs==null?"—":Math.round(room.stats.rttMs);
  const bitrate=room.stats?.bitrateKbps==null?"—":(room.stats.bitrateKbps/1000).toFixed(1);
  const connection=room.status==="Conectado"?"Excelente":room.status;
  const sourceLabel=selectedSource?.name||"Escolher fonte";
  const sidebarPeople=useMemo(
    ()=>participants.length?participants:[{id:"self",displayName:selfName}],
    [participants,selfName],
  );

  return <div className="relative h-full overflow-hidden">
    <RoomSidebar
      open={sidebarOpen}
      roomCode={roomCode}
      copied={copied}
      onCopy={()=>void copyCode()}
      people={sidebarPeople}
      count={participants.length||room.roomState.count||1}
      ownerName={room.roomState.ownerName}
      activeSharerId={room.roomState.activeScreenSharerId}
      onToggle={()=>setSidebarOpen(value=>!value)}
    />

    <div className={cx(
      "relative flex h-full min-w-0 flex-col transition-[padding-left] duration-300 ease-out transform-gpu",
      sidebarOpen?"pl-[252px]":"pl-0",
    )} style={{willChange:"padding-left"}}>
      <header className="relative z-40 flex h-[68px] shrink-0 items-center justify-between border-b border-zinc-800/60 bg-[#0b0b0e]/80 px-5 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold">Sala de {selfName}</h1>
            {room.roomState.live&&<span className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/[.08] px-2 py-1 text-[9px] font-semibold uppercase text-red-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"/>Ao vivo</span>}
          </div>
          <p className="mt-1 text-[10px] text-zinc-600">{room.roomState.activeScreenSharerName?`${room.roomState.activeScreenSharerName} está compartilhando`:"Controle a captura e acompanhe o desempenho."}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="flex min-w-[230px] items-center gap-3 rounded-xl border border-zinc-800/80 bg-[#121216]/80 px-3 py-2 text-left backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c]">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-purple-400">{selectedSource?.kind==="window"?<AppWindow size={16}/>:<Monitor size={16}/>}</div>
            <div className="min-w-0 flex-1"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">Fonte de captura</span><span className="block truncate text-xs font-medium text-zinc-200">{sourceLabel}</span></div>
            <ChevronDown size={15} className="text-zinc-600"/>
          </button>

          <button onClick={()=>setSettingsOpen(value=>!value)} className={cx("grid h-10 w-10 place-items-center rounded-xl border transition-all duration-200",settingsOpen?"border-purple-500/40 bg-purple-500/10 text-purple-300":"border-zinc-800/80 bg-[#121216]/80 text-zinc-500 hover:border-purple-500/40 hover:text-zinc-200")} aria-label="Configurações de captura"><Settings2 size={16}/></button>
        </div>
      </header>

      <StatsPanel open={statsOpen} cpu={desktopMetrics.cpu} latency={latency} bitrate={bitrate} systemAudio={systemAudio}/>

      <section className="relative z-10 flex min-h-0 flex-1 p-5 pb-28">
        <StreamStage
          videoRef={room.videoRef}
          live={room.roomState.live}
          sharing={sharing}
          switching={room.switching}
          sourceLabel={sharing?sourceLabel:(room.roomState.activeScreenSharerName||sourceLabel)}
          connection={connection}
          quality={quality}
          fps={room.stats?.fps??fps}
          busy={busy}
          onChooseSource={()=>{void refreshSources();setSourceOpen(true);}}
          onShare={()=>void toggleShare()}
        />

        <RoomDock
          sidebarOpen={sidebarOpen}
          systemAudio={systemAudio}
          sharing={sharing}
          busy={busy}
          statsOpen={statsOpen}
          pip={pip}
          onToggleAudio={()=>void toggleAudio()}
          onToggleShare={()=>void toggleShare()}
          onToggleStats={()=>setStatsOpen(value=>!value)}
          onTogglePip={()=>void togglePip()}
          onSettings={()=>setSettingsOpen(value=>!value)}
          onLeave={()=>void leave()}
        />

        <AnimatePresence>
          {settingsOpen&&<motion.div
            initial={{opacity:0,y:-8,scale:.98}}
            animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:-6,scale:.985}}
            transition={{duration:.2}}
            className="absolute right-8 top-8 z-50 w-72 rounded-2xl border border-zinc-800/80 bg-[#121216]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl will-change-transform"
          >
            <div className="mb-4 flex items-center justify-between"><div><span className="text-[9px] font-semibold uppercase tracking-wider text-purple-300">Captura</span><h3 className="mt-1 text-sm font-semibold">Qualidade</h3></div><button onClick={()=>setSettingsOpen(false)} className="text-zinc-600 hover:text-zinc-300"><X size={15}/></button></div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-600">Resolução</label>
            <div className="mt-2 grid grid-cols-2 gap-2">{(["1080p","720p"] as Quality[]).map(item=><button key={item} onClick={()=>void changeQuality(item)} className={cx("rounded-lg border px-3 py-2 text-xs",quality===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item}</button>)}</div>
            <label className="mt-4 block text-[10px] uppercase tracking-wider text-zinc-600">Quadros por segundo</label>
            <div className="mt-2 grid grid-cols-2 gap-2">{([60,30] as FrameRate[]).map(item=><button key={item} onClick={()=>void changeFps(item)} className={cx("rounded-lg border px-3 py-2 text-xs",fps===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item} FPS</button>)}</div>
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-[10px] leading-4 text-zinc-600">A captura mantém até 1080p/60; o encoder ajusta FPS e bitrate sem fechar a sala.</div>
          </motion.div>}
        </AnimatePresence>

        <AnimatePresence>
          {room.error&&<motion.div
            initial={{opacity:0,x:-16,y:10,scale:.97}}
            animate={{opacity:1,x:0,y:0,scale:1}}
            exit={{opacity:0,x:-10,scale:.98}}
            transition={{duration:.22}}
            className="fixed bottom-6 left-6 z-50 max-w-md rounded-xl border border-red-500/25 bg-[#2a1015]/95 px-4 py-3 text-xs text-red-200 shadow-2xl shadow-black/40 backdrop-blur-xl will-change-transform"
          >{room.error}</motion.div>}
        </AnimatePresence>
      </section>
    </div>

    <CaptureSourceDialog open={sourceOpen} sources={sources} selected={selectedSource} onSelect={source=>void chooseSource(source)} onClose={()=>setSourceOpen(false)}/>
  </div>;
});
