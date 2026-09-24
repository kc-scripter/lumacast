export type BackendWakeState="waking"|"ready"|"error";

const signalingBase=(import.meta.env.VITE_SIGNALING_URL||"https://lunira-screen.onrender.com").trim().replace(/\/$/,"");
const healthUrl=new URL("/api/health",signalingBase+"/").toString();
let activeWake:Promise<void>|null=null;

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function probeHealth(){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12_000);
  try{
    const response=await fetch(healthUrl,{
      method:"GET",
      cache:"no-store",
      credentials:"omit",
      headers:{Accept:"application/json"},
      signal:controller.signal
    });
    if(response.ok)return true;
    if(response.status===503){
      let detail="";
      try{
        const body=await response.json() as {issues?:string[]};
        if(body.issues?.length)detail=" ("+body.issues.join(", ")+")";
      }catch{}
      throw new Error("O servidor acordou, mas a configuração de mídia está incompleta"+detail+".");
    }
    if(response.status>=400&&response.status<500)throw new Error("O servidor respondeu com HTTP "+response.status+".");
    return false;
  }finally{
    clearTimeout(timeout);
  }
}

export async function wakeSignalingServer({timeoutMs=85_000}:{timeoutMs?:number}={}){
  if(activeWake)return activeWake;
  const task=(async()=>{
    const deadline=Date.now()+timeoutMs;
    let lastError:unknown=null;
    while(Date.now()<deadline){
      try{
        if(await probeHealth())return;
      }catch(cause){
        lastError=cause;
        const message=cause instanceof Error?cause.message:String(cause);
        if(message.includes("configuração de mídia")||message.includes("HTTP 4"))throw cause;
      }
      await sleep(2_500);
    }
    const suffix=lastError instanceof Error&&lastError.message?": "+lastError.message:"";
    throw new Error("O servidor demorou demais para acordar"+suffix);
  })();
  activeWake=task;
  try{await task;}finally{if(activeWake===task)activeWake=null;}
}
