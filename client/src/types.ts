export type Quality = "auto" | "720p" | "1080p";
export type FrameRate = 30 | 60;
export type ConnectionLabel = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
export interface StreamStats { resolution:string; fps:number; bitrateKbps:number; rttMs:number; packetsLost:number; iceState:string; peerState:string; }
export interface RoomAck { ok:boolean; roomId?:string; broadcasterToken?:string; dailyUrl?:string; dailyToken?:string; error?:string; live?:boolean; viewers?:number; }
export interface JoinAck { ok:boolean; dailyUrl?:string; dailyToken?:string; error?:string; live?:boolean; }
