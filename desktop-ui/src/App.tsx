import { useCallback, useState } from "react";
import { safeSessionRemove, safeSessionSet } from "../../client/src/services/browser";
import { getSocket } from "../../client/src/services/socket";
import { DesktopTitleBar } from "./components/DesktopTitleBar";
import { SplashScreen } from "./components/SplashScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { RoomLayout } from "./screens/RoomLayout";

export type SessionState={owner:boolean;roomId?:string};

function shouldShowSplash(){
  const forced=new URLSearchParams(window.location.search).get("splash")==="true";
  return forced||localStorage.getItem("lunira_splash_seen")!=="1";
}

export default function App(){
  const [session,setSession]=useState<SessionState|null>(null);
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
  },[]);

  const finishSplash=useCallback(()=>{
    localStorage.setItem("lunira_splash_seen","1");
    setShowSplash(false);
  },[]);

  return <div className="relative flex h-screen min-h-screen select-none flex-col overflow-hidden bg-[#0b0b0e] text-zinc-100">
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1f1f2e_1px,transparent_1px),linear-gradient(to_bottom,#1f1f2e_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-30 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"/>
    <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-purple-600/20 blur-[128px] transform-gpu"/>
    <div className="pointer-events-none absolute right-0 top-1/2 h-96 w-96 -translate-y-1/2 rounded-full bg-indigo-600/15 blur-[128px] transform-gpu"/>

    <DesktopTitleBar status={session?"Conectado":"Pronto"} inRoom={!!session} onHome={goHome}/>

    <main className="relative z-10 min-h-0 flex-1">
      {session
        ? <RoomLayout session={session} onLeave={goHome}/>
        : <HomeScreen onCreate={createRoom} onJoin={joinRoom}/>}
    </main>

    <SplashScreen visible={showSplash} onComplete={finishSplash}/>
  </div>;
}
