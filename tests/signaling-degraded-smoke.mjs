import assert from "node:assert/strict";
import { io } from "socket.io-client";

const url=process.env.TEST_SIGNALING_URL||"http://localhost:3002";
const origin=process.env.TEST_WEB_ORIGIN||"http://localhost:5173";
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
const connect=()=>new Promise((resolve,reject)=>{
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000,extraHeaders:{Origin:origin}});
  socket.once("connect",()=>resolve(socket));
  socket.once("connect_error",reject);
});

const health=await fetch(url+"/api/health",{headers:{Origin:origin}});
assert.equal(health.status,503);
const healthBody=await health.json();
assert.equal(healthBody.ok,false);
assert.equal(healthBody.code,"SERVICE_NOT_READY");

const host=await connect(),viewer=await connect();
try{
  const created=await ack(host,"create-room",{displayName:"Degraded Host"});
  assert.equal(created.ok,true);
  assert.match(created.roomId,/^[A-Z2-9]{8}$/);
  assert.match(created.inviteToken,/^[A-Za-z0-9_-]{43}$/);
  assert.equal("agoraAppId" in created,false);

  const joined=await ack(viewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Degraded Viewer"});
  assert.equal(joined.ok,true);
  assert.equal("agoraAppId" in joined,false);

  const screen=await ack(host,"request-screen-share",{roomId:created.roomId});
  assert.equal(screen.ok,false);
  assert.match(screen.error,/Configure Agora ou LiveKit/i);
}finally{
  viewer.disconnect();
  host.disconnect();
}

console.log(JSON.stringify({ok:true,healthAvailable:true,roomLifecycleAvailable:true,mediaFailureFriendly:true}));
