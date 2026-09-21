import { randomBytes } from "node:crypto";

export type ScreenProvider="agora"|"livekit";
export type Participant={socketId:string;agoraUid:number;token:string;livekitActive:boolean;disconnectTimer?:NodeJS.Timeout};
export type Room={id:string;ownerId:string;ownerUid:number;ownerToken:string;ownerLivekitActive:boolean;participants:Map<string,Participant>;activeScreenSharerId:string|null;activeScreenUid:number|null;screenProvider:ScreenProvider;live:boolean;ownerDisconnectTimer?:NodeJS.Timeout;screenDisconnectTimer?:NodeJS.Timeout};
const ROOM_RE=/^[A-Z2-9]{8}$/;
export const validRoomId=(value:unknown):value is string=>typeof value==="string"&&ROOM_RE.test(value);
export const newSecret=()=>randomBytes(32).toString("base64url");
export class RoomStore{
  private rooms=new Map<string,Room>();
  private alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  newId(){let id="";do{const bytes=randomBytes(8);id=Array.from(bytes,b=>this.alphabet[b%this.alphabet.length]).join("");}while(this.rooms.has(id));return id;}
  create(id:string,ownerId:string,ownerUid:number){const room:Room={id,ownerId,ownerUid,ownerToken:newSecret(),ownerLivekitActive:false,participants:new Map(),activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",live:false};this.rooms.set(id,room);return room;}
  get(id:string){return this.rooms.get(id);}
  findByOwner(id:string){return [...this.rooms.values()].find(room=>room.ownerId===id);}
  findByParticipant(id:string){return [...this.rooms.values()].find(room=>room.participants.has(id));}
  isMember(room:Room,id:string){return room.ownerId===id||room.participants.has(id);}
  getUid(room:Room,id:string){return room.ownerId===id?room.ownerUid:room.participants.get(id)?.agoraUid;}
  reclaim(room:Room,token:string,id:string){if(room.ownerToken!==token)return false;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);room.ownerDisconnectTimer=undefined;const old=room.ownerId;room.ownerId=id;if(room.activeScreenSharerId===old){if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);room.screenDisconnectTimer=undefined;room.activeScreenSharerId=id;}return true;}
  remove(id:string){const room=this.rooms.get(id);if(!room)return;if(room.ownerDisconnectTimer)clearTimeout(room.ownerDisconnectTimer);if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);for(const participant of room.participants.values())if(participant.disconnectTimer)clearTimeout(participant.disconnectTimer);this.rooms.delete(id);}
  count(){return this.rooms.size;}
}
