import { useEffect, useState } from "react";
import type { FrameRate, Quality } from "../types";

const QUALITY_KEY="lumacast-screen-quality";
const FPS_KEY="lumacast-screen-fps";

const savedQuality=():Quality=>{
  let value:string|null=null;
  try{value=localStorage.getItem(QUALITY_KEY);}catch{}
  return value==="auto"||value==="720p"||value==="1080p"?value:"1080p";
};

const savedFps=():FrameRate=>{try{return localStorage.getItem(FPS_KEY)==="30"?30:60;}catch{return 60;}};

export function useMediaPreferences(){
  const [quality,setQuality]=useState<Quality>(savedQuality);
  const [fps,setFps]=useState<FrameRate>(savedFps);

  useEffect(()=>{try{localStorage.setItem(QUALITY_KEY,quality);}catch{}},[quality]);
  useEffect(()=>{try{localStorage.setItem(FPS_KEY,String(fps));}catch{}},[fps]);

  return{quality,setQuality,fps,setFps};
}
