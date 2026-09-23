import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, MonitorUp, Radio, Wifi, X } from "lucide-react";
import { AmbientBackground } from "./AmbientBackground";

export const HowItWorksModal=memo(function HowItWorksModal({open,onClose}:{open:boolean;onClose():void}){
  const steps=[{icon:Radio,title:"1. Criar ou Conectar",text:"Defina o seu nome e crie uma sala privada instantânea ou entre usando um código compartilhado."},{icon:MonitorUp,title:"2. Escolher Fonte & Áudio",text:"Selecione a tela inteira ou janela de app. Transmita o áudio do sistema com alta fidelidade e sem ruídos de microfone."},{icon:Activity,title:"3. Controle em Tempo Real",text:"Acompanhe latência, bitrate e CPU, ajustando 1080p / 60 FPS quando quiser."},{icon:Wifi,title:"4. Transmissão Sem Interrupção",text:"Conexão fluida de baixíssima latência com visualização limpa e controles flutuantes discretos."}];
  return <AnimatePresence>{open&&<motion.div className="fixed inset-0 z-50 isolate grid place-items-center overflow-hidden bg-black/70 p-6 backdrop-blur-md" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.18}} onMouseDown={onClose}>
    <AmbientBackground variant="modal"/>
    <motion.div className="relative z-10 w-full max-w-3xl rounded-2xl border border-zinc-800/80 bg-[#121215]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl will-change-transform" initial={{opacity:0,scale:.975,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.985,y:6}} transition={{duration:.24,ease:[.2,.8,.2,1]}} onMouseDown={event=>event.stopPropagation()}>
      <div className="flex items-start justify-between"><div><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-purple-300">Lunira Screen Desktop</span><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Como Funciona</h2><p className="mt-1 text-xs text-zinc-500">Da sala privada à transmissão em quatro passos.</p></div><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X size={16}/></button></div>
      <div className="mt-5 grid grid-cols-2 gap-3">{steps.map(({icon:Icon,title,text},index)=><motion.div key={title} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:.06*index,duration:.22}} className="rounded-xl border border-zinc-800/60 bg-[#121216]/80 p-4 backdrop-blur-xl transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c] hover:shadow-lg hover:shadow-purple-500/5"><div className="grid h-9 w-9 place-items-center rounded-lg bg-purple-500/10 text-purple-300"><Icon size={17}/></div><strong className="mt-4 block text-sm text-zinc-200">{title}</strong><p className="mt-2 text-[11px] leading-5 text-zinc-600">{text}</p></motion.div>)}</div>
      <div className="mt-6 flex justify-end"><button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-purple-600/20 hover:bg-purple-500 active:scale-95">Entendi</button></div>
    </motion.div>
  </motion.div>}</AnimatePresence>;
});
