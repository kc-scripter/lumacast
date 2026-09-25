export type DiagnosticLevel="info"|"warn"|"error";

export interface DiagnosticEvent{
  at:string;
  level:DiagnosticLevel;
  scope:string;
  message:string;
  detail?:string;
}

const STORAGE_KEY="lunira-diagnostics-v1";
const MAX_EVENTS=80;
const redactText=(value:string)=>value
  .replace(/([?&](?:invite|token|guest|code)=)[^&#\s]+/gi,"$1[redacted]")
  .replace(/\b[A-Za-z0-9_-]{43}\b/g,"[secret]");

const safeText=(value:unknown)=>{
  if(value instanceof Error)return redactText(`${value.name}: ${value.message}${value.stack?`\n${value.stack}`:""}`).slice(0,6000);
  if(typeof value==="string")return redactText(value).slice(0,6000);
  try{return redactText(JSON.stringify(value)).slice(0,6000);}catch{return redactText(String(value)).slice(0,6000);}
};
const safeObject=(value:Record<string,unknown>)=>{try{return JSON.parse(redactText(JSON.stringify(value))) as Record<string,unknown>;}catch{return{};}};

export function readDiagnostics():DiagnosticEvent[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]") as DiagnosticEvent[];
    return Array.isArray(parsed)?parsed.slice(-MAX_EVENTS):[];
  }catch{return[];}
}

export function recordDiagnostic(level:DiagnosticLevel,scope:string,message:string,detail?:unknown){
  const event:DiagnosticEvent={at:new Date().toISOString(),level,scope:redactText(scope).slice(0,80),message:redactText(message).slice(0,1000)};
  if(detail!==undefined)event.detail=safeText(detail);
  try{
    const events=[...readDiagnostics(),event].slice(-MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(events));
  }catch{}
  return event;
}

export function clearDiagnostics(){try{localStorage.removeItem(STORAGE_KEY);}catch{}}

export function buildDiagnosticReport(extra:Record<string,unknown>={}){
  const safeLocation=`${location.origin}${location.pathname}`;
  const safeExtra=safeObject(extra);
  const payload={
    generatedAt:new Date().toISOString(),
    app:"Lunira Screen",
    runtime:{
      href:safeLocation,
      online:navigator.onLine,
      userAgent:navigator.userAgent,
      language:navigator.language,
      viewport:`${window.innerWidth}x${window.innerHeight}`,
      devicePixelRatio:window.devicePixelRatio
    },
    ...safeExtra,
    events:readDiagnostics()
  };
  return JSON.stringify(payload,null,2);
}

export async function submitDiagnosticReport(extra:Record<string,unknown>={}){
  const explicit=import.meta.env.VITE_TELEMETRY_URL?.trim();
  const signaling=import.meta.env.VITE_SIGNALING_URL?.trim()?.replace(/\/$/,"");
  const endpoint=explicit||(signaling?`${signaling}/api/telemetry`:"");
  if(!endpoint)return false;
  const body=buildDiagnosticReport(extra);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6000);
  try{
    const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body,credentials:"omit",signal:controller.signal});
    return response.ok;
  }finally{clearTimeout(timer);}
}

let installed=false;
export function installGlobalDiagnostics(){
  if(installed)return;
  installed=true;
  window.addEventListener("error",event=>{
    recordDiagnostic("error","window","Erro global de interface",event.error||event.message);
    void submitDiagnosticReport({kind:"window-error"}).catch(()=>undefined);
  });
  window.addEventListener("unhandledrejection",event=>{
    recordDiagnostic("error","promise","Promise rejeitada sem tratamento",event.reason);
    void submitDiagnosticReport({kind:"unhandled-rejection"}).catch(()=>undefined);
  });
}
