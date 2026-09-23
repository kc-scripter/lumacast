import { memo, useMemo } from "react";
import { Activity, Cpu, Gauge, Volume2, VolumeX, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const MetricCard=memo(function MetricCard({icon:Icon,label,value,suffix,bars}:{icon:React.ElementType;label:string;value:string|number;suffix?:string;bars:number[]}){
  return <div className="min-w-0 rounded-xl border border-white/[.06] bg-black/20 p-3.5">
    <div className="flex items-center gap-2 text-zinc-600"><Icon size={13}/><span className="text-[9px] font-semibold uppercase tracking-[.12em]">{label}</span></div>
    <div className="mt-3 flex items-end justify-between gap-3">
      <div><span className="text-lg font-semibold tracking-tight text-zinc-100">{value}</span>{suffix&&<span className="ml-1 text-[10px] text-zinc-600">{suffix}</span>}</div>
      <div className="flex h-6 items-end gap-[3px]">{bars.map((height,index)=><span key={index} className="w-[3px] rounded-full bg-purple-500/55" style={{height:String(height)+"%"}}/>)}</div>
    </div>
  </div>;
});

export const StatsPanel=memo(function StatsPanel({open,onClose,cpu,latency,bitrate,systemAudio}:{open:boolean;onClose():void;cpu:number;latency:string|number;bitrate:string|number;systemAudio:boolean}){
  const cpuBars=useMemo(()=>[26,41,33,52,46,58,40,Math.max(12,Math.min(90,cpu+20))],[cpu]);
  const audioBars=useMemo(()=>systemAudio?[24,55,38,74,44,64,79,58]:[5,5,5,5,5,5,5,5],[systemAudio]);

  return <AnimatePresence>{open&&<motion.aside
    initial={{opacity:0,y:-8,scale:.985}}
    animate={{opacity:1,y:0,scale:1}}
    exit={{opacity:0,y:-6,scale:.99}}
    transition={{duration:.18}}
    className="absolute right-5 top-[76px] z-50 w-[520px] rounded-2xl border border-white/[.075] bg-[#111219]/96 p-4 shadow-[0_22px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
  >
    <div className="mb-3 flex items-start justify-between">
      <div><h3 className="text-sm font-semibold text-zinc-200">Estatísticas da transmissão</h3><p className="mt-1 text-[10px] text-zinc-600">Informações em tempo real da sessão atual.</p></div>
      <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-600 hover:bg-white/[.05] hover:text-zinc-300"><X size={14}/></button>
    </div>
    <div className="grid grid-cols-4 gap-2">
      <MetricCard icon={Cpu} label="CPU" value={Math.round(cpu)} suffix="%" bars={cpuBars}/>
      <MetricCard icon={Activity} label="Latência" value={latency} suffix={latency==="—"?"":"ms"} bars={[42,35,49,30,39,45,36,43]}/>
      <MetricCard icon={Gauge} label="Bitrate" value={bitrate} suffix={bitrate==="—"?"":"Mbps"} bars={[31,46,51,63,71,67,76,73]}/>
      <MetricCard icon={systemAudio?Volume2:VolumeX} label="Áudio" value={systemAudio?"Ativo":"Mudo"} bars={audioBars}/>
    </div>
  </motion.aside>}</AnimatePresence>;
});
