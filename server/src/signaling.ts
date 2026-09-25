import type { Server,Socket } from "socket.io";
import { agoraConfigured,createAgoraCredentials,createAgoraUid,optionalAgoraCredentials } from "./agora.js";
import { createLiveKitToken,livekitConfigured } from "./livekit.js";
import { guestCodeMatches,hashSecret,newGuestCode,newSecret,normalizeDisplayName,RoomStore,secretMatches,validGuestCode,validRoomId,validSecret,type Room,type ScreenProvider } from "./rooms.js";
import { createRoomPersistenceFromEnv } from "./roomPersistence.js";

type Ack=(payload:Record<string,unknown>)=>void;
const reply=(ack:unknown,payload:Record<string,unknown>)=>{if(typeof ack==="function")(ack as Ack)(payload);};
const limiter=new Map<string,{start:number;count:number}>();
const limiterCleanup=setInterval(()=>{const cutoff=Date.now()-120_000;for(const [key,value] of limiter)if(value.start<cutoff)limiter.delete(key);},60_000);
limiterCleanup.unref();
const proxyHopsRaw=Number(process.env.TRUST_PROXY_HOPS||0);
const proxyHops=Number.isInteger(proxyHopsRaw)&&proxyHopsRaw>=0&&proxyHopsRaw<=10?proxyHopsRaw:0;
const maxParticipantsRaw=Number(process.env.MAX_ROOM_PARTICIPANTS||50);
const maxParticipants=Number.isInteger(maxParticipantsRaw)&&maxParticipantsRaw>=1&&maxParticipantsRaw<=500?maxParticipantsRaw:50;
function rateAddress(socket:Socket){
  if(proxyHops<=0)return socket.handshake.address;
  const raw=socket.handshake.headers["x-forwarded-for"];
  const value=Array.isArray(raw)?raw.join(","):raw;
  const forwarded=value?.split(",").map(item=>item.trim()).filter(Boolean)||[];
  if(!forwarded.length)return socket.handshake.address;
  return forwarded[Math.max(0,forwarded.length-proxyHops)]||socket.handshake.address;
}
function allowed(socket:Socket,limit=140,windowMs=10_000,scope="general"){const now=Date.now(),key=`${scope}:${rateAddress(socket)}`;let entry=limiter.get(key);if(!entry||now-entry.start>windowMs)entry={start:now,count:0};entry.count++;limiter.set(key,entry);return entry.count<=limit;}
const livekitActive=(room:Room)=>room.ownerLivekitActive||[...room.participants.values()].some(p=>p.livekitActive)||room.live&&room.screenProvider==="livekit";
const state=(room:Room)=>({live:room.live,count:room.participants.size,activeScreenSharerId:room.activeScreenSharerId,activeScreenUid:room.activeScreenUid,activeScreenSharerName:room.activeScreenSharerId===room.ownerId?room.ownerName:room.participants.get(room.activeScreenSharerId||"")?.displayName||null,screenProvider:room.screenProvider,livekitActive:livekitActive(room),ownerName:room.ownerName,locked:room.locked,guestCodeEnabled:!!room.guestCodeHash,participants:[{id:room.ownerId,displayName:room.ownerName,role:"owner" as const},...[...room.participants.values()].map(p=>({id:p.socketId,displayName:p.displayName,role:"participant" as const}))]});
export async function registerSignaling(io:Server){const rooms=new RoomStore(createRoomPersistenceFromEnv());await rooms.hydrate();
  const announce=(room:Room)=>{rooms.persist(room);io.to(room.id).emit("room-state",state(room));io.to(room.ownerId).emit("viewer-count",{count:room.participants.size});};
  const release=(room:Room)=>{if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);room.screenDisconnectTimer=undefined;room.activeScreenSharerId=null;room.activeScreenUid=null;room.screenProvider="agora";room.live=false;io.to(room.id).emit("broadcast-ended");announce(room);};
  io.on("connection",socket=>{
    const member=(input:unknown)=>{const id=(input as {roomId?:unknown})?.roomId;if(!validRoomId(id))return null;const room=rooms.get(id);return room&&rooms.isMember(room,socket.id)?room:null;};

    socket.on("create-room",(input:unknown,ack:Ack)=>{
      if(!allowed(socket,5,60_000,"create"))return reply(ack,{ok:false,error:"Muitas tentativas. Aguarde um minuto."});

      const requested=normalizeDisplayName((input as {displayName?:unknown})?.displayName);
      if(!requested)return reply(ack,{ok:false,error:"Informe um nome entre 2 e 20 caracteres."});
      try{
        const existing=rooms.findByOwner(socket.id),room=existing??rooms.create(rooms.newId(),socket.id,requested,createAgoraUid());
        socket.join(room.id);
        reply(ack,{ok:true,roomId:room.id,ownerToken:room.ownerToken||undefined,broadcasterToken:room.ownerToken||undefined,inviteToken:room.inviteToken||undefined,displayName:room.ownerName,...optionalAgoraCredentials(room.id,room.ownerUid,"viewer"),...state(room)});
      }catch(error){console.error("Room creation error",error);reply(ack,{ok:false,error:"Não foi possível criar a sala."});}
    });

    socket.on("reclaim-room",(input:unknown,ack:Ack)=>{
      if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});

      const data=input as {roomId?:unknown;token?:unknown;inviteToken?:unknown};
      if(!validRoomId(data?.roomId)||!validSecret(data.token))return reply(ack,{ok:false,error:"Credenciais inválidas."});
      const room=rooms.get(data.roomId);
      if(!room||!rooms.reclaim(room,data.token,socket.id,data.inviteToken))return reply(ack,{ok:false,error:"Sala expirada ou credenciais inválidas."});
      try{socket.join(room.id);reply(ack,{ok:true,roomId:room.id,ownerToken:room.ownerToken||undefined,inviteToken:room.inviteToken||undefined,...optionalAgoraCredentials(room.id,room.ownerUid,"viewer"),...state(room)});announce(room);}
      catch(error){console.error("Owner reclaim error",error);reply(ack,{ok:false,error:"Não foi possível retomar a sala."});}
    });

    socket.on("join-room",(input:unknown,ack:Ack)=>{
      if(!allowed(socket,60,60_000,"join"))return reply(ack,{ok:false,error:"Muitas tentativas. Aguarde um minuto."});

      const data=input as {roomId?:unknown;participantToken?:unknown;inviteToken?:unknown;guestCode?:unknown;displayName?:unknown};
      if(!validRoomId(data?.roomId))return reply(ack,{ok:false,error:"Código de sala inválido."});
      const room=rooms.get(data.roomId);
      if(!room)return reply(ack,{ok:false,error:"Sala não encontrada ou convite inválido."});
      try{
        const reconnectToken=validSecret(data.participantToken)?data.participantToken:null;
        const old=reconnectToken?[...room.participants.values()].find(p=>secretMatches(reconnectToken,p.tokenHash)):undefined;
        let participant=room.participants.get(socket.id);
        if(!participant){
          if(!old&&room.locked)return reply(ack,{ok:false,error:"Esta sala está trancada pelo anfitrião."});
          if(!old&&room.participants.size>=maxParticipants)return reply(ack,{ok:false,error:"Esta sala atingiu o limite de participantes."});
          if(old){
            if(old.disconnectTimer)clearTimeout(old.disconnectTimer);
            room.participants.delete(old.socketId);
            participant={...old,socketId:socket.id,token:reconnectToken,disconnectTimer:undefined};
            if(room.activeScreenSharerId===old.socketId){if(room.screenDisconnectTimer)clearTimeout(room.screenDisconnectTimer);room.screenDisconnectTimer=undefined;room.activeScreenSharerId=socket.id;}
          }else{
            const inviteOk=validSecret(data.inviteToken)&&secretMatches(data.inviteToken,room.inviteTokenHash);
            const codeOk=validGuestCode(data.guestCode)&&guestCodeMatches(data.guestCode,room.guestCodeHash);
            if(!inviteOk&&!codeOk)return reply(ack,{ok:false,error:"Sala não encontrada ou convite/código inválido."});
            const requested=normalizeDisplayName(data.displayName);
            if(!requested)return reply(ack,{ok:false,error:"Informe um nome entre 2 e 20 caracteres."});
            let uid:number;do{uid=createAgoraUid();}while(uid===room.ownerUid||[...room.participants.values()].some(p=>p.agoraUid===uid));
            const token=newSecret();
            participant={socketId:socket.id,displayName:rooms.nameFor(room,requested),agoraUid:uid,token,tokenHash:hashSecret(token),livekitActive:false};
          }
          room.participants.set(socket.id,participant);
        }
        socket.join(room.id);
        reply(ack,{ok:true,participantToken:participant.token||undefined,displayName:participant.displayName,...optionalAgoraCredentials(room.id,participant.agoraUid,"viewer"),...state(room)});
        announce(room);
      }catch(error){console.error("Room join error",error);reply(ack,{ok:false,error:"Não foi possível entrar na sala."});}
    });

    socket.on("request-screen-share",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room)return reply(ack,{ok:false,error:"Participante não autorizado."});if(room.activeScreenSharerId&&room.activeScreenSharerId!==socket.id)return reply(ack,{ok:false,error:"Outra pessoa já está compartilhando a tela."});try{const useAgora=agoraConfigured();if(!useAgora&&!livekitConfigured())return reply(ack,{ok:false,error:"Configure Agora ou LiveKit para compartilhar a tela."});if(!room.activeScreenSharerId){room.activeScreenSharerId=socket.id;let uid:number;do{uid=createAgoraUid();}while(uid===room.ownerUid||[...room.participants.values()].some(p=>p.agoraUid===uid));room.activeScreenUid=useAgora?uid:null;room.screenProvider=useAgora?"agora":"livekit";}reply(ack,{ok:true,...(useAgora?createAgoraCredentials(room.id,room.activeScreenUid!,"broadcaster"):{}),...state(room)});announce(room);}catch(error){console.error("Screen lock error",error);reply(ack,{ok:false,error:"Não foi possível preparar a tela."});}});
    socket.on("release-screen-share",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room||room.activeScreenSharerId!==socket.id)return reply(ack,{ok:false,error:"Participante não autorizado."});release(room);reply(ack,{ok:true});});
    socket.on("screen-provider-changed",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input),provider=(input as {provider?:ScreenProvider})?.provider;if(!room||room.activeScreenSharerId!==socket.id||provider!=="livekit")return reply(ack,{ok:false,error:"Participante não autorizado."});room.screenProvider="livekit";io.to(room.id).emit("screen-provider-changed",{screenProvider:"livekit"});announce(room);reply(ack,{ok:true});});
    socket.on("broadcast-started",(input:unknown)=>{if(!allowed(socket))return;const room=member(input);if(!room||room.activeScreenSharerId!==socket.id)return;room.live=true;io.to(room.id).emit("broadcast-started");announce(room);});
    socket.on("broadcast-ended",(input:unknown)=>{if(!allowed(socket))return;const room=member(input);if(room&&room.activeScreenSharerId===socket.id)release(room);});

    socket.on("renew-agora-token",(input:unknown,ack:Ack)=>{if(!allowed(socket,30,60_000,"credentials"))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room)return reply(ack,{ok:false,error:"Participante não autorizado."});try{const screen=room.activeScreenSharerId===socket.id&&(input as {screen?:boolean})?.screen===true,uid=screen?room.activeScreenUid:rooms.getUid(room,socket.id);if(uid==null)return reply(ack,{ok:false,error:"UID inválido."});reply(ack,{ok:true,agoraToken:createAgoraCredentials(room.id,uid,screen?"broadcaster":"viewer").agoraToken});}catch(error){console.error("Agora renewal error",error);reply(ack,{ok:false,error:"Não foi possível renovar a conexão."});}});
    socket.on("get-livekit-token",async(input:unknown,ack:Ack)=>{if(!allowed(socket,30,60_000,"credentials"))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room)return reply(ack,{ok:false,error:"Participante não autorizado."});try{const screen=room.activeScreenSharerId===socket.id,token=await createLiveKitToken(room.id,socket.id,screen);reply(ack,{ok:true,livekitUrl:process.env.LIVEKIT_URL,livekitToken:token});}catch(error){console.error("LiveKit token error",error);reply(ack,{ok:false,error:"Não foi possível conectar ao LiveKit."});}});

    socket.on("livekit-media-active",(input:unknown)=>{if(!allowed(socket))return;const room=member(input),participant=room?.participants.get(socket.id);if(!room)return;if(participant)participant.livekitActive=!!(input as {active?:boolean}).active;else room.ownerLivekitActive=!!(input as {active?:boolean}).active;announce(room);});
    socket.on("set-room-lock",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room||room.ownerId!==socket.id)return reply(ack,{ok:false,error:"Apenas o anfitrião pode trancar a sala."});room.locked=!!(input as {locked?:boolean}).locked;announce(room);reply(ack,{ok:true,locked:room.locked});});
    socket.on("rotate-room-invite",(input:unknown,ack:Ack)=>{if(!allowed(socket,20,60_000,"invite"))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room||room.ownerId!==socket.id)return reply(ack,{ok:false,error:"Apenas o anfitrião pode renovar o convite."});const inviteToken=newSecret();room.inviteToken=inviteToken;room.inviteTokenHash=hashSecret(inviteToken);rooms.persist(room);reply(ack,{ok:true,inviteToken});});
    socket.on("rotate-room-guest-code",(input:unknown,ack:Ack)=>{if(!allowed(socket,20,60_000,"guest-code"))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room||room.ownerId!==socket.id)return reply(ack,{ok:false,error:"Apenas o anfitrião pode gerar um código temporário."});const guestCode=newGuestCode();room.guestCodeHash=hashSecret(guestCode);announce(room);reply(ack,{ok:true,guestCode});});
    socket.on("disable-room-guest-code",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input);if(!room||room.ownerId!==socket.id)return reply(ack,{ok:false,error:"Apenas o anfitrião pode desativar o código temporário."});room.guestCodeHash=null;announce(room);reply(ack,{ok:true});});
    socket.on("kick-participant",(input:unknown,ack:Ack)=>{if(!allowed(socket))return reply(ack,{ok:false,error:"Muitas tentativas."});const room=member(input),targetId=(input as {participantId?:unknown})?.participantId;if(!room||room.ownerId!==socket.id||typeof targetId!=="string")return reply(ack,{ok:false,error:"Apenas o anfitrião pode remover participantes."});const participant=room.participants.get(targetId);if(!participant)return reply(ack,{ok:false,error:"Participante não encontrado."});if(participant.disconnectTimer)clearTimeout(participant.disconnectTimer);room.participants.delete(targetId);if(room.activeScreenSharerId===targetId)release(room);io.to(targetId).emit("kicked",{roomId:room.id,reason:"Você foi removido da sala pelo anfitrião."});io.sockets.sockets.get(targetId)?.leave(room.id);announce(room);reply(ack,{ok:true});});
    socket.on("leave-room",(input:unknown)=>{if(!allowed(socket))return;const room=member(input);if(!room)return;const participant=room.participants.get(socket.id);if(participant){room.participants.delete(socket.id);socket.leave(room.id);if(room.activeScreenSharerId===socket.id)release(room);announce(room);}});

    socket.on("disconnect",()=>{
      const owner=rooms.findByOwner(socket.id);
      if(owner){owner.ownerLivekitActive=false;io.to(owner.id).emit("owner-disconnected");owner.ownerDisconnectTimer=setTimeout(()=>{if(rooms.get(owner.id)===owner&&owner.ownerId===socket.id){rooms.remove(owner.id);io.to(owner.id).emit("broadcast-ended");io.to(owner.id).emit("room-expired");}},30_000);rooms.persist(owner);}
      const room=rooms.findByParticipant(socket.id);
      if(room){const participant=room.participants.get(socket.id)!;participant.livekitActive=false;participant.disconnectTimer=setTimeout(()=>{if(room.participants.get(socket.id)===participant){room.participants.delete(socket.id);if(room.activeScreenSharerId===socket.id)release(room);announce(room);}},10_000);announce(room);}
      const screen=owner?.activeScreenSharerId===socket.id?owner:room?.activeScreenSharerId===socket.id?room:null;
      if(screen){screen.screenDisconnectTimer=setTimeout(()=>{if(screen.activeScreenSharerId===socket.id)release(screen);},10_000);}
    });
  });
  return rooms;
}
