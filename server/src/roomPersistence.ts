export type PersistedParticipant={socketId:string;displayName:string;agoraUid:number;tokenHash?:string;token?:string};
export type PersistedRoom={id:string;ownerId:string;ownerName:string;ownerUid:number;ownerTokenHash?:string;ownerToken?:string;inviteTokenHash?:string;inviteToken?:string;participants:PersistedParticipant[]};

export interface RoomPersistence{
  load():Promise<PersistedRoom[]>;
  save(room:PersistedRoom):Promise<void>;
  delete(roomId:string):Promise<void>;
  readonly label:string;
}

type RedisResponse<T>={result?:T;error?:string};

class RedisRestRoomPersistence implements RoomPersistence{
  readonly label="redis-rest";
  private prefix="lumacast:room:";
  constructor(private url:string,private token:string,private ttlSeconds:number){}
  private async command<T>(...args:(string|number)[]):Promise<T>{
    const response=await fetch(this.url,{method:"POST",headers:{Authorization:`Bearer ${this.token}`,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(4_000)});
    const payload=await response.json() as RedisResponse<T>;
    if(!response.ok||payload.error)throw new Error(payload.error||`Redis HTTP ${response.status}`);
    return payload.result as T;
  }
  async load(){
    let cursor="0";const keys:string[]=[];
    do{const result=await this.command<[string,string[]]>("SCAN",cursor,"MATCH",`${this.prefix}*`,"COUNT",100);cursor=String(result?.[0]??"0");if(Array.isArray(result?.[1]))keys.push(...result[1]);}while(cursor!=="0");
    const rooms:PersistedRoom[]=[];
    for(let i=0;i<keys.length;i+=100){const batch=keys.slice(i,i+100);if(!batch.length)continue;const values=await this.command<(string|null)[]>("MGET",...batch);for(const value of values||[]){if(!value)continue;try{rooms.push(JSON.parse(value) as PersistedRoom);}catch{}}}
    return rooms;
  }
  async save(room:PersistedRoom){await this.command<string>("SET",`${this.prefix}${room.id}`,JSON.stringify(room),"EX",this.ttlSeconds);}
  async delete(roomId:string){await this.command<number>("DEL",`${this.prefix}${roomId}`);}
}

export function createRoomPersistenceFromEnv():RoomPersistence|null{
  const url=process.env.UPSTASH_REDIS_REST_URL?.trim(),token=process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if(!url&&!token)return null;
  if(!url||!token){console.warn("Redis persistence disabled: configure both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.");return null;}
  const configured=Number(process.env.ROOM_REDIS_TTL_SECONDS||7200),ttl=Number.isFinite(configured)&&configured>=60?Math.floor(configured):7200;
  return new RedisRestRoomPersistence(url.replace(/\/$/,""),token,ttl);
}
