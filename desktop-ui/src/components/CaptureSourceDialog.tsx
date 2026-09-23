import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, Check, Monitor, ShieldCheck, X } from "lucide-react";
import type { CaptureSource } from "../types";

const cx=(...values:Array<string|false|null|undefined>)=>values.filter(Boolean).join(" ");

export const CaptureSourceDialog=memo(function CaptureSourceDialog({open,sources,selected,onSelect,onClose}:{open:boolean;sources:CaptureSource[];selected?:CaptureSource;onSelect(source:CaptureSource):void;onClose():void}){
  const [tab,setTab]=useState<"monitor"|"window">("monitor");
  const visible=useMemo(()=>sources.filter(source=>source.kind===tab),[sources,tab]);

  return <AnimatePresence>{open&&<motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-8 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}} onMouseDown={onClose}>
    <motion.div className="relative z-50 w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#121216]/95 shadow-2xl shadow-black/60 backdrop-blur-xl will-change-transform" initial={{opacity:0,scale:.975,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.985,y:6}} transition={{duration:.22,ease:[.2,.8,.2,1]}} onMouseDown={event=>event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4"><div><h2 className="text-sm font-semibold">Escolher fonte de captura</h2><p className="mt-1 text-[11px] text-zinc-500">Escolha exatamente o monitor ou aplicativo transmitido.</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="Fechar"><X size={16}/></button></div>

      <div className="flex border-b border-zinc-800/70 px-5 py-3"><div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-1"><button onClick={()=>setTab("monitor")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs",tab==="monitor"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><Monitor size={14}/>Monitores</button><button onClick={()=>setTab("window")} className={cx("flex items-center gap-2 rounded-md px-3 py-2 text-xs",tab==="window"?"bg-zinc-800 text-white":"text-zinc-500 hover:text-zinc-300")}><AppWindow size={14}/>Janelas</button></div></div>

      <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto p-5">
        {visible.length?visible.map(source=><button key={source.id} onClick={()=>onSelect(source)} className={cx("group rounded-xl border p-2 text-left transition-all duration-200",selected?.id===source.id?"border-purple-500/70 bg-purple-500/[.06]":"border-zinc-800 bg-zinc-950 hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c]")}><div className="relative h-32 overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b]">{source.thumbnail?<img src={source.thumbnail} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center text-zinc-700">{source.kind==="monitor"?<Monitor/>:<AppWindow/>}</div>}{selected?.id===source.id&&<span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-purple-600"><Check size={13}/></span>}</div><div className="flex items-center gap-2 px-1 pb-1 pt-3"><span className="text-zinc-500">{source.kind==="monitor"?<Monitor size={14}/>:<AppWindow size={14}/>}</span><span className="min-w-0 truncate text-xs font-medium text-zinc-200">{source.name}</span></div></button>):<div className="col-span-2 py-16 text-center text-xs text-zinc-600">Nenhuma fonte encontrada.</div>}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-800/80 bg-zinc-950/40 px-5 py-4"><span className="flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13}/>Somente a fonte escolhida será capturada.</span><button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/25 hover:bg-purple-500 active:scale-95">Concluir</button></div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
});
