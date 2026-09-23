import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, ChevronDown, Monitor, PictureInPicture2, Settings2, X } from "lucide-react";
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
const readQuality=():Quality=>localStorage.getItem("lunira_default_quality")==="720p"?"720p":"1080p";
const readFps=():FrameRate=>localStorage.getItem("lunira_default_fps")==="30"?30:60;
const readAudio=()=>localStorage.getItem("lunira_default_audio")!=="0";

export const RoomLayout=memo(function RoomLayout({session,onLeave}:{session:SessionState;onLeave():void}){
  const room=useCollaborativeRoom(session.owner,session.roomId);

  const [sources,setSources]=useState<CaptureSource[]>([]);
  const [selectedSource,setSelectedSource]=useState<CaptureSource>();
  const [sourceOpen,setSourceOpen]=useState(false);
  const [quality,setQuality]=useState<Quality>(readQuality);
  const [fps,setFps]=useState<FrameRate>(readFps);
  const [systemAudio,setSystemAudio]=useState(readAudio);
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
      if(event.key==="Escape"){
        setSettingsOpen(false);
        setStatsOpen(false);
        setSourceOpen(false);
        return;
      }
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
    localStorage.setItem("lunira_default_quality",next);
    if(sharing)await room.updateScreenQuality(next);
  },[room,sharing]);

  const changeFps=useCallback(async(next:FrameRate)=>{
    setFps(next);
    localStorage.setItem("lunira_default_fps",String(next));
    if(sharing)await room.updateScreenFrameRate(next);
  },[room,sharing]);

  const togglePip=useCallback(async()=>{
    const next=!pip;
    setPip(next);
    if(next){
      setStatsOpen(false);
      setSettingsOpen(false);
      setSourceOpen(false);
    }
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
  const visiblePeople=sidebarPeople.slice(0,6);

  return <div className="relative h-full min-h-0 overflow-hidden">
    {!pip&&<RoomSidebar
      open={sidebarOpen}
      roomCode={roomCode}
      copied={copied}
      onCopy={()=>void copyCode()}
      people={sidebarPeople}
      count={participants.length||room.roomState.count||1}
      ownerName={room.roomState.ownerName}
      activeSharerId={room.roomState.activeScreenSharerId}
      onToggle={()=>setSidebarOpen(value=>!value)}
    />}

    <div className={cx(
      "relative flex h-full min-w-0 flex-col transition-[padding-left] duration-300",
      !pip&&sidebarOpen?"pl-[232px]":"pl-0",
    )}>
      {!pip&&<header className="relative z-40 flex h-[62px] shrink-0 items-center justify-between border-b border-white/[.055] bg-[#090a0f]/56 px-4 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-zinc-200">Sala de {selfName}</h1>
            {room.roomState.live&&<span className="flex items-center gap-1.5 rounded-full border border-red-500/18 bg-red-500/[.08] px-2 py-1 text-[8px] font-semibold uppercase text-red-300"><span className="h-1.5 w-1.5 rounded-full bg-red-400"/>Ao vivo</span>}
          </div>
          <p className="mt-1 truncate text-[10px] text-zinc-700">{room.roomState.activeScreenSharerName?room.roomState.activeScreenSharerName+" está compartilhando":"Escolha uma fonte e comece quando quiser."}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="flex min-w-[220px] items-center gap-3 rounded-xl border border-white/[.065] bg-white/[.025] px-3 py-2 text-left hover:border-purple-500/20 hover:bg-white/[.04]">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-500/9 text-purple-300">{selectedSource?.kind==="window"?<AppWindow size={14}/>:<Monitor size={14}/>}</div>
            <div className="min-w-0 flex-1"><span className="block text-[8px] uppercase tracking-[.12em] text-zinc-700">Fonte</span><span className="block truncate text-[10px] font-medium text-zinc-300">{sourceLabel}</span></div>
            <ChevronDown size={13} className="text-zinc-700"/>
          </button>
          <button onClick={()=>setSettingsOpen(value=>!value)} className={cx("grid h-10 w-10 place-items-center rounded-xl border",settingsOpen?"border-purple-500/25 bg-purple-500/10 text-purple-300":"border-white/[.065] bg-white/[.025] text-zinc-600 hover:text-zinc-300")} aria-label="Configurações da transmissão"><Settings2 size={15}/></button>
        </div>
      </header>}

      {!pip&&<StatsPanel open={statsOpen} onClose={()=>setStatsOpen(false)} cpu={desktopMetrics.cpu} latency={latency} bitrate={bitrate} systemAudio={systemAudio}/>}

      <section className={cx("relative z-10 flex min-h-0 flex-1 flex-col",pip?"p-2":"p-4 pb-[82px]")}>
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
          compact={pip}
        />

        {!pip&&<div className="mt-3 flex h-[76px] shrink-0 gap-2 overflow-x-auto">
          {visiblePeople.map((person,index)=>{
            const name=person.displayName||"Participante";
            const initials=name.split(" ").slice(0,2).map(part=>part[0]?.toUpperCase()).join("");
            const active=person.id===room.roomState.activeScreenSharerId;
            return <div key={person.id||String(index)} className={"flex min-w-[128px] items-center gap-2 rounded-xl border px-3 "+(active?"border-purple-500/30 bg-purple-500/[.07]":"border-white/[.055] bg-white/[.018]")}>
              <div className="grid h-9 w-9 place-items-center rounded-full border border-white/[.07] bg-[#171821] text-[10px] font-semibold text-zinc-300">{initials}</div>
              <div className="min-w-0"><span className="block truncate text-[10px] font-medium text-zinc-300">{name}</span><span className={"mt-1 block text-[8px] "+(active?"text-purple-300":"text-zinc-700")}>{active?"Transmitindo":"Na sala"}</span></div>
            </div>;
          })}
        </div>}

        {pip&&<button onClick={()=>void togglePip()} className="absolute bottom-4 right-4 z-30 flex h-8 items-center gap-2 rounded-lg border border-white/[.08] bg-[#111219]/92 px-3 text-[10px] text-zinc-300 shadow-lg backdrop-blur-xl"><PictureInPicture2 size={13}/>Restaurar</button>}

        {!pip&&<RoomDock
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
        />}

        <AnimatePresence>
          {!pip&&settingsOpen&&<motion.div
            initial={{opacity:0,y:-7,scale:.985}}
            animate={{opacity:1,y:0,scale:1}}
            exit={{opacity:0,y:-5,scale:.99}}
            transition={{duration:.18}}
            className="absolute right-5 top-5 z-50 w-72 rounded-2xl border border-white/[.075] bg-[#111219]/97 p-4 shadow-[0_22px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
          >
            <div className="mb-4 flex items-center justify-between"><div><span className="text-[8px] font-semibold uppercase tracking-[.14em] text-purple-300">Transmissão</span><h3 className="mt-1 text-sm font-semibold text-zinc-200">Qualidade</h3></div><button onClick={()=>setSettingsOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.05] hover:text-zinc-300"><X size={14}/></button></div>
            <label className="block text-[9px] uppercase tracking-[.12em] text-zinc-700">Resolução</label>
            <div className="mt-2 grid grid-cols-2 gap-2">{(["1080p","720p"] as Quality[]).map(item=><button key={item} onClick={()=>void changeQuality(item)} className={cx("rounded-xl border px-3 py-2.5 text-xs",quality===item?"border-purple-500/35 bg-purple-500/10 text-purple-200":"border-white/[.06] bg-black/20 text-zinc-600 hover:text-zinc-300")}>{item}</button>)}</div>
            <label className="mt-4 block text-[9px] uppercase tracking-[.12em] text-zinc-700">Quadros por segundo</label>
            <div className="mt-2 grid grid-cols-2 gap-2">{([60,30] as FrameRate[]).map(item=><button key={item} onClick={()=>void changeFps(item)} className={cx("rounded-xl border px-3 py-2.5 text-xs",fps===item?"border-purple-500/35 bg-purple-500/10 text-purple-200":"border-white/[.06] bg-black/20 text-zinc-600 hover:text-zinc-300")}>{item} FPS</button>)}</div>
            <button onClick={()=>void toggleAudio()} className={"mt-4 flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left text-xs "+(systemAudio?"border-emerald-400/14 bg-emerald-400/[.045] text-zinc-300":"border-white/[.06] bg-black/20 text-zinc-500")}><span>Áudio do sistema</span><span className={"h-2 w-2 rounded-full "+(systemAudio?"bg-emerald-400":"bg-zinc-700")}/></button>
          </motion.div>}
        </AnimatePresence>

        <AnimatePresence>
          {room.error&&<motion.div initial={{opacity:0,x:-12,y:8}} animate={{opacity:1,x:0,y:0}} exit={{opacity:0,x:-8}} transition={{duration:.18}} className="fixed bottom-5 left-5 z-[70] max-w-md rounded-xl border border-red-500/22 bg-[#271015]/96 px-4 py-3 text-xs text-red-200 shadow-2xl backdrop-blur-xl">{room.error}</motion.div>}
        </AnimatePresence>
      </section>
    </div>

    {!pip&&<CaptureSourceDialog open={sourceOpen} sources={sources} selected={selectedSource} onSelect={source=>void chooseSource(source)} onClose={()=>setSourceOpen(false)}/>}
  </div>;
});
