import { ArrowLeft, Minus, Square, X } from "lucide-react";
import { BrandLogo } from "./BrandLogo";

type DesktopTitleBarProps = {
  status?: string;
  inRoom?: boolean;
  onHome?: () => void;
};

export function DesktopTitleBar({ status="Pronto", inRoom=false, onHome }: DesktopTitleBarProps) {
  const action=(value:"minimize"|"maximize"|"close")=>void window.desktopBridge?.windowAction(value);
  const connected=status==="Conectado"||status==="Pronto";

  return <header className="flex h-11 shrink-0 items-center border-b border-zinc-800/70 bg-[#0d0d10] pl-4 [-webkit-app-region:drag]">
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <BrandLogo/>
      <div className="h-4 w-px bg-zinc-800"/>
      <span className="rounded-md border border-purple-500/20 bg-purple-500/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-purple-300">Desktop App v1.0</span>
    </div>
    <div className="flex items-center gap-2 pr-2 [-webkit-app-region:no-drag]">
      {inRoom&&<button onClick={onHome} className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[10px] font-medium text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><ArrowLeft size={14}/>Voltar para Home</button>}
      <div className="mr-2 flex items-center gap-2 rounded-full border border-zinc-800/80 bg-zinc-900/60 px-2.5 py-1">
        <span className={connected?"h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.38)]":"h-2 w-2 rounded-full bg-amber-400"}/>
        <span className="text-[10px] text-zinc-400">{status}</span>
      </div>
      <button aria-label="Minimizar" onClick={()=>action("minimize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Minus size={15}/></button>
      <button aria-label="Maximizar" onClick={()=>action("maximize")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><Square size={12}/></button>
      <button aria-label="Fechar" onClick={()=>action("close")} className="grid h-8 w-10 place-items-center rounded-md text-zinc-500 hover:bg-red-500/90 hover:text-white"><X size={15}/></button>
    </div>
  </header>;
}
