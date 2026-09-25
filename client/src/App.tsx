import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { HomePage } from "./pages/HomePage";
import { parseRoomInvite } from "./services/invite";
const BroadcasterPage=lazy(()=>import("./pages/BroadcasterPage").then(module=>({default:module.BroadcasterPage})));
const ViewerPage=lazy(()=>import("./pages/ViewerPage").then(module=>({default:module.ViewerPage})));
const HowItWorksPage=lazy(()=>import("./pages/HowItWorksPage").then(module=>({default:module.HowItWorksPage})));
const TermsPage=lazy(()=>import("./pages/TermsPage").then(module=>({default:module.TermsPage})));
type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:any)=>unknown},options?:{signal:AbortSignal})=>void|Promise<void>};
const load=(page:ReactNode)=><Suspense fallback={<main className="app-loading" role="status"><span/><b>Carregando Lunira Screen…</b></main>}>{page}</Suspense>;
export function App(){
  const [,setLocationVersion]=useState(0);
  useEffect(()=>{const onPopState=()=>setLocationVersion(value=>value+1);window.addEventListener("popstate",onPopState);return()=>window.removeEventListener("popstate",onPopState);},[]);
  useEffect(()=>{const context=(document as Document&{modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();void Promise.resolve(context.registerTool({name:"open_watch_room",title:"Abrir sala",description:"Abre uma sala do Lunira Screen usando um link de convite válido.",inputSchema:{type:"object",properties:{inviteUrl:{type:"string",maxLength:512}},required:["inviteUrl"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input:{inviteUrl?:string}){const invite=parseRoomInvite(input.inviteUrl||"");if(!invite)throw new Error("Link de convite inválido");location.assign(`/watch/${invite.roomId}#invite=${encodeURIComponent(invite.inviteToken)}`);return{roomId:invite.roomId,status:"opening"};}},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();},[]);
  const path=location.pathname,invite=parseRoomInvite(location.href),watch=path.match(/^\/watch\/([A-Z2-9]{8})\/?$/i),queryRoom=new URLSearchParams(location.search).get("room")?.toUpperCase();if(watch){const roomId=watch[1].toUpperCase();return load(<ViewerPage roomId={roomId} inviteToken={invite?.roomId===roomId?invite.inviteToken:undefined}/>);}if(path==="/"&&queryRoom&&/^[A-Z2-9]{8}$/.test(queryRoom))return load(<ViewerPage roomId={queryRoom} inviteToken={invite?.roomId===queryRoom?invite.inviteToken:undefined}/>);if(path==="/broadcast")return load(<BroadcasterPage/>);if(path==="/como-funciona")return load(<HowItWorksPage/>);if(path==="/termos")return load(<TermsPage/>);return <HomePage/>;
}
