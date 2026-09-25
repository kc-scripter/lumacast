import { connectSocket, getSocket } from "../../../client/src/services/socket";

export type BackendWakeState="waking"|"ready"|"error";

const signalingBase=(import.meta.env.VITE_SIGNALING_URL||"https://lunira-screen.onrender.com").trim().replace(/\/$/,"");
const wakeUrl=new URL("/api/wake",signalingBase+"/").toString();
const healthUrl=new URL("/api/health",signalingBase+"/").toString();
let activeWake:Promise<void>|null=null;

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function fetchWithTimeout(url:string,timeoutMs:number,mode?:RequestMode){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{
      method:"GET",
      cache:"no-store",
      credentials:"omit",
      headers:mode==="no-cors"?undefined:{Accept:"application/json"},
      mode,
      signal:controller.signal
    });
  }finally{
    clearTimeout(timeout);
  }
}

function triggerColdStart(){
  void fetchWithTimeout(wakeUrl+"?wake="+Date.now(),70_000,"no-cors").catch(()=>{});
}

async function probeReady(){
  try{
    const response=await fetchWithTimeout(wakeUrl+"?probe="+Date.now(),10_000);
    if(response.ok)return true;
    if(response.status>=400&&response.status<500&&response.status!==404)return true;
    if(response.status!==404)return false;
  }catch{}

  try{
    const response=await fetchWithTimeout(healthUrl+"?probe="+Date.now(),10_000);
    if(response.ok)return true;
    if(response.status===503){
      try{
        const body=await response.json() as {service?:string};
        return body.service==="lunira-screen-signaling";
      }catch{
        return false;
      }
    }
    return response.status>=400&&response.status<500;
  }catch{
    return false;
  }
}

async function waitForSocket(timeoutMs=20_000){
  const socket=connectSocket();
  if(socket.connected)return;

  await new Promise<void>((resolve,reject)=>{
    let lastError="Sem resposta do signaling.";

    const cleanup=()=>{
      clearTimeout(timer);
      socket.off("connect",onConnect);
      socket.off("connect_error",onError);
    };
    const onConnect=()=>{cleanup();resolve();};
    const onError=(error:Error)=>{lastError=error.message||lastError;};
    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error("O servidor acordou, mas o canal em tempo real não conectou: "+lastError));
    },timeoutMs);

    socket.on("connect",onConnect);
    socket.on("connect_error",onError);
  });
}

export function signalingReady(){
  return getSocket().connected;
}

export async function wakeSignalingServer({timeoutMs=105_000}:{timeoutMs?:number}={}){
  if(getSocket().connected)return;
  if(activeWake)return activeWake;

  const task=(async()=>{
    triggerColdStart();
    const deadline=Date.now()+timeoutMs;
    let lastError:unknown=null;

    while(Date.now()<deadline){
      try{
        if(await probeReady()){
          try{
            await waitForSocket(Math.min(20_000,Math.max(6_000,deadline-Date.now())));
            return;
          }catch(cause){
            lastError=cause;
          }
        }
      }catch(cause){
        lastError=cause;
      }

      await sleep(2_500);
    }

    const suffix=lastError instanceof Error&&lastError.message?": "+lastError.message:"";
    throw new Error("O servidor gratuito demorou demais para acordar"+suffix);
  })();

  activeWake=task;
  try{await task;}finally{if(activeWake===task)activeWake=null;}
}
