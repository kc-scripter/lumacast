export type Quality = "auto" | "720p" | "1080p";
export type FrameRate = 30 | 60;
export type CameraPreset = "720p40" | "480p60";
export type ConnectionLabel = "connecting" | "connected" | "reconnecting" | "disconnected" | "failed";
export interface StreamStats { resolution:string; fps:number|null; captureFps?:number|null; bitrateKbps:number|null; rttMs:number|null; packetsLost:number|null; iceState:string; peerState:string; }
export interface AgoraCredentials { agoraAppId:string; agoraChannel:string; agoraUid:number; agoraToken:string; }
export interface TokenAck { ok:boolean; agoraToken?:string; error?:string; }
export type ScreenProvider="agora"|"livekit";
export interface RoomParticipant { id:string; displayName:string; }
export interface RoomState {live:boolean;count:number;activeScreenSharerId:string|null;activeScreenUid:number|null;activeScreenSharerName:string|null;screenProvider:ScreenProvider;livekitActive:boolean;ownerName:string;participants:RoomParticipant[];}
export interface RoomAck extends Partial<AgoraCredentials>,Partial<RoomState> { ok:boolean; roomId?:string; ownerToken?:string; broadcasterToken?:string; participantToken?:string; error?:string; viewers?:number; }
export interface JoinAck extends Partial<AgoraCredentials>,Partial<RoomState> { ok:boolean; participantToken?:string; error?:string; }
