import { lazy, Suspense, useState } from "react";
import { safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { AmbientBackground } from "./components/AmbientBackground";
import { HowItWorksDialog } from "./components/HowItWorksDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Titlebar } from "./components/Titlebar";
import { useDesktopMediaPreferences } from "./hooks/useDesktopMediaPreferences";
import { HomePage } from "./pages/HomePage";
const RoomPage=lazy(()=>import("./pages/RoomPage").then(module=>({default:module.RoomPage})));

type Route={type:"home"}|{type:"room";owner:boolean;roomId?:string};

export function App(){
  const [route,setRoute]=useState<Route>({type:"home"});
  const [howOpen,setHowOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const {quality,setQuality,fps,setFps}=useDesktopMediaPreferences();

  const createRoom=(name:string)=>{
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-broadcaster");
    setRoute({type:"room",owner:true});
  };

  const joinRoom=(roomId:string,name:string)=>{
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-participant-"+roomId);
    setRoute({type:"room",owner:false,roomId});
  };

  return <div className="app-shell">
    <AmbientBackground/>
    <Titlebar status={route.type==="room"?"Em sala":"Pronto"} tone="ready"/>
    <div className="app-content">
      {route.type==="home"
        ?<HomePage onCreate={createRoom} onJoin={joinRoom} onHow={()=>setHowOpen(true)} onSettings={()=>setSettingsOpen(true)}/>
        :<Suspense fallback={<main className="room-loading" role="status"><span/><strong>Preparando a sala…</strong><small>Carregando mídia em tempo real</small></main>}><RoomPage owner={route.owner} roomId={route.roomId} onBack={()=>setRoute({type:"home"})}/></Suspense>}
    </div>
    {howOpen&&<HowItWorksDialog onClose={()=>setHowOpen(false)}/>}
    {settingsOpen&&<SettingsDialog onClose={()=>setSettingsOpen(false)} quality={quality} setQuality={setQuality} fps={fps} setFps={setFps}/>}
  </div>;
}
