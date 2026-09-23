import { memo } from "react";
import { Monitor, ScreenShare, Wifi } from "lucide-react";

export const StreamStage=memo(function StreamStage({videoRef,live,sharing,switching,sourceLabel,connection,quality,fps,busy,onChooseSource,onShare,compact=false}:{videoRef:React.RefObject<HTMLVideoElement|null>;live:boolean;sharing:boolean;switching:boolean;sourceLabel:string;connection:string;quality:string;fps:number;busy:boolean;onChooseSource():void;onShare():void;compact?:boolean}){
  return <div className={"relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] border bg-[#090a0f] transition-all duration-300 "+(live?"border-purple-500/25 shadow-[0_0_60px_rgba(124,58,237,.055)]":"border-white/[.07]")}>
    <div className={"flex shrink-0 items-center justify-between border-b border-white/[.055] px-4 "+(compact?"h-8":"h-10")}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={"h-1.5 w-1.5 shrink-0 rounded-full "+(live?"bg-red-400":"bg-zinc-700")}/>
        <span className="text-[9px] font-semibold uppercase tracking-[.12em] text-zinc-600">{live?"Ao vivo":"Pré-visualização"}</span>
        {!compact&&<><span className="text-zinc-800">•</span><span className="max-w-[260px] truncate text-[9px] text-zinc-700">{sourceLabel}</span></>}
      </div>
      <div className="flex items-center gap-2 text-[9px] text-zinc-600"><Wifi size={11} className="text-emerald-400"/>{compact?"":connection}<span className="text-zinc-800">•</span>{quality}<span className="text-zinc-800">•</span>{fps} FPS</div>
    </div>

    <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
      <video ref={videoRef} autoPlay playsInline muted={sharing} className={"absolute inset-0 h-full w-full bg-black object-contain transition-opacity duration-200 "+(live?"opacity-100":"opacity-0")}/>
      {!live&&<div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,.07),transparent_48%),#090a0f]">
        <div className="max-w-sm px-5 text-center">
          <div className={"mx-auto grid place-items-center rounded-2xl border border-purple-500/14 bg-purple-500/[.055] text-purple-300 "+(compact?"h-12 w-12":"h-16 w-16")}><ScreenShare size={compact?21:28} strokeWidth={1.6}/></div>
          {!compact&&<><h2 className="mt-4 text-sm font-semibold text-zinc-300">Pronto para compartilhar</h2><p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-zinc-600">Fonte selecionada: <span className="font-medium text-zinc-400">{sourceLabel}</span>.</p><div className="mt-4 flex justify-center gap-2"><button onClick={onChooseSource} className="flex h-9 items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.025] px-3 text-[11px] text-zinc-400 hover:bg-white/[.045] hover:text-zinc-200"><Monitor size={13}/>Alterar fonte</button><button disabled={busy} onClick={onShare} className="flex h-9 items-center gap-2 rounded-lg bg-purple-600 px-3 text-[11px] font-semibold text-white shadow-md shadow-purple-600/20 hover:bg-purple-500 disabled:opacity-40"><ScreenShare size={13}/>Compartilhar agora</button></div></>}
        </div>
      </div>}
      {switching&&<div className="absolute inset-x-4 bottom-4 rounded-xl border border-amber-400/18 bg-[#221b0d]/92 px-4 py-3 text-[11px] text-amber-200 shadow-xl backdrop-blur-xl">Trocando para o servidor alternativo de transmissão…</div>}
    </div>
  </div>;
});
