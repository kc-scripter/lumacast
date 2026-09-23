import { memo, useCallback, useState } from "react";
import { Maximize2, Radio } from "lucide-react";
import { safeSessionGet } from "../../../client/src/services/browser";
import { BrandLogo } from "../components/BrandLogo";
import { HowItWorksModal } from "../components/HowItWorksModal";

export const HomeScreen=memo(function HomeScreen({onCreate,onJoin}:{onCreate(name:string):void;onJoin(name:string,code:string):void}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [howOpen,setHowOpen]=useState(false);

  const enterOrCreate=useCallback(()=>{
    const clean=name.trim();
    const room=code.replace(/[^a-z0-9]/gi,"").toUpperCase();
    if(!clean){setError("Digite o seu nome para continuar.");return;}
    if(room&&room.length<6){setError("Digite um código de sala válido.");return;}
    setError("");
    if(room)onJoin(clean,room);else onCreate(clean);
  },[code,name,onCreate,onJoin]);

  return <>
    <section className="relative h-full overflow-auto px-10 py-8">
      <div className="mx-auto grid min-h-full w-full max-w-6xl grid-cols-[1.05fr_.95fr] items-center gap-16">
        <div>
          <div className="mb-6 inline-flex"><BrandLogo size="lg"/></div>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-[-.04em] text-zinc-50">Compartilhe a sua tela sem interromper o fluxo.</h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">Salas privadas, captura de monitor ou janela, áudio do sistema e controlo de qualidade numa interface feita para desktop.</p>

          <div className="mt-8 max-w-xl rounded-2xl border border-zinc-800/80 bg-[#121216]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c]">
            <div className="mb-4">
              <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-purple-300">Entrar ou criar</span>
              <p className="mt-1 text-xs text-zinc-500">Deixe o código vazio para criar uma sala nova.</p>
            </div>

            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-zinc-600">Seu nome</label>
            <input value={name} onChange={event=>setName(event.target.value)} maxLength={24} placeholder="Como as pessoas vão ver você?" className="h-11 w-full rounded-xl border border-zinc-800/80 bg-[#121216]/80 px-3 text-sm text-zinc-100 outline-none backdrop-blur-md placeholder:text-zinc-700 transition-all focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20"/>

            <label className="mb-1.5 mt-3 block text-[10px] font-medium uppercase tracking-wider text-zinc-600">Código da sala <span className="normal-case text-zinc-700">(opcional)</span></label>
            <input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} onKeyDown={event=>event.key==="Enter"&&enterOrCreate()} maxLength={10} placeholder="J2N265E8" className="h-11 w-full rounded-xl border border-zinc-800/80 bg-[#121216]/80 px-3 font-mono text-xs tracking-[.12em] text-zinc-200 outline-none backdrop-blur-md placeholder:text-zinc-700 transition-all focus:border-purple-500/80 focus:ring-2 focus:ring-purple-500/20"/>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <button onClick={enterOrCreate} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-sm font-semibold text-white shadow-lg shadow-purple-600/25 transition-transform duration-150 hover:bg-purple-500 active:scale-95"><Radio size={16}/>Entrar / Criar Sala</button>
              <button onClick={()=>setHowOpen(true)} className="h-11 rounded-xl border border-zinc-800/80 bg-transparent px-5 text-xs font-semibold text-zinc-300 transition-all duration-200 hover:border-purple-500/40 hover:bg-zinc-900/60 active:scale-95">Como Funciona</button>
            </div>
            {error&&<p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
        </div>

        <div>
          <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-[#121216]/80 shadow-xl shadow-black/25 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c]">
            <div className="flex h-10 items-center justify-between border-b border-zinc-800/70 px-4 text-[10px] text-zinc-600"><span>PREVIEW DO DESKTOP</span><Maximize2 size={13}/></div>
            <div className="relative flex h-80 items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(124,58,237,.14),transparent_48%),rgba(13,13,16,.82)]">
              <div className="text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-purple-500/20 bg-purple-500/[.06] shadow-lg shadow-purple-950/10"><img src="/__desktop__/logo.svg" alt="Lunira Screen" className="h-9 w-9"/></div>
                <strong className="mt-4 block text-sm text-zinc-200">Sua transmissão aparece aqui</strong>
                <span className="mt-1 block text-xs text-zinc-600">Monitor ou janela específica</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[["Privado","Protegido"],["Duração","Temporária"],["Qualidade","1080p"],["Fluidez","60 FPS"]].map(([label,value])=><div key={label} className="rounded-xl border border-zinc-800/70 bg-[#121216]/70 px-3 py-3 backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-500/40 hover:bg-[#16161c]"><span className="block text-[9px] uppercase tracking-wider text-zinc-600">{label}</span><strong className="mt-1 block text-xs text-zinc-300">{value}</strong></div>)}
          </div>
        </div>
      </div>
    </section>

    <HowItWorksModal open={howOpen} onClose={()=>setHowOpen(false)}/>
  </>;
});
