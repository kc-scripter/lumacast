const ROOM_RE=/^[A-Z2-9]{8}$/;
const INVITE_RE=/^[A-Za-z0-9_-]{43}$/;

export type RoomInvite={roomId:string;inviteToken:string};

export function buildRoomInvite(base:string,roomId:string,inviteToken:string){
  if(!ROOM_RE.test(roomId)||!INVITE_RE.test(inviteToken))return "";
  const url=new URL(base);
  url.pathname="/";
  url.search="";
  url.searchParams.set("room",roomId);
  url.hash=`invite=${encodeURIComponent(inviteToken)}`;
  return url.toString();
}

export function parseRoomInvite(value:string,base?:string):RoomInvite|null{
  const trimmed=value.trim();
  if(!trimmed)return null;
  const compact=trimmed.match(/^([A-Z2-9]{8})#invite=([A-Za-z0-9_-]{43})$/i);
  if(compact)return{roomId:compact[1].toUpperCase(),inviteToken:compact[2]};
  try{
    const url=new URL(trimmed,base||globalThis.location?.origin||"https://lunirascreen.onrender.com");
    const queryRoom=url.searchParams.get("room")?.toUpperCase();
    const pathRoom=url.pathname.match(/^\/watch\/([A-Z2-9]{8})\/?$/i)?.[1]?.toUpperCase();
    const roomId=queryRoom||pathRoom||"";
    const inviteToken=new URLSearchParams(url.hash.replace(/^#/,"")).get("invite")||"";
    return ROOM_RE.test(roomId)&&INVITE_RE.test(inviteToken)?{roomId,inviteToken}:null;
  }catch{return null;}
}
