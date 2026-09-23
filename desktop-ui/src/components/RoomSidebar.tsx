import { memo } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Radio, Users } from "lucide-react";

type Person={id:string;displayName?:string};

const Participant=memo(function Participant({person,ownerName,sharing}:{person:Person;ownerName:string;sharing:boolean}){
  const name=person.displayName||"Participante";
  const initials=name.split(" ").slice(0,2).map(part=>part[0]?.toUpperCase()).join("");
  return <div className={"group flex items-center gap-3 rounded-xl border px-2.5 py-2.5 transition-all "+(sharing?"border-purple-500/18 bg-purple-500/[.07]":"border-transparent hover:border-white/[.045] hover:bg-white/[.025]")}>
    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[.08] bg-[#171821] text-[10px] font-semibold text-zinc-300">{initials}<span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c0d12] bg-emerald-400"/></div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2"><span className="truncate text-xs font-medium text-zinc-300">{name}</span>{name===ownerName&&<span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase text-purple-300">Host</span>}</div>
      <span className={"mt-0.5 block text-[9px] "+(sharing?"text-purple-300":"text-zinc-700")}>{sharing?"Transmitindo":"Online"}</span>
    </div>
  </div>;
});

export const RoomSidebar=memo(function RoomSidebar({open,roomCode,copied,onCopy,people,count,ownerName,activeSharerId,onToggle}:{open:boolean;roomCode:string;copied:boolean;onCopy():void;people:Person[];count:number;ownerName:string;activeSharerId:string|null;onToggle():void}){
  return <>
    <aside className={"absolute inset-y-0 left-0 z-30 flex w-[232px] flex-col overflow-hidden border-r border-white/[.055] bg-[#090a0f]/78 shadow-xl shadow-black/15 backdrop-blur-xl transition-all duration-300 "+(open?"translate-x-0 opacity-100":"-translate-x-full opacity-0")}>
      <div className="border-b border-white/[.05] px-4 py-4">
        <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.15em] text-zinc-700"><Radio size={11}/>Sala atual</div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-semibold tracking-[.08em] text-zinc-200">{roomCode}</span>
          <button onClick={onCopy} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[.06] bg-white/[.025] text-zinc-600 hover:text-zinc-300">{copied?<Check size={12}/>:<Copy size={12}/>}</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-2 flex items-center justify-between px-2"><span className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[.14em] text-zinc-600"><Users size={12}/>Participantes</span><span className="rounded-full border border-white/[.05] bg-white/[.02] px-1.5 py-0.5 text-[9px] text-zinc-600">{count}</span></div>
        <div className="space-y-1 overflow-y-auto">{people.map(person=><Participant key={person.id} person={person} ownerName={ownerName} sharing={person.id===activeSharerId}/>)}</div>

        <div className="mt-auto rounded-xl border border-white/[.05] bg-black/20 p-3">
          <div className="flex items-center gap-2 text-[10px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400"/>Conectado</div>
          <div className="mt-1 text-[9px] text-zinc-700">Sala sincronizada em tempo real.</div>
        </div>
      </div>
    </aside>

    <button onClick={onToggle} aria-label={open?"Recolher participantes":"Mostrar participantes"} className={"absolute top-1/2 z-40 grid h-9 w-6 -translate-y-1/2 place-items-center rounded-r-lg border border-l-0 border-white/[.06] bg-[#111219]/92 text-zinc-600 shadow-lg backdrop-blur-xl transition-all duration-300 hover:text-zinc-300 "+(open?"left-[232px]":"left-0")}>{open?<ChevronLeft size={14}/>:<ChevronRight size={14}/>}</button>
  </>;
});
