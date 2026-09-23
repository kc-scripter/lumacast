import { memo, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AmbientBackground } from "./AmbientBackground";

export const SplashScreen=memo(function SplashScreen({visible,onComplete}:{visible:boolean;onComplete():void}){
  const reduced=useReducedMotion();

  useEffect(()=>{
    if(!visible)return;
    const timer=window.setTimeout(onComplete,reduced?350:1850);
    return()=>window.clearTimeout(timer);
  },[onComplete,reduced,visible]);

  return <AnimatePresence>{visible&&<motion.button
    type="button"
    aria-label="Continuar para o Lunira Screen"
    onClick={onComplete}
    className="fixed inset-0 z-[100] isolate grid place-items-center overflow-hidden bg-[#08090d] text-left"
    initial={{opacity:1}}
    exit={{opacity:0,scale:.992}}
    transition={{duration:reduced?.01:.45,ease:"easeInOut"}}
  >
    <AmbientBackground variant="home"/>
    <div className="relative flex w-[360px] flex-col items-center text-center">
      <motion.div
        initial={{opacity:0,scale:.9,y:8}}
        animate={{opacity:1,scale:1,y:0}}
        transition={{duration:reduced?.01:.42,ease:[.2,.8,.2,1]}}
        className="grid h-16 w-16 place-items-center rounded-[18px] border border-purple-400/25 bg-purple-600 shadow-[0_18px_55px_rgba(91,33,182,.25)]"
      >
        <img src="/__desktop__/logo.svg" alt="" className="h-9 w-9"/>
      </motion.div>

      <motion.h1 className="mt-5 text-2xl font-semibold tracking-[-.03em] text-zinc-100" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:reduced?0:.14,duration:.35}}>Lunira Screen</motion.h1>
      <motion.p className="mt-2 text-xs text-zinc-500" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:reduced?0:.26,duration:.35}}>Compartilhe o que importa.</motion.p>

      <motion.div className="mt-12 w-40" initial={{opacity:0}} animate={{opacity:1}} transition={{delay:reduced?0:.35,duration:.3}}>
        <div className="splash-progress h-1 overflow-hidden rounded-full bg-white/[.07]"/>
        <span className="mt-3 block text-[10px] text-zinc-600">Iniciando…</span>
      </motion.div>
    </div>
  </motion.button>}</AnimatePresence>;
});
