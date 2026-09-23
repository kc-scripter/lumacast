import { memo, useCallback, useState } from "react";
import { ArrowRight, Home, LogIn, MonitorUp, Radio, Settings2, ShieldCheck, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { safeSessionGet } from "../../../client/src/services/browser";
import { HowItWorksModal } from "../components/HowItWorksModal";

export const HomeScreen=memo(function HomeScreen({onCreate,onJoin,onSettings}:{onCreate(name:string):void;onJoin(name:string,code:string):void;onSettings():void}){
  const [name,setName]=useState(()=>safeSessionGet("lumacast-display-name")||"");
  const [code,setCode]=useState("");
  const [error,setError]=useState("");
  const [howOpen,setHowOpen]=useState(false);

  const cleanName=()=>name.trim();
  const cleanCode=()=>code.replace(/[^a-z0-9]/gi,"").toUpperCase();

  const createRoom=useCallback(()=>{
    const clean=cleanName();
    if(!clean){setError("Digite o seu nome para continuar.");return;}
    setError("");
    onCreate(clean);
  },[name,onCreate]);

  const joinRoom=useCallback(()=>{
    const clean=cleanName();
    const room=cleanCode();
    if(!clean){setError("Digite o seu nome para continuar.");return;}
    if(room.length<6){setError("Digite um código de sala válido.");return;}
    setError("");
    onJoin(clean,room);
  },[code,name,onJoin]);

  return <>
    <section className="relative flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[78px] shrink-0 flex-col items-center border-r border-white/[.055] bg-[#090a0f]/55 py-5 backdrop-blur-xl">
        <button aria-label="Início" className="grid h-10 w-10 place-items-center rounded-xl border border-purple-500/20 bg-purple-500/12 text-purple-300"><Home size={17}/></button>
        <button aria-label="Configurações" onClick={onSettings} className="mt-2 grid h-10 w-10 place-items-center rounded-xl text-zinc-600 hover:bg-white/[.04] hover:text-zinc-300"><Settings2 size={17}/></button>
        <div className="mt-auto h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.35)]"/>
      </aside>

      <div className="min-w-0 flex-1 overflow-auto px-10 py-8">
        <div className="mx-auto grid min-h-full w-full max-w-[1180px] grid-cols-[1.02fr_.98fr] items-center gap-14">
          <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{duration:.38,ease:[.2,.8,.2,1]}}>
            <div className="mb-5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-purple-300/85"><span className="h-1.5 w-1.5 rounded-full bg-purple-400"/>Mais conexão, menos barreiras</div>
            <h1 className="max-w-2xl text-[46px] font-semibold leading-[1.04] tracking-[-.045em] text-zinc-50">Compartilhe sua tela<br/>com quem importa.</h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">Transmissão em alta qualidade, direto do desktop. Sem complicação, sem interrupções.</p>

            <div className="mt-8 max-w-xl rounded-2xl border border-white/[.07] bg-[#0f1017]/76 p-5 shadow-[0_18px_55px_rgba(0,0,0,.22)] backdrop-blur-xl">
              <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[.12em] text-zinc-600">Seu nome</label>
              <input value={name} onChange={event=>setName(event.target.value)} maxLength={24} placeholder="Ex.: Kc" className="h-11 w-full rounded-xl border border-white/[.07] bg-black/20 px-3.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-700 transition focus:border-purple-500/45 focus:bg-black/28"/>

              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <button onClick={createRoom} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-500 px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(109,40,217,.24)] hover:-translate-y-px hover:shadow-[0_16px_34px_rgba(109,40,217,.3)]"><Radio size={16}/>Criar sala<ArrowRight size={15}/></button>
                <button onClick={()=>setHowOpen(true)} className="h-11 rounded-xl border border-white/[.07] bg-white/[.025] px-4 text-xs font-medium text-zinc-400 hover:bg-white/[.045] hover:text-zinc-200">Como funciona</button>
              </div>

              <div className="my-4 flex items-center gap-3"><div className="h-px flex-1 bg-white/[.05]"/><span className="text-[9px] uppercase tracking-[.15em] text-zinc-700">ou entre numa sala</span><div className="h-px flex-1 bg-white/[.05]"/></div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} onKeyDown={event=>event.key==="Enter"&&joinRoom()} maxLength={10} placeholder="Código da sala" className="h-10 rounded-xl border border-white/[.07] bg-black/20 px-3.5 font-mono text-xs uppercase tracking-[.12em] text-zinc-200 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-zinc-700 focus:border-purple-500/45"/>
                <button onClick={joinRoom} className="flex h-10 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.035] px-4 text-xs font-semibold text-zinc-300 hover:bg-white/[.06]"><LogIn size={14}/>Entrar</button>
              </div>
              {error&&<p className="mt-3 text-xs text-red-300">{error}</p>}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-5 text-[10px] text-zinc-600">
              <span className="flex items-center gap-2"><MonitorUp size={13} className="text-purple-400"/>1080p · 60 FPS</span>
              <span className="h-3 w-px bg-white/[.06]"/>
              <span className="flex items-center gap-2"><Zap size={13} className="text-purple-400"/>Baixa latência</span>
              <span className="h-3 w-px bg-white/[.06]"/>
              <span className="flex items-center gap-2"><ShieldCheck size={13} className="text-purple-400"/>Conexão segura</span>
            </div>
          </motion.div>

          <motion.div initial={{opacity:0,x:14}} animate={{opacity:1,x:0}} transition={{delay:.08,duration:.42,ease:[.2,.8,.2,1]}} className="relative">
            <div className="overflow-hidden rounded-[22px] border border-purple-400/20 bg-[#0e0f16]/86 shadow-[0_28px_80px_rgba(0,0,0,.34)] backdrop-blur-xl">
              <div className="flex h-10 items-center justify-between border-b border-white/[.055] px-4">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400/80"/><span className="h-2 w-2 rounded-full bg-amber-300/80"/><span className="h-2 w-2 rounded-full bg-emerald-400/80"/></div>
                <span className="text-[9px] text-zinc-700">Lunira Screen</span>
              </div>

              <div className="grid min-h-[400px] grid-cols-[74px_1fr]">
                <div className="border-r border-white/[.05] bg-white/[.012] p-3">
                  <div className="grid h-9 place-items-center rounded-lg bg-purple-500/12 text-purple-300"><Home size={14}/></div>
                  <div className="mt-2 grid h-9 place-items-center rounded-lg text-zinc-700"><Settings2 size={14}/></div>
                </div>
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between"><div><span className="block text-[11px] font-semibold text-zinc-200">Sua sala está pronta</span><span className="mt-1 block text-[9px] text-zinc-700">Quando você transmitir, sua tela aparece aqui.</span></div><span className="rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-2 py-1 text-[8px] text-emerald-300">Conectado</span></div>
                  <div className="relative grid h-[275px] place-items-center overflow-hidden rounded-xl border border-dashed border-white/[.08] bg-black/28">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(124,58,237,.09),transparent_55%)]"/>
                    <div className="relative text-center">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-purple-500/15 bg-purple-500/[.06] text-purple-300"><MonitorUp size={21}/></div>
                      <strong className="mt-4 block text-xs text-zinc-300">Nenhuma tela sendo compartilhada</strong>
                      <span className="mt-1 block text-[9px] text-zinc-700">Pronto para começar quando você quiser.</span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[["Sala privada","Código temporário"],["Qualidade","1080p"],["Fluidez","60 FPS"]].map(([label,value])=><div key={label} className="rounded-lg border border-white/[.055] bg-white/[.018] px-3 py-2"><span className="block text-[8px] uppercase tracking-wider text-zinc-700">{label}</span><strong className="mt-1 block text-[10px] text-zinc-400">{value}</strong></div>)}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
    <HowItWorksModal open={howOpen} onClose={()=>setHowOpen(false)}/>
  </>;
});
