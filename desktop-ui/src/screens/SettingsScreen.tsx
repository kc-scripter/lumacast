import { memo, useMemo, useState } from "react";
import { ArrowLeft, Info, Keyboard, MonitorUp, Palette, Settings2, Volume2 } from "lucide-react";

type Section="general"|"media"|"shortcuts"|"appearance"|"about";

function readBool(key:string,fallback=true){const value=localStorage.getItem(key);return value==null?fallback:value!=="0";}
function writeBool(key:string,value:boolean){localStorage.setItem(key,value?"1":"0");}

export const SettingsScreen=memo(function SettingsScreen({onHome}:{onHome():void}){
  const [section,setSection]=useState<Section>("general");
  const [showSplash,setShowSplash]=useState(()=>readBool("lunira_show_splash",true));
  const [audio,setAudio]=useState(()=>readBool("lunira_default_audio",true));
  const [quality,setQuality]=useState(()=>localStorage.getItem("lunira_default_quality")==="720p"?"720p":"1080p");
  const [fps,setFps]=useState(()=>localStorage.getItem("lunira_default_fps")==="30"?30:60);

  const menu=useMemo(()=>[
    {id:"general" as Section,label:"Geral",icon:Settings2},
    {id:"media" as Section,label:"Vídeo e áudio",icon:MonitorUp},
    {id:"shortcuts" as Section,label:"Atalhos",icon:Keyboard},
    {id:"appearance" as Section,label:"Aparência",icon:Palette},
    {id:"about" as Section,label:"Sobre",icon:Info}
  ],[]);

  return <section className="relative flex h-full min-h-0 overflow-hidden">
    <aside className="w-[230px] shrink-0 border-r border-white/[.055] bg-[#090a0f]/55 p-4 backdrop-blur-xl">
      <button onClick={onHome} className="mb-4 flex h-9 items-center gap-2 rounded-lg px-2.5 text-xs text-zinc-500 hover:bg-white/[.04] hover:text-zinc-200"><ArrowLeft size={14}/>Voltar</button>
      <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[.16em] text-zinc-700">Configurações</div>
      <div className="space-y-1">
        {menu.map(({id,label,icon:Icon})=><button key={id} onClick={()=>setSection(id)} className={"flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-xs "+(section===id?"border border-purple-500/15 bg-purple-500/10 text-purple-200":"border border-transparent text-zinc-500 hover:bg-white/[.035] hover:text-zinc-300")}><Icon size={15}/>{label}</button>)}
      </div>
    </aside>

    <div className="min-w-0 flex-1 overflow-auto px-10 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-[-.03em] text-zinc-100">{menu.find(item=>item.id===section)?.label}</h1>
        <p className="mt-2 text-xs leading-5 text-zinc-600">Ajustes do Lunira Screen para este computador.</p>

        {section==="general"&&<div className="mt-7 space-y-3">
          <SettingCard title="Inicialização" description="Preferências exibidas ao abrir o aplicativo.">
            <Toggle label="Mostrar tela de inicialização" checked={showSplash} onChange={value=>{setShowSplash(value);writeBool("lunira_show_splash",value);}}/>
          </SettingCard>
          <SettingCard title="Idioma" description="Idioma usado pela interface desktop.">
            <div className="rounded-xl border border-white/[.06] bg-black/20 px-3 py-2.5 text-xs text-zinc-300">Português (Brasil)</div>
          </SettingCard>
        </div>}

        {section==="media"&&<div className="mt-7 space-y-3">
          <SettingCard title="Qualidade padrão" description="Aplicada ao iniciar uma nova transmissão.">
            <div className="grid grid-cols-2 gap-2">
              {["1080p","720p"].map(value=><button key={value} onClick={()=>{setQuality(value);localStorage.setItem("lunira_default_quality",value);}} className={"rounded-xl border px-3 py-2.5 text-xs "+(quality===value?"border-purple-500/35 bg-purple-500/10 text-purple-200":"border-white/[.06] bg-black/20 text-zinc-500 hover:text-zinc-300")}>{value}</button>)}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {[60,30].map(value=><button key={value} onClick={()=>{setFps(value);localStorage.setItem("lunira_default_fps",String(value));}} className={"rounded-xl border px-3 py-2.5 text-xs "+(fps===value?"border-purple-500/35 bg-purple-500/10 text-purple-200":"border-white/[.06] bg-black/20 text-zinc-500 hover:text-zinc-300")}>{value} FPS</button>)}
            </div>
          </SettingCard>
          <SettingCard title="Áudio do sistema" description="Compartilhe o áudio do computador junto com a tela por padrão.">
            <Toggle icon={<Volume2 size={14}/>} label="Áudio do sistema ativado" checked={audio} onChange={value=>{setAudio(value);writeBool("lunira_default_audio",value);}}/>
          </SettingCard>
        </div>}

        {section==="shortcuts"&&<div className="mt-7"><SettingCard title="Atalhos da sala" description="Comandos disponíveis enquanto você estiver em uma sala."><Shortcut label="Compartilhar / parar tela" keys="Ctrl  ⇧  S"/><Shortcut label="Ativar / mutar áudio do sistema" keys="Ctrl  ⇧  A"/></SettingCard></div>}

        {section==="appearance"&&<div className="mt-7"><SettingCard title="Aparência" description="A interface usa um tema escuro otimizado para desktop."><div className="flex items-center justify-between rounded-xl border border-white/[.06] bg-black/20 p-3"><div><span className="block text-xs font-medium text-zinc-300">Tema escuro</span><span className="mt-1 block text-[10px] text-zinc-600">Fundo discreto com movimento suave.</span></div><span className="h-7 w-7 rounded-lg border border-purple-400/20 bg-purple-500/15"/></div></SettingCard></div>}

        {section==="about"&&<div className="mt-7"><SettingCard title="Lunira Screen" description="Aplicativo desktop para compartilhamento de tela em tempo real."><div className="text-xs leading-6 text-zinc-500">Versão 1.0.0<br/>Captura de monitor ou janela · até 1080p / 60 FPS</div></SettingCard></div>}
      </div>
    </div>
  </section>;
});

function SettingCard({title,description,children}:{title:string;description:string;children:React.ReactNode}){
  return <div className="rounded-2xl border border-white/[.065] bg-[#0f1017]/72 p-5 shadow-sm backdrop-blur-xl"><h2 className="text-sm font-semibold text-zinc-200">{title}</h2><p className="mt-1 text-[11px] text-zinc-600">{description}</p><div className="mt-4">{children}</div></div>;
}
function Toggle({label,checked,onChange,icon}:{label:string;checked:boolean;onChange(value:boolean):void;icon?:React.ReactNode}){
  return <button onClick={()=>onChange(!checked)} className="flex w-full items-center justify-between rounded-xl border border-white/[.06] bg-black/20 px-3 py-3 text-left"><span className="flex items-center gap-2 text-xs text-zinc-300">{icon}{label}</span><span className={"relative h-5 w-9 rounded-full transition-colors "+(checked?"bg-purple-600":"bg-zinc-800")}><span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform "+(checked?"translate-x-[18px]":"translate-x-0.5")}/></span></button>;
}
function Shortcut({label,keys}:{label:string;keys:string}){return <div className="flex items-center justify-between border-b border-white/[.05] py-3 last:border-b-0"><span className="text-xs text-zinc-400">{label}</span><kbd className="rounded-lg border border-white/[.07] bg-black/25 px-2 py-1 text-[10px] text-zinc-500">{keys}</kbd></div>;}
