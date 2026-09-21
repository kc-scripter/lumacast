import { randomBytes } from "node:crypto";

export type Room = { id:string; broadcasterId:string; broadcasterUid:number; token:string; viewers:Map<string,number>; live:boolean; disconnectTimer?:NodeJS.Timeout };
const ROOM_RE=/^[A-Z2-9]{8}$/;
export const validRoomId=(value:unknown):value is string=>typeof value==="string"&&ROOM_RE.test(value);

export class RoomStore {
  private rooms=new Map<string,Room>();
  private alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  newId(){let id="";do{const bytes=randomBytes(8);id=Array.from(bytes,b=>this.alphabet[b%this.alphabet.length]).join("");}while(this.rooms.has(id));return id;}
  create(id:string,broadcasterId:string,broadcasterUid:number){const room:Room={id,broadcasterId,broadcasterUid,token:randomBytes(32).toString("base64url"),viewers:new Map(),live:false};this.rooms.set(room.id,room);return room;}
  get(id:string){return this.rooms.get(id);}
  findByBroadcaster(socketId:string){return [...this.rooms.values()].find(r=>r.broadcasterId===socketId);}
  findByViewer(socketId:string){return [...this.rooms.values()].find(r=>r.viewers.has(socketId));}
  isBroadcaster(id:string,socketId:string){return this.rooms.get(id)?.broadcasterId===socketId;}
  reclaim(id:string,token:string,newSocketId:string){const room=this.rooms.get(id);if(!room||room.token!==token)return null;if(room.disconnectTimer)clearTimeout(room.disconnectTimer);room.disconnectTimer=undefined;room.broadcasterId=newSocketId;return room;}
  scheduleBroadcasterRemoval(id:string,onExpired:(room:Room)=>void){const room=this.rooms.get(id);if(!room)return;room.disconnectTimer=setTimeout(()=>{if(this.rooms.get(id)===room){this.rooms.delete(id);onExpired(room);}},30_000);}
  delete(id:string){const room=this.rooms.get(id);if(room?.disconnectTimer)clearTimeout(room.disconnectTimer);this.rooms.delete(id);}
  count(){return this.rooms.size;}
}
