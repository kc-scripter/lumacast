import { createHash,randomBytes,timingSafeEqual } from "node:crypto";
import type { PersistedRoom,RoomPersistence } from "./roomPersistence.js";

export type ScreenProvider="agora"|"livekit";
export type Participant={socketId:string;displayName:string;agoraUid:number;token:string|null;tokenHash:string;livekitActive:boolean;disconnectTimer?:NodeJS.Timeout};
export type Room={id:string;ownerId:string;ownerName:string;ownerUid:number;ownerToken:string|null;ownerTokenHash:string;inviteToken:string|null;inviteTokenHash:string;ownerLivekitActive:boolean;participants:Map<string,Participant>;activeScreenSharerId:string|null;activeScreenUid:number|null;screenProvider:ScreenProvider;live:boolean;ownerDisconnectTimer?:NodeJS.Timeout;screenDisconnectTimer?:NodeJS.Timeout};

const ROOM_RE=/^[A-Z2-9]{8}$/;
const SECRET_RE=/^[A-Za-z0-9_-]{43}$/;
const HASH_RE=/^[0-9a-f]{64}$/i;

export const validRoomId=(value:unknown):value is string=>typeof value==="string"&&ROOM_RE.test(value);
export const validSecret=(value:unknown):value is string=>typeof value==="string"&&SECRET_RE.test(value);
export const normalizeDisplayName=(value:unknown)=>{if(typeof value!=="string"||/[\u0000-\u001f\u007f]/.test(value))return null;const name=value.trim().replace(/\s+/g," ");return name.length>=2&&name.length<=20?name:null;};
export const newSecret=()=>randomBytes(32).toString("base64url");
export const hashSecret=(value:string)=>createHash("sha256").update(value).digest("hex");
export const secretMatches=(value:unknown,expectedHash:string)=>{
  if(!validSecret(value)||!HASH_RE.test(expectedHash))return false;
  const actual=Buffer.from(hashSecret(value),"hex"),expected=Buffer.from(expectedHash,"hex");
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
};

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
        const ownerName=normalizeDisplayName(item.ownerName);
        const ownerTokenHash=HASH_RE.test(item.ownerTokenHash||"")?item.ownerTokenHash!:validSecret(item.ownerToken)?hashSecret(item.ownerToken):null;
        const inviteTokenHash=HASH_RE.test(item.inviteTokenHash||"")?item.inviteTokenHash!:validSecret(item.inviteToken)?hashSecret(item.inviteToken):hashSecret(newSecret());
        if(!validRoomId(item.id)||!ownerName||!ownerTokenHash||!Number.isSafeInteger(item.ownerUid))continue;
        const participants=new Map<string,Participant>();
        for(const itemParticipant of item.participants||[]){
          const displayName=normalizeDisplayName(itemParticipant.displayName);
          const tokenHash=HASH_RE.test(itemParticipant.tokenHash||"")?itemParticipant.tokenHash!:validSecret(itemParticipant.token)?hashSecret(itemParticipant.token):null;
          if(!displayName||!tokenHash||typeof itemParticipant.socketId!=="string"||!Number.isSafeInteger(itemParticipant.agoraUid))continue;
          participants.set(itemParticipant.socketId,{socketId:itemParticipant.socketId,displayName,agoraUid:itemParticipant.agoraUid,token:null,tokenHash,livekitActive:false});
        }
        const room:Room={id:item.id,ownerId:item.ownerId,ownerName,ownerUid:item.ownerUid,ownerToken:null,ownerTokenHash,inviteToken:null,inviteTokenHash,ownerLivekitActive:false,participants,activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",live:false};
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
        // Rewrites legacy plaintext persistence to hash-only on the next save.
        this.persist(room);
      }
      console.info(`Room persistence: ${this.persistence.label} · ${this.rooms.size} room(s) recovered`);
    }catch(error){console.error("Room persistence recovery failed; continuing in memory.",error);}
  }

  private snapshot(room:Room):PersistedRoom{return{id:room.id,ownerId:room.ownerId,ownerName:room.ownerName,ownerUid:room.ownerUid,ownerTokenHash:room.ownerTokenHash,inviteTokenHash:room.inviteTokenHash,participants:[...room.participants.values()].map(({socketId,displayName,agoraUid,tokenHash})=>({socketId,displayName,agoraUid,tokenHash}))};}
  private queue(id:string,task:()=>Promise<void>){
    if(!this.persistence)return;
    const previous=this.writes.get(id)||Promise.resolve();
    const next=previous.catch(()=>undefined).then(task).catch(error=>console.error(`Room persistence write failed for ${id}`,error));
    this.writes.set(id,next);
    void next.finally(()=>{if(this.writes.get(id)===next)this.writes.delete(id);});
  }
  persist(room:Room){if(this.persistence){const snapshot=this.snapshot(room);this.queue(room.id,()=>this.persistence!.save(snapshot));}}
  newId(){let id="";do{const bytes=randomBytes(8);id=Array.from(bytes,b=>this.alphabet[b%this.alphabet.length]).join("");}while(this.rooms.has(id));return id;}
  create(id:string,ownerId:string,ownerName:string,ownerUid:number){const ownerToken=newSecret(),inviteToken=newSecret();const room:Room={id,ownerId,ownerName,ownerUid,ownerToken,ownerTokenHash:hashSecret(ownerToken),inviteToken,inviteTokenHash:hashSecret(inviteToken),ownerLivekitActive:false,participants:new Map(),activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",live:false};this.rooms.set(id,room);this.persist(room);return room;}
  nameFor(room:Room,name:string,except?:string){const taken=[room.ownerId===except?"":room.ownerName,...[...room.participants.values()].filter(p=>p.socketId!==except).map(p=>p.displayName)].map(value=>value.toLocaleLowerCase());let result=name,index=2;while(taken.includes(result.toLocaleLowerCase())){const suffix=` (${index++})`;result=`${name.slice(0,Math.max(1,20-suffix.length))}${suffix}`;}return result;}
  get(id:string){return this.rooms.get(id);}
  findByOwner(id:string){return [...this.rooms.values()].find(room=>room.ownerId===id);}
  findByParticipant(id:string){return [...this.rooms.values()].find(room=>room.participants.has(id));}
  isMember(room:Room,id:string){return room.ownerId===id||room.participants.has(id);}
  getUid(room:Room,id:string){return room.ownerId===id?room.ownerUid:room.participants.get(id)?.agoraUid;}
  reclaim(room:Room,token:unknown,id:string,inviteToken?:unknown){if(!validSecret(token)||!secretMatches(token,room.ownerTokenHash))return false;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);room.ownerDisconnectTimer=undefined;const old=room.ownerId;room.ownerId=id;room.ownerToken=token;if(validSecret(inviteToken)&&secretMatches(inviteToken,room.inviteTokenHash))room.inviteToken=inviteToken;else{const rotated=newSecret();room.inviteToken=rotated;room.inviteTokenHash=hashSecret(rotated);}if(room.activeScreenSharerId===old){if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);room.screenDisconnectTimer=undefined;room.activeScreenSharerId=id;}this.persist(room);return true;}
  remove(id:string){const room=this.rooms.get(id);if(!room)return;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);for(const participant of room.participants.values())if(participant.disconnectTimer)clearTimeout(participant.disconnectTimer);this.rooms.delete(id);if(this.persistence)this.queue(id,()=>this.persistence!.delete(id));}
  count(){return this.rooms.size;}
}
