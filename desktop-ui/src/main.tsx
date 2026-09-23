import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, Check, ChevronDown, Maximize2, Monitor, Radio, Settings2, ShieldCheck, X } from "lucide-react";
import { useCollaborativeRoom } from "../../client/src/services/useCollaborativeRoom";
import { copyText, safeSessionGet, safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { getSocket } from "../../client/src/services/socket";
import { AmbientBackground } from "./components/AmbientBackground";
import { BrandLogo } from "./components/BrandLogo";
import { DesktopTitleBar } from "./components/DesktopTitleBar";
import { HowItWorksModal } from "./components/HowItWorksModal";
import { RoomDock } from "./components/RoomDock";
import { RoomSidebar } from "./components/RoomSidebar";
import { SplashScreen } from "./components/SplashScreen";
import { StatsPanel } from "./components/StatsPanel";
import { StreamStage } from "./components/StreamStage";
import type { CaptureSource, DesktopMetrics, FrameRate, Quality } from "./types";
import "./index.css";

type SessionState={owner:boolean;roomId?:string};
const cx=(...values:Array<string|false|null|undefined>)=>values.filter(Boolean).join(" ");

const CaptureDialog=memo(function CaptureDialog({sources,selected,onSelect,onClose}:{sources:CaptureSource[];selected?:CaptureSource;onSelect(source:CaptureSource):void;onClose():void}){
  const [tab,setTab]=useState<"monitor"|"window">("monitor");
  const visible=useMemo(()=>sources.filter(source=>source.kind===tab),[sources,tab]);
  return <motion.div className="fixed inset-0 z-50 isolate grid place-items-center overflow-hidden bg-black/70 p-8 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}} onMouseDown={onClose}>
    <AmbientBackground variant="modal"/>
    <motion.div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#121215]/95 shadow-2xl shadow-black/60 backdrop-blur-xl" initial={{opacity:0,scale:.975,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.985,y:6}} transition={{duration:.22,ease:[.2,.8,.2,1]}} onMouseDown={event=>event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4"><div><h2 className="text-sm font-semibold">Escolher fonte de captura</h2><p className="mt-1 text-[11px] text-zinc-500">Escolha exatamente o monitor ou aplicativo transmitido.</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Fechar"><X size={16}/></button></div>
      <div className="flex border-b border-zinc-800/70 px-5 py-3"><div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1"><button onClick={()=>setTab("monitor")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs",tab==="monitor"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><Monitor size={14}/>Monitores</button><button onClick={()=>setTab("window")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs",tab==="window"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><AppWindow size={14}/>Janelas</button></div></div>
      <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto p-5">{visible.length?visible.map(source=><button key={source.id} onClick={()=>onSelect(source)} className={cx("group rounded-xl border p-2 text-left transition-all duration-200",selected?.id===source.id?"border-purple-500/70 bg-purple-500/[.06]":"border-zinc-800 bg-zinc-950 hover:-translate-y-0.5 hover:border-purple-500/30 hover:bg-[#151518] hover:shadow-lg hover:shadow-purple-500/5")}><div className="relative h-32 overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b]">{source.thumbnail?<img src={source.thumbnail} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center text-zinc-700">{source.kind==="monitor"?<Monitor/>:<AppWindow/>}</div>}{selected?.id===source.id&&<span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-purple-600"><Check size={13}/></span>}</div><div className="flex items-center gap-2 px-1 pb-1 pt-3"><span className="text-zinc-500">{source.kind==="monitor"?<Monitor size={14}/>:<AppWindow size={14}/>}</span><span className="min-w-0 truncate text-xs font-medium text-zinc-200">{source.name}</span></div></button>):<div className="col-span-2 py-16 text-center text-xs text-zinc-600">Nenhuma fonte encontrada.</div>}</div>
      <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950/40 px-5 py-4"><span className="flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13}/>Somente a fonte escolhida será capturada.</span><button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 active:scale-95">Concluir</button></div>
    </motion.div>
  </motion.div>;
});

const Home=memo(function Home({onCreate,onJoin}:{onCreate(name:string):void;onJoin(name:string,code:string):void}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [howOpen,setHowOpen]=useState(false);
  const enterOrCreate=useCallback(()=>{const clean=name.trim();const room=code.replace(/[^a-z0-9]/gi,"").toUpperCase();if(!clean)return setError("Digite o seu nome para continuar.");if(room&&room.length<6)return setError("Digite um código de sala válido.");setError("");if(room)onJoin(clean,room);else onCreate(clean);},[code,name,onCreate,onJoin]);
  return <>
    <div className="relative isolate flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#09090b] p-10">
      <AmbientBackground variant="home"/>
      <div className="relative z-10 grid w-full max-w-6xl grid-cols-[1.05fr_.95fr] items-center gap-16">
        <section><div className="mb-6 inline-flex"><BrandLogo size="lg"/></div><h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-[-.04em] text-zinc-50">Compartilhe a sua tela sem interromper o fluxo.</h1><p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">Salas privadas, captura de monitor ou janela, áudio do sistema e controle de qualidade numa interface feita para desktop.</p>
          <div className="mt-8 max-w-xl rounded-2xl border border-zinc-800/80 bg-[#121216]/80 p-5 shadow-2xl shadow-black/20 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-purple-500/30 hover:bg-[#151518] hover:shadow-lg hover:shadow-purple-500/5">
            <div className="mb-4"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-purple-300">Entrar ou criar</span><p className="mt-1 text-xs text-zinc-500">Deixe o código vazio para criar uma sala nova.</p></div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-600">Seu nome</label><input value={name} onChange={event=>setName(event.target.value)} maxLength={24} placeholder="Como as pessoas vão ver você?" className="h-11 w-full rounded-xl border border-zinc-800/80 bg-[#121216]/80 px-3 text-sm text-zinc-100 outline-none backdrop-blur-md placeholder:text-zinc-700 focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20"/>
            <label className="mb-1.5 mt-3 block text-[10px] font-medium uppercase tracking-wider text-zinc-600">Código da sala <span className="normal-case text-zinc-700">(opcional)</span></label><input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} onKeyDown={event=>event.key==="Enter"&&enterOrCreate()} maxLength={10} placeholder="J2N265E8" className="h-11 w-full rounded-xl border border-zinc-800/80 bg-[#121216]/80 px-3 font-mono text-xs tracking-[.12em] text-zinc-200 outline-none backdrop-blur-md placeholder:text-zinc-700 focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20"/>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button onClick={enterOrCreate} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 active:scale-95"><Radio size={16}/>Entrar / Criar Sala</button><button onClick={()=>setHowOpen(true)} className="h-11 rounded-xl border border-zinc-800/80 bg-transparent px-5 text-xs font-semibold text-zinc-300 hover:border-purple-500/30 hover:bg-zinc-900/60">Como Funciona</button></div>
            {error&&<p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
        </section>
        <section><div className="cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#121215]/90 shadow-2xl shadow-black/30 backdrop-blur-md transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-purple-500/30 hover:bg-[#151518] hover:shadow-lg hover:shadow-purple-500/5"><div className="flex h-10 items-center justify-between border-b border-zinc-800/70 px-4 text-[10px] text-zinc-600"><span>PREVIEW DO DESKTOP</span><Maximize2 size={13}/></div><div className="relative flex h-80 items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,.14),transparent_48%),#0d0d10]"><div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-purple-500/20 bg-purple-500/[.06] text-purple-400"><img src="/__desktop__/logo.svg" alt="" className="h-9 w-9"/></div><strong className="mt-4 block text-sm text-zinc-200">Sua transmissão aparece aqui</strong><span className="mt-1 block text-xs text-zinc-600">Monitor ou janela específica</span></div></div></div>
          <div className="mt-4 grid grid-cols-4 gap-2">{[["Privado","Protegido"],["Duração","Temporária"],["Qualidade","1080p"],["Fluidez","60 FPS"]].map(([label,value])=><div key={label} className="rounded-xl border border-zinc-800/70 bg-[#101013]/90 px-3 py-3 backdrop-blur-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-purple-500/30 hover:bg-[#151518] hover:shadow-lg hover:shadow-purple-500/5"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">{label}</span><strong className="mt-1 block text-xs text-zinc-300">{value}</strong></div>)}</div>
        </section>
      </div>
    </div>
    <HowItWorksModal open={howOpen} onClose={()=>setHowOpen(false)}/>
  </>;
});

function Room({session,onLeave}:{session:SessionState;onLeave():void}){
  const room=useCollaborativeRoom(session.owner,session.roomId);
  const [sources,setSources]=useState<CaptureSource[]>([]),[selectedSource,setSelectedSource]=useState<CaptureSource>(),[sourceOpen,setSourceOpen]=useState(false);
  const [quality,setQuality]=useState<Quality>("1080p"),[fps,setFps]=useState<FrameRate>(60),[systemAudio,setSystemAudio]=useState(true),[pip,setPip]=useState(false),[settingsOpen,setSettingsOpen]=useState(false),[statsOpen,setStatsOpen]=useState(false),[sidebarOpen,setSidebarOpen]=useState(true),[copied,setCopied]=useState(false);
  const [desktopMetrics,setDesktopMetrics]=useState<DesktopMetrics>({cpu:0,memoryMb:0});
  const selfName=safeSessionGet("lumacast-display-name")||"Você";
  const participants=useMemo(()=>room.roomState.participants||[],[room.roomState.participants]);
  const roomCode=room.roomId||session.roomId||"—",sharing=room.isScreenSharer,busy=!!room.roomState.activeScreenSharerId&&!room.ownsScreenLock;

  const refreshSources=useCallback(async()=>{const next=await window.desktopBridge?.listCaptureSources().catch(()=>[])||[];setSources(next);if(!selectedSource&&next[0]){setSelectedSource(next[0]);await window.desktopBridge?.selectCaptureSource(next[0].id);}},[selectedSource]);
  useEffect(()=>{void refreshSources();},[]);
  useEffect(()=>{let active=true;const update=async()=>{const next=await window.desktopBridge?.getPerformanceMetrics().catch(()=>null);if(active&&next)setDesktopMetrics(next);};void update();const timer=window.setInterval(()=>void update(),1000);return()=>{active=false;window.clearInterval(timer);};},[]);
  useEffect(()=>{if(sharing)setSystemAudio(!room.muted);},[sharing,room.muted]);

  const chooseSource=useCallback(async(source:CaptureSource)=>{setSelectedSource(source);await window.desktopBridge?.selectCaptureSource(source.id);if(sharing){await room.stopScreen();await new Promise(resolve=>window.setTimeout(resolve,120));await room.startScreen(quality,fps);if(!systemAudio)await room.toggleScreenAudio();}},[fps,quality,room,sharing,systemAudio]);
  const toggleShare=useCallback(async()=>{if(sharing){await room.stopScreen();return;}if(busy){room.setError("Outra pessoa já está compartilhando.");return;}if(!selectedSource){await refreshSources();setSourceOpen(true);return;}await window.desktopBridge?.selectCaptureSource(selectedSource.id);await room.startScreen(quality,fps);},[busy,fps,quality,refreshSources,room,selectedSource,sharing]);
  const toggleAudio=useCallback(async()=>{if(!sharing){setSystemAudio(value=>!value);return;}const nextEnabled=room.muted;await room.toggleScreenAudio();setSystemAudio(nextEnabled);},[room,sharing]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(!event.ctrlKey||!event.shiftKey)return;if(event.key.toLowerCase()==="s"){event.preventDefault();void toggleShare();}if(event.key.toLowerCase()==="a"){event.preventDefault();void toggleAudio();}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[toggleAudio,toggleShare]);

  const changeQuality=useCallback(async(next:Quality)=>{setQuality(next);if(sharing)await room.updateScreenQuality(next);},[room,sharing]);
  const changeFps=useCallback(async(next:FrameRate)=>{setFps(next);if(sharing)await room.updateScreenFrameRate(next);},[room,sharing]);
  const togglePip=useCallback(async()=>{const next=!pip;setPip(next);await window.desktopBridge?.togglePip(next);},[pip]);
  const copyCode=useCallback(async()=>{if(roomCode==="—")return;await copyText(roomCode);setCopied(true);window.setTimeout(()=>setCopied(false),1200);},[roomCode]);
  const leave=useCallback(async()=>{try{if(sharing)await room.stopScreen();}catch{}getSocket().disconnect();onLeave();},[onLeave,room,sharing]);

  const latency=room.stats?.rttMs==null?"—":Math.round(room.stats.rttMs),bitrate=room.stats?.bitrateKbps==null?"—":(room.stats.bitrateKbps/1000).toFixed(1),connection=room.status==="Conectado"?"Excelente":room.status,sourceLabel=selectedSource?.name||"Escolher fonte";
  const sidebarPeople=useMemo(()=>participants.length?participants:[{id:"self",displayName:selfName}],[participants,selfName]);

  return <div className="relative isolate flex min-h-0 flex-1 overflow-hidden bg-[#09090b]">
    <AmbientBackground variant="room"/>
    <RoomSidebar open={sidebarOpen} roomCode={roomCode} copied={copied} onCopy={()=>void copyCode()} people={sidebarPeople} count={participants.length||room.roomState.count||1} ownerName={room.roomState.ownerName} activeSharerId={room.roomState.activeScreenSharerId} onToggle={()=>setSidebarOpen(value=>!value)}/>
    <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="relative z-20 flex h-[66px] shrink-0 items-center justify-between border-b border-zinc-800/70 bg-[#09090b]/72 px-5 backdrop-blur-xl"><div><div className="flex items-center gap-2"><h1 className="text-sm font-semibold">Sala de {selfName}</h1>{room.roomState.live&&<span className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/[.08] px-2 py-1 text-[9px] font-semibold uppercase text-red-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"/>Ao vivo</span>}</div><p className="mt-1 text-[10px] text-zinc-600">{room.roomState.activeScreenSharerName?`${room.roomState.activeScreenSharerName} está compartilhando`:"Controle a captura e acompanhe o desempenho."}</p></div><div className="flex items-center gap-2"><button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="flex min-w-[230px] items-center gap-3 rounded-xl border border-zinc-800/80 bg-[#121215] px-3 py-2 text-left hover:border-purple-500/30 hover:bg-[#151518]"><div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-purple-400">{selectedSource?.kind==="window"?<AppWindow size={16}/>:<Monitor size={16}/>}</div><div className="min-w-0 flex-1"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">Fonte de captura</span><span className="block truncate text-xs font-medium text-zinc-200">{sourceLabel}</span></div><ChevronDown size={15} className="text-zinc-600"/></button><button onClick={()=>setSettingsOpen(value=>!value)} className={cx("grid h-10 w-10 place-items-center rounded-xl border",settingsOpen?"border-purple-500/40 bg-purple-500/10 text-purple-300":"border-zinc-800 bg-[#121215] text-zinc-500 hover:text-zinc-200")} title="Configurações de captura"><Settings2 size={16}/></button></div></div>
      <StatsPanel open={statsOpen} cpu={desktopMetrics.cpu} latency={latency} bitrate={bitrate} systemAudio={systemAudio}/>
      <section className="relative z-10 flex min-h-0 flex-1 p-5 pb-28">
        <StreamStage videoRef={room.videoRef} live={room.roomState.live} sharing={sharing} switching={room.switching} sourceLabel={sharing?sourceLabel:(room.roomState.activeScreenSharerName||sourceLabel)} connection={connection} quality={quality} fps={room.stats?.fps??fps} busy={busy} onChooseSource={()=>{void refreshSources();setSourceOpen(true);}} onShare={()=>void toggleShare()}/>
        <RoomDock sidebarOpen={sidebarOpen} systemAudio={systemAudio} sharing={sharing} busy={busy} statsOpen={statsOpen} pip={pip} onToggleAudio={()=>void toggleAudio()} onToggleShare={()=>void toggleShare()} onToggleStats={()=>setStatsOpen(value=>!value)} onTogglePip={()=>void togglePip()} onSettings={()=>setSettingsOpen(value=>!value)} onLeave={()=>void leave()}/>
        <AnimatePresence>{settingsOpen&&<motion.div initial={{opacity:0,y:-8,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-6,scale:.985}} transition={{duration:.2}} className="absolute right-8 top-8 z-40 w-72 rounded-2xl border border-zinc-800 bg-[#121215]/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl will-change-transform"><div className="mb-4 flex items-center justify-between"><div><span className="text-[9px] font-semibold uppercase tracking-wider text-purple-300">Captura</span><h3 className="mt-1 text-sm font-semibold">Qualidade</h3></div><button onClick={()=>setSettingsOpen(false)} className="text-zinc-600 hover:text-zinc-300"><X size={15}/></button></div><label className="block text-[10px] uppercase tracking-wider text-zinc-600">Resolução</label><div className="mt-2 grid grid-cols-2 gap-2">{(["1080p","720p"] as Quality[]).map(item=><button key={item} onClick={()=>void changeQuality(item)} className={cx("rounded-lg border px-3 py-2 text-xs",quality===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item}</button>)}</div><label className="mt-4 block text-[10px] uppercase tracking-wider text-zinc-600">Quadros por segundo</label><div className="mt-2 grid grid-cols-2 gap-2">{([60,30] as FrameRate[]).map(item=><button key={item} onClick={()=>void changeFps(item)} className={cx("rounded-lg border px-3 py-2 text-xs",fps===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item} FPS</button>)}</div><div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-[10px] leading-4 text-zinc-600">A captura mantém até 1080p/60; o encoder ajusta FPS e bitrate sem fechar a sala.</div></motion.div>}</AnimatePresence>
        <AnimatePresence>{room.error&&<motion.div initial={{opacity:0,x:-16,y:10,scale:.97}} animate={{opacity:1,x:0,y:0,scale:1}} exit={{opacity:0,x:-10,scale:.98}} transition={{duration:.22}} className="fixed bottom-6 left-6 z-50 max-w-md rounded-xl border border-red-500/25 bg-[#2a1015]/95 px-4 py-3 text-xs text-red-200 shadow-2xl shadow-black/40 backdrop-blur-xl will-change-transform">{room.error}</motion.div>}</AnimatePresence>
      </section>
    </main>
    <AnimatePresence>{sourceOpen&&<CaptureDialog sources={sources} selected={selectedSource} onSelect={source=>void chooseSource(source)} onClose={()=>setSourceOpen(false)}/>}</AnimatePresence>
  </div>;
}

function App(){
  const [session,setSession]=useState<SessionState|null>(null);
  const [splash,setSplash]=useState(()=>new URLSearchParams(window.location.search).get("splash")==="true"||localStorage.getItem("lunira_splash_seen")!=="1");
  const createRoom=useCallback((name:string)=>{safeSessionSet("lumacast-display-name",name);safeSessionRemove("lumacast-broadcaster");getSocket().disconnect();setSession({owner:true});},[]);
  const joinRoom=useCallback((name:string,roomId:string)=>{safeSessionSet("lumacast-display-name",name);getSocket().disconnect();setSession({owner:false,roomId});},[]);
  const goHome=useCallback(()=>{getSocket().disconnect();setSession(null);},[]);
  const finishSplash=useCallback(()=>{localStorage.setItem("lunira_splash_seen","1");setSplash(false);},[]);
  return <div className="flex h-screen min-h-[680px] w-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100"><DesktopTitleBar status={session?"Conectado":"Pronto"} inRoom={!!session} onHome={goHome}/>{session?<Room session={session} onLeave={goHome}/>:<Home onCreate={createRoom} onJoin={joinRoom}/>}<SplashScreen visible={splash} onComplete={finishSplash}/></div>;
}

createRoot(document.getElementById("root")!).render(<App/>);
