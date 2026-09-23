import { MonitorUp, Radio, X, Zap } from "lucide-react";

export function HowItWorksModal({open,onClose}:{open:boolean;onClose():void}) {
  if(!open)return null;
  const steps=[
    {icon:Radio,title:"1. Crie a Sala",text:"Defina o seu nome e crie uma sala privada ou entre com um código existente."},
    {icon:MonitorUp,title:"2. Escolha o Ecrã e Áudio",text:"Selecione exatamente o monitor ou janela e mantenha apenas o áudio do sistema que deseja transmitir."},
    {icon:Zap,title:"3. Transmita sem Lag",text:"Inicie a transmissão e acompanhe qualidade, latência e bitrate diretamente no app desktop."}
  ];
  return <div className="modal-enter fixed inset-0 z-50 grid place-items-center bg-black/70 p-6 backdrop-blur-sm" onMouseDown={onClose}>
    <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-[#121215] p-5 shadow-2xl shadow-black/60" onMouseDown={e=>e.stopPropagation()}>
      <div className="flex items-start justify-between">
        <div><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-purple-300">Lunira Screen Desktop</span><h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">Como Funciona</h2><p className="mt-1 text-xs text-zinc-500">Três passos para começar a transmitir.</p></div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"><X size={16}/></button>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {steps.map(({icon:Icon,title,text})=><div key={title} className="rounded-xl border border-zinc-800/80 bg-[#0d0d10] p-4">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-purple-500/10 text-purple-300"><Icon size={17}/></div>
          <strong className="mt-4 block text-sm text-zinc-200">{title}</strong>
          <p className="mt-2 text-[11px] leading-5 text-zinc-600">{text}</p>
        </div>)}
      </div>
      <div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-500">Entendi</button></div>
    </div>
  </div>;
}
