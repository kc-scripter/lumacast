import { io } from "socket.io-client";
import assert from "node:assert/strict";

const url=process.env.TEST_SIGNALING_URL||"http://localhost:3001";
const origin=process.env.TEST_WEB_ORIGIN||"http://localhost:5173";
const once=(socket,event,timeout=4000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Timeout: ${event}`)),timeout);socket.once(event,data=>{clearTimeout(timer);resolve(data);});});
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
const connect=()=>new Promise((resolve,reject)=>{const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,extraHeaders:{Origin:origin}});socket.once("connect",()=>resolve(socket));socket.once("connect_error",reject);});

const host=await connect();
const created=await ack(host,"create-room",{displayName:"Smoke Host"});
assert.equal(created.ok,true);assert.match(created.roomId,/^[A-Z2-9]{8}$/);assert.ok(created.ownerToken);assert.match(created.inviteToken,/^[A-Za-z0-9_-]{43}$/);assert.ok(created.agoraToken);

const viewer1=await connect(),viewer2=await connect();
const state1=once(host,"room-state");
const joined1=await ack(viewer1,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Smoke Viewer 1"});
assert.equal(joined1.ok,true);assert.ok(joined1.participantToken);assert.equal((await state1).count,1);

const state2=once(host,"room-state");
const joined2=await ack(viewer2,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Smoke Viewer 2"});
assert.equal(joined2.ok,true);assert.equal((await state2).count,2);

const lock=await ack(viewer1,"request-screen-share",{roomId:created.roomId});
assert.equal(lock.ok,true);assert.equal(lock.activeScreenSharerId,viewer1.id);

const started=once(host,"broadcast-started");
viewer1.emit("broadcast-started",{roomId:created.roomId});
await started;

const ended=once(viewer2,"broadcast-ended");
assert.equal((await ack(viewer1,"release-screen-share",{roomId:created.roomId})).ok,true);
await ended;

const reconnectToken=joined1.participantToken;
viewer1.disconnect();
const viewer1b=await connect();
const rejoined=await ack(viewer1b,"join-room",{roomId:created.roomId,participantToken:reconnectToken,displayName:"Ignored Name"});
assert.equal(rejoined.ok,true);assert.equal(rejoined.displayName,"Smoke Viewer 1");

const capacitySockets=[];
for(let index=3;index<=8;index++){
  const socket=await connect();capacitySockets.push(socket);
  const joined=await ack(socket,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:`Smoke Viewer ${index}`});
  assert.equal(joined.ok,true);
}
const overflow=await connect();
const rejected=await ack(overflow,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Overflow Viewer"});
assert.equal(rejected.ok,false);
assert.match(rejected.error,/limite de participantes/i);

host.disconnect();viewer1b.disconnect();viewer2.disconnect();overflow.disconnect();capacitySockets.forEach(socket=>socket.disconnect());
console.log(JSON.stringify({ok:true,roomId:created.roomId,joins:true,screenLock:true,broadcastLifecycle:true,participantReconnect:true,roomCapacity:true}));
