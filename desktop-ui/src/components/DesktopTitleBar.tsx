import { memo } from "react";
import { ArrowLeft, Minus, Settings2, Square, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

function Tip({label,children}:{label:string;children:React.ReactNode}){
  return <span className="group/tip relative inline-flex">{children}<span className="pointer-events-none absolute left-1/2 top-full z-[70] mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[.07] bg-[#111219]/96 px-2 py-1 text-[9px] text-zinc-300 opacity-0 shadow-xl backdrop-blur-xl transition-opacity duration-150 group-hover/tip:opacity-100">{label}</span></span>;
}

export const DesktopTitleBar=memo(function DesktopTitleBar({status="Pronto",inRoom=false,onHome,onSettings,settingsActive=false}:{status?:string;inRoom?:boolean;onHome?:()=>void;onSettings?:()=>void;settingsActive?:boolean}){
  const action=(value:"minimize"|"maximize"|"close")=>void window.desktopBridge?.windowAction(value);
  const connected=status==="Conectado"||status==="Pronto";

  return <header className="relative z-50 flex h-[52px] shrink-0 items-center border-b border-white/[.06] bg-[#0a0b10]/88 pl-4 shadow-sm shadow-black/20 backdrop-blur-xl [-webkit-app-region:drag]">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <BrandLogo/>
      <span className="hidden rounded-md border border-white/[.06] bg-white/[.025] px-2 py-1 text-[9px] font-medium uppercase tracking-[.12em] text-zinc-600 xl:inline">Desktop</span>
    </div>

    <div className="flex items-center gap-1.5 pr-2 [-webkit-app-region:no-drag]">
      {inRoom&&<Tip label="Voltar para o início"><button onClick={onHome} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"><ArrowLeft size={14}/></button></Tip>}
      {!inRoom&&onSettings&&<Tip label="Configurações"><button onClick={onSettings} className={"grid h-8 w-8 place-items-center rounded-lg "+(settingsActive?"bg-purple-500/12 text-purple-300":"text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200")}><Settings2 size={14}/></button></Tip>}
      <div className="mx-1 flex items-center gap-2 rounded-full border border-white/[.06] bg-white/[.025] px-2.5 py-1">
        <span className={connected?"h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.35)]":"h-1.5 w-1.5 rounded-full bg-amber-400"}/>
        <span className="text-[10px] text-zinc-500">{status}</span>
      </div>
      <div className="mx-1 h-5 w-px bg-white/[.06]"/>
      <Tip label="Minimizar"><button aria-label="Minimizar" onClick={()=>action("minimize")} className="grid h-8 w-9 place-items-center rounded-md text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"><Minus size={14}/></button></Tip>
      <Tip label="Maximizar"><button aria-label="Maximizar" onClick={()=>action("maximize")} className="grid h-8 w-9 place-items-center rounded-md text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"><Square size={11}/></button></Tip>
      <Tip label="Fechar"><button aria-label="Fechar" onClick={()=>action("close")} className="grid h-8 w-9 place-items-center rounded-md text-zinc-500 hover:bg-red-500/90 hover:text-white"><X size={14}/></button></Tip>
    </div>
  </header>;
});
