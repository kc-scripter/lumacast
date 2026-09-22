import { useEffect,useRef } from "react";
import type { FrameRate,Quality,StreamStats } from "../types";

type Profile={quality:Quality;fps:FrameRate};
type Options={enabled:boolean;stats:StreamStats|null;preferredFps:FrameRate;updateQuality:(quality:Quality)=>Promise<void>;updateFrameRate:(fps:FrameRate)=>Promise<void>};

const profilesFor=(preferredFps:FrameRate):Profile[]=>preferredFps===60
  ?[{quality:"auto",fps:60},{quality:"1080p",fps:30},{quality:"720p",fps:30}]
  :[{quality:"auto",fps:30},{quality:"720p",fps:30}];

export function useAdaptiveScreenQuality({enabled,stats,preferredFps,updateQuality,updateFrameRate}:Options){
  const tierRef=useRef(0),extremeRef=useRef(0),stableRef=useRef(0),lastLostRef=useRef<number|null>(null),lastChangeRef=useRef(0),busyRef=useRef(false);

  useEffect(()=>{
    tierRef.current=0;
    extremeRef.current=0;
    stableRef.current=0;
    lastLostRef.current=null;
    lastChangeRef.current=0;
  },[enabled,preferredFps]);

  useEffect(()=>{
    if(!enabled||!stats||busyRef.current)return;
    const profiles=profilesFor(preferredFps);
    if(tierRef.current>=profiles.length)tierRef.current=0;

    const lost=stats.packetsLost??lastLostRef.current??0;
    const lossDelta=lastLostRef.current==null?0:Math.max(0,lost-lastLostRef.current);
    lastLostRef.current=lost;
    const rtt=stats.rttMs;

    // Deliberately conservative: automatic quality only reacts to sustained,
    // clearly bad sender connectivity. Short spikes must not change quality.
    const extreme=(rtt!=null&&rtt>=600)||lossDelta>=50;
    const stable=rtt!=null&&rtt<=180&&lossDelta<=2;
    extremeRef.current=extreme?extremeRef.current+1:0;
    stableRef.current=stable?stableRef.current+1:0;

    const previousTier=tierRef.current;
    let next=previousTier;
    const cooldown=Date.now()-lastChangeRef.current<30_000;

    if(!cooldown&&extremeRef.current>=5&&previousTier<profiles.length-1)next=previousTier+1;
    else if(!cooldown&&stableRef.current>=30&&previousTier>0)next=previousTier-1;
    if(next===previousTier)return;

    const profile=profiles[next];
    busyRef.current=true;
    void (async()=>{
      try{
        await updateQuality(profile.quality);
        await updateFrameRate(profile.fps);
        tierRef.current=next;
        extremeRef.current=0;
        stableRef.current=0;
        lastChangeRef.current=Date.now();
        console.info("Lunira Screen adaptive screen profile",{
          profile,
          reason:next>previousTier?"extreme-network-degrade":"stable-network-recover",
          rttMs:rtt,
          packetLossDelta:lossDelta
        });
      }catch(cause){
        extremeRef.current=0;
        stableRef.current=0;
        lastChangeRef.current=Date.now();
        console.warn("Lunira Screen adaptive quality update failed",cause);
      }finally{busyRef.current=false;}
    })();
  },[enabled,preferredFps,stats,updateFrameRate,updateQuality]);
}
