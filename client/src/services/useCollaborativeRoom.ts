import AgoraRTC,{type IAgoraRTCClient,type IAgoraRTCRemoteUser,type ILocalAudioTrack,type ILocalVideoTrack} from "agora-rtc-sdk-ng";
import { Room,RoomEvent,Track,type RemoteTrack,type RemoteTrackPublication } from "livekit-client";
import { useCallback,useEffect,useRef,useState } from "react";
import { connectSocket } from "./socket";
import { displayConstraints,readAgoraStats } from "./webrtc";
import type { AgoraCredentials,CameraPreset,FrameRate,JoinAck,Quality,RoomAck,RoomState,ScreenProvider,StreamStats,TokenAck } from "../types";

type Camera={identity:string;track:MediaStreamTrack;local:boolean};
type ScreenAck=RoomAck&{error?:string};
type LiveKitAck={ok:boolean;livekitUrl?:string;livekitToken?:string;error?:string};
const initial:RoomState={live:false,count:0,activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora",livekitActive:false};
const valid=(track?:MediaStreamTrack|null):track is MediaStreamTrack=>!!track&&track.readyState==="live";
const emitAck=<T,>(event:string,payload:object)=>new Promise<T>((resolve,reject)=>connectSocket().timeout(12_000).emit(event,payload,(error:Error|null,ack:T)=>error?reject(error):resolve(ack)));

export function useCollaborativeRoom(owner:boolean,requestedRoomId?:string){
  const videoRef=useRef<HTMLVideoElement>(null),streamRef=useRef<MediaStream|null>(null),subscriberRef=useRef<IAgoraRTCClient|null>(null),screenClientRef=useRef<IAgoraRTCClient|null>(null),screenTracksRef=useRef<(ILocalVideoTrack|ILocalAudioTrack)[]>([]),livekitRef=useRef<Room|null>(null),livekitPromiseRef=useRef<Promise<Room>|null>(null),livekitAudioRef=useRef<Map<string,HTMLMediaElement>>(new Map()),screenLivekitTracksRef=useRef<MediaStreamTrack[]>([]),credentialsRef=useRef<AgoraCredentials|null>(null),screenCredentialsRef=useRef<AgoraCredentials|null>(null),roomIdRef=useRef(requestedRoomId||""),stateRef=useRef<RoomState>(initial),cameraRef=useRef<MediaStreamTrack|null>(null),fallbackTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null),publishingRef=useRef(false),stoppingRef=useRef(false),socketIdRef=useRef(""),screenConfigRef=useRef<{quality:Quality;fps:FrameRate}>({quality:"1080p",fps:30});
  const startingRef=useRef(false),fallbackPromiseRef=useRef<Promise<boolean>|null>(null),screenAudioBusyRef=useRef(false),screenAudioMutedRef=useRef(false);
  const [roomId,setRoomId]=useState(requestedRoomId||""),[credentials,setCredentials]=useState<AgoraCredentials|null>(null),[roomState,setRoomState]=useState<RoomState>(initial),[ready,setReady]=useState(false),[status,setStatus]=useState("Conectando"),[error,setError]=useState(""),[stats,setStats]=useState<StreamStats|null>(null),[cameras,setCameras]=useState<Camera[]>([]),[cameraOn,setCameraOn]=useState(false),[cameraPreset,setCameraPreset]=useState<CameraPreset>("720p40"),[switching,setSwitching]=useState(false),[muted,setMuted]=useState(false);
  const updateState=useCallback((next:Partial<RoomState>)=>{stateRef.current={...stateRef.current,...next};setRoomState(stateRef.current);},[]);
  const putCamera=useCallback((camera:Camera)=>setCameras(current=>[...current.filter(item=>item.identity!==camera.identity),camera]),[]);
  const removeCamera=useCallback((identity:string)=>setCameras(current=>current.filter(item=>item.identity!==identity)),[]);
  const clearVideo=useCallback(()=>{if(videoRef.current)videoRef.current.srcObject=null;setStats(null);},[]);
  const showVideo=useCallback((track:MediaStreamTrack)=>{if(!videoRef.current)return;videoRef.current.srcObject=new MediaStream([track]);void videoRef.current.play().catch(()=>undefined);},[]);
  const renew=useCallback(async(client:IAgoraRTCClient,screen=false)=>{const ack=await emitAck<TokenAck>("renew-agora-token",{roomId:roomIdRef.current,screen});if(!ack.ok||!ack.agoraToken)throw new Error(ack.error||"Token Agora inválido.");await client.renewToken(ack.agoraToken);},[]);
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
      room.on(RoomEvent.TrackSubscribed,onSubscribed);
      room.on(RoomEvent.TrackUnsubscribed,onUnsubscribed);
      room.on(RoomEvent.ParticipantDisconnected,participant=>removeCamera(participant.identity));
      try{
        await room.connect(ack.livekitUrl,ack.livekitToken);
        livekitRef.current=room;
        if(cameraRef.current&&!valid(cameraRef.current)){cameraRef.current=null;setCameraOn(false);removeCamera(socketIdRef.current);}
        if(valid(cameraRef.current))await room.localParticipant.publishTrack(cameraRef.current!,{source:Track.Source.Camera});
        if(stateRef.current.screenProvider==="livekit"&&stateRef.current.activeScreenSharerId===socketIdRef.current){
          for(const track of screenLivekitTracksRef.current.filter(valid))await room.localParticipant.publishTrack(track,{source:track.kind==="video"?Track.Source.ScreenShare:Track.Source.ScreenShareAudio});
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
  },[clearVideo,putCamera,removeCamera,showVideo]);
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
        const room=await ensureLivekit(true),video=stream.getVideoTracks().find(valid),audio=stream.getAudioTracks().find(valid);
        if(streamRef.current!==stream||!video)throw new Error("Tela encerrada.");
        await room.localParticipant.publishTrack(video,{source:Track.Source.ScreenShare});
        if(streamRef.current!==stream){await room.localParticipant.unpublishTrack(video,false);throw new Error("Tela encerrada.");}
        screenLivekitTracksRef.current=[video];
        if(audio&&!screenAudioMutedRef.current){await room.localParticipant.publishTrack(audio,{source:Track.Source.ScreenShareAudio});if(streamRef.current!==stream){await room.localParticipant.unpublishTrack(audio,false);throw new Error("Tela encerrada.");}screenLivekitTracksRef.current.push(audio);}
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
    const stream=streamRef.current,client=screenClientRef.current,tracks=screenTracksRef.current,livekitTracks=screenLivekitTracksRef.current;
    streamRef.current=null;screenClientRef.current=null;screenTracksRef.current=[];screenLivekitTracksRef.current=[];screenCredentialsRef.current=null;
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
      tracks.forEach(track=>track.close());
      stream?.getTracks().forEach(track=>track.stop());
      clearVideo();screenAudioMutedRef.current=false;screenAudioBusyRef.current=false;setMuted(false);
      connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);
      updateState({live:false,activeScreenSharerId:null,activeScreenUid:null,screenProvider:"agora"});
      stoppingRef.current=false;
    }
  },[clearVideo,updateState]);
  const publishAgora=useCallback(async(auth:AgoraCredentials,stream:MediaStream)=>{const client=AgoraRTC.createClient({mode:"live",codec:"vp8"});screenClientRef.current=client;client.on("connection-state-change",state=>{if(state==="CONNECTED"){if(fallbackTimerRef.current){clearTimeout(fallbackTimerRef.current);fallbackTimerRef.current=null;}const publishable=screenTracksRef.current.filter(track=>track.trackMediaType!=="audio"||!screenAudioMutedRef.current);if(streamRef.current===stream&&publishable.length&&!client.localTracks.length&&!publishingRef.current){publishingRef.current=true;void client.publish(publishable).catch(cause=>console.error("Agora screen republish error",cause)).finally(()=>publishingRef.current=false);}}else if(state==="DISCONNECTED"&&streamRef.current===stream&&stateRef.current.screenProvider==="agora"&&!fallbackTimerRef.current)fallbackTimerRef.current=setTimeout(()=>{if(client.connectionState!=="CONNECTED")void fallback();},9_000);});client.on("token-privilege-will-expire",()=>void renew(client,true).catch(cause=>console.error("Agora screen token renewal error",cause)));client.on("token-privilege-did-expire",()=>void renew(client,true).catch(cause=>console.error("Agora screen token expiry error",cause)));await client.setClientRole("host");await client.join(auth.agoraAppId,auth.agoraChannel,auth.agoraToken,auth.agoraUid);
    const video=stream.getVideoTracks().find(valid),audio=stream.getAudioTracks().find(valid);
    if(!video)throw new Error("A captura não forneceu vídeo ativo.");
    const {quality,fps}=screenConfigRef.current,settings=video.getSettings(),width=settings.width||(quality==="1080p"?1920:quality==="720p"?1280:1280),height=settings.height||(quality==="1080p"?1080:quality==="720p"?720:720),bitrateMax=quality==="1080p"?(fps===60?5000:3000):quality==="720p"?(fps===60?3000:2000):(fps===60?3500:2500);
    const videoAgoraTrack=AgoraRTC.createCustomVideoTrack({mediaStreamTrack:video,width,height,frameRate:fps,bitrateMax,optimizationMode:"motion"});
    const tracks:(ILocalVideoTrack|ILocalAudioTrack)[]=[videoAgoraTrack];
    if(audio)tracks.push(AgoraRTC.createCustomAudioTrack({mediaStreamTrack:audio,encoderConfig:"music_standard"}));
    console.info("LumaCast capture",{video:video.getSettings(),requestedFps:fps,bitrateMax,hasAudio:!!audio});
    screenTracksRef.current=tracks;await client.publish(tracks);},[fallback,renew]);
  const startScreen=useCallback(async(quality:Quality,fps:FrameRate)=>{
    if(startingRef.current||stoppingRef.current||streamRef.current)return;
    startingRef.current=true;
    try{
      setError("");screenConfigRef.current={quality,fps};
      if(stateRef.current.activeScreenSharerId&&stateRef.current.activeScreenSharerId!==socketIdRef.current){setError("Outra pessoa já está compartilhando a tela.");return;}
      const lock:ScreenAck=await emitAck<ScreenAck>("request-screen-share",{roomId:roomIdRef.current}).catch(cause=>({ok:false,error:String(cause)}));
      if(!lock.ok||!lock.agoraAppId||!lock.agoraChannel||lock.agoraUid===undefined||!lock.agoraToken){setError(lock.error||"Não foi possível iniciar a transmissão.");return;}
      const auth:AgoraCredentials={agoraAppId:lock.agoraAppId,agoraChannel:lock.agoraChannel,agoraUid:lock.agoraUid,agoraToken:lock.agoraToken};
      screenCredentialsRef.current=auth;
      updateState({activeScreenSharerId:socketIdRef.current,activeScreenUid:auth.agoraUid,screenProvider:"agora"});
      let stream:MediaStream;
      try{stream=await navigator.mediaDevices.getDisplayMedia(displayConstraints(quality,60));}
      catch(cause){console.error("Screen capture error",cause);setError((cause as DOMException).name==="NotAllowedError"?"O compartilhamento foi cancelado.":"Não foi possível capturar a tela.");connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);return;}
      const video=stream.getVideoTracks()[0];
      if(!valid(video)){stream.getTracks().forEach(track=>track.stop());connectSocket().emit("release-screen-share",{roomId:roomIdRef.current},()=>undefined);setError("Não foi possível capturar a tela.");return;}
      const capturedFps=video.getSettings().frameRate;
      if(capturedFps&&capturedFps<50)console.warn(`A fonte de captura iniciou em ${capturedFps} FPS apesar da solicitação de 60 FPS.`);
      try{video.contentHint="motion";}catch{}
      streamRef.current=stream;screenAudioMutedRef.current=false;setMuted(false);showVideo(video);
      video.addEventListener("ended",()=>{if(streamRef.current?.getVideoTracks()[0]===video)void stopScreen();},{once:true});
      try{await publishAgora(auth,stream);}
      catch(cause){
        console.error("Agora screen publish error",cause);
        if(streamRef.current!==stream||!valid(video))return;
        if(!await fallback()){await stopScreen();return;}
      }
      if(streamRef.current!==stream||!valid(video))return;
      updateState({live:true});connectSocket().emit("broadcast-started",{roomId:roomIdRef.current});
    }finally{startingRef.current=false;}
  },[fallback,publishAgora,showVideo,stopScreen,updateState]);
  const updateScreenFrameRate=useCallback(async(nextFps:FrameRate)=>{
    screenConfigRef.current={...screenConfigRef.current,fps:nextFps};
    let source=streamRef.current?.getVideoTracks().find(valid);
    if(!source)return;

    // Keep the capture source at 60 whenever possible. Agora can then switch
    // 30 <-> 60 only at the encoder without restarting the room or publisher.
    if(nextFps===60){
      try{
        await source.applyConstraints({frameRate:{ideal:60,max:60}});
        try{source.contentHint="motion";}catch{}
      }catch(cause){console.warn("Display FPS upgrade constraint failed",cause);}

      let captured=source.getSettings().frameRate;
      if(!captured||captured<50){
        const previousStream=streamRef.current;
        const previousAudio=previousStream?.getAudioTracks().filter(valid)||[];
        let freshStream:MediaStream;
        try{
          // This runs directly from the user's 60 FPS click. The old 30 FPS
          // publication stays live while the browser asks for the screen again.
          freshStream=await navigator.mediaDevices.getDisplayMedia(displayConstraints(screenConfigRef.current.quality,60));
        }catch(cause){
          console.warn("60 FPS screen refresh cancelled or failed",cause);
          setError((cause as DOMException).name==="NotAllowedError"
            ?"A transmissão continuou em 30 FPS porque a nova captura foi cancelada."
            :"Não foi possível atualizar a captura para 60 FPS; a transmissão atual foi mantida.");
          return;
        }

        const freshVideo=freshStream.getVideoTracks().find(valid);
        // We only need a new video source. Keep the already-published screen
        // audio untouched so mute state and audio continuity are preserved.
        freshStream.getAudioTracks().forEach(track=>track.stop());
        if(!freshVideo){
          freshStream.getTracks().forEach(track=>track.stop());
          setError("A nova captura não forneceu vídeo ativo; a transmissão atual foi mantida.");
          return;
        }
        try{freshVideo.contentHint="motion";}catch{}

        try{
          if(stateRef.current.screenProvider==="agora"){
            const videoTrack=screenTracksRef.current.find((track):track is ILocalVideoTrack=>track.trackMediaType==="video");
            if(!videoTrack)throw new Error("Track de vídeo Agora indisponível.");
            // Agora supports replacing a published MediaStreamTrack in-place,
            // so viewers stay in the same live publication.
            await videoTrack.replaceTrack(freshVideo,false);
          }else{
            const room=livekitRef.current;
            if(!room)throw new Error("LiveKit indisponível.");
            await room.localParticipant.unpublishTrack(source,false);
            try{
              await room.localParticipant.publishTrack(freshVideo,{source:Track.Source.ScreenShare});
            }catch(cause){
              // Roll back to the previous source if publishing the replacement fails.
              await room.localParticipant.publishTrack(source,{source:Track.Source.ScreenShare}).catch(()=>undefined);
              throw cause;
            }
            screenLivekitTracksRef.current=screenLivekitTracksRef.current.map(track=>track===source?freshVideo:track);
            if(!screenLivekitTracksRef.current.includes(freshVideo))screenLivekitTracksRef.current.unshift(freshVideo);
          }

          const merged=new MediaStream([freshVideo,...previousAudio]);
          streamRef.current=merged;
          showVideo(freshVideo);
          freshVideo.addEventListener("ended",()=>{if(streamRef.current?.getVideoTracks()[0]===freshVideo)void stopScreen();},{once:true});
          source.stop();
          source=freshVideo;
          captured=freshVideo.getSettings().frameRate;
        }catch(cause){
          console.error("Live screen source replacement failed",cause);
          freshVideo.stop();
          setError("Não foi possível trocar a fonte para 60 FPS; a transmissão atual foi mantida.");
          return;
        }
      }
    }else if(stateRef.current.screenProvider==="livekit"){
      // LiveKit publishes the raw screen track, so 30 FPS must be applied to
      // the source itself. Agora keeps a 60 FPS source and limits only encoder output.
      try{await source.applyConstraints({frameRate:{ideal:30,max:30}});}
      catch(cause){console.warn("LiveKit 30 FPS constraint failed",cause);}
    }

    if(stateRef.current.screenProvider==="agora"){
      const videoTrack=screenTracksRef.current.find((track):track is ILocalVideoTrack=>track.trackMediaType==="video");
      if(videoTrack){
        const quality=screenConfigRef.current.quality,settings=source.getSettings(),width=settings.width||(quality==="1080p"?1920:quality==="720p"?1280:1280),height=settings.height||(quality==="1080p"?1080:quality==="720p"?720:720),bitrateMax=quality==="1080p"?(nextFps===60?5000:3000):quality==="720p"?(nextFps===60?3000:2000):(nextFps===60?3500:2500);
        try{await videoTrack.setEncoderConfiguration({width,height,frameRate:nextFps,bitrateMax});}
        catch(cause){console.warn("Agora live FPS update failed",cause);}
      }
    }

    const actual=source.getSettings().frameRate;
    console.info("LumaCast live FPS update",{requestedFps:nextFps,captureSourceFps:actual,provider:stateRef.current.screenProvider});
    if(nextFps===60&&actual&&actual<50)setError(`O navegador manteve a captura em ${Math.round(actual)} FPS mesmo após a atualização para 60 FPS.`);
    else setError("");
  },[showVideo,stopScreen]);
  const toggleCamera=useCallback(async()=>{
    try{
      const room=await ensureLivekit();
      if(cameraOn){
        await room.localParticipant.setCameraEnabled(false);
        cameraRef.current=null;
        removeCamera(socketIdRef.current);
        setCameraOn(false);
      }else{
        const width=cameraPreset==="480p60"?854:1280,height=cameraPreset==="480p60"?480:720,fps=cameraPreset==="480p60"?60:40;
        const publication=await room.localParticipant.setCameraEnabled(true,{resolution:{width,height},frameRate:{ideal:fps,max:fps}});
        const track=publication?.track?.mediaStreamTrack;
        if(!valid(track))throw new Error("A câmera não forneceu vídeo ativo.");
        cameraRef.current=track;
        putCamera({identity:socketIdRef.current,track,local:true});
        setCameraOn(true);
      }
      connectSocket().emit("livekit-media-active",{roomId:roomIdRef.current,active:!cameraOn||!!streamRef.current&&stateRef.current.screenProvider==="livekit"});
    }catch(cause){console.error("LiveKit camera error",cause);setError("Não foi possível ativar a câmera.");}
  },[cameraOn,cameraPreset,ensureLivekit,putCamera,removeCamera]);
  const toggleScreenAudio=useCallback(async()=>{
    if(screenAudioBusyRef.current)return;
    const source=streamRef.current?.getAudioTracks().find(valid);
    if(!source){setError("Esta captura não possui áudio para silenciar.");return;}
    const nextMuted=!screenAudioMutedRef.current;
    screenAudioBusyRef.current=true;
    try{
      if(stateRef.current.screenProvider==="agora"){
        const client=screenClientRef.current,audioTrack=screenTracksRef.current.find((track):track is ILocalAudioTrack=>track.trackMediaType==="audio");
        if(!client||!audioTrack)throw new Error("Áudio da transmissão indisponível.");
        if(nextMuted){await client.unpublish(audioTrack);source.enabled=false;}
        else{source.enabled=true;await client.publish(audioTrack);}
      }else{
        const room=livekitRef.current;
        if(!room)throw new Error("Servidor alternativo indisponível.");
        if(nextMuted){
          const published=screenLivekitTracksRef.current.find(track=>track.kind==="audio");
          if(published){await room.localParticipant.unpublishTrack(published,false);screenLivekitTracksRef.current=screenLivekitTracksRef.current.filter(track=>track!==published);}
          source.enabled=false;
        }else{
          source.enabled=true;
          await room.localParticipant.publishTrack(source,{source:Track.Source.ScreenShareAudio});
          if(!screenLivekitTracksRef.current.includes(source))screenLivekitTracksRef.current.push(source);
        }
      }
      screenAudioMutedRef.current=nextMuted;setMuted(nextMuted);
    }catch(cause){
      source.enabled=!screenAudioMutedRef.current;
      console.error("Screen audio toggle error",cause);
      setError("Não foi possível alterar o áudio da transmissão.");
    }finally{screenAudioBusyRef.current=false;}
  },[]);
  useEffect(()=>{
    const socket=connectSocket();
    const apply=(ack:RoomAck|JoinAck)=>{
      if(!ack.ok||!ack.agoraAppId||!ack.agoraChannel||ack.agoraUid===undefined||!ack.agoraToken){
        setError(ack.error||"Sala não encontrada.");setStatus("missing");return;
      }
      const next:AgoraCredentials={agoraAppId:ack.agoraAppId,agoraChannel:ack.agoraChannel,agoraUid:ack.agoraUid,agoraToken:ack.agoraToken};
      credentialsRef.current=next;setCredentials(next);
      updateState({live:!!ack.live,count:ack.count||0,activeScreenSharerId:ack.activeScreenSharerId||null,activeScreenUid:ack.activeScreenUid??null,screenProvider:ack.screenProvider||"agora",livekitActive:!!ack.livekitActive});
      if("roomId" in ack&&ack.roomId){roomIdRef.current=ack.roomId;setRoomId(ack.roomId);}
      if("ownerToken" in ack&&ack.ownerToken)sessionStorage.setItem("lumacast-broadcaster",JSON.stringify({roomId:roomIdRef.current,token:ack.ownerToken}));
      if("participantToken" in ack&&ack.participantToken)sessionStorage.setItem(`lumacast-participant-${roomIdRef.current}`,ack.participantToken);
      setStatus("Conectado");
      const mediaActive=valid(cameraRef.current)||!!streamRef.current&&stateRef.current.screenProvider==="livekit";
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
        const saved=sessionStorage.getItem("lumacast-broadcaster");
        if(saved){
          try{const parsed=JSON.parse(saved) as {roomId:string;token:string};socket.emit("reclaim-room",parsed,(ack:RoomAck)=>ack.ok?apply(ack):socket.emit("create-room",(fresh:RoomAck)=>apply(fresh)));}
          catch{socket.emit("create-room",(ack:RoomAck)=>apply(ack));}
        }else socket.emit("create-room",(ack:RoomAck)=>apply(ack));
      }else socket.emit("join-room",{roomId:requestedRoomId,participantToken:sessionStorage.getItem(`lumacast-participant-${requestedRoomId}`)},(ack:JoinAck)=>apply(ack));
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
    const onDisconnect=()=>setStatus("Reconectando"),onExpired=()=>setStatus("missing");
    socket.on("connect",connect);socket.on("disconnect",onDisconnect);socket.on("room-state",onState);socket.on("room-expired",onExpired);
    if(socket.connected)connect();
    return()=>{socket.off("connect",connect);socket.off("disconnect",onDisconnect);socket.off("room-state",onState);socket.off("room-expired",onExpired);};
  },[clearVideo,ensureLivekit,fallback,owner,requestedRoomId,showVideo,updateState]);
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
  },[credentials?.agoraAppId,credentials?.agoraChannel,credentials?.agoraUid,roomState.live,roomState.screenProvider,roomState.activeScreenUid,roomState.activeScreenSharerId,clearVideo,renew,showVideo]);
  useEffect(()=>{if(roomState.livekitActive){void ensureLivekit().catch(cause=>{console.error("LiveKit join error",cause);setError("Não foi possível conectar à mídia da sala.");});return;}const timer=setTimeout(()=>{if(!stateRef.current.livekitActive&&!valid(cameraRef.current||undefined)&&!(streamRef.current&&stateRef.current.screenProvider==="livekit")){const room=livekitRef.current;livekitRef.current=null;if(room)void room.disconnect();setCameras([]);livekitAudioRef.current.forEach(element=>element.remove());livekitAudioRef.current.clear();}},3_000);return()=>clearTimeout(timer);},[roomState.livekitActive,ensureLivekit]);
  useEffect(()=>{if(!roomState.live)return;const timer=setInterval(()=>{const client=socketIdRef.current===roomState.activeScreenSharerId?screenClientRef.current:subscriberRef.current;if(client&&roomState.screenProvider==="agora")void readAgoraStats(client,streamRef.current,socketIdRef.current===roomState.activeScreenSharerId?null:roomState.activeScreenUid).then(setStats);},1000);return()=>clearInterval(timer);},[roomState.live,roomState.activeScreenSharerId,roomState.activeScreenUid,roomState.screenProvider]);
  useEffect(()=>()=>{const room=livekitRef.current;if(room)void room.disconnect();livekitAudioRef.current.forEach(element=>element.remove());cameraRef.current?.stop();if(streamRef.current)void stopScreen();},[stopScreen]);
  return{videoRef,roomId,roomState,ready,status,error,setError,stats,cameras,cameraOn,cameraPreset,setCameraPreset,switching,muted,isScreenSharer:!!roomState.activeScreenSharerId&&roomState.activeScreenSharerId===socketIdRef.current,startScreen,stopScreen,updateScreenFrameRate,toggleCamera,toggleScreenAudio};
}
