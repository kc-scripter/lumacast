import { Activity, Radio, Timer, Wifi } from "lucide-react";
import type { StreamStats } from "../types";
export function StatsPanel({stats}:{stats:StreamStats|null}) {
  const values=[{icon:<Radio/>,label:"Resolução",value:stats?.resolution||"—"},{icon:<Activity/>,label:stats?.captureFps!=null?"Envio":"Quadros",value:stats?.fps!=null?`${Math.round(stats.fps)} FPS`:"—"},...(stats?.captureFps!=null?[{icon:<Activity/>,label:"Captura",value:`${Math.round(stats.captureFps)} FPS`}]:[]),{icon:<Wifi/>,label:"Bitrate",value:stats?.bitrateKbps!=null?`${stats.bitrateKbps} kbps`:"—"},{icon:<Timer/>,label:"RTT",value:stats?.rttMs!=null?`${stats.rttMs} ms`:"—"}];
  return <div className="stats-grid">{values.map(item=><div className="stat" key={item.label}><span>{item.icon}{item.label}</span><strong>{item.value}</strong></div>)}<div className="stat wide"><span>SFU / conexão</span><strong>{stats?`${stats.iceState} · ${stats.peerState}`:"Aguardando conexão"}</strong></div><div className="stat"><span>Pacotes perdidos</span><strong>{stats?.packetsLost??"—"}</strong></div></div>;
}
