import { useEffect,useRef,useState,type PointerEvent as ReactPointerEvent } from "react";
import { Maximize2,Minimize2,PanelRightClose,PanelRightOpen,Users,X } from "lucide-react";

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

export function ParticipantsSidebar({cameras,count}:{cameras:Camera[];count:number}){
  const [open,setOpen]=useState(false),[pinned,setPinned]=useState<string|null>(null),[large,setLarge]=useState(false),[position,setPosition]=useState<Point|null>(null),[dragging,setDragging]=useState(false);
  const overlayRef=useRef<HTMLDivElement>(null),dragRef=useRef<DragState|null>(null);
  const selected=cameras.find(camera=>camera.identity===pinned);

  useEffect(()=>{if(pinned&&!selected)setPinned(null);},[pinned,selected]);
  useEffect(()=>{setPosition(null);setLarge(false);},[pinned]);

  const startDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest("button"))return;
    const node=overlayRef.current;
    if(!node)return;
    const rect=node.getBoundingClientRect();
    dragRef.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:rect.left,originY:rect.top};
    setPosition({x:rect.left,y:rect.top});
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current,node=overlayRef.current;
    if(!drag||drag.pointerId!==event.pointerId||!node)return;
    const rect=node.getBoundingClientRect(),margin=8;
    const nextX=drag.originX+event.clientX-drag.startX,nextY=drag.originY+event.clientY-drag.startY;
    setPosition({
      x:Math.max(margin,Math.min(Math.max(margin,window.innerWidth-rect.width-margin),nextX)),
      y:Math.max(margin,Math.min(Math.max(margin,window.innerHeight-rect.height-margin),nextY))
    });
  };
  const stopDrag=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(dragRef.current?.pointerId!==event.pointerId)return;
    dragRef.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <>
    <aside className={`participants-sidebar ${open?"open":""}`}>
      <button className="participants-toggle" onClick={()=>setOpen(!open)} aria-label={open?"Recolher participantes":"Expandir participantes"}>{open?<PanelRightClose/>:<PanelRightOpen/>}</button>
      <div className="participants-heading"><Users/><span>{count+1}</span></div>
      {open&&<div className="participants-list">{cameras.map(camera=><button className="camera-card" key={camera.identity} onClick={()=>setPinned(camera.identity)}><CameraVideo track={camera.track}/><span>{camera.local?"VOCÊ":"Participante"}</span></button>)}</div>}
      {!open&&<div className="participants-mini">{cameras.slice(0,3).map(camera=><button key={camera.identity} onClick={()=>{setOpen(true);setPinned(camera.identity);}}><CameraVideo track={camera.track}/></button>)}</div>}
    </aside>
    {selected&&<div ref={overlayRef} className={`camera-overlay ${large?"large":""} ${dragging?"dragging":""}`} style={position?{left:position.x,top:position.y,right:"auto",bottom:"auto"}:undefined} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
      <CameraVideo track={selected.track}/>
      <div className="camera-overlay-actions"><button onClick={()=>{setLarge(value=>!value);setPosition(null);}} aria-label={large?"Reduzir câmera":"Expandir câmera"}>{large?<Minimize2/>:<Maximize2/>}</button><button onClick={()=>setPinned(null)} aria-label="Fechar câmera"><X/></button></div>
      <span>{selected.local?"VOCÊ":"Participante"}</span>
    </div>}
  </>;
}
