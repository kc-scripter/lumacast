import { randomBytes } from "node:crypto";
import type { PersistedRoom,RoomPersistence } from "./roomPersistence.js";

export type ScreenProvider="agora"|"livekit";
export type Participant={socketId:string;displayName:string;agoraUid:number;token:string;livekitActive:boolean;disconnectTimer?:NodeJS.Timeout};
export type Room={id:string;ownerId:string;ownerName:string;ownerUid:number;ownerToken:string;ownerLivekitActive:boolean;participants:Map<string,Participant>;activeScreenSharerId:string|null;activeScreenUid:number|null;screenProvider:ScreenProvider;live:boolean;ownerDisconnectTimer?:NodeJS.Timeout;screenDisconnectTimer?:NodeJS.Timeout};
const ROOM_RE=/^[A-Z2-9]{8}$/;
export const validRoomId=(value:unknown):value is string=>typeof value==="string"&&ROOM_RE.test(value);
export const normalizeDisplayName=(value:unknown)=>{if(typeof value!=="string"||/[\u0000-\u001f\u007f]/.test(value))return null;const name=value.trim().replace(/\s+/g," ");return name.length>=2&&name.length<=20?name:null;};
export const newSecret=()=>randomBytes(32).toString("base64url");

export class RoomStore{
  private rooms=new Map<string,Room>();
  private writes=new Map<string,Promise<void>>();
  private alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  constructor(private persistence:RoomPersistence|null=null){}

  async hydrate(){
    if(!this.persistence)return;
    try{
      const saved=await this.persistence.load();
      for(const item of saved){
        if(!validRoomId(item.id)||!item.ownerToken||!item.ownerName)continue;
        const room:Room={id:item.id,ownerId:item.ownerId,ownerName:item.ownerName,ownerUid:item.ownerUid,ownerToken:item.ownerToken,ownerLivekitActive:false,participants:new Map((item.participants||[]).map(participant=>[participant.socketId,{...participant,livekitActive:false}])),activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",live:false};
        this.rooms.set(room.id,room);
        room.ownerDisconnectTimer=setTimeout(()=>{if(this.rooms.get(room.id)===room)this.remove(room.id);},30_000);
        for(const participant of room.participants.values()){
          participant.disconnectTimer=setTimeout(()=>{
            if(room.participants.get(participant.socketId)===participant){
              room.participants.delete(participant.socketId);
              this.persist(room);
            }
          },10_000);
        }
      }
      console.info(`Room persistence: ${this.persistence.label} · ${this.rooms.size} room(s) recovered`);
    }catch(error){console.error("Room persistence recovery failed; continuing in memory.",error);}
  }

  private snapshot(room:Room):PersistedRoom{return{id:room.id,ownerId:room.ownerId,ownerName:room.ownerName,ownerUid:room.ownerUid,ownerToken:room.ownerToken,participants:[...room.participants.values()].map(({socketId,displayName,agoraUid,token})=>({socketId,displayName,agoraUid,token}))};}
  private queue(id:string,task:()=>Promise<void>){
    if(!this.persistence)return;
    const previous=this.writes.get(id)||Promise.resolve();
    const next=previous.catch(()=>undefined).then(task).catch(error=>console.error(`Room persistence write failed for ${id}`,error));
    this.writes.set(id,next);
    void next.finally(()=>{if(this.writes.get(id)===next)this.writes.delete(id);});
  }
  persist(room:Room){if(this.persistence){const snapshot=this.snapshot(room);this.queue(room.id,()=>this.persistence!.save(snapshot));}}
  newId(){let id="";do{const bytes=randomBytes(8);id=Array.from(bytes,b=>this.alphabet[b%this.alphabet.length]).join("");}while(this.rooms.has(id));return id;}
  create(id:string,ownerId:string,ownerName:string,ownerUid:number){const room:Room={id,ownerId,ownerName,ownerUid,ownerToken:newSecret(),ownerLivekitActive:false,participants:new Map(),activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",live:false};this.rooms.set(id,room);this.persist(room);return room;}
  nameFor(room:Room,name:string,except?:string){const taken=[room.ownerId===except?"":room.ownerName,...[...room.participants.values()].filter(p=>p.socketId!==except).map(p=>p.displayName)].map(value=>value.toLocaleLowerCase());let result=name,index=2;while(taken.includes(result.toLocaleLowerCase()))result=`${name} (${index++})`;return result;}
  get(id:string){return this.rooms.get(id);}
  findByOwner(id:string){return [...this.rooms.values()].find(room=>room.ownerId===id);}
  findByParticipant(id:string){return [...this.rooms.values()].find(room=>room.participants.has(id));}
  isMember(room:Room,id:string){return room.ownerId===id||room.participants.has(id);}
  getUid(room:Room,id:string){return room.ownerId===id?room.ownerUid:room.participants.get(id)?.agoraUid;}
  reclaim(room:Room,token:string,id:string){if(room.ownerToken!==token)return false;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);room.ownerDisconnectTimer=undefined;const old=room.ownerId;room.ownerId=id;if(room.activeScreenSharerId===old){if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);room.screenDisconnectTimer=undefined;room.activeScreenSharerId=id;}this.persist(room);return true;}
  remove(id:string){const room=this.rooms.get(id);if(!room)return;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);for(const participant of room.participants.values())if(participant.disconnectTimer)clearTimeout(participant.disconnectTimer);this.rooms.delete(id);if(this.persistence)this.queue(id,()=>this.persistence!.delete(id));}
  count(){return this.rooms.size;}
}
