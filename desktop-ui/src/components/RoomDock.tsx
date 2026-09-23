import { memo } from "react";
import { BarChart3, LogOut, MoreHorizontal, PictureInPicture2, ScreenShare, ScreenShareOff, Volume2, VolumeX } from "lucide-react";

function Tool({label,children}:{label:string;children:React.ReactNode}){
  return <span className="group/tip relative inline-flex">{children}<span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[.07] bg-[#111219]/96 px-2 py-1 text-[9px] text-zinc-300 opacity-0 shadow-xl backdrop-blur-xl transition-opacity duration-150 group-hover/tip:opacity-100">{label}</span></span>;
}

export const RoomDock=memo(function RoomDock(props:{
  sidebarOpen:boolean;systemAudio:boolean;sharing:boolean;busy:boolean;statsOpen:boolean;pip:boolean;
  onToggleAudio():void;onToggleShare():void;onToggleStats():void;onTogglePip():void;onSettings():void;onLeave():void;
}){
  return <div className={"pointer-events-none absolute bottom-4 z-40 flex -translate-x-1/2 justify-center transition-[left] duration-300 "+(props.sidebarOpen?"left-[calc(50%+116px)]":"left-1/2")}>
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-[18px] border border-white/[.075] bg-[#111219]/92 p-1.5 shadow-[0_18px_55px_rgba(0,0,0,.35)] backdrop-blur-2xl">
      <Tool label={props.sharing?"Parar transmissão":"Compartilhar tela"}>
        <button disabled={props.busy} onClick={props.onToggleShare} className={props.sharing?"flex h-10 items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 text-xs font-semibold text-red-300 hover:bg-red-500/16 disabled:opacity-40":"flex h-10 items-center gap-2 rounded-xl bg-purple-600 px-4 text-xs font-semibold text-white shadow-md shadow-purple-600/20 hover:bg-purple-500 disabled:opacity-40"}>
          {props.sharing?<ScreenShareOff size={16}/>:<ScreenShare size={16}/>}<span className="hidden xl:inline">{props.sharing?"Parar":"Compartilhar"}</span>
        </button>
      </Tool>

      <Tool label={props.systemAudio?"Mutar áudio do sistema":"Ativar áudio do sistema"}>
        <button onClick={props.onToggleAudio} className={props.systemAudio?"grid h-10 w-10 place-items-center rounded-xl text-zinc-400 hover:bg-white/[.05] hover:text-zinc-200":"grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/15"}>{props.systemAudio?<Volume2 size={16}/>:<VolumeX size={16}/>}</button>
      </Tool>

      <Tool label="Estatísticas"><button onClick={props.onToggleStats} className={props.statsOpen?"grid h-10 w-10 place-items-center rounded-xl bg-purple-500/12 text-purple-300":"grid h-10 w-10 place-items-center rounded-xl text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"}><BarChart3 size={16}/></button></Tool>
      <Tool label="Mini-player"><button onClick={props.onTogglePip} className={props.pip?"grid h-10 w-10 place-items-center rounded-xl bg-purple-500/12 text-purple-300":"grid h-10 w-10 place-items-center rounded-xl text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"}><PictureInPicture2 size={16}/></button></Tool>
      <Tool label="Mais opções"><button onClick={props.onSettings} className="grid h-10 w-10 place-items-center rounded-xl text-zinc-500 hover:bg-white/[.05] hover:text-zinc-200"><MoreHorizontal size={17}/></button></Tool>

      <div className="mx-1 h-6 w-px bg-white/[.06]"/>
      <Tool label="Sair da sala"><button onClick={props.onLeave} className="grid h-10 w-10 place-items-center rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/16"><LogOut size={16}/></button></Tool>
    </div>
  </div>;
});
