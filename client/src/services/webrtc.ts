import type { IAgoraRTCClient, UID } from "agora-rtc-sdk-ng";
import type { FrameRate, Quality, StreamStats } from "../types";

type ExtendedDisplayMediaOptions=DisplayMediaStreamOptions&{systemAudio?:"include"|"exclude";windowAudio?:"exclude"|"window"|"system"};
type ExtendedVideoConstraints=MediaTrackConstraints&{resizeMode?:"none"|"crop-and-scale"};
export function displayConstraints(quality:Quality,frameRate:FrameRate):DisplayMediaStreamOptions{
  const height=quality==="1080p"?1080:quality==="720p"?720:undefined,width=quality==="1080p"?1920:quality==="720p"?1280:undefined,isFirefox=/Firefox\//.test(navigator.userAgent);
  // Firefox's desktop capture uses the native-refresh path with resizeMode:none.
  // Supplying width/height there can move capture back to the 30 FPS scaling path.
  const video:ExtendedVideoConstraints=isFirefox&&frameRate===60
    ?{frameRate:60,resizeMode:"none"}
    :{frameRate:{ideal:frameRate,max:frameRate},...(width?{width:{ideal:width},height:{ideal:height}}:{})};
  const options:ExtendedDisplayMediaOptions={video,audio:true,systemAudio:"include",windowAudio:"system"};
  return options;
}
export async function readAgoraStats(client:IAgoraRTCClient,stream?:MediaStream|null,remoteUid?:UID|null):Promise<StreamStats>{const rtc=client.getRTCStats(),settings=stream?.getVideoTracks()[0]?.getSettings();if(remoteUid!==undefined&&remoteUid!==null){const video=client.getRemoteVideoStats()[String(remoteUid)];return{resolution:video?.receiveResolutionWidth&&video?.receiveResolutionHeight?`${video.receiveResolutionWidth} × ${video.receiveResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video?.receiveFrameRate??video?.decodeFrameRate??null,bitrateKbps:video?Math.round(video.receiveBitrate/1000):null,rttMs:rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video?.receivePacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}const video=client.getLocalVideoStats();return{resolution:video.sendResolutionWidth&&video.sendResolutionHeight?`${video.sendResolutionWidth} × ${video.sendResolutionHeight}`:settings?.width&&settings?.height?`${settings.width} × ${settings.height}`:"—",fps:video.sendFrameRate??null,bitrateKbps:video.sendBitrate>=0?Math.round(video.sendBitrate/1000):null,rttMs:video.sendRttMs>0?Math.round(video.sendRttMs):rtc.RTT>0?Math.round(rtc.RTT):null,packetsLost:video.sendPacketsLost??null,iceState:"Agora SFU",peerState:client.connectionState};}
