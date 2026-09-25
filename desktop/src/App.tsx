import { useCallback, useEffect, useRef, useState } from "react";
import { safeSessionGet, safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { AmbientBackground } from "./components/AmbientBackground";
import { HowItWorksDialog } from "./components/HowItWorksDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Titlebar } from "./components/Titlebar";
import { useDesktopMediaPreferences } from "./hooks/useDesktopMediaPreferences";
import { signalingReady, wakeSignalingServer, type BackendWakeState } from "./services/backendWake";
import { HomePage } from "./pages/HomePage";
import { RoomPage } from "./pages/RoomPage";
import { WelcomePage } from "./pages/WelcomePage";

type Route={type:"home"}|{type:"room";owner:boolean;roomId?:string;inviteToken?:string};

export function App(){
  const [route,setRoute]=useState<Route>({type:"home"});
  const [entryScreen,setEntryScreen]=useState<"welcome"|"home">("welcome");
  const [howOpen,setHowOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [backendState,setBackendState]=useState<BackendWakeState>("waking");
  const [backendMessage,setBackendMessage]=useState("Verificando o servidor…");
  const backendStateRef=useRef<BackendWakeState>("waking");
  const {quality,setQuality,fps,setFps}=useDesktopMediaPreferences();

  const ensureBackend=useCallback(async(force=false)=>{
    if(!force&&backendStateRef.current==="ready"&&signalingReady())return true;

    backendStateRef.current="waking";
    setBackendState("waking");
    setBackendMessage("Acordando o servidor gratuito…");

    try{
      await wakeSignalingServer();
      backendStateRef.current="ready";
      setBackendState("ready");
      setBackendMessage("Servidor e conexão em tempo real prontos");
      return true;
    }catch(cause){
      const detail=cause instanceof Error?cause.message:"Não foi possível alcançar o servidor.";
      backendStateRef.current="error";
      setBackendState("error");
      setBackendMessage(detail);
      return false;
    }
  },[]);

  useEffect(()=>{void ensureBackend();},[ensureBackend]);

  const createRoom=async(name:string)=>{
    if(!await ensureBackend())return false;
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-broadcaster");
    setRoute({type:"room",owner:true});
    return true;
  };

  const joinRoom=async(roomId:string,inviteToken:string,name:string)=>{
    if(!await ensureBackend())return false;
    safeSessionSet("lumacast-display-name",name);
    if(inviteToken)safeSessionSet("lumacast-invite-"+roomId,inviteToken);else safeSessionRemove("lumacast-invite-"+roomId);
    safeSessionRemove("lumacast-guest-"+roomId);
    safeSessionRemove("lumacast-participant-"+roomId);
    setRoute({type:"room",owner:false,roomId,inviteToken});
    return true;
  };

  const resumeRoom=async(roomId:string,owner:boolean,name:string)=>{
    if(!await ensureBackend())return false;
    if(owner){
      const saved=safeSessionGet("lumacast-broadcaster");
      try{if(!saved||(JSON.parse(saved) as {roomId?:string}).roomId!==roomId)return false;}catch{return false;}
    }else if(!safeSessionGet("lumacast-participant-"+roomId))return false;
    if(name.trim())safeSessionSet("lumacast-display-name",name.trim());
    setRoute({type:"room",owner,roomId});
    return true;
  };

  const titleStatus=route.type==="room"?"Em sala":backendState==="ready"?"Pronto":backendState==="error"?"Servidor offline":"Acordando…";

  return <div className="app-shell">
    <AmbientBackground/>
    <Titlebar status={titleStatus} tone={backendState==="ready"?"ready":"warn"}/>
    <div className="app-content">
      {route.type==="home"
        ?entryScreen==="welcome"
          ?<WelcomePage onStart={()=>setEntryScreen("home")} onHow={()=>setHowOpen(true)} onSettings={()=>setSettingsOpen(true)}/>
          :<HomePage onCreate={createRoom} onJoin={joinRoom} onResume={resumeRoom} onHow={()=>setHowOpen(true)} onSettings={()=>setSettingsOpen(true)} backendState={backendState} backendMessage={backendMessage} onRetry={()=>void ensureBackend(true)} onBack={()=>setEntryScreen("welcome")}/>
        :<RoomPage owner={route.owner} roomId={route.roomId} inviteToken={route.inviteToken} onBack={()=>setRoute({type:"home"})}/>}
    </div>
    {howOpen&&<HowItWorksDialog onClose={()=>setHowOpen(false)}/>}
    {settingsOpen&&<SettingsDialog onClose={()=>setSettingsOpen(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps}/>}
  </div>;
}
