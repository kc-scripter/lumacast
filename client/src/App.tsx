import { useEffect } from "react";
import { BroadcasterPage } from "./pages/BroadcasterPage";
import { HomePage } from "./pages/HomePage";
import { ViewerPage } from "./pages/ViewerPage";
type ModelContext={registerTool:(tool:{name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:any)=>unknown},options?:{signal:AbortSignal})=>void|Promise<void>};
export function App(){
  useEffect(()=>{const context=(document as Document&{modelContext?:ModelContext}).modelContext;if(!context?.registerTool)return;const lifecycle=new AbortController();void Promise.resolve(context.registerTool({name:"open_watch_room",title:"Abrir sala",description:"Abre uma sala do LumaCast usando um código válido de oito caracteres.",inputSchema:{type:"object",properties:{roomId:{type:"string",pattern:"^[A-Z2-9]{8}$"}},required:["roomId"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input:{roomId?:string}){const roomId=input.roomId?.toUpperCase();if(!roomId||!/^[A-Z2-9]{8}$/.test(roomId))throw new Error("Código de sala inválido");location.assign(`/watch/${roomId}`);return{roomId,status:"opening"};}},{signal:lifecycle.signal})).catch(()=>{});return()=>lifecycle.abort();},[]);
  const path=location.pathname;const watch=path.match(/^\/watch\/([A-Za-z0-9]+)$/);if(watch)return <ViewerPage roomId={watch[1].toUpperCase()}/>;if(path==="/broadcast")return <BroadcasterPage/>;return <HomePage/>;
}
