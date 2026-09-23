import { MonitorUp } from "lucide-react";

export function BrandLogo() {
  return <div className="flex items-center gap-2.5 select-none">
    <div className="relative grid h-7 w-7 place-items-center rounded-lg border border-purple-400/40 bg-purple-600 text-white shadow-[0_0_24px_rgba(124,58,237,.28)]">
      <MonitorUp size={17} strokeWidth={2.2}/>
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-[#0d0d10] bg-purple-300"/>
    </div>
    <span className="text-xs font-semibold tracking-[-.01em] text-zinc-100">Lunira <span className="text-purple-300">Screen</span></span>
  </div>;
}
