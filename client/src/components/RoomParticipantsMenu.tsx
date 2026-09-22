import { ChevronDown, Radio, Users } from "lucide-react";
import { useEffect,useRef,useState } from "react";
import type { RoomParticipant } from "../types";

type Props={
  participants:RoomParticipant[];
  activeScreenSharerId:string|null;
};

export function RoomParticipantsMenu({participants,activeScreenSharerId}:Props){
  const [open,setOpen]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);

  useEffect(()=>{
    if(!open)return;
    const onPointerDown=(event:PointerEvent)=>{
      if(!rootRef.current?.contains(event.target as Node))setOpen(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape")setOpen(false);
    };
    document.addEventListener("pointerdown",onPointerDown);
    document.addEventListener("keydown",onKeyDown);
    return()=>{
      document.removeEventListener("pointerdown",onPointerDown);
      document.removeEventListener("keydown",onKeyDown);
    };
  },[open]);

  return <div className="room-members-menu" ref={rootRef}>
    <button
      type="button"
      className={`room-members-trigger ${open?"open":""}`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`${participants.length} pessoa${participants.length===1?"":"s"} na sala`}
      onClick={()=>setOpen(value=>!value)}
    >
      <Users/>
      <span>{participants.length}</span>
      <ChevronDown className="room-members-chevron"/>
    </button>

    {open&&<div className="room-members-popover" role="dialog" aria-label="Pessoas na sala">
      <div className="room-members-popover-head">
        <div><b>Pessoas na sala</b><small>{participants.length} conectado{participants.length===1?"":"s"}</small></div>
        <span>{participants.length}</span>
      </div>
      <div className="room-members-list">
        {participants.length===0
          ?<div className="room-members-empty">Ninguém conectado ainda.</div>
          :participants.map(person=>{
            const sharing=person.id===activeScreenSharerId;
            const initial=person.displayName.trim().charAt(0).toUpperCase()||"?";
            return <div className="room-members-row" key={person.id}>
              <span className="room-members-avatar">{initial}</span>
              <div className="room-members-name">
                <b title={person.displayName}>{person.displayName}</b>
                <small>{sharing?<><Radio/>Transmitindo</>:"Na sala"}</small>
              </div>
              <i className={sharing?"sharing":""}/>
            </div>;
          })}
      </div>
    </div>}
  </div>;
}
