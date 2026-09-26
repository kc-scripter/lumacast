export type RuntimeEnvironmentStatus={
  ready:boolean;
  issues:string[];
  message:string;
};

const configurationMessage="O serviço de transmissão ainda não está configurado. Tente novamente em alguns minutos ou contacte o administrador.";

export function runtimeEnvironmentStatus():RuntimeEnvironmentStatus{
  const issues:string[]=[];
  if(!(process.env.CLIENT_ORIGIN||process.env.PUBLIC_URL))issues.push("CLIENT_ORIGIN/PUBLIC_URL");
  const agoraReady=/^[0-9a-f]{32}$/i.test(process.env.AGORA_APP_ID||"")&&/^[0-9a-f]{32}$/i.test(process.env.AGORA_APP_CERTIFICATE||"");
  const livekitUrl=process.env.LIVEKIT_URL?.trim();
  const livekitReady=!!livekitUrl&&/^wss?:\/\//i.test(livekitUrl)&&!!process.env.LIVEKIT_API_KEY?.trim()&&!!process.env.LIVEKIT_API_SECRET?.trim();
  if(!agoraReady&&!livekitReady)issues.push("AGORA ou LIVEKIT");
  return {ready:issues.length===0,issues,message:configurationMessage};
}

export function configurationError(){
  const {issues,message}=runtimeEnvironmentStatus();
  return {ok:false,code:"RTC_CONFIGURATION_INCOMPLETE",error:message,issues};
}

export function logRuntimeEnvironment(){
  const status=runtimeEnvironmentStatus();
  if(!status.issues.length){
    console.log("Lunira Screen RTC configuration verified.");
  }else{
    console.warn(`Lunira Screen RTC configuration incomplete. Missing or invalid: ${status.issues.join(", ")}. Signaling remains available.`);
  }
  return status;
}
