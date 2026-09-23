import { memo } from "react";
import { ArrowLeft, Minus, Square, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

function Tip({label,children}:{label:string;children:React.ReactNode}){
  return <span className="group/tip relative inline-flex">
    {children}
    <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-800/80 bg-[#121216]/95 px-2 py-1 text-[9px] text-zinc-300 opacity-0 shadow-xl backdrop-blur-xl transition-opacity duration-150 group-hover/tip:opacity-100">{label}</span>
  </span>;
}

export const DesktopTitleBar=memo(function DesktopTitleBar({status="Pronto",inRoom=false,onHome}:{status?:string;inRoom?:boolean;onHome?:()=>void}){
  const action=(value:"minimize"|"maximize"|"close")=>void window.desktopBridge?.windowAction(value);
  const connected=status==="Conectado"||status==="Pronto";
  return <header className="relative z-40 flex h-11 shrink-0 items-center border-b border-zinc-800/70 bg-[#0d0d10]/95 pl-4 shadow-sm shadow-black/20 backdrop-blur-xl [-webkit-app-region:drag]">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <BrandLogo/>
      <div className="h-4 w-px bg-zinc-800"/>
      <span className="rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-purple-300">Desktop App v1.0</span>
    </div>
    <div className="flex items-center gap-2 pr-2 [-webkit-app-region:no-drag]">
      {inRoom&&<Tip label="Voltar para a Home"><button onClick={onHome} className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[10px] font-medium text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"><ArrowLeft size={14}/>Voltar para Home</button></Tip>}
      <div className="mr-2 flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1">
        <span className={connected?"h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.38)]":"h-2 w-2 rounded-full bg-amber-400"}/>
        <span className="text-[10px] text-zinc-400">{status}</span>
      </div>
      <Tip label="Minimizar"><button aria-label="Minimizar" onClick={()=>action("minimize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"><Minus size={15}/></button></Tip>
      <Tip label="Maximizar"><button aria-label="Maximizar" onClick={()=>action("maximize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition-transform duration-150 hover:bg-zinc-800 hover:text-zinc-200 active:scale-95"><Square size={12}/></button></Tip>
      <Tip label="Fechar"><button aria-label="Fechar" onClick={()=>action("close")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 transition-transform duration-150 hover:bg-red-500/90 hover:text-white active:scale-95"><X size={15}/></button></Tip>
    </div>
  </header>;
});
