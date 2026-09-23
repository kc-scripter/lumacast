import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AppWindow, Check, ChevronDown, Copy, Cpu, Gauge, Keyboard,
  Maximize2, Minus, Monitor, MoreHorizontal, Radio, ScreenShare,
  ScreenShareOff, Settings2, ShieldCheck, SlidersHorizontal, Square,
  Users, Volume2, VolumeX, Wifi, X, Zap
} from "lucide-react";
import { useCollaborativeRoom } from "../../client/src/services/useCollaborativeRoom";
import { copyText, safeSessionGet, safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { getSocket } from "../../client/src/services/socket";
import "./index.css";

type Quality = "1080p" | "720p";
type FrameRate = 30 | 60;
type SessionState = { owner: boolean; roomId?: string };
type CaptureSource = {
  id: string;
  name: string;
  kind: "monitor" | "window";
  thumbnail?: string;
  displayId?: string;
};
type DesktopMetrics = { cpu: number; memoryMb: number };
type DesktopBridge = {
  windowAction(action: "minimize" | "maximize" | "close"): Promise<void>;
  listCaptureSources(): Promise<CaptureSource[]>;
  selectCaptureSource(id: string): Promise<boolean>;
  togglePip(enabled: boolean): Promise<boolean>;
  getPerformanceMetrics(): Promise<DesktopMetrics>;
};

declare global {
  interface Window { desktopBridge?: DesktopBridge; }
}

const cx = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

function Logo() {
  return <div className="flex items-center gap-2">
    <div className="relative h-6 w-6 rounded-lg bg-purple-600 shadow-[0_0_24px_rgba(124,58,237,.24)]">
      <div className="absolute inset-[5px] rounded border border-white/70" />
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[#0d0d10] bg-purple-300" />
    </div>
    <span className="text-xs font-semibold tracking-tight">Lunira Screen</span>
  </div>;
}

function TitleBar({ status = "Pronto" }: { status?: string }) {
  const action = (value: "minimize" | "maximize" | "close") => void window.desktopBridge?.windowAction(value);
  const connected = status === "Conectado" || status === "Pronto";
  return <header className="flex h-11 shrink-0 items-center border-b border-zinc-800/70 bg-[#0d0d10] pl-4 [-webkit-app-region:drag]">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Logo />
      <div className="h-4 w-px bg-zinc-800" />
      <span className="rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-purple-300">Desktop App v1.0</span>
    </div>
    <div className="flex items-center gap-2 pr-2 [-webkit-app-region:no-drag]">
      <div className="mr-2 flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1">
        <span className={cx("h-2 w-2 rounded-full", connected ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.38)]" : "bg-amber-400")} />
        <span className="text-[10px] text-zinc-400">{status}</span>
      </div>
      <button aria-label="Minimizar" onClick={() => action("minimize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"><Minus size={15}/></button>
      <button aria-label="Maximizar" onClick={() => action("maximize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"><Square size={12}/></button>
      <button aria-label="Fechar" onClick={() => action("close")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition hover:bg-red-500/90 hover:text-white"><X size={15}/></button>
    </div>
  </header>;
}

function Home({ onCreate, onJoin }: { onCreate(name: string): void; onJoin(name: string, code: string): void }) {
  const [name, setName] = useState(() => safeSessionGet("lumacast-display-name") || "");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const create = () => {
    const clean = name.trim();
    if (!clean) return setError("Digite o seu nome para criar uma sala.");
    setError(""); onCreate(clean);
  };
  const join = () => {
    const clean = name.trim(), room = code.replace(/[^a-z0-9]/gi, "").toUpperCase();
    if (!clean) return setError("Digite o seu nome primeiro.");
    if (room.length < 6) return setError("Digite um código de sala válido.");
    setError(""); onJoin(clean, room);
  };

  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#09090b] p-10">
    <div className="grid w-full max-w-6xl grid-cols-[1.05fr_.95fr] items-center gap-16">
      <section>
        <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-purple-300"><span className="h-2 w-2 rounded-full bg-purple-500"/> Lunira Screen Desktop</div>
        <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-[-.04em] text-zinc-50">Compartilhe a sua tela sem interromper o fluxo.</h1>
        <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">Salas privadas, captura de monitor ou janela, áudio do sistema e controle de qualidade em uma interface feita para desktop.</p>

        <div className="mt-8 max-w-xl rounded-2xl border border-zinc-800/80 bg-[#121215] p-5 shadow-2xl shadow-black/20">
          <div className="mb-4">
            <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-purple-300">Nova sala</span>
            <p className="mt-1 text-xs text-zinc-500">Como as outras pessoas vão ver você?</p>
          </div>
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && create()} maxLength={24} placeholder="Seu nome" className="h-11 w-full rounded-xl border border-zinc-800 bg-[#09090b] px-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-700 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/10" />
          <button onClick={create} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-purple-600 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 transition hover:bg-purple-500 active:scale-[.995]"><Radio size={16}/> Criar sala privada</button>
          {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
        </div>

        <div className="mt-4 flex max-w-xl gap-2">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} onKeyDown={e => e.key === "Enter" && join()} maxLength={10} placeholder="CÓDIGO DA SALA" className="h-10 flex-1 rounded-xl border border-zinc-800 bg-[#121215] px-3 font-mono text-xs tracking-[.12em] text-zinc-200 outline-none focus:border-purple-500/50" />
          <button onClick={join} className="h-10 rounded-xl border border-zinc-700 bg-zinc-900 px-5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800">Entrar</button>
        </div>
      </section>

      <section>
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#121215] shadow-2xl shadow-black/30">
          <div className="flex h-10 items-center justify-between border-b border-zinc-800/70 px-4 text-[10px] text-zinc-600"><span>PREVIEW DO DESKTOP</span><Maximize2 size={13}/></div>
          <div className="relative flex h-80 items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,.14),transparent_48%),#0d0d10]">
            <div className="text-center">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-purple-500/20 bg-purple-500/[.06] text-purple-400"><Monitor size={28}/></div>
              <strong className="mt-4 block text-sm text-zinc-200">Sua transmissão aparece aqui</strong>
              <span className="mt-1 block text-xs text-zinc-600">Monitor ou janela específica</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[["Privado","Protegido"],["Duração","Temporária"],["Qualidade","1080p"],["Fluidez","60 FPS"]].map(([label,value]) => <div key={label} className="rounded-xl border border-zinc-800/70 bg-[#101013] px-3 py-3"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">{label}</span><strong className="mt-1 block text-xs text-zinc-300">{value}</strong></div>)}
        </div>
      </section>
    </div>
  </div>;
}

function MetricCard({ icon: Icon, label, value, suffix, bars }: { icon: React.ElementType; label: string; value: string | number; suffix?: string; bars?: number[] }) {
  return <div className="group min-w-0 rounded-xl border border-zinc-800/80 bg-[#121215] px-3.5 py-3 transition duration-150 hover:border-zinc-700/90 hover:bg-[#151519]">
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-zinc-500"><Icon size={14}/><span className="text-[10px] font-medium uppercase tracking-[.13em]">{label}</span></div><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]"/></div>
    <div className="flex items-end justify-between gap-3"><div><span className="text-lg font-semibold tracking-tight text-zinc-100">{value}</span>{suffix && <span className="ml-1 text-[11px] text-zinc-500">{suffix}</span>}</div>{bars && <div className="flex h-7 items-end gap-[3px]">{bars.map((height,index)=><span key={index} className="w-[3px] rounded-full bg-purple-500/50 transition group-hover:bg-purple-500/80" style={{height:`${height}%`}}/>)}</div>}</div>
  </div>;
}

function ParticipantRow({ name, host, sharing }: { name: string; host?: boolean; sharing?: boolean }) {
  const initials = name.split(" ").slice(0,2).map(p => p[0]?.toUpperCase()).join("");
  return <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 transition hover:bg-zinc-900/80">
    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-zinc-700/70 bg-zinc-800 text-[10px] font-semibold text-zinc-300">{initials}<span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d0d10] bg-emerald-400"/></div>
    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-medium text-zinc-200">{name}</span>{host && <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-purple-300">Host</span>}</div><span className="text-[10px] text-zinc-600">{sharing ? "Compartilhando tela" : "Conectado"}</span></div>
    <MoreHorizontal size={15} className="text-zinc-700 transition group-hover:text-zinc-400"/>
  </div>;
}

function CaptureDialog({ sources, selected, onSelect, onClose }: { sources: CaptureSource[]; selected?: CaptureSource; onSelect(source: CaptureSource): void; onClose(): void }) {
  const [tab,setTab] = useState<"monitor"|"window">("monitor");
  const visible = sources.filter(source => source.kind === tab);
  return <div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-8 backdrop-blur-sm" onMouseDown={onClose}>
    <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#121215] shadow-2xl shadow-black/60" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4"><div><h2 className="text-sm font-semibold">Escolher fonte de captura</h2><p className="mt-1 text-[11px] text-zinc-500">Escolha exatamente o monitor ou aplicativo que será transmitido.</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X size={16}/></button></div>
      <div className="flex border-b border-zinc-800/70 px-5 py-3"><div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1"><button onClick={()=>setTab("monitor")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs transition",tab==="monitor"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><Monitor size={14}/>Monitores</button><button onClick={()=>setTab("window")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs transition",tab==="window"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><AppWindow size={14}/>Janelas</button></div></div>
      <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto p-5">
        {visible.length ? visible.map(source => <button key={source.id} onClick={()=>onSelect(source)} className={cx("group rounded-xl border p-2 text-left transition",selected?.id===source.id?"border-purple-500/70 bg-purple-500/[.06]":"border-zinc-800 bg-zinc-950 hover:border-zinc-700")}>
          <div className="relative h-32 overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b]">{source.thumbnail ? <img src={source.thumbnail} className="h-full w-full object-cover" alt=""/> : <div className="grid h-full place-items-center text-zinc-700">{source.kind==="monitor"?<Monitor/>:<AppWindow/>}</div>}{selected?.id===source.id&&<span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-purple-600"><Check size={13}/></span>}</div>
          <div className="flex items-center gap-2 px-1 pb-1 pt-3"><span className="text-zinc-500">{source.kind==="monitor"?<Monitor size={14}/>:<AppWindow size={14}/>}</span><span className="min-w-0 truncate text-xs font-medium text-zinc-200">{source.name}</span></div>
        </button>) : <div className="col-span-2 py-16 text-center text-xs text-zinc-600">Nenhuma fonte encontrada.</div>}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950/40 px-5 py-4"><span className="flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13}/>Somente a fonte escolhida será capturada.</span><button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500">Concluir</button></div>
    </div>
  </div>;
}

function Room({ session, onLeave }: { session: SessionState; onLeave(): void }) {
  const room = useCollaborativeRoom(session.owner, session.roomId);
  const [sources,setSources] = useState<CaptureSource[]>([]);
  const [selectedSource,setSelectedSource] = useState<CaptureSource>();
  const [sourceOpen,setSourceOpen] = useState(false);
  const [quality,setQuality] = useState<Quality>("1080p");
  const [fps,setFps] = useState<FrameRate>(60);
  const [systemAudio,setSystemAudio] = useState(true);
  const [pip,setPip] = useState(false);
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [copied,setCopied] = useState(false);
  const [desktopMetrics,setDesktopMetrics] = useState<DesktopMetrics>({cpu:0,memoryMb:0});
  const selfName = safeSessionGet("lumacast-display-name") || "Você";
  const participants = room.roomState.participants || [];
  const roomCode = room.roomId || session.roomId || "—";
  const sharing = room.isScreenSharer;
  const remoteLive = room.roomState.live && !sharing;
  const busy = !!room.roomState.activeScreenSharerId && !room.ownsScreenLock;

  const refreshSources = useCallback(async() => {
    const next = await window.desktopBridge?.listCaptureSources().catch(()=>[]) || [];
    setSources(next);
    if (!selectedSource && next[0]) {
      setSelectedSource(next[0]);
      await window.desktopBridge?.selectCaptureSource(next[0].id);
    }
  },[selectedSource]);

  useEffect(()=>{ void refreshSources(); },[]);
  useEffect(()=>{
    const timer = window.setInterval(async()=>{
      const next = await window.desktopBridge?.getPerformanceMetrics().catch(()=>null);
      if(next) setDesktopMetrics(next);
    },1000);
    return()=>window.clearInterval(timer);
  },[]);
  useEffect(()=>{ if(sharing) setSystemAudio(!room.muted); },[sharing,room.muted]);

  const chooseSource = async(source: CaptureSource) => {
    setSelectedSource(source);
    await window.desktopBridge?.selectCaptureSource(source.id);
    if (sharing) {
      await room.stopScreen();
      await new Promise(resolve=>window.setTimeout(resolve,120));
      await room.startScreen(quality,fps);
      if(!systemAudio) await room.toggleScreenAudio();
    }
  };

  const toggleShare = useCallback(async() => {
    if (sharing) return void await room.stopScreen();
    if (busy) return room.setError("Outra pessoa já está compartilhando.");
    if (!selectedSource) { await refreshSources(); setSourceOpen(true); return; }
    await window.desktopBridge?.selectCaptureSource(selectedSource.id);
    await room.startScreen(quality,fps);
    if(!systemAudio) await room.toggleScreenAudio();
  },[sharing,busy,selectedSource,quality,fps,systemAudio,room,refreshSources]);

  const toggleAudio = useCallback(async() => {
    if(!sharing){ setSystemAudio(value=>!value); return; }
    const nextEnabled = room.muted;
    await room.toggleScreenAudio();
    setSystemAudio(nextEnabled);
  },[sharing,room]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(!event.ctrlKey||!event.shiftKey)return;
      if(event.key.toLowerCase()==="s"){event.preventDefault();void toggleShare();}
      if(event.key.toLowerCase()==="a"){event.preventDefault();void toggleAudio();}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[toggleShare,toggleAudio]);

  const changeQuality = async(next:Quality) => { setQuality(next); if(sharing) await room.updateScreenQuality(next); };
  const changeFps = async(next:FrameRate) => { setFps(next); if(sharing) await room.updateScreenFrameRate(next); };
  const togglePip = async() => { const next=!pip; setPip(next); await window.desktopBridge?.togglePip(next); };

  const copyCode = async() => { if(roomCode==="—")return; await copyText(roomCode); setCopied(true); window.setTimeout(()=>setCopied(false),1200); };
  const leave = async() => { try{if(sharing)await room.stopScreen();}catch{} getSocket().disconnect(); onLeave(); };

  const latency = room.stats?.rttMs == null ? "—" : Math.round(room.stats.rttMs);
  const bitrate = room.stats?.bitrateKbps == null ? "—" : (room.stats.bitrateKbps/1000).toFixed(1);
  const connection = room.status === "Conectado" ? "Excelente" : room.status;
  const sourceLabel = selectedSource?.name || "Escolher fonte";

  return <div className="relative flex min-h-0 flex-1 overflow-hidden">
    <aside className="flex w-[252px] shrink-0 flex-col border-r border-zinc-800/80 bg-[#0d0d10]">
      <div className="border-b border-zinc-800/70 p-4">
        <div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[.15em] text-zinc-600"><Radio size={12}/>Sala atual</div>
        <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold tracking-[.08em] text-zinc-200">{roomCode}</span><button onClick={()=>void copyCode()} className="flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[10px] text-zinc-500 hover:text-zinc-200">{copied?<Check size={12}/>:<Copy size={12}/>} {copied?"Copiado":"Copiar"}</button></div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between px-2"><span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"><Users size={13}/>Participantes</span><span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[9px] text-zinc-500">{participants.length || room.roomState.count || 1}</span></div>
        <div className="space-y-1 overflow-y-auto">{(participants.length?participants:[{id:"self",displayName:selfName}]).map((p:any)=><ParticipantRow key={p.id} name={p.displayName||"Participante"} host={(p.displayName||"")===room.roomState.ownerName} sharing={p.id===room.roomState.activeScreenSharerId}/>)}</div>
        <div className="mt-auto border-t border-zinc-800/70 pt-4">
          <div className="mb-3 flex items-center gap-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600"><Keyboard size={13}/>Atalhos</div>
          <div className="space-y-2 px-2 text-[10px] text-zinc-600"><div className="flex items-center justify-between"><span>Compartilhar</span><kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5">Ctrl ⇧ S</kbd></div><div className="flex items-center justify-between"><span>Áudio sistema</span><kbd className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5">Ctrl ⇧ A</kbd></div></div>
        </div>
      </div>
    </aside>

    <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-[66px] shrink-0 items-center justify-between border-b border-zinc-800/70 px-5">
        <div><div className="flex items-center gap-2"><h1 className="text-sm font-semibold">Sala de {selfName}</h1>{room.roomState.live&&<span className="flex items-center gap-1.5 rounded-md border border-red-500/20 bg-red-500/[.08] px-2 py-1 text-[9px] font-semibold uppercase text-red-300"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"/>Ao vivo</span>}</div><p className="mt-1 text-[10px] text-zinc-600">{room.roomState.activeScreenSharerName ? `${room.roomState.activeScreenSharerName} está compartilhando` : "Controle a captura e acompanhe o desempenho."}</p></div>
        <div className="flex items-center gap-2">
          <button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="flex min-w-[230px] items-center gap-3 rounded-xl border border-zinc-800/80 bg-[#121215] px-3 py-2 text-left transition hover:border-zinc-700"><div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-500/10 text-purple-400">{selectedSource?.kind==="window"?<AppWindow size={16}/>:<Monitor size={16}/>}</div><div className="min-w-0 flex-1"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">Fonte de captura</span><span className="block truncate text-xs font-medium text-zinc-200">{sourceLabel}</span></div><ChevronDown size={15} className="text-zinc-600"/></button>
          <button onClick={()=>setSettingsOpen(v=>!v)} className={cx("grid h-10 w-10 place-items-center rounded-xl border transition",settingsOpen?"border-purple-500/40 bg-purple-500/10 text-purple-300":"border-zinc-800 bg-[#121215] text-zinc-500 hover:text-zinc-200")}><Settings2 size={16}/></button>
        </div>
      </div>

      <section className="grid shrink-0 grid-cols-4 gap-2 border-b border-zinc-800/60 px-5 py-3">
        <MetricCard icon={Cpu} label="CPU" value={Math.round(desktopMetrics.cpu)} suffix="%" bars={[26,41,33,52,46,58,40,Math.max(12,Math.min(90,desktopMetrics.cpu+20))]}/>
        <MetricCard icon={Activity} label="Latência" value={latency} suffix={latency==="—"?"":"ms"} bars={[42,35,49,30,39,45,36,43]}/>
        <MetricCard icon={Gauge} label="Bitrate" value={bitrate} suffix={bitrate==="—"?"":"Mbps"} bars={[31,46,51,63,71,67,76,73]}/>
        <MetricCard icon={systemAudio?Volume2:VolumeX} label="Áudio do sistema" value={systemAudio?"Ativo":"Mudo"} bars={systemAudio?[24,55,38,74,44,64,79,58]:[5,5,5,5,5,5,5,5]}/>
      </section>

      <section className="relative flex min-h-0 flex-1 p-5">
        <div className={cx("relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-[#0c0c0f] transition",room.roomState.live?"border-purple-500/30 shadow-[0_0_60px_rgba(124,58,237,.06)]":"border-zinc-800/80")}>
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/70 px-4">
            <div className="flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full",room.roomState.live?"bg-red-400":"bg-zinc-700")}/><span className="text-[10px] font-medium text-zinc-500">{room.roomState.live?"TRANSMITINDO":"PRÉ-VISUALIZAÇÃO"}</span><span className="text-zinc-800">•</span><span className="max-w-[280px] truncate text-[10px] text-zinc-600">{sharing?sourceLabel:(room.roomState.activeScreenSharerName||sourceLabel)}</span></div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600"><Wifi size={12} className="text-emerald-400"/>{connection}<span className="text-zinc-800">•</span>{quality}<span className="text-zinc-800">•</span>{room.stats?.fps??fps} FPS</div>
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <video ref={room.videoRef} autoPlay playsInline muted={sharing} className={cx("absolute inset-0 h-full w-full bg-black object-contain",room.roomState.live?"opacity-100":"opacity-0")}/>
            {!room.roomState.live && <div className="absolute inset-0 grid place-items-center"><div className="max-w-md text-center"><div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-2xl border border-purple-500/15 bg-purple-500/[.05]"><ScreenShare size={34} strokeWidth={1.5} className="text-purple-400"/></div><h2 className="text-base font-semibold text-zinc-200">Pronto para compartilhar</h2><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-600">Fonte selecionada: <span className="font-medium text-zinc-400">{sourceLabel}</span>. Escolha uma fonte e inicie quando quiser.</p><div className="mt-5 flex justify-center gap-2"><button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="flex h-9 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-300 hover:bg-zinc-800"><Monitor size={14}/>Alterar fonte</button><button disabled={busy} onClick={()=>void toggleShare()} className="flex h-9 items-center gap-2 rounded-lg bg-purple-600 px-3 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-40"><ScreenShare size={14}/>Compartilhar agora</button></div></div></div>}
            {room.switching && <div className="absolute inset-x-4 bottom-4 rounded-xl border border-amber-400/20 bg-amber-400/[.08] px-4 py-3 text-xs text-amber-200">Trocando para o servidor alternativo de transmissão…</div>}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-zinc-700/70 bg-[#17171b]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
            <button onClick={()=>void toggleAudio()} className={cx("flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium transition",systemAudio?"bg-zinc-800 text-zinc-200 hover:bg-zinc-700":"bg-red-500/10 text-red-300")} >{systemAudio?<Volume2 size={17}/>:<VolumeX size={17}/>}<span className="hidden 2xl:inline">{systemAudio?"Áudio ligado":"Áudio mudo"}</span></button>
            <button disabled={busy} onClick={()=>void toggleShare()} className={cx("flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-semibold transition disabled:opacity-40",sharing?"bg-red-500/10 text-red-300 hover:bg-red-500/15":"bg-purple-600 text-white shadow-lg shadow-purple-950/30 hover:bg-purple-500")}>{sharing?<ScreenShareOff size={17}/>:<ScreenShare size={17}/>} {sharing?"Parar tela":"Compartilhar tela"}</button>
            <div className="mx-1 h-6 w-px bg-zinc-700/80"/>
            <button onClick={()=>void togglePip()} className={cx("grid h-11 w-11 place-items-center rounded-xl transition",pip?"bg-purple-500/15 text-purple-300":"text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200")} title="Mini-player"><Minus size={17}/></button>
            <button onClick={()=>{void refreshSources();setSourceOpen(true);}} className="grid h-11 w-11 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200" title="Fonte de captura"><Monitor size={17}/></button>
            <button onClick={()=>setSettingsOpen(v=>!v)} className="grid h-11 w-11 place-items-center rounded-xl text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200" title="Configurações"><SlidersHorizontal size={17}/></button>
          </div>
        </div>

        {settingsOpen && <div className="absolute right-8 top-8 z-20 w-72 rounded-2xl border border-zinc-800 bg-[#121215] p-4 shadow-2xl shadow-black/50">
          <div className="mb-4 flex items-center justify-between"><div><span className="text-[9px] font-semibold uppercase tracking-wider text-purple-300">Captura</span><h3 className="mt-1 text-sm font-semibold">Qualidade</h3></div><button onClick={()=>setSettingsOpen(false)} className="text-zinc-600 hover:text-zinc-300"><X size={15}/></button></div>
          <label className="block text-[10px] uppercase tracking-wider text-zinc-600">Resolução</label>
          <div className="mt-2 grid grid-cols-2 gap-2">{(["1080p","720p"] as Quality[]).map(item=><button key={item} onClick={()=>void changeQuality(item)} className={cx("rounded-lg border px-3 py-2 text-xs",quality===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item}</button>)}</div>
          <label className="mt-4 block text-[10px] uppercase tracking-wider text-zinc-600">Quadros por segundo</label>
          <div className="mt-2 grid grid-cols-2 gap-2">{([60,30] as FrameRate[]).map(item=><button key={item} onClick={()=>void changeFps(item)} className={cx("rounded-lg border px-3 py-2 text-xs",fps===item?"border-purple-500/50 bg-purple-500/10 text-purple-200":"border-zinc-800 bg-zinc-950 text-zinc-500")}>{item} FPS</button>)}</div>
          <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-[10px] leading-4 text-zinc-600">Mudanças de qualidade são aplicadas ao encoder sem encerrar a sala.</div>
        </div>}

        {room.error && <div className="absolute bottom-8 left-8 max-w-md rounded-xl border border-red-500/20 bg-red-500/[.1] px-4 py-3 text-xs text-red-200 shadow-xl">{room.error}</div>}
      </section>
    </main>

    {sourceOpen && <CaptureDialog sources={sources} selected={selectedSource} onSelect={source=>void chooseSource(source)} onClose={()=>setSourceOpen(false)}/>}
  </div>;
}

function App() {
  const [session,setSession] = useState<SessionState|null>(null);
  const createRoom = (name:string) => { safeSessionSet("lumacast-display-name",name); safeSessionRemove("lumacast-broadcaster"); getSocket().disconnect(); setSession({owner:true}); };
  const joinRoom = (name:string,roomId:string) => { safeSessionSet("lumacast-display-name",name); getSocket().disconnect(); setSession({owner:false,roomId}); };
  return <div className="flex h-screen min-h-[680px] w-screen flex-col overflow-hidden bg-[#09090b] text-zinc-100">
    <TitleBar status={session ? "Conectado" : "Pronto"} />
    {session ? <Room session={session} onLeave={()=>setSession(null)} /> : <Home onCreate={createRoom} onJoin={joinRoom} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
