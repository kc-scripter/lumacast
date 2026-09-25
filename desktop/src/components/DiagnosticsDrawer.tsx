import { CheckCircle2, Clipboard, RefreshCw, Trash2, Wifi, X } from "lucide-react";
import { useMemo,useState } from "react";
import { buildDiagnosticReport,clearDiagnostics,readDiagnostics } from "../../../client/src/services/diagnostics";
import type { StreamStats } from "../../../client/src/types";

export function DiagnosticsDrawer({
  onClose,onRecover,recovering,status,provider,roomId,live,stats,cameraCount,participantCount
}:{
  onClose:()=>void;
  onRecover:()=>Promise<boolean>;
  recovering:boolean;
  status:string;
  provider:string;
  roomId:string;
  live:boolean;
  stats:StreamStats|null;
  cameraCount:number;
  participantCount:number;
}){
  const [copied,setCopied]=useState(false);
  const [eventsVersion,setEventsVersion]=useState(0);
  const events=useMemo(()=>readDiagnostics().slice(-12).reverse(),[eventsVersion]);
  const copy=async()=>{
    const report=buildDiagnosticReport({room:{roomId,status,provider,live,participantCount,cameraCount},stats});
    try{await navigator.clipboard.writeText(report);setCopied(true);setTimeout(()=>setCopied(false),1400);}catch{}
  };
  const clear=()=>{clearDiagnostics();setEventsVersion(value=>value+1);};
  return <div className="diagnostics-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside className="diagnostics-drawer" role="dialog" aria-modal="true" aria-label="Diagnóstico da sala">
      <header><div><span>DIAGNÓSTICO</span><h2>Saúde da transmissão</h2></div><button type="button" aria-label="Fechar diagnóstico" onClick={onClose}><X/></button></header>
      <div className="diagnostics-health">
        <div><span>Signaling</span><strong><i className={status==="Conectado"?"ok":"warn"}/>{status}</strong></div>
        <div><span>Rota de mídia</span><strong><Wifi/>{provider==="livekit"?"LiveKit fallback":"Agora RTC"}</strong></div>
        <div><span>Estado</span><strong><CheckCircle2/>{live?"Transmitindo":"Em espera"}</strong></div>
        <div><span>Sala</span><strong>{roomId||"—"}</strong></div>
      </div>
      <section className="diagnostics-stats"><h3>Mídia</h3><div className="diagnostics-grid">
        <div><span>Resolução</span><strong>{stats?.resolution||"—"}</strong></div>
        <div><span>FPS</span><strong>{stats?.fps??"—"}</strong></div>
        <div><span>Bitrate</span><strong>{stats?.bitrateKbps!=null?`${stats.bitrateKbps} kbps`:"—"}</strong></div>
        <div><span>RTT</span><strong>{stats?.rttMs!=null?`${stats.rttMs} ms`:"—"}</strong></div>
        <div><span>Pacotes perdidos</span><strong>{stats?.packetsLost??"—"}</strong></div>
        <div><span>ICE / Peer</span><strong>{stats?`${stats.iceState} / ${stats.peerState}`:"—"}</strong></div>
      </div></section>
      <section className="diagnostics-events"><div className="diagnostics-section-head"><h3>Eventos recentes</h3><button type="button" onClick={clear}><Trash2/>Limpar</button></div>{events.length?<div className="diagnostics-event-list">{events.map((event,index)=><article key={event.at+index} className={event.level}><div><span>{event.scope}</span><time>{new Date(event.at).toLocaleTimeString()}</time></div><strong>{event.message}</strong>{event.detail&&<small>{event.detail.slice(0,300)}</small>}</article>)}</div>:<p>Nenhum erro recente registrado.</p>}</section>
      <footer><button type="button" className="secondary" onClick={()=>void copy()}><Clipboard/>{copied?"Relatório copiado":"Copiar relatório"}</button><button type="button" className="primary" disabled={recovering} onClick={()=>void onRecover()}><RefreshCw className={recovering?"spin":""}/>{recovering?"Recuperando…":"Reconectar mídia"}</button></footer>
    </aside>
  </div>;
}
