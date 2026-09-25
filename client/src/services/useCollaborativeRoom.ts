import AgoraRTC,{type IAgoraRTCClient,type IAgoraRTCRemoteUser,type ILocalAudioTrack,type ILocalVideoTrack} from "agora-rtc-sdk-ng";
import { Room,RoomEvent,Track,type Participant,type RemoteTrack,type RemoteTrackPublication,type TrackPublication,type TrackPublishOptions,type VideoCaptureOptions } from "livekit-client";
import { useCallback,useEffect,useRef,useState } from "react";
import { safeSessionGet,safeSessionRemove,safeSessionSet } from "./browser";
import { recordDiagnostic } from "./diagnostics";
import { connectSocket } from "./socket";
import { displayConstraints,readAgoraStats } from "./webrtc";
import type { AgoraCredentials,CameraPreset,FrameRate,JoinAck,Quality,RoomAck,RoomState,ScreenProvider,StreamStats,TokenAck } from "../types";

type Camera={identity:string;track:MediaStreamTrack;local:boolean};
type ScreenAck=RoomAck&{error?:string};
type LiveKitAck={ok:boolean;livekitUrl?:string;livekitToken?:string;error?:string};
type ExtendedMediaTrackConstraints=MediaTrackConstraints&{resizeMode?:"none"|"crop-and-scale"};
const initial:RoomState={live:false,count:0,activeScreenSharerId:null,activeScreenUid:null,activeScreenSharerName:null,screenProvider:"agora",livekitActive:false,ownerName:"",locked:false,guestCodeEnabled:false,participants:[]};
const valid=(track?:MediaStreamTrack|null):track is MediaStreamTrack=>!!track&&track.readyState==="live";
const emitAck=<T,>(event:string,payload:object)=>new Promise<T>((resolve,reject)=>connectSocket().timeout(12_000).emit(event,payload,(error:Error|null,ack:T)=>error?reject(error):resolve(ack)));
const videoSize=(quality:Quality,settings:MediaTrackSettings)=>quality==="1080p"?{width:1920,height:1080}:quality==="720p"?{width:1280,height:720}:{width:settings.width||1920,height:settings.height||1080};
const videoBitrate=(quality:Quality,fps:FrameRate)=>quality==="1080p"?(fps===60?7500:4500):quality==="720p"?(fps===60?4500:2500):(fps===60?6000:3500);
const captureConstraints=(quality:Quality,settings:MediaTrackSettings,captureFps:FrameRate=60):ExtendedMediaTrackConstraints=>{
  if(/Firefox\//.test(navigator.userAgent))return{resizeMode:"none",frameRate:{ideal:captureFps,max:captureFps}};
  const size=videoSize(quality,settings);
  return{width:{ideal:size.width},height:{ideal:size.height},frameRate:{ideal:captureFps,max:captureFps}};
};
const cameraPresetConfig=(preset:CameraPreset)=>preset==="480p60"
  ?{width:854,height:480,fps:60,maxBitrate:1_200_000}
  :{width:1280,height:720,fps:40,maxBitrate:1_800_000};
const cameraCaptureOptions=(preset:CameraPreset):VideoCaptureOptions=>{
  const {width,height,fps}=cameraPresetConfig(preset);
  return{resolution:{width,height},frameRate:{ideal:fps,max:fps}};
};
const cameraPublishOptions=(preset:CameraPreset):TrackPublishOptions=>{
  const {fps,maxBitrate}=cameraPresetConfig(preset);
  return{source:Track.Source.Camera,simulcast:true,degradationPreference:"maintain-framerate",videoEncoding:{maxBitrate,maxFramerate:fps,priority:"high"}};
};
const screenLivekitPublishOptions=(quality:Quality,fps:FrameRate):TrackPublishOptions=>({
  source:Track.Source.ScreenShare,
  simulcast:false,
  degradationPreference:"maintain-framerate",
  videoEncoding:{maxBitrate:videoBitrate(quality,fps)*1000,maxFramerate:fps,priority:"high"}
});

export function useCollaborativeRoom(owner:boolean,requestedRoomId?:string,requestedInviteToken?:string){
  const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),pendingScreenRef=useRef<MediaStream|null>(null),subscriberRef=useRef<IAgoraRTCClient|null>(null),screenClientRef=useRef<IAgoraRTCClient|null>(null),screenTracksRef=useRef<(ILocalVideoTrack|ILocalAudioTrack)[]>([]),retiredScreenTracksRef=useRef<(ILocalVideoTrack|ILocalAudioTrack)[]>([]),livekitRef=useRef<Room|null>(null),livekitPromiseRef=useRef<Promise<Room>|null>(null),livekitAudioRef=useRef<Map<string,HTMLMediaElement>>(new Map()),screenLivekitTracksRef=useRef<MediaStreamTrack[]>([]),credentialsRef=useRef<AgoraCredentials|null>(null),screenCredentialsRef=useRef<AgoraCredentials|null>(null),roomIdRef=useRef(requestedRoomId||""),stateRef=useRef<RoomState>(initial),cameraRef=useRef<MediaStreamTrack|null>(null),cameraPresetRef=useRef<CameraPreset>("720p40"),cameraRestartingRef=useRef(false),cameraPresetSwitchRef=useRef<Promise<void>|null>(null),fallbackTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null),publishingRef=useRef(false),stoppingRef=useRef(false),socketIdRef=useRef(""),screenConfigRef=useRef<{quality:Quality;fps:FrameRate}>({quality:"1080p",fps:30}),lastVideoTimeRef=useRef(0),stalledTicksRef=useRef(0);
  const startingRef=useRef(false),fallbackPromiseRef=useRef<Promise<boolean>|null>(null),screenAudioBusyRef=useRef(false),screenAudioMutedRef=useRef(false),recoveryBusyRef=useRef(false);
  const [roomId,setRoomId]=useState(requestedRoomId||""),[inviteToken,setInviteToken]=useState(""),[credentials,setCredentials]=useState<AgoraCredentials|null>(null),[roomState,setRoomState]=useState<RoomState>(initial),[ready,setReady]=useState(false),[status,setStatus]=useState("Conectando"),[error,setError]=useState(""),[stats,setStats]=useState<StreamStats|null>(null),[cameras,setCameras]=useState<Camera[]>([]),[cameraOn,setCameraOn]=useState(false),[cameraPreset,setCameraPresetState]=useState<CameraPreset>("720p40"),[switching,setSwitching]=useState(false),[muted,setMuted]=useState(false),[localScreenActive,setLocalScreenActive]=useState(false),[previewStream,setPreviewStream]=useState<MediaStream|null>(null),[recoveryNonce,setRecoveryNonce]=useState(0),[recovering,setRecovering]=useState(false),[kicked,setKicked]=useState(false);
  const updateState=useCallback((next:Partial<RoomState>)=>{stateRef.current={...stateRef.current,...next};setRoomState(stateRef.current);},[]);
  const putCamera=useCallback((camera:Camera)=>setCameras(current=>[...current.filter(item=>item.identity!==camera.identity),camera]),[]);
  const removeCamera=useCallback((identity:string)=>setCameras(current=>current.filter(item=>item.identity!==identity)),[]);
  const bindCameraTrack=useCallback((track:MediaStreamTrack,preset:CameraPreset)=>{
    const {fps}=cameraPresetConfig(preset),settings=track.getSettings();
    cameraRef.current=track;
    putCamera({identity:socketIdRef.current,track,local:true});
    setCameraOn(true);
    console.info("Lunira Screen camera preset",{preset,requested:cameraPresetConfig(preset),actual:{width:settings.width,height:settings.height,frameRate:settings.frameRate}});
    if(settings.frameRate&&settings.frameRate<fps-5)console.warn(`Camera limitada pelo dispositivo/navegador a ${Math.round(settings.frameRate)} FPS (solicitado ${fps}).`);
    track.addEventListener("ended",()=>{
      if(cameraRestartingRef.current)return;
      if(cameraRef.current===track){
        cameraRef.current=null;
        removeCamera(socketIdRef.current);
        setCameraOn(false);
        connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:screenLivekitTracksRef.current.some(item=>item.kind==="audio"&&valid(item))||!!streamRef.current&&stateRef.current.screenProvider==="livekit"});
      }
    },{once:true});
  },[putCamera,removeCamera]);
  const clearVideo=useCallback(()=>{if(videoRef.current)videoRef.current.srcObject=null;setStats(null);},[]);
  const showVideo=useCallback((track:MediaStreamTrack)=>{if(!videoRef.current)return;videoRef.current.srcObject=new MediaStream([track]);void videoRef.current.play().catch(()=>undefined);},[]);
  const acquireScreen=useCallback(async(quality:Quality,fps:FrameRate)=>{
    const stream=await navigator.mediaDevices.getDisplayMedia(displayConstraints(quality,60));
    const video=stream.getVideoTracks()[0];
    if(!valid(video)){stream.getTracks().forEach(track=>track.stop());throw new Error("A captura não forneceu vídeo ativo.");}
    const initialCaptureFps=video.getSettings().frameRate;
    if(!initialCaptureFps||initialCaptureFps<50){
      try{await video.applyConstraints(captureConstraints(quality,video.getSettings()));}
      catch(cause){console.warn("Display capture 60 FPS applyConstraints failed",cause);}
    }
    try{video.contentHint="motion";}catch{}
    const capturedFps=video.getSettings().frameRate;
    if(capturedFps&&capturedFps<50&&fps===60)setError(`O navegador entregou a captura a ${Math.round(capturedFps)} FPS, mesmo com 60 FPS selecionado.`);
    return stream;
  },[]);
  const cancelScreenPreview=useCallback(()=>{
    const pending=pendingScreenRef.current;
    pendingScreenRef.current=null;
    setPreviewStream(null);
    pending?.getTracks().forEach(track=>track.stop());
  },[]);
  const prepareScreen=useCallback(async(quality:Quality,fps:FrameRate)=>{
    cancelScreenPreview();
    try{
      const stream=await acquireScreen(quality,fps);
      pendingScreenRef.current=stream;
      setPreviewStream(stream);
      recordDiagnostic("info","capture","Fonte de tela selecionada",stream.getVideoTracks()[0]?.getSettings());
      return true;
    }catch(cause){
      const name=cause instanceof DOMException?cause.name:"";
      setError(name==="NotAllowedError"?"A seleção de tela foi cancelada.":"Não foi possível capturar a tela.");
      recordDiagnostic("warn","capture","Falha ao selecionar fonte de tela",cause);
      return false;
    }
  },[acquireScreen,cancelScreenPreview]);
  const renew=useCallback(async(client:IAgoraRTCClient,screen=false)=>{const ack=await emitAck<TokenAck>("renew-agora-token",{roomId:roomIdRef.current,screen});if(!ack.ok||!ack.agoraToken)throw new Error(ack.error||"Token Agora inválido.");await client.renewToken(ack.agoraToken);},[]);
  const tuneAgoraSender=useCallback(async(track:ILocalVideoTrack,quality:Quality,fps:FrameRate,bitrateMax:number)=>{
    const source=track.getMediaStreamTrack(),settings=source.getSettings(),size=videoSize(quality,settings);
    try{
      await track.setEncoderConfiguration({
        width:size.width,
        height:size.height,
        frameRate:fps,
        bitrateMax
      });
    }catch(cause){console.warn("Agora encoder configuration failed",cause);}
    if(/Chrome|Chromium|Edg\//.test(navigator.userAgent)){
      try{await track.setOptimizationMode("motion");}catch(cause){console.warn("Agora motion optimization failed",cause);}
    }
    try{
      const sender=track.getRTCRtpTransceiver()?.sender;
      if(sender){
        const params=sender.getParameters();
        if(!params.encodings?.length)params.encodings=[{}];
        for(const encoding of params.encodings){
          encoding.maxFramerate=fps;
          encoding.maxBitrate=bitrateMax*1000;
          encoding.priority="high";
        }
        params.degradationPreference="maintain-framerate";
        await sender.setParameters(params);
      }
    }catch(cause){console.warn("WebRTC sender tuning failed",cause);}
  },[]);
  const ensureLivekit=useCallback(async(forceNew=false):Promise<Room>=>{
    if(!forceNew&&livekitRef.current&&livekitRef.current.state!=="disconnected")return livekitRef.current;
    if(livekitPromiseRef.current){const pending=livekitPromiseRef.current;if(!forceNew)return pending;await pending;}
    const pending=(async()=>{
      if(livekitRef.current){
        const previous=livekitRef.current;
        livekitRef.current=null;
        await previous.disconnect(false);
        livekitAudioRef.current.forEach(element=>element.remove());
        livekitAudioRef.current.clear();
        setCameras(current=>current.filter(camera=>camera.local&&valid(camera.track)).map(camera=>({...camera,identity:socketIdRef.current})));
      }
      const ack=await emitAck<LiveKitAck>("get-livekit-token",{roomId:roomIdRef.current});
      if(!ack.ok||!ack.livekitUrl||!ack.livekitToken)throw new Error(ack.error||"LiveKit indisponível.");
      const room=new Room({adaptiveStream:true,dynacast:true});
      const onSubscribed=(track:RemoteTrack,publication:RemoteTrackPublication,participant:{identity:string})=>{
        if(publication.source===Track.Source.Camera){
          putCamera({identity:participant.identity,track:track.mediaStreamTrack,local:false});
        }else if(publication.source===Track.Source.ScreenShare&&stateRef.current.screenProvider==="livekit"){
          showVideo(track.mediaStreamTrack);
        }else if(publication.source===Track.Source.ScreenShareAudio&&track.kind===Track.Kind.Audio){
          livekitAudioRef.current.get(publication.trackSid)?.remove();
          const element=track.attach();
          element.autoplay=true;
          element.style.display="none";
          document.body.append(element);
          void element.play().catch(()=>undefined);
          livekitAudioRef.current.set(publication.trackSid,element);
        }
      };
      const onUnsubscribed=(track:RemoteTrack,publication:RemoteTrackPublication,participant:{identity:string})=>{
        track.detach().forEach(element=>element.remove());
        if(publication.source===Track.Source.Camera)removeCamera(participant.identity);
        if(publication.source===Track.Source.ScreenShare&&stateRef.current.screenProvider==="livekit")clearVideo();
        livekitAudioRef.current.get(publication.trackSid)?.remove();
        livekitAudioRef.current.delete(publication.trackSid);
      };
      const onTrackMuted=(publication:TrackPublication,participant:Participant)=>{
        if(publication.source===Track.Source.Camera&&participant.identity!==socketIdRef.current)removeCamera(participant.identity);
      };
      const onTrackUnmuted=(publication:TrackPublication,participant:Participant)=>{
        const media=publication.track?.mediaStreamTrack;
        if(publication.source===Track.Source.Camera&&participant.identity!==socketIdRef.current&&valid(media))putCamera({identity:participant.identity,track:media,local:false});
      };
      room.on(RoomEvent.TrackSubscribed,onSubscribed);
      room.on(RoomEvent.TrackUnsubscribed,onUnsubscribed);
      room.on(RoomEvent.TrackMuted,onTrackMuted);
      room.on(RoomEvent.TrackUnmuted,onTrackUnmuted);
      room.on(RoomEvent.TrackUnpublished,(publication,participant)=>{if(publication.source===Track.Source.Camera)removeCamera(participant.identity);});
      room.on(RoomEvent.ParticipantDisconnected,participant=>removeCamera(participant.identity));
      try{
        await room.connect(ack.livekitUrl,ack.livekitToken);
        livekitRef.current=room;
        if(cameraRef.current&&!valid(cameraRef.current)){cameraRef.current=null;setCameraOn(false);removeCamera(socketIdRef.current);}
        if(valid(cameraRef.current)){
          const preset=cameraPresetRef.current,previousTrack=cameraRef.current;
          cameraRestartingRef.current=true;
          try{
            previousTrack.stop();
            const cameraPublication=await room.localParticipant.setCameraEnabled(true,cameraCaptureOptions(preset),cameraPublishOptions(preset));
            const nextCameraTrack=cameraPublication?.track?.mediaStreamTrack;
            if(!valid(nextCameraTrack))throw new Error("A câmera não forneceu vídeo ativo após a reconexão.");
            bindCameraTrack(nextCameraTrack,preset);
          }finally{cameraRestartingRef.current=false;}
        }
        if(stateRef.current.activeScreenSharerId===socketIdRef.current){
          for(const track of screenLivekitTracksRef.current.filter(valid)){
            if(track.kind==="video"&&stateRef.current.screenProvider!=="livekit")continue;
            await room.localParticipant.publishTrack(track,track.kind==="video"?screenLivekitPublishOptions(screenConfigRef.current.quality,screenConfigRef.current.fps):{source:Track.Source.ScreenShareAudio});
          }
        }
        return room;
      }catch(cause){
        if(livekitRef.current===room)livekitRef.current=null;
        await room.disconnect(false);
        throw cause;
      }
    })();
    livekitPromiseRef.current=pending;
    try{return await pending;}finally{if(livekitPromiseRef.current===pending)livekitPromiseRef.current=null;}
  },[bindCameraTrack,clearVideo,putCamera,removeCamera,showVideo]);
  const applyCameraPreset=useCallback(async()=>{
    if(cameraPresetSwitchRef.current)return cameraPresetSwitchRef.current;
    const pending=(async()=>{
      while(valid(cameraRef.current)){
        const preset=cameraPresetRef.current,room=livekitRef.current;
        if(!room||room.state==="disconnected")return;
        const publication=room.localParticipant.getTrackPublication(Track.Source.Camera);
        const localTrack=publication?.videoTrack;
        if(!localTrack)return;
        cameraRestartingRef.current=true;
        try{
          // LiveKit 2.22.x recomputes sender encodings during restartTrack using publishOptions.
          // Updating both before restart keeps the same publication while applying the new
          // resolution/FPS/bitrate profile to capture and encoder.
          localTrack.publishOptions=cameraPublishOptions(preset);
          await localTrack.restartTrack(cameraCaptureOptions(preset));
          const nextTrack=localTrack.mediaStreamTrack;
          if(!valid(nextTrack))throw new Error("A câmera não forneceu vídeo após trocar o preset.");
          bindCameraTrack(nextTrack,preset);
          setError("");
        }catch(cause){
          console.warn("LiveKit seamless camera preset switch failed; recreating camera track",cause);
          try{
            const currentPublication=room.localParticipant.getTrackPublication(Track.Source.Camera);
            if(currentPublication?.track)await room.localParticipant.unpublishTrack(currentPublication.track,true);
            const recreated=await room.localParticipant.setCameraEnabled(true,cameraCaptureOptions(preset),cameraPublishOptions(preset));
            const nextTrack=recreated?.track?.mediaStreamTrack;
            if(!valid(nextTrack))throw new Error("A câmera não forneceu vídeo após recriar a faixa.");
            bindCameraTrack(nextTrack,preset);
            setError("");
          }catch(fallbackCause){
            console.error("LiveKit camera preset fallback failed",fallbackCause);
            setError("Não foi possível trocar a qualidade da câmera.");
            return;
          }
        }finally{
          cameraRestartingRef.current=false;
        }
        if(cameraPresetRef.current===preset)break;
      }
    })();
    cameraPresetSwitchRef.current=pending;
    try{await pending;}finally{if(cameraPresetSwitchRef.current===pending)cameraPresetSwitchRef.current=null;}
  },[bindCameraTrack]);
  const setCameraPreset=useCallback((preset:CameraPreset)=>{
    cameraPresetRef.current=preset;
    setCameraPresetState(preset);
    if(valid(cameraRef.current))void applyCameraPreset();
  },[applyCameraPreset]);
  const publishScreenAudioLivekit=useCallback(async(stream:MediaStream)=>{
    const audio=stream.getAudioTracks().find(valid);
    if(!audio)return false;
    const room=await ensureLivekit();
    audio.enabled=true;
    if(!screenLivekitTracksRef.current.includes(audio)){
      await room.localParticipant.publishTrack(audio,{source:Track.Source.ScreenShareAudio});
      screenLivekitTracksRef.current=[...screenLivekitTracksRef.current.filter(track=>track.kind!=="audio"),audio];
    }
    connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:true});
    return true;
  },[ensureLivekit]);
  const fallback=useCallback(async():Promise<boolean>=>{
    if(fallbackPromiseRef.current)return fallbackPromiseRef.current;
    const stream=streamRef.current;
    if(!stream||!valid(stream.getVideoTracks()[0])||stateRef.current.screenProvider==="livekit")return false;
    const pending=(async()=>{
      setSwitching(true);
      try{
        const ack=await emitAck<{ok:boolean;error?:string}>("screen-provider-changed",{roomId:roomIdRef.current,provider:"livekit"});
        if(!ack.ok)throw new Error(ack.error||"Fallback recusado.");
        if(streamRef.current!==stream)return false;
        updateState({screenProvider:"livekit",livekitActive:true});
        const agora=screenClientRef.current;
        if(agora){
          screenClientRef.current=null;
          try{await agora.unpublish();await agora.leave();}catch(cause){console.error("Agora fallback cleanup error",cause);}
        }
        const room=await ensureLivekit(true),video=stream.getVideoTracks().find(valid);
        if(streamRef.current!==stream||!video)throw new Error("Tela encerrada.");
        await room.localParticipant.publishTrack(video,screenLivekitPublishOptions(screenConfigRef.current.quality,screenConfigRef.current.fps));
        if(streamRef.current!==stream){await room.localParticipant.unpublishTrack(video,false);throw new Error("Tela encerrada.");}
        screenLivekitTracksRef.current=[...screenLivekitTracksRef.current.filter(track=>track.kind==="audio"&&valid(track)),video];
        return true;
      }catch(cause){console.error("LiveKit screen fallback error",cause);setError("Não foi possível trocar o servidor de transmissão.");return false;}
      finally{setSwitching(false);}
    })();
    fallbackPromiseRef.current=pending;
    try{return await pending;}finally{if(fallbackPromiseRef.current===pending)fallbackPromiseRef.current=null;}
  },[ensureLivekit,updateState]);
  const stopScreen=useCallback(async()=>{
    if(stoppingRef.current)return;
    stoppingRef.current=true;
    const stream=streamRef.current,client=screenClientRef.current,tracks=screenTracksRef.current,retiredTracks=retiredScreenTracksRef.current,livekitTracks=screenLivekitTracksRef.current;
    streamRef.current=null;screenClientRef.current=null;screenTracksRef.current=[];retiredScreenTracksRef.current=[];screenLivekitTracksRef.current=[];screenCredentialsRef.current=null;
    if(fallbackTimerRef.current)clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current=null;
    try{
      if(client){
        try{await client.unpublish();}catch(cause){console.error("Agora screen unpublish error",cause);}
        try{await client.leave();}catch(cause){console.error("Agora screen leave error",cause);}
      }
      const room=livekitRef.current;
      if(room)for(const track of livekitTracks){try{await room.localParticipant.unpublishTrack(track,false);}catch(cause){console.error("LiveKit screen unpublish error",cause);}}
    }finally{
      [...tracks,...retiredTracks].forEach(track=>track.close());
      stream?.getTracks().forEach(track=>track.stop());
      clearVideo();screenAudioMutedRef.current=false;screenAudioBusyRef.current=false;setMuted(false);setLocalScreenActive(false);
      connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:valid(cameraRef.current)});
      connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);
      updateState({live:false,activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora"});
      stoppingRef.current=false;
    }
  },[clearVideo,updateState]);
  const publishAgora=useCallback(async(auth:AgoraCredentials,stream:MediaStream)=>{const client=AgoraRTC.createClient({mode:"live",codec:"vp8"});screenClientRef.current=client;client.on("connection-state-change",state=>{if(state==="CONNECTED"){if(fallbackTimerRef.current){clearTimeout(fallbackTimerRef.current);fallbackTimerRef.current=null;}const publishable=screenTracksRef.current;if(streamRef.current===stream&&publishable.length&&!client.localTracks.length&&!publishingRef.current){publishingRef.current=true;void client.publish(publishable).catch(cause=>console.error("Agora screen republish error",cause)).finally(()=>publishingRef.current=false);}}else if(state==="DISCONNECTED"&&streamRef.current===stream&&stateRef.current.screenProvider==="agora"&&!fallbackTimerRef.current)fallbackTimerRef.current=setTimeout(()=>{if(client.connectionState!=="CONNECTED")void fallback();},9_000);});client.on("token-privilege-will-expire",()=>void renew(client,true).catch(cause=>console.error("Agora screen token renewal error",cause)));client.on("token-privilege-did-expire",()=>void renew(client,true).catch(cause=>console.error("Agora screen token expiry error",cause)));await client.setClientRole("host");await client.join(auth.agoraAppId,auth.agoraChannel,auth.agoraToken,auth.agoraUid);
    const video=stream.getVideoTracks().find(valid);
    if(!video)throw new Error("A captura não forneceu vídeo ativo.");
    const {quality,fps}=screenConfigRef.current,settings=video.getSettings(),size=videoSize(quality,settings),width=size.width,height=size.height,bitrateMax=videoBitrate(quality,fps);
    const videoAgoraTrack=AgoraRTC.createCustomVideoTrack({mediaStreamTrack:video,width,height,frameRate:fps,bitrateMax,optimizationMode:"motion"});
    await tuneAgoraSender(videoAgoraTrack,quality,fps,bitrateMax);
    const tracks:(ILocalVideoTrack|ILocalAudioTrack)[]=[videoAgoraTrack];
    console.info("Lunira Screen capture",{video:video.getSettings(),requestedFps:fps,bitrateMax,hasAudio:stream.getAudioTracks().some(valid),audioProvider:"livekit"});
    screenTracksRef.current=tracks;await client.publish(tracks);await tuneAgoraSender(videoAgoraTrack,quality,fps,bitrateMax);},[fallback,renew,tuneAgoraSender]);
  const startScreen=useCallback(async(quality:Quality,fps:FrameRate)=>{
    if(startingRef.current||stoppingRef.current||streamRef.current)return false;
    startingRef.current=true;
    try{
      setError("");screenConfigRef.current={quality,fps};
      if(stateRef.current.activeScreenSharerId&&stateRef.current.activeScreenSharerId!==socketIdRef.current){setError("Outra pessoa já está compartilhando a tela.");return false;}
      const lock:ScreenAck=await emitAck<ScreenAck>("request-screen-share",{roomId:roomIdRef.current}).catch(cause=>({ok:false,error:String(cause)}));
      if(!lock.ok){setError(lock.error||"Não foi possível iniciar a transmissão.");return false;}
      const auth:AgoraCredentials|null=lock.agoraAppId&&lock.agoraChannel&&lock.agoraUid!==undefined&&lock.agoraToken?{agoraAppId:lock.agoraAppId,agoraChannel:lock.agoraChannel,agoraUid:lock.agoraUid,agoraToken:lock.agoraToken}:null;
      if(!auth&&lock.screenProvider!=="livekit"){setError("Servidor de mídia indisponível.");connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);return false;}
      screenCredentialsRef.current=auth;
      const provider=lock.screenProvider||"agora";
      updateState({activeScreenSharerId:socketIdRef.current,activeScreenUid:auth?.agoraUid??null,screenProvider:provider});
      let stream=pendingScreenRef.current;
      pendingScreenRef.current=null;
      setPreviewStream(null);
      if(!stream){
        try{stream=await acquireScreen(quality,fps);}
        catch(cause){console.error("Screen capture error",cause);setError(cause instanceof DOMException&&cause.name==="NotAllowedError"?"O compartilhamento foi cancelado.":"Não foi possível capturar a tela.");connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);return false;}
      }
      const video=stream.getVideoTracks()[0];
      if(!valid(video)){stream.getTracks().forEach(track=>track.stop());connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);setError("Não foi possível capturar a tela.");return false;}
      try{await video.applyConstraints(captureConstraints(quality,video.getSettings(),provider==="livekit"?fps:60));}catch(cause){console.warn("Display preset constraints failed",cause);}
      streamRef.current=stream;screenAudioMutedRef.current=false;setMuted(false);setLocalScreenActive(true);showVideo(video);
      video.addEventListener("ended",()=>{if(streamRef.current?.getVideoTracks()[0]===video)void stopScreen();},{once:true});
      try{await publishScreenAudioLivekit(stream);}catch(cause){console.error("LiveKit screen audio publish error",cause);setError("A tela iniciou, mas não foi possível enviar o áudio pelo LiveKit.");}
      try{if(auth)await publishAgora(auth,stream);else{
        const room=await ensureLivekit(),screen=stream.getVideoTracks().find(valid);
        if(!screen)throw new Error("Tela encerrada.");
        await room.localParticipant.publishTrack(screen,screenLivekitPublishOptions(quality,fps));
        screenLivekitTracksRef.current=[...screenLivekitTracksRef.current.filter(track=>track.kind==="audio"&&valid(track)),screen];
        connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:true});
      }}
      catch(cause){
        console.error("Screen publish error",cause);
        if(streamRef.current!==stream||!valid(video))return false;
        if(!auth||!await fallback()){await stopScreen();return false;}
      }
      if(streamRef.current!==stream||!valid(video))return false;
      updateState({live:true});connectSocket().emit("broadcast-started",{roomId:roomIdRef.current});
      return true;
    }finally{startingRef.current=false;}
  },[acquireScreen,ensureLivekit,fallback,publishAgora,publishScreenAudioLivekit,showVideo,stopScreen,updateState]);
  const switchPreparedScreen=useCallback(async(quality:Quality,fps:FrameRate)=>{
    const nextStream=pendingScreenRef.current;
    if(!nextStream||!valid(nextStream.getVideoTracks()[0])){setError("Escolha uma nova fonte antes de trocar a tela.");return false;}
    if(!streamRef.current||!localScreenActive){
      return await startScreen(quality,fps);
    }
    if(startingRef.current||stoppingRef.current)return false;
    startingRef.current=true;
    setSwitching(true);
    const previousStream=streamRef.current;
    const previousVideo=previousStream.getVideoTracks().find(valid);
    const previousConfig={...screenConfigRef.current};
    const nextVideo=nextStream.getVideoTracks()[0];
    const previousLivekitTracks=[...screenLivekitTracksRef.current];
    const provider=stateRef.current.screenProvider;
    let agoraVideo:ILocalVideoTrack|undefined;
    let livekitRoom:Room|undefined;
    let oldLivekitVideo:MediaStreamTrack|undefined;
    let videoSwitched=false;
    try{
      screenConfigRef.current={quality,fps};
      try{await nextVideo.applyConstraints(captureConstraints(quality,nextVideo.getSettings(),provider==="livekit"?fps:60));}catch(cause){console.warn("Display source switch constraints failed",cause);}
      if(provider==="agora"){
        agoraVideo=screenTracksRef.current.find((track):track is ILocalVideoTrack=>track.trackMediaType==="video");
        if(!agoraVideo)throw new Error("Faixa Agora indisponível para troca de fonte.");
        await agoraVideo.replaceTrack(nextVideo,false);
        videoSwitched=true;
        await tuneAgoraSender(agoraVideo,quality,fps,videoBitrate(quality,fps));
      }else{
        livekitRoom=await ensureLivekit();
        oldLivekitVideo=previousLivekitTracks.find(track=>track.kind==="video");
        if(oldLivekitVideo)await livekitRoom.localParticipant.unpublishTrack(oldLivekitVideo,false);
        try{await livekitRoom.localParticipant.publishTrack(nextVideo,screenLivekitPublishOptions(quality,fps));videoSwitched=true;}
        catch(cause){if(oldLivekitVideo&&valid(oldLivekitVideo))await livekitRoom.localParticipant.publishTrack(oldLivekitVideo,screenLivekitPublishOptions(previousConfig.quality,previousConfig.fps)).catch(()=>undefined);throw cause;}
      }

      const room=await ensureLivekit();
      const previousAudio=previousLivekitTracks.find(track=>track.kind==="audio");
      if(previousAudio)await room.localParticipant.unpublishTrack(previousAudio,false).catch(()=>undefined);
      const nextAudio=nextStream.getAudioTracks().find(valid);
      try{
        if(nextAudio){nextAudio.enabled=true;await room.localParticipant.publishTrack(nextAudio,{source:Track.Source.ScreenShareAudio});}
      }catch(cause){
        if(previousAudio&&valid(previousAudio))await room.localParticipant.publishTrack(previousAudio,{source:Track.Source.ScreenShareAudio}).catch(()=>undefined);
        throw cause;
      }
      screenLivekitTracksRef.current=[...(nextAudio?[nextAudio]:[]),...(provider==="livekit"?[nextVideo]:[])];

      pendingScreenRef.current=null;
      setPreviewStream(null);
      streamRef.current=nextStream;
      screenAudioMutedRef.current=false;
      setMuted(false);
      showVideo(nextVideo);
      nextVideo.addEventListener("ended",()=>{if(streamRef.current?.getVideoTracks()[0]===nextVideo)void stopScreen();},{once:true});
      previousStream.getTracks().forEach(track=>track.stop());
      recordDiagnostic("info","capture","Fonte de tela trocada sem sair da sala",nextVideo.getSettings());
      setError("");
      return true;
    }catch(cause){
      screenConfigRef.current=previousConfig;
      if(videoSwitched&&provider==="agora"&&agoraVideo&&previousVideo){
        try{await agoraVideo.replaceTrack(previousVideo,false);await tuneAgoraSender(agoraVideo,previousConfig.quality,previousConfig.fps,videoBitrate(previousConfig.quality,previousConfig.fps));}
        catch(rollbackCause){console.error("Agora source rollback failed",rollbackCause);}
      }else if(videoSwitched&&provider==="livekit"&&livekitRoom){
        try{
          await livekitRoom.localParticipant.unpublishTrack(nextVideo,false).catch(()=>undefined);
          if(oldLivekitVideo&&valid(oldLivekitVideo))await livekitRoom.localParticipant.publishTrack(oldLivekitVideo,screenLivekitPublishOptions(previousConfig.quality,previousConfig.fps));
        }catch(rollbackCause){console.error("LiveKit source rollback failed",rollbackCause);}
      }
      console.error("Screen source switch error",cause);
      recordDiagnostic("error","capture","Falha ao trocar a fonte da tela",cause);
      setError("Não foi possível trocar a fonte. A transmissão atual foi mantida quando possível.");
      return false;
    }finally{startingRef.current=false;setSwitching(false);}
  },[ensureLivekit,localScreenActive,showVideo,startScreen,stopScreen,tuneAgoraSender]);
  const updateScreenFrameRate=useCallback(async(nextFps:FrameRate)=>{
    screenConfigRef.current={...screenConfigRef.current,fps:nextFps};
    const source=streamRef.current?.getVideoTracks().find(valid);
    if(!source)return;
    const quality=screenConfigRef.current.quality,bitrateMax=videoBitrate(quality,nextFps);
    try{
      // Keep the capture source at 60 even while publishing 30. This makes the
      // live FPS switch immediate and avoids another permission prompt.
      await source.applyConstraints(captureConstraints(quality,source.getSettings(),stateRef.current.screenProvider==="livekit"?nextFps:60));
      if(stateRef.current.screenProvider==="agora"){
        const videoTrack=screenTracksRef.current.find((track):track is ILocalVideoTrack=>track.trackMediaType==="video");
        if(!videoTrack)throw new Error("Faixa de vídeo indisponível.");
        await tuneAgoraSender(videoTrack,quality,nextFps,bitrateMax);
      }
      console.info("Lunira Screen Agora encoder FPS",{captureFps:source.getSettings().frameRate,encoderFps:nextFps});
      const actual=source.getSettings().frameRate;
      if(nextFps===60&&actual&&actual<50)setError(`O navegador limitou a captura a ${Math.round(actual)} FPS. Para 60 FPS reais, use Chrome ou Edge com aceleração de hardware.`);else setError("");
    }catch(cause){console.warn("Agora live FPS update failed",cause);setError("Não foi possível aplicar a nova taxa de quadros.");}
  },[tuneAgoraSender]);
  const updateScreenQuality=useCallback(async(nextQuality:Quality)=>{
    screenConfigRef.current={...screenConfigRef.current,quality:nextQuality};
    const source=streamRef.current?.getVideoTracks().find(valid);
    if(!source)return;
    const fps=screenConfigRef.current.fps,bitrateMax=videoBitrate(nextQuality,fps);
    try{
      await source.applyConstraints(captureConstraints(nextQuality,source.getSettings(),stateRef.current.screenProvider==="livekit"?fps:60));
      if(stateRef.current.screenProvider==="agora"){
        const videoTrack=screenTracksRef.current.find((track):track is ILocalVideoTrack=>track.trackMediaType==="video");
        if(!videoTrack)throw new Error("Faixa de vídeo indisponível.");
        await tuneAgoraSender(videoTrack,nextQuality,fps,bitrateMax);
      }
      console.info("Lunira Screen Agora encoder quality",{capture:source.getSettings(),quality:nextQuality,fps});
      setError("");
    }catch(cause){console.warn("Agora live quality update failed",cause);setError("Não foi possível aplicar a nova qualidade.");}
  },[tuneAgoraSender]);
  const toggleCamera=useCallback(async()=>{
    try{
      if(cameraPresetSwitchRef.current)await cameraPresetSwitchRef.current;
      const room=await ensureLivekit();
      if(cameraOn){
        const track=cameraRef.current;
        cameraRestartingRef.current=true;
        cameraRef.current=null;
        removeCamera(socketIdRef.current);
        setCameraOn(false);
        try{
          if(track){
            try{await room.localParticipant.unpublishTrack(track,true);}
            catch{await room.localParticipant.setCameraEnabled(false);}
          }else await room.localParticipant.setCameraEnabled(false);
        }finally{cameraRestartingRef.current=false;}
      }else{
        const preset=cameraPresetRef.current;
        const publication=await room.localParticipant.setCameraEnabled(true,cameraCaptureOptions(preset),cameraPublishOptions(preset));
        const track=publication?.track?.mediaStreamTrack;
        if(!valid(track))throw new Error("A câmera não forneceu vídeo ativo.");
        bindCameraTrack(track,preset);
      }
      connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:!cameraOn||screenLivekitTracksRef.current.some(track=>track.kind==="audio"&&valid(track))||!!streamRef.current&&stateRef.current.screenProvider==="livekit"});
    }catch(cause){console.error("LiveKit camera error",cause);setError(cameraOn?"Não foi possível desativar a câmera.":"Não foi possível ativar a câmera.");}
  },[bindCameraTrack,cameraOn,ensureLivekit,removeCamera]);
  const toggleScreenAudio=useCallback(async()=>{
    if(screenAudioBusyRef.current)return;
    const source=streamRef.current?.getAudioTracks().find(valid);
    if(!source){setError("Esta captura não possui áudio para silenciar.");return;}
    const nextMuted=!screenAudioMutedRef.current;
    screenAudioBusyRef.current=true;
    try{
      const room=livekitRef.current||await ensureLivekit();
      if(nextMuted){
        const published=screenLivekitTracksRef.current.find(track=>track.kind==="audio");
        if(published){await room.localParticipant.unpublishTrack(published,false);screenLivekitTracksRef.current=screenLivekitTracksRef.current.filter(track=>track!==published);}
        source.enabled=false;
      }else{
        source.enabled=true;
        await room.localParticipant.publishTrack(source,{source:Track.Source.ScreenShareAudio});
        if(!screenLivekitTracksRef.current.includes(source))screenLivekitTracksRef.current.push(source);
      }
      screenAudioMutedRef.current=nextMuted;setMuted(nextMuted);
      connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:!nextMuted||valid(cameraRef.current)||stateRef.current.screenProvider==="livekit"});
    }catch(cause){
      source.enabled=!screenAudioMutedRef.current;
      console.error("Screen audio toggle error",cause);
      setError("Não foi possível alterar o áudio da transmissão.");
    }finally{screenAudioBusyRef.current=false;}
  },[ensureLivekit]);
  const recoverMedia=useCallback(async()=>{
    if(recoveryBusyRef.current)return false;
    recoveryBusyRef.current=true;
    setRecovering(true);
    recordDiagnostic("warn","rtc","Recuperação de mídia iniciada",{provider:stateRef.current.screenProvider,localScreen:localScreenActive,status});
    try{
      const socket=connectSocket();
      if(!socket.connected)socket.connect();
      if(localScreenActive&&streamRef.current){
        const stream=streamRef.current;
        if(!valid(stream.getVideoTracks()[0])){setError("A fonte de tela foi encerrada. Escolha outra fonte para continuar.");return false;}
        if(stateRef.current.screenProvider==="livekit"){
          await ensureLivekit(true);
        }else{
          const current=screenClientRef.current;
          const lock=await emitAck<ScreenAck>("request-screen-share",{roomId:roomIdRef.current});
          const auth:AgoraCredentials|null=lock.ok&&lock.agoraAppId&&lock.agoraChannel&&lock.agoraUid!==undefined&&lock.agoraToken?{agoraAppId:lock.agoraAppId,agoraChannel:lock.agoraChannel,agoraUid:lock.agoraUid,agoraToken:lock.agoraToken}:null;
          if(!auth)throw new Error(lock.error||"Credenciais Agora indisponíveis.");
          screenCredentialsRef.current=auth;
          if(current){try{await current.unpublish();}catch{}try{await current.leave();}catch{}}
          const retired=screenTracksRef.current;
          screenTracksRef.current=[];
          if(retired.length)retiredScreenTracksRef.current.push(...retired);
          try{await publishAgora(auth,stream);}catch(cause){if(!await fallback())throw cause;}
        }
      }else{
        if(stateRef.current.screenProvider==="livekit"&&stateRef.current.livekitActive)await ensureLivekit(true);
        setRecoveryNonce(value=>value+1);
      }
      stalledTicksRef.current=0;
      recordDiagnostic("info","rtc","Recuperação de mídia concluída");
      setError("");
      return true;
    }catch(cause){
      console.error("Media recovery failed",cause);
      recordDiagnostic("error","rtc","Recuperação de mídia falhou",cause);
      setError("A reconexão automática falhou. Tente novamente ou troque a fonte da tela.");
      return false;
    }finally{recoveryBusyRef.current=false;setRecovering(false);}
  },[ensureLivekit,localScreenActive,publishAgora,status]);
  const setRoomLocked=useCallback(async(locked:boolean)=>{
    try{
      const ack=await emitAck<{ok:boolean;locked?:boolean;error?:string}>("set-room-lock",{roomId:roomIdRef.current,locked});
      if(!ack.ok)throw new Error(ack.error||"Não foi possível alterar o bloqueio da sala.");
      updateState({locked:!!ack.locked});
      return true;
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível alterar o bloqueio da sala.");return false;}
  },[updateState]);
  const rotateInvite=useCallback(async()=>{
    try{
      const ack=await emitAck<{ok:boolean;inviteToken?:string;error?:string}>("rotate-room-invite",{roomId:roomIdRef.current});
      if(!ack.ok||!ack.inviteToken)throw new Error(ack.error||"Não foi possível renovar o convite.");
      setInviteToken(ack.inviteToken);
      const saved=safeSessionGet("lumacast-broadcaster");
      if(saved){try{const parsed=JSON.parse(saved) as {roomId:string;token:string};safeSessionSet("lumacast-broadcaster",JSON.stringify({...parsed,inviteToken:ack.inviteToken}));}catch{}}
      return ack.inviteToken;
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível renovar o convite.");return null;}
  },[]);
  const rotateGuestCode=useCallback(async()=>{
    try{
      const ack=await emitAck<{ok:boolean;guestCode?:string;error?:string}>("rotate-room-guest-code",{roomId:roomIdRef.current});
      if(!ack.ok||!ack.guestCode)throw new Error(ack.error||"Não foi possível gerar o código temporário.");
      updateState({guestCodeEnabled:true});
      return ack.guestCode;
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível gerar o código temporário.");return null;}
  },[updateState]);
  const disableGuestCode=useCallback(async()=>{
    try{
      const ack=await emitAck<{ok:boolean;error?:string}>("disable-room-guest-code",{roomId:roomIdRef.current});
      if(!ack.ok)throw new Error(ack.error||"Não foi possível desativar o código temporário.");
      updateState({guestCodeEnabled:false});
      return true;
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível desativar o código temporário.");return false;}
  },[updateState]);
  const kickParticipant=useCallback(async(participantId:string)=>{
    try{
      const ack=await emitAck<{ok:boolean;error?:string}>("kick-participant",{roomId:roomIdRef.current,participantId});
      if(!ack.ok)throw new Error(ack.error||"Não foi possível remover o participante.");
      return true;
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível remover o participante.");return false;}
  },[]);
  useEffect(()=>{
    const socket=connectSocket();
    const apply=(ack:RoomAck|JoinAck)=>{
      if(!ack.ok){
        setError(ack.error||"Sala não encontrada.");setStatus("missing");return;
      }
      const next:AgoraCredentials|null=ack.agoraAppId&&ack.agoraChannel&&ack.agoraUid!==undefined&&ack.agoraToken?{agoraAppId:ack.agoraAppId,agoraChannel:ack.agoraChannel,agoraUid:ack.agoraUid,agoraToken:ack.agoraToken}:null;
      credentialsRef.current=next;setCredentials(next);
      updateState({live:!!ack.live,count:ack.count||0,activeScreenSharerId:ack.activeScreenSharerId||null,activeScreenUid:ack.activeScreenUid??null,activeScreenSharerName:ack.activeScreenSharerName||null,screenProvider:ack.screenProvider||"agora",livekitActive:!!ack.livekitActive,ownerName:ack.ownerName||"",locked:!!ack.locked,guestCodeEnabled:!!ack.guestCodeEnabled,participants:ack.participants||[]});
      if("roomId" in ack&&ack.roomId){roomIdRef.current=ack.roomId;setRoomId(ack.roomId);}
      if("inviteToken" in ack&&ack.inviteToken)setInviteToken(ack.inviteToken);
      if("ownerToken" in ack&&ack.ownerToken)safeSessionSet("lumacast-broadcaster",JSON.stringify({roomId:roomIdRef.current,token:ack.ownerToken,inviteToken:"inviteToken" in ack?ack.inviteToken:undefined}));
      if("participantToken" in ack&&ack.participantToken){safeSessionSet(`lumacast-participant-${roomIdRef.current}`,ack.participantToken);safeSessionRemove(`lumacast-invite-${roomIdRef.current}`);safeSessionRemove(`lumacast-guest-${roomIdRef.current}`);}
      setStatus("Conectado");
      const mediaActive=valid(cameraRef.current)||screenLivekitTracksRef.current.some(track=>track.kind==="audio"&&valid(track))||!!streamRef.current&&stateRef.current.screenProvider==="livekit";
      if(mediaActive)socket.emit("livekit-media-active",{roomId:roomIdRef.current,active:true});
      if(livekitRef.current&&livekitRef.current.localParticipant.identity!==socket.id){
        void ensureLivekit(true).catch(cause=>{console.error("LiveKit rejoin error",cause);setError("Não foi possível reconectar a mídia da sala.");});
      }
      if(streamRef.current&&socket.id===stateRef.current.activeScreenSharerId&&stateRef.current.screenProvider==="agora"&&screenClientRef.current?.connectionState==="DISCONNECTED"&&!fallbackTimerRef.current){
        const client=screenClientRef.current;
        fallbackTimerRef.current=setTimeout(()=>{fallbackTimerRef.current=null;if(client.connectionState!=="CONNECTED")void fallback();},9_000);
      }
    };
    const connect=()=>{
      socketIdRef.current=socket.id||"";setStatus("Conectando");
      if(owner){
        const saved=safeSessionGet("lumacast-broadcaster");
        if(saved){
          try{
            const parsed=JSON.parse(saved) as {roomId:string;token:string;inviteToken?:string};
            if(requestedRoomId&&parsed.roomId!==requestedRoomId){safeSessionRemove("lumacast-broadcaster");apply({ok:false,error:"A sessão salva desta sala expirou."});return;}
            socket.emit("reclaim-room",parsed,(ack:RoomAck)=>{
              if(ack.ok)return apply(ack);
              if(requestedRoomId){safeSessionRemove("lumacast-broadcaster");apply(ack);return;}
              socket.emit("create-room",{displayName:safeSessionGet("lumacast-display-name")},(fresh:RoomAck)=>apply(fresh));
            });
          }catch{
            safeSessionRemove("lumacast-broadcaster");
            if(requestedRoomId)apply({ok:false,error:"A sessão salva desta sala expirou."});else socket.emit("create-room",{displayName:safeSessionGet("lumacast-display-name")},(ack:RoomAck)=>apply(ack));
          }
        }else if(requestedRoomId)apply({ok:false,error:"A sessão desta sala não está mais disponível."});
        else socket.emit("create-room",{displayName:safeSessionGet("lumacast-display-name")},(ack:RoomAck)=>apply(ack));
      }else{
        const inviteKey=`lumacast-invite-${requestedRoomId}`;
        const joinInvite=requestedInviteToken||safeSessionGet(inviteKey);
        if(requestedInviteToken)safeSessionSet(inviteKey,requestedInviteToken);
        socket.emit("join-room",{roomId:requestedRoomId,participantToken:safeSessionGet(`lumacast-participant-${requestedRoomId}`),inviteToken:joinInvite,guestCode:safeSessionGet(`lumacast-guest-${requestedRoomId}`),displayName:safeSessionGet("lumacast-display-name")},(ack:JoinAck)=>apply(ack));
      }
    };
    const onState=(next:RoomState)=>{
      const previous=stateRef.current;updateState(next);
      if(!next.live&&previous.live&&socket.id!==previous.activeScreenSharerId)clearVideo();
      if(next.screenProvider!==previous.screenProvider){
        subscriberRef.current?.remoteUsers.forEach(user=>user.audioTrack?.stop());
        if(socket.id===next.activeScreenSharerId&&valid(streamRef.current?.getVideoTracks()[0]))showVideo(streamRef.current!.getVideoTracks()[0]);else clearVideo();
        setSwitching(next.screenProvider==="livekit");
        if(next.screenProvider==="livekit"&&socket.id!==next.activeScreenSharerId)void ensureLivekit().catch(cause=>{console.error("LiveKit join error",cause);setError("Não foi possível receber a tela pelo servidor alternativo.");}).finally(()=>setSwitching(false));
        else if(next.screenProvider!=="livekit")setSwitching(false);
      }
    };
    const onDisconnect=()=>{setStatus("Reconectando");recordDiagnostic("warn","socket","Socket desconectado; aguardando reconexão");};
    const onExpired=()=>{setStatus("missing");if(owner)safeSessionRemove("lumacast-broadcaster");else safeSessionRemove(`lumacast-participant-${roomIdRef.current}`);};
    const onKicked=(payload:{reason?:string})=>{safeSessionRemove(`lumacast-participant-${roomIdRef.current}`);safeSessionRemove(`lumacast-invite-${roomIdRef.current}`);safeSessionRemove(`lumacast-guest-${roomIdRef.current}`);setKicked(true);setStatus("missing");setError(payload?.reason||"Você foi removido da sala.");recordDiagnostic("warn","room","Participante removido da sala");};
    socket.on("connect",connect);socket.on("disconnect",onDisconnect);socket.on("room-state",onState);socket.on("room-expired",onExpired);socket.on("kicked",onKicked);
    if(socket.connected)connect();
    return()=>{socket.off("connect",connect);socket.off("disconnect",onDisconnect);socket.off("room-state",onState);socket.off("room-expired",onExpired);socket.off("kicked",onKicked);};
  },[clearVideo,ensureLivekit,fallback,owner,requestedInviteToken,requestedRoomId,showVideo,updateState]);
  useEffect(()=>{
    const shouldJoin=!!credentials&&roomState.live&&roomState.screenProvider==="agora"&&roomState.activeScreenUid!==null&&roomState.activeScreenSharerId!==socketIdRef.current;
    if(!shouldJoin){setReady(false);return;}
    let active=true;
    const client=AgoraRTC.createClient({mode:"live",codec:"vp8"});
    subscriberRef.current=client;
    const subscribe=async(user:IAgoraRTCRemoteUser,mediaType:"video"|"audio")=>{
      if(stateRef.current.screenProvider!=="agora"||user.uid!==stateRef.current.activeScreenUid)return;
      try{
        await client.subscribe(user,mediaType);
        if(!active)return;
        if(mediaType==="video"&&user.videoTrack)showVideo(user.videoTrack.getMediaStreamTrack());
        if(mediaType==="audio"&&user.audioTrack)user.audioTrack.play();
      }catch(cause){console.error("Agora screen subscribe error",cause);setError("Não foi possível receber a tela.");}
    };
    client.on("user-published",subscribe);
    client.on("user-unpublished",(user,type)=>{if(user.uid===stateRef.current.activeScreenUid&&type==="video")clearVideo();});
    client.on("token-privilege-will-expire",()=>void renew(client).catch(cause=>console.error("Agora token renewal error",cause)));
    client.on("token-privilege-did-expire",()=>void renew(client).catch(cause=>console.error("Agora token expiry error",cause)));
    void (async()=>{
      try{
        const tokenAck=await emitAck<TokenAck>("renew-agora-token",{roomId:roomIdRef.current,screen:false});
        if(!tokenAck.ok||!tokenAck.agoraToken)throw new Error(tokenAck.error||"Token Agora inválido.");
        if(!active)return;
        await client.setClientRole("audience");
        await client.join(credentials!.agoraAppId,credentials!.agoraChannel,tokenAck.agoraToken,credentials!.agoraUid,{autoSubscribe:false});
        if(active)setReady(true);else await client.leave();
      }catch(cause){
        console.error("Agora viewer join error",cause);
        if(active){setReady(false);setError("Não foi possível conectar ao servidor principal. A tela poderá usar o servidor alternativo.");}
      }
    })();
    return()=>{
      active=false;setReady(false);
      client.remoteUsers.forEach(user=>user.audioTrack?.stop());
      if(subscriberRef.current===client)subscriberRef.current=null;
      clearVideo();
      void client.leave().catch(()=>undefined);
    };
  },[credentials?.agoraAppId,credentials?.agoraChannel,credentials?.agoraUid,roomState.live,roomState.screenProvider,roomState.activeScreenUid,roomState.activeScreenSharerId,recoveryNonce,clearVideo,renew,showVideo]);
  useEffect(()=>{if(roomState.livekitActive){void ensureLivekit().catch(cause=>{console.error("LiveKit join error",cause);setError("Não foi possível conectar à mídia da sala.");});return;}const timer=setTimeout(()=>{if(!stateRef.current.livekitActive&&!valid(cameraRef.current||undefined)&&!screenLivekitTracksRef.current.some(track=>valid(track))){const room=livekitRef.current;livekitRef.current=null;if(room)void room.disconnect();setCameras([]);livekitAudioRef.current.forEach(element=>element.remove());livekitAudioRef.current.clear();}},3_000);return()=>clearTimeout(timer);},[roomState.livekitActive,ensureLivekit]);
  useEffect(()=>{if(!roomState.live)return;const timer=setInterval(()=>{const client=socketIdRef.current===roomState.activeScreenSharerId?screenClientRef.current:subscriberRef.current;if(client&&roomState.screenProvider==="agora")void readAgoraStats(client,streamRef.current,socketIdRef.current===roomState.activeScreenSharerId?null:roomState.activeScreenUid).then(setStats).catch(()=>undefined);},1000);return()=>clearInterval(timer);},[roomState.live,roomState.activeScreenSharerId,roomState.activeScreenUid,roomState.screenProvider]);
  useEffect(()=>{
    if(!roomState.live||localScreenActive)return;
    lastVideoTimeRef.current=videoRef.current?.currentTime||0;
    stalledTicksRef.current=0;
    const timer=setInterval(()=>{
      const element=videoRef.current;
      if(!element||element.paused||element.readyState<2)return;
      const now=element.currentTime;
      if(now>lastVideoTimeRef.current+0.01){lastVideoTimeRef.current=now;stalledTicksRef.current=0;return;}
      stalledTicksRef.current++;
      if(stalledTicksRef.current>=4){stalledTicksRef.current=0;recordDiagnostic("warn","watchdog","Stream de vídeo sem progresso; tentando recuperar",{provider:stateRef.current.screenProvider});void recoverMedia();}
    },2000);
    return()=>clearInterval(timer);
  },[localScreenActive,recoverMedia,roomState.live]);
  useEffect(()=>()=>{const room=livekitRef.current;if(room)void room.disconnect();livekitAudioRef.current.forEach(element=>element.remove());cameraRef.current?.stop();pendingScreenRef.current?.getTracks().forEach(track=>track.stop());if(streamRef.current)void stopScreen();},[stopScreen]);
  return{videoRef,roomId,inviteToken,roomState,ready,status,error,setError,stats,cameras,cameraOn,cameraPreset,setCameraPreset,switching,muted,isScreenSharer:localScreenActive,ownsScreenLock:!!roomState.activeScreenSharerId&&roomState.activeScreenSharerId===socketIdRef.current,startScreen,prepareScreen,previewStream,cancelScreenPreview,switchPreparedScreen,stopScreen,updateScreenFrameRate,updateScreenQuality,toggleCamera,toggleScreenAudio,recoverMedia,recovering,setRoomLocked,rotateInvite,rotateGuestCode,disableGuestCode,kickParticipant,kicked};
}
