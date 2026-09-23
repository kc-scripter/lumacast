import { BarChart3, LogOut, PictureInPicture2, ScreenShare, ScreenShareOff, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";

type RoomDockProps={
  systemAudio:boolean;
  sharing:boolean;
  busy:boolean;
  statsOpen:boolean;
  pip:boolean;
  onToggleAudio():void;
  onToggleShare():void;
  onToggleStats():void;
  onTogglePip():void;
  onSettings():void;
  onLeave():void;
};

export function RoomDock(props:RoomDockProps){
  return <div className="pointer-events-none absolute inset-x-0 bottom-8 z-30 flex justify-center px-6">
    <div className="pointer-events-auto flex items-center gap-1.5 rounded-2xl border border-zinc-700/70 bg-[#17171b]/95 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="flex items-center gap-1">
        <button onClick={props.onToggleAudio} className={props.systemAudio?"flex h-11 items-center gap-2 rounded-xl bg-zinc-800 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-700":"flex h-11 items-center gap-2 rounded-xl bg-red-500/10 px-3 text-xs font-medium text-red-300 hover:bg-red-500/15"} title="Áudio do Sistema">
          {props.systemAudio?<Volume2 size={17}/>:<VolumeX size={17}/>}<span className="hidden xl:inline">{props.systemAudio?"Áudio do Sistema":"Áudio Mutado"}</span>
        </button>
      </div>
      <div className="mx-1 h-6 w-px bg-zinc-700/80"/>
      <button disabled={props.busy} onClick={props.onToggleShare} className={props.sharing?"flex h-12 items-center gap-2 rounded-xl bg-red-500/12 px-5 text-sm font-semibold text-red-300 hover:bg-red-500/20 disabled:opacity-40":"flex h-12 items-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 hover:bg-purple-500 disabled:opacity-40"}>
        {props.sharing?<ScreenShareOff size={18}/>:<ScreenShare size={18}/>} {props.sharing?"Parar Transmissão":"Compartilhar Tela"}
      </button>
      <div className="mx-1 h-6 w-px bg-zinc-700/80"/>
      <div className="flex items-center gap-1">
        <button onClick={props.onToggleStats} className={props.statsOpen?"grid h-11 w-11 place-items-center rounded-xl bg-purple-500/15 text-purple-300":"grid h-11 w-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"} title="Estatísticas"><BarChart3 size={17}/></button>
        <button onClick={props.onTogglePip} className={props.pip?"grid h-11 w-11 place-items-center rounded-xl bg-purple-500/15 text-purple-300":"grid h-11 w-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"} title="Mini-player"><PictureInPicture2 size={17}/></button>
        <button onClick={props.onSettings} className="grid h-11 w-11 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" title="Configurações de Captura"><SlidersHorizontal size={17}/></button>
      </div>
      <div className="mx-1 h-6 w-px bg-zinc-700/80"/>
      <button onClick={props.onLeave} className="grid h-11 w-11 place-items-center rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300" title="Sair da Sala"><LogOut size={17}/></button>
    </div>
  </div>;
}
