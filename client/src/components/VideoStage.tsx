import { Cast, Maximize, Volume2, VolumeX } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
export function VideoStage({videoRef,emptyTitle,emptyText,muted=false,active=false}:{videoRef:RefObject<HTMLVideoElement|null>;emptyTitle:string;emptyText:string;muted?:boolean;active?:boolean}) {
  const wrap=useRef<HTMLDivElement>(null); const [volume,setVolume]=useState(true);
  const toggle=()=>{if(videoRef.current){videoRef.current.muted=volume;setVolume(!volume);}};
  return <div className={`video-stage ${active?"has-video":""}`} ref={wrap}><video ref={videoRef} autoPlay playsInline muted={muted||!volume}/><div className="video-empty"><span className="orb"><Cast/></span><h2>{emptyTitle}</h2><p>{emptyText}</p></div><div className="video-controls"><button onClick={toggle} aria-label={volume?"Silenciar":"Ativar som"}>{volume?<Volume2/>:<VolumeX/>}</button><button onClick={()=>wrap.current?.requestFullscreen()} aria-label="Tela cheia"><Maximize/></button></div></div>;
}
