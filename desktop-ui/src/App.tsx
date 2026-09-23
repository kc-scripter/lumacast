import { useCallback, useState } from "react";
import { safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { getSocket } from "../../client/src/services/socket";
import { AmbientBackground } from "./components/AmbientBackground";
import { DesktopTitleBar } from "./components/DesktopTitleBar";
import { SplashScreen } from "./components/SplashScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { RoomLayout } from "./screens/RoomLayout";
import { SettingsScreen } from "./screens/SettingsScreen";

export type SessionState={owner:boolean;roomId?:string};
type AppPage="home"|"settings";

function shouldShowSplash(){
  const forced=new URLSearchParams(window.location.search).get("splash")==="true";
  return forced||localStorage.getItem("lunira_show_splash")!=="0";
}

export default function App(){
  const [session,setSession]=useState<SessionState|null>(null);
  const [page,setPage]=useState<AppPage>("home");
  const [showSplash,setShowSplash]=useState(shouldShowSplash);

  const createRoom=useCallback((name:string)=>{
    safeSessionSet("lumacast-display-name",name);
    safeSessionRemove("lumacast-broadcaster");
    getSocket().disconnect();
    setSession({owner:true});
  },[]);

  const joinRoom=useCallback((name:string,roomId:string)=>{
    safeSessionSet("lumacast-display-name",name);
    getSocket().disconnect();
    setSession({owner:false,roomId});
  },[]);

  const goHome=useCallback(()=>{
    getSocket().disconnect();
    setSession(null);
    setPage("home");
  },[]);

  return <div className="relative isolate flex h-screen min-h-0 flex-col overflow-hidden bg-[#08090d] text-zinc-100">
    <AmbientBackground variant={session?"room":page==="settings"?"modal":"home"}/>
    <DesktopTitleBar
      status={session?"Conectado":"Pronto"}
      inRoom={!!session}
      onHome={goHome}
      onSettings={!session?()=>setPage("settings"):undefined}
      settingsActive={!session&&page==="settings"}
    />

    <main className="relative z-10 min-h-0 flex-1">
      {session
        ? <RoomLayout session={session} onLeave={goHome}/>
        : page==="settings"
          ? <SettingsScreen onHome={()=>setPage("home")}/>
          : <HomeScreen onCreate={createRoom} onJoin={joinRoom} onSettings={()=>setPage("settings")}/>}
    </main>

    <SplashScreen visible={showSplash} onComplete={()=>setShowSplash(false)}/>
  </div>;
}
