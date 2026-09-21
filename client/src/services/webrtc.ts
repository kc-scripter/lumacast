import type { IAgoraRTCClient, UID } from "agora-rtc-sdk-ng";
import type { FrameRate, Quality, StreamStats } from "../types";

type ExtendedDisplayMediaOptions=DisplayMediaStreamOptions&{systemAudio?:"include"|"exclude";windowAudio?:"exclude"|"window"|"system";surfaceSwitching?:"include"|"exclude";selfBrowserSurface?:"include"|"exclude"};
export function displayConstraints(quality:Quality,frameRate:FrameRate):DisplayMediaStreamOptions{
  const height=quality==="1080p"?1080:quality==="720p"?720:undefined,width=quality==="1080p"?1920:quality==="720p"?1280:undefined,firefox=/Firefox\//.test(navigator.userAgent);
  const options:ExtendedDisplayMediaOptions={
    // Firefox's native capture path can follow the display refresh rate. Asking
    // it to crop/scale the source first commonly keeps desktop capture at 30 FPS.
    video:{frameRate:{ideal:frameRate,max:frameRate},...(firefox?{resizeMode:"none"}:width?{width:{ideal:width},height:{ideal:height}}:{})},
    audio:true,
    systemAudio:"include",
    windowAudio:"system",
    surfaceSwitching:"include",
    selfBrowserSurface:"exclude"
  };
  return options;
}
export async function readAgoraStats(client:IAgoraRTCClient,stream?:MediaStream|null,remoteUid?:UID|null):Promise<StreamStats>{const rtc=client.getRTCStats(),settings=stream?.getVideoTracks()[0]?.getSettings();if(remoteUid!==undefined&&remoteUid!==null){const video=client.getRemoteVideoStats()[String(remoteUid)];return{resolution:video?.receiveResolutionWidth&&video?.receiveResolutionHeight?`${video.receiveResolutionWidth} × ${video.receiveResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video?.receiveFrameRate??video?.decodeFrameRate??null,bitrateKbps:video?Math.round(video.receiveBitrate/1000):null,rttMs:rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video?.receivePacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}const video=client.getLocalVideoStats();return{resolution:video.sendResolutionWidth&&video.sendResolutionHeight?`${video.sendResolutionWidth} × ${video.sendResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video.sendFrameRate??null,captureFps:settings?.frameRate??video.captureFrameRate??null,bitrateKbps:video.sendBitrate>=0?Math.round(video.sendBitrate/1000):null,rttMs:video.sendRttMs>0?Math.round(video.sendRttMs):rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video.sendPacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}
