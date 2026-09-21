export type Quality = "auto" | "720p" | "1080p";
export type FrameRate = 30 | 60;
export type ConnectionLabel = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
export interface StreamStats { resolution:string; fps:number|null; bitrateKbps:number|null; rttMs:number|null; packetsLost:number|null; iceState:string; peerState:string; }
export interface AgoraCredentials { agoraAppId:string; agoraChannel:string; agoraUid:number; agoraToken:string; }
export interface RoomAck extends Partial<AgoraCredentials> { ok:boolean; roomId?:string; broadcasterToken?:string; error?:string; live?:boolean; viewers?:number; }
export interface JoinAck extends Partial<AgoraCredentials> { ok:boolean; error?:string; live?:boolean; }
export interface TokenAck { ok:boolean; agoraToken?:string; error?:string; }
