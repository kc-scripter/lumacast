import { memo, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AmbientBackground } from "./AmbientBackground";
import { BrandLogo } from "./BrandLogo";

export const SplashScreen=memo(function SplashScreen({visible,onComplete}:{visible:boolean;onComplete():void}){
  const reduced=useReducedMotion();
  useEffect(()=>{if(!visible)return;const timer=window.setTimeout(onComplete,reduced?450:2200);return()=>window.clearTimeout(timer);},[onComplete,reduced,visible]);
  return <AnimatePresence>{visible&&<motion.button type="button" aria-label="Continuar para o Lunira Screen" onClick={onComplete} className="fixed inset-0 z-[100] isolate grid place-items-center overflow-hidden bg-[#09090b] text-left" initial={{opacity:1,scale:1}} exit={{opacity:0,scale:.98}} transition={{duration:reduced?.15:.6,ease:"easeInOut"}}>
    <AmbientBackground variant="home"/>
    <div className="relative flex flex-col items-center text-center will-change-transform">
      <motion.div initial={{opacity:0,scale:.8,y:12}} animate={{opacity:1,scale:1,y:0}} transition={{duration:reduced?.01:.5,ease:[.2,.8,.2,1]}}><motion.div className="transform-gpu will-change-transform" animate={reduced?{}:{scale:[1,1.06,1],filter:["drop-shadow(0 0 0 rgba(124,58,237,0))","drop-shadow(0 0 30px rgba(124,58,237,.62))","drop-shadow(0 0 10px rgba(124,58,237,.24))"]}} transition={{duration:1.35,repeat:1}}><BrandLogo size="lg"/></motion.div></motion.div>
      <motion.h1 className="mt-7 text-3xl font-semibold tracking-[-.035em] text-zinc-50" initial={{opacity:0,y:14}} animate={{opacity:1,y:0}} transition={{delay:reduced?0:.35,duration:reduced?.01:.45}}>Bem-vindo ao Lunira Screen</motion.h1>
      <motion.p className="mt-3 max-w-xl text-sm text-zinc-500" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:reduced?0:.55,duration:reduced?.01:.45}}>Transmissão desktop de alta performance sem interrupções.</motion.p>
    </div>
  </motion.button>}</AnimatePresence>;
});
