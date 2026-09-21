import { AccessToken,TrackSource } from "livekit-server-sdk";

const required=(name:"LIVEKIT_URL"|"LIVEKIT_API_KEY"|"LIVEKIT_API_SECRET")=>{const value=process.env[name];if(!value)throw new Error(`${name} não configurada.`);return value;};
export async function createLiveKitToken(roomId:string,identity:string,screen=false){required("LIVEKIT_URL");const token=new AccessToken(required("LIVEKIT_API_KEY"),required("LIVEKIT_API_SECRET"),{identity,ttl:"1h"});token.addGrant({room:`lumacast-${roomId.toLowerCase()}`,roomJoin:true,canSubscribe:true,canPublish:true,canPublishSources:screen?[TrackSource.CAMERA,TrackSource.MICROPHONE,TrackSource.SCREEN_SHARE,TrackSource.SCREEN_SHARE_AUDIO]:[TrackSource.CAMERA,TrackSource.MICROPHONE],canPublishData:false});return token.toJwt();}
