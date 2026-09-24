import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { AmbientBackground } from "./components/AmbientBackground";
import { HowItWorksDialog } from "./components/HowItWorksDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Titlebar } from "./components/Titlebar";
import { useDesktopMediaPreferences } from "./hooks/useDesktopMediaPreferences";
import { wakeSignalingServer, type BackendWakeState } from "./services/backendWake";
import { HomePage } from "./pages/HomePage";
const RoomPage=lazy(()=>import("./pages/RoomPage").then(module=>({default:module.RoomPage})));

type Route={type:"home"}|{type:"room";owner:boolean;roomId?:string};

export function App(){
  const [route,setRoute]=useState<Route>({type:"home"});
  const [howOpen,setHowOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [backendState,setBackendState]=useState<BackendWakeState>("waking");
  const [backendMessage,setBackendMessage]=useState("Verificando o servidor…");
  const {quality,setQuality,fps,setFps}=useDesktopMediaPreferences();

  const ensureBackend=useCallback(async()=>{
    setBackendState("waking");
    setBackendMessage("Acordando o servidor…");
    try{
      await wakeSignalingServer();
      setBackendState("ready");
      setBackendMessage("Servidor pronto");
      return true;
    }catch(cause){
      const detail=cause instanceof Error?cause.message:"Não foi possível alcançar o servidor.";
      setBackendState("error");
      setBackendMessage(detail);
      return false;
    }
  },[]);

  useEffect(()=>{void ensureBackend();},[ensureBackend]);

  const createRoom=async(name:string)=>{
    if(!await ensureBackend())return;
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-broadcaster");
    setRoute({type:"room",owner:true});
  };

  const joinRoom=async(roomId:string,name:string)=>{
    if(!await ensureBackend())return;
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-participant-"+roomId);
    setRoute({type:"room",owner:false,roomId});
  };

  const titleStatus=route.type==="room"?"Em sala":backendState==="ready"?"Pronto":backendState==="error"?"Servidor offline":"Acordando…";

  return <div className="app-shell">
    <AmbientBackground/>
    <Titlebar status={titleStatus} tone={backendState==="ready"?"ready":"warn"}/>
    <div className="app-content">
      {route.type==="home"
        ?<HomePage onCreate={createRoom} onJoin={joinRoom} onHow={()=>setHowOpen(true)} onSettings={()=>setSettingsOpen(true)} backendState={backendState} backendMessage={backendMessage} onRetry={()=>void ensureBackend()}/>
        :<Suspense fallback={<main className="room-loading" role="status"><span/><strong>Preparando a sala…</strong><small>Carregando mídia em tempo real</small></main>}><RoomPage owner={route.owner} roomId={route.roomId} onBack={()=>setRoute({type:"home"})}/></Suspense>}
    </div>
    {howOpen&&<HowItWorksDialog onClose={()=>setHowOpen(false)}/>}
    {settingsOpen&&<SettingsDialog onClose={()=>setSettingsOpen(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps}/>}
  </div>;
}
