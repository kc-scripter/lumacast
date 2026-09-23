import { memo, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AppWindow, Check, Monitor, ShieldCheck, X } from "lucide-react";
import type { CaptureSource } from "../types";

const cx=(...values:Array<string|false|null|undefined>)=>values.filter(Boolean).join(" ");

export const CaptureSourceDialog=memo(function CaptureSourceDialog({open,sources,selected,onSelect,onClose}:{open:boolean;sources:CaptureSource[];selected?:CaptureSource;onSelect(source:CaptureSource):void;onClose():void}){
  const [tab,setTab]=useState<"monitor"|"window">("monitor");
  const visible=useMemo(()=>sources.filter(source=>source.kind===tab),[sources,tab]);

  return <AnimatePresence>{open&&<motion.div className="fixed inset-0 z-[80] grid place-items-center bg-black/72 p-8 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.16}} onMouseDown={onClose}>
    <motion.div className="relative z-50 w-full max-w-3xl overflow-hidden rounded-[20px] border border-purple-400/20 bg-[#101118]/98 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl" initial={{opacity:0,scale:.982,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.987,y:5}} transition={{duration:.2,ease:[.2,.8,.2,1]}} onMouseDown={event=>event.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-white/[.06] px-5 py-4">
        <div><h2 className="text-sm font-semibold text-zinc-200">Escolha o que compartilhar</h2><p className="mt-1 text-[10px] text-zinc-600">Selecione um monitor ou uma janela específica.</p></div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.05] hover:text-zinc-300" aria-label="Fechar"><X size={15}/></button>
      </div>

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 rounded-xl border border-white/[.06] bg-black/20 p-1">
          <button onClick={()=>setTab("monitor")} className={cx("flex h-9 items-center justify-center gap-2 rounded-lg text-xs",tab==="monitor"?"bg-purple-500/14 text-purple-200":"text-zinc-600 hover:text-zinc-300")}><Monitor size={14}/>Monitores</button>
          <button onClick={()=>setTab("window")} className={cx("flex h-9 items-center justify-center gap-2 rounded-lg text-xs",tab==="window"?"bg-purple-500/14 text-purple-200":"text-zinc-600 hover:text-zinc-300")}><AppWindow size={14}/>Janelas</button>
        </div>
      </div>

      <div className="grid max-h-[430px] grid-cols-2 gap-3 overflow-y-auto p-5">
        {visible.length?visible.map(source=><button key={source.id} onClick={()=>onSelect(source)} className={cx("group rounded-xl border p-2 text-left",selected?.id===source.id?"border-purple-500/55 bg-purple-500/[.055] shadow-[0_0_0_1px_rgba(139,92,246,.12)]":"border-white/[.06] bg-black/20 hover:border-white/[.11] hover:bg-white/[.025]")}>
          <div className="relative h-32 overflow-hidden rounded-lg border border-white/[.055] bg-[#08090d]">{source.thumbnail?<img src={source.thumbnail} className="h-full w-full object-cover" alt=""/>:<div className="grid h-full place-items-center text-zinc-800">{source.kind==="monitor"?<Monitor/>:<AppWindow/>}</div>}{selected?.id===source.id&&<span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-purple-600 text-white shadow-lg"><Check size={12}/></span>}</div>
          <div className="flex items-center gap-2 px-1 pb-1 pt-3"><span className="text-zinc-600">{source.kind==="monitor"?<Monitor size={13}/>:<AppWindow size={13}/>}</span><span className="min-w-0 truncate text-xs font-medium text-zinc-300">{source.name}</span></div>
        </button>):<div className="col-span-2 py-16 text-center text-xs text-zinc-700">Nenhuma fonte encontrada.</div>}
      </div>

      <div className="flex items-center justify-between border-t border-white/[.06] bg-black/15 px-5 py-4">
        <span className="flex items-center gap-2 text-[10px] text-zinc-600"><ShieldCheck size={13}/>Somente a fonte escolhida será capturada.</span>
        <button onClick={onClose} className="rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500">Concluir</button>
      </div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
});
