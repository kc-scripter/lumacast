import type { IAgoraRTCClient, UID } from "agora-rtc-sdk-ng";
import type { FrameRate, Quality, StreamStats } from "../types";

type ExtendedDisplayMediaOptions=DisplayMediaStreamOptions&{systemAudio?:"include"|"exclude";windowAudio?:"exclude"|"window"|"system"};
export function displayConstraints(quality:Quality,frameRate:FrameRate):DisplayMediaStreamOptions{
  const height=quality==="1080p"?1080:quality==="720p"?720:undefined,width=quality==="1080p"?1920:quality==="720p"?1280:undefined;
  const options:ExtendedDisplayMediaOptions={
    video:{frameRate:{ideal:frameRate,max:frameRate},...(width?{width:{ideal:width},height:{ideal:height}}:{})},
    audio:true,
    systemAudio:"include",
    windowAudio:"system"
  };
  return options;
}
export async function readAgoraStats(client:IAgoraRTCClient,stream?:MediaStream|null,remoteUid?:UID|null):Promise<StreamStats>{const rtc=client.getRTCStats(),settings=stream?.getVideoTracks()[0]?.getSettings();if(remoteUid!==undefined&&remoteUid!==null){const video=client.getRemoteVideoStats()[String(remoteUid)];return{resolution:video?.receiveResolutionWidth&&video?.receiveResolutionHeight?`${video.receiveResolutionWidth} × ${video.receiveResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video?.receiveFrameRate??video?.decodeFrameRate??settings?.frameRate??null,bitrateKbps:video?Math.round(video.receiveBitrate/1000):null,rttMs:rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video?.receivePacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}const video=client.getLocalVideoStats();return{resolution:video.sendResolutionWidth&&video.sendResolutionHeight?`${video.sendResolutionWidth} × ${video.sendResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video.sendFrameRate??video.captureFrameRate??settings?.frameRate??null,bitrateKbps:video.sendBitrate>=0?Math.round(video.sendBitrate/1000):null,rttMs:video.sendRttMs>0?Math.round(video.sendRttMs):rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video.sendPacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}
