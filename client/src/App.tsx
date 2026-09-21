import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { HomePage } from "./pages/HomePage";
const BroadcasterPage=lazy(()=>import("./pages/BroadcasterPage").then(module=>({default:module.BroadcasterPage})));
const ViewerPage=lazy(()=>import("./pages/ViewerPage").then(module=>({default:module.ViewerPage})));
const HowItWorksPage=lazy(()=>import("./pages/HowItWorksPage").then(module=>({default:module.HowItWorksPage})));
type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:any)=>unknown},options?:{signal:AbortSignal})=>void|Promise<void>};
const load=(page:ReactNode)=><Suspense fallback={<main className="app-loading" role="status"><span/><b>Carregando LumaCast…</b></main>}>{page}</Suspense>;
export function App(){
  useEffect(()=>{const context=(document as Document&{modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();void Promise.resolve(context.registerTool({name:"open_watch_room",title:"Abrir sala",description:"Abre uma sala do LumaCast usando um código válido de oito caracteres.",inputSchema:{type:"object",properties:{roomId:{type:"string",pattern:"^[A-Z2-9]{8}$"}},required:["roomId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input:{roomId?:string}){const roomId=input.roomId?.toUpperCase();if(!roomId||!/^[A-Z2-9]{8}$/.test(roomId))throw new Error("Código de sala inválido");location.assign(`/watch/${roomId}`);return{roomId,status:"opening"};}},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();},[]);
  const path=location.pathname;const watch=path.match(/^\/watch\/([A-Z2-9]{8})\/?$/i),queryRoom=new URLSearchParams(location.search).get("room")?.toUpperCase();if(watch)return load(<ViewerPage roomId={watch[1].toUpperCase()}/>);if(path==="/"&&queryRoom&&/^[A-Z2-9]{8}$/.test(queryRoom))return load(<ViewerPage roomId={queryRoom}/>);if(path==="/broadcast")return load(<BroadcasterPage/>);if(path==="/como-funciona")return load(<HowItWorksPage/>);return <HomePage/>;
}
