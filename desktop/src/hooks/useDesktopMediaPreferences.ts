import { useEffect, useState } from "react";
import type { FrameRate, Quality } from "../../../client/src/types";

const QUALITY_KEY="lunira-desktop-screen-quality";
const FPS_KEY="lunira-desktop-screen-fps";

function initialQuality():Quality{
  try{
    const value=localStorage.getItem(QUALITY_KEY);
    if(value==="auto"||value==="720p"||value==="1080p")return value;
  }catch{}
  return "auto";
}

function initialFps():FrameRate{
  try{return localStorage.getItem(FPS_KEY)==="60"?60:30;}catch{return 30;}
}

export function useDesktopMediaPreferences(){
  const [quality,setQuality]=useState<Quality>(initialQuality);
  const [fps,setFps]=useState<FrameRate>(initialFps);
  useEffect(()=>{try{localStorage.setItem(QUALITY_KEY,quality);}catch{}},[quality]);
  useEffect(()=>{try{localStorage.setItem(FPS_KEY,String(fps));}catch{}},[fps]);
  return {quality,setQuality,fps,setFps};
}
