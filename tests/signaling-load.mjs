import { io } from "socket.io-client";
import { performance } from "node:perf_hooks";

const arg=(name,fallback)=>{const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]??fallback:fallback;};
const url=arg("url","http://localhost:3001"),roomCount=Math.max(1,Number(arg("rooms","3"))),userCount=Math.max(1,Number(arg("users","30")));
if(roomCount>5)throw new Error("O signaling limita criação a 5 salas/min por IP; use --rooms 5 ou menos neste teste.");

const connect=()=>new Promise((resolve,reject)=>{const started=performance.now(),socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:5000});socket.once("connect",()=>resolve({socket,ms:performance.now()-started}));socket.once("connect_error",reject);});
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
const percentile=(values,p)=>{if(!values.length)return 0;const ordered=[...values].sort((a,b)=>a-b);return ordered[Math.min(ordered.length-1,Math.floor((ordered.length-1)*p))];};

const sockets=[],latencies=[],rooms=[];
try{
  for(let i=0;i<roomCount;i++){const {socket,ms}=await connect();sockets.push(socket);latencies.push(ms);const created=await ack(socket,"create-room",{displayName:`Load Host ${i+1}`});if(!created.ok)throw new Error(created.error||"Falha ao criar sala");rooms.push(created.roomId);}
  const results=await Promise.all(Array.from({length:userCount},async(_,index)=>{const started=performance.now();try{const {socket}=await connect();sockets.push(socket);const joined=await ack(socket,"join-room",{roomId:rooms[index%rooms.length],displayName:`Load User ${index+1}`});const ms=performance.now()-started;latencies.push(ms);return{ok:!!joined.ok,error:joined.error||null};}catch(error){return{ok:false,error:String(error)};}}));
  const failures=results.filter(result=>!result.ok);
  console.log(JSON.stringify({ok:failures.length===0,url,rooms:roomCount,users:userCount,connected:sockets.length,failures:failures.length,latencyMs:{p50:Math.round(percentile(latencies,.5)),p95:Math.round(percentile(latencies,.95)),max:Math.round(Math.max(...latencies))},sampleErrors:failures.slice(0,3).map(item=>item.error)},null,2));
  if(failures.length)process.exitCode=1;
}finally{sockets.forEach(socket=>socket.disconnect());}
