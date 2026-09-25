export interface RecentRoom{
  roomId:string;
  owner:boolean;
  lastUsedAt:number;
}

const KEY="lunira-desktop-recent-rooms-v1";
const MAX_AGE=24*60*60*1000;

export function readRecentRooms():RecentRoom[]{
  try{
    localStorage.removeItem(KEY);
    const raw=JSON.parse(sessionStorage.getItem(KEY)||"[]") as RecentRoom[];
    if(!Array.isArray(raw))return[];
    const now=Date.now();
    return raw.filter(item=>typeof item?.roomId==="string"&&typeof item.owner==="boolean"&&Number.isFinite(item.lastUsedAt)&&now-item.lastUsedAt<MAX_AGE).map(item=>({roomId:item.roomId,owner:item.owner,lastUsedAt:item.lastUsedAt})).slice(0,5);
  }catch{return[];}
}

export function rememberRecentRoom(room:Omit<RecentRoom,"lastUsedAt">){
  try{
    const next=[{...room,lastUsedAt:Date.now()},...readRecentRooms().filter(item=>item.roomId!==room.roomId)].slice(0,5);
    sessionStorage.setItem(KEY,JSON.stringify(next));
  }catch{}
}

export function forgetRecentRoom(roomId:string){
  try{sessionStorage.setItem(KEY,JSON.stringify(readRecentRooms().filter(item=>item.roomId!==roomId)));}catch{}
}
