import { Cast, Maximize, Volume2, VolumeX } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
export function VideoStage({videoRef,emptyTitle,emptyText,muted=false,active=false}:{videoRef:RefObject<HTMLVideoElement|null>;emptyTitle:string;emptyText:string;muted?:boolean;active?:boolean}) {
  const wrap=useRef<HTMLDivElement>(null); const [soundOn,setSoundOn]=useState(true);
  const toggle=()=>{if(videoRef.current){videoRef.current.muted=soundOn;setSoundOn(!soundOn);}};
  return <div className={`video-stage ${active?"has-video":""}`} ref={wrap}><video ref={videoRef} autoPlay playsInline muted={muted||!soundOn}/><div className="video-empty"><span className="orb"><Cast/></span><h2>{emptyTitle}</h2><p>{emptyText}</p></div><div className="video-controls"><button type="button" onClick={toggle} aria-label={soundOn?"Silenciar":"Ativar som"} title={soundOn?"Silenciar":"Ativar som"}>{soundOn?<Volume2/>:<VolumeX/>}</button><button type="button" onClick={()=>void wrap.current?.requestFullscreen().catch(()=>undefined)} aria-label="Tela cheia" title="Tela cheia"><Maximize/></button></div></div>;
}
