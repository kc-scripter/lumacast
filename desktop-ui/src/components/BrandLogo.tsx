import { memo } from "react";
export const BrandLogo=memo(function BrandLogo({size="sm"}:{size?:"sm"|"lg"}){
  const large=size==="lg";
  return <div className="group flex select-none items-center gap-2.5">
    <div className={`relative grid place-items-center rounded-xl border border-purple-400/30 bg-purple-600/95 shadow-purple-500/20 transition-all duration-300 transform-gpu group-hover:-translate-y-0.5 group-hover:scale-105 group-hover:border-purple-500/50 group-hover:shadow-lg group-hover:shadow-purple-500/30 ${large?"h-11 w-11":"h-7 w-7"}`}><img src="/__desktop__/logo.svg" alt="" className={large?"h-7 w-7":"h-[18px] w-[18px]"}/></div>
    <span className={`font-semibold tracking-[-.01em] text-zinc-100 transition-colors duration-300 group-hover:text-purple-300 ${large?"text-base":"text-xs"}`}>Lunira Screen</span>
  </div>;
});
