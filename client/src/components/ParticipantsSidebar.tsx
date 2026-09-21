import { useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown,ChevronUp,Maximize2,Minimize2,PanelRightClose,PanelRightOpen,Users,X } from "lucide-react";
import type { RoomParticipant } from "../types";

type Camera={identity:string;track:MediaStreamTrack;local:boolean};
type Point={x:number;y:number};
type DragState={pointerId:number;startX:number;startY:number;originX:number;originY:number};

function CameraVideo({track}:{track:MediaStreamTrack}){
  const ref=useRef<HTMLVideoElement>(null);
  useEffect(()=>{
    if(ref.current){ref.current.srcObject=new MediaStream([track]);void ref.current.play().catch(()=>undefined);}
    return()=>{if(ref.current)ref.current.srcObject=null;};
  },[track]);
  return <video ref={ref} autoPlay playsInline muted/>;
}

export function ParticipantsSidebar({participants}:{participants:RoomParticipant[]}){
  const [open,setOpen]=useState(()=>typeof window==="undefined"||window.innerWidth>720);
  return <aside className={"people-sidebar "+(open?"open":"")}>
    <button className="people-toggle" onClick={()=>setOpen(value=>!value)} aria-label={open?"Recolher pessoas":"Expandir pessoas"}>{open?<PanelRightClose/>:<PanelRightOpen/>}</button>
    <div className="people-heading"><Users/><span>{participants.length}</span>{open&&<b>Pessoas na sala</b>}</div>
    {open?<div className="people-list">{participants.map((person,index)=><div className="person-row" key={person.id}><span className="person-avatar">{person.displayName.slice(0,1).toUpperCase()}</span><div><b>{person.displayName}</b><small>{index===0?"Dono da sala":"Participante"}</small></div><i/></div>)}</div>:<div className="people-mini">{participants.slice(0,4).map(person=><span key={person.id} title={person.displayName}>{person.displayName.slice(0,1).toUpperCase()}</span>)}</div>}
  </aside>;
}

export function CameraDock({cameras,participants}:{cameras:Camera[];participants:RoomParticipant[]}){
  const [open,setOpen]=useState(true),[pinned,setPinned]=useState<string|null>(null),[large,setLarge]=useState(false),[position,setPosition]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
  const overlayRef=useRef<HTMLDivElement>(null),dragRef=useRef<DragState|null>(null);
  const names=useMemo(()=>new Map(participants.map(person=>[person.id,person.displayName])),[participants]);
  const selected=cameras.find(camera=>camera.identity===pinned);
  const cameraName=(camera:Camera)=>names.get(camera.identity)||sessionStorage.getItem("lumacast-display-name")||"Participante";

  useEffect(()=>{if(pinned&&!selected)setPinned(null);},[pinned,selected]);
  useEffect(()=>{setPosition(null);setLarge(false);},[pinned]);

  const startDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest("button"))return;
    const node=overlayRef.current;if(!node)return;
    const rect=node.getBoundingClientRect();
    dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:rect.left,originY:rect.top};
    setPosition({x:rect.left,y:rect.top});setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();
  };
  const moveDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current,node=overlayRef.current;if(!drag||drag.pointerId!==event.pointerId||!node)return;
    const rect=node.getBoundingClientRect(),margin=8,nextX=drag.originX+event.clientX-drag.startX,nextY=drag.originY+event.clientY-drag.startY;
    setPosition({x:Math.max(margin,Math.min(Math.max(margin,window.innerWidth-rect.width-margin),nextX)),y:Math.max(margin,Math.min(Math.max(margin,window.innerHeight-rect.height-margin),nextY))});
  };
  const stopDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(dragRef.current?.pointerId!==event.pointerId)return;
    dragRef.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const countText=cameras.length?String(cameras.length)+" ativa"+(cameras.length===1?"":"s"):"Nenhuma câmera ativa";
  return <>
    <section className={"camera-dock "+(cameras.length?"has-cameras":"empty")+" "+(open?"":"collapsed")}>
      <button className="camera-dock-head" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>
        <span><Users/><b>Câmeras</b><small>{countText}</small></span>{open?<ChevronDown/>:<ChevronUp/>}
      </button>
      {open&&cameras.length>0&&<div className="camera-dock-list">{cameras.map(camera=><button className="camera-dock-card" key={camera.identity} onClick={()=>setPinned(camera.identity)}>
        <CameraVideo track={camera.track}/><span>{cameraName(camera)}{camera.local&&<em>VOCÊ</em>}</span><i className="camera-expand-hint"><Maximize2/></i>
      </button>)}</div>}
    </section>
    {selected&&<div ref={overlayRef} className={"camera-overlay "+(large?"large ":"")+(dragging?"dragging":"")} style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <CameraVideo track={selected.track}/>
      <div className="camera-overlay-actions"><button onClick={()=>{setLarge(value=>!value);setPosition(null);}} aria-label={large?"Reduzir câmera":"Expandir câmera"}>{large?<Minimize2/>:<Maximize2/>}</button><button onClick={()=>setPinned(null)} aria-label="Fechar câmera"><X/></button></div>
      <span>{cameraName(selected)}{selected.local?" · VOCÊ":""}</span>
    </div>}
  </>;
}
