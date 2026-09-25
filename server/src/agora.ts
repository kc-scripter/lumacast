import { randomInt } from "node:crypto";
import agoraToken from "agora-token";

const { RtcRole, RtcTokenBuilder }=agoraToken;

const TOKEN_TTL_SECONDS=3_600;
const credential=(name:"AGORA_APP_ID"|"AGORA_APP_CERTIFICATE")=>{const value=process.env[name];if(!value)throw new Error(`${name} não configurada.`);if(!/^[0-9a-f]{32}$/i.test(value))throw new Error(`${name} inválida.`);return value;};
export const agoraConfigured=()=>/^[0-9a-f]{32}$/i.test(process.env.AGORA_APP_ID||"")&&/^[0-9a-f]{32}$/i.test(process.env.AGORA_APP_CERTIFICATE||"");
export const optionalAgoraCredentials=(roomId:string,uid:number,role:AgoraRole)=>agoraConfigured()?createAgoraCredentials(roomId,uid,role):{};

export type AgoraRole="broadcaster"|"viewer";
export const agoraChannel=(roomId:string)=>`lumacast-${roomId.toLowerCase()}`;
export const createAgoraUid=()=>randomInt(1,4_294_967_296);
export function createAgoraCredentials(roomId:string,uid:number,role:AgoraRole){const appId=credential("AGORA_APP_ID"),certificate=credential("AGORA_APP_CERTIFICATE"),channel=agoraChannel(roomId),token=RtcTokenBuilder.buildTokenWithUid(appId,certificate,channel,uid,role==="broadcaster"?RtcRole.PUBLISHER:RtcRole.SUBSCRIBER,TOKEN_TTL_SECONDS,TOKEN_TTL_SECONDS);return{agoraAppId:appId,agoraChannel:channel,agoraUid:uid,agoraToken:token};}
