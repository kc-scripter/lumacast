import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { RoomStore,hashSecret,newSecret,secretMatches } from "../server/dist/rooms.js";

const url=process.env.TEST_SIGNALING_URL||"http://localhost:3001";

const rawOwnerToken=newSecret();
assert.equal(secretMatches(rawOwnerToken,hashSecret(rawOwnerToken)),true);
assert.equal(secretMatches("invalid",hashSecret(rawOwnerToken)),false);

let saved;
let saveResolve;
let savedOnce=new Promise(resolve=>{saveResolve=resolve;});
const persistence={
  label:"security-test",
  async load(){return[];},
  async save(room){saved=room;saveResolve?.();},
  async delete(){}
};
const store=new RoomStore(persistence);
const room=store.create("ABCDEFGH","owner","Security Owner",123);
const ownerToken=room.ownerToken;
const inviteToken=room.inviteToken;
assert.ok(ownerToken);
assert.ok(inviteToken);
await savedOnce;
assert.ok(saved?.ownerTokenHash);
assert.ok(saved?.inviteTokenHash);
assert.equal(saved?.ownerToken,undefined);
assert.equal(saved?.inviteToken,undefined);
assert.equal(JSON.stringify(saved).includes(ownerToken),false);
assert.equal(JSON.stringify(saved).includes(inviteToken),false);

const participantToken=newSecret();
room.participants.set("participant",{socketId:"participant",displayName:"Security Guest",agoraUid:456,token:participantToken,tokenHash:hashSecret(participantToken),livekitActive:false});
const longName="ABCDEFGHIJKLMNOPQRST",longToken=newSecret();
room.participants.set("long-name",{socketId:"long-name",displayName:longName,agoraUid:457,token:longToken,tokenHash:hashSecret(longToken),livekitActive:false});
const deduplicated=store.nameFor(room,longName);
assert.ok(deduplicated.length<=20);
assert.notEqual(deduplicated,longName);
savedOnce=new Promise(resolve=>{saveResolve=resolve;});
store.persist(room);
await savedOnce;
assert.equal(saved?.participants?.[0]?.token,undefined);
assert.ok(saved?.participants?.[0]?.tokenHash);
assert.equal(JSON.stringify(saved).includes(participantToken),false);

await new Promise((resolve,reject)=>{
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000,extraHeaders:{Origin:"https://evil.example"}});
  const timer=setTimeout(()=>{socket.disconnect();reject(new Error("Origin não autorizado conseguiu manter a conexão."));},4000);
  socket.once("connect",()=>{clearTimeout(timer);socket.disconnect();reject(new Error("Origin não autorizado foi aceito."));});
  socket.once("connect_error",()=>{clearTimeout(timer);socket.disconnect();resolve();});
});

await new Promise((resolve,reject)=>{
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000});
  const timer=setTimeout(()=>{socket.disconnect();reject(new Error("Conexão sem Origin foi aceita."));},4000);
  socket.once("connect",()=>{clearTimeout(timer);socket.disconnect();reject(new Error("Conexão sem Origin foi aceita."));});
  socket.once("connect_error",()=>{clearTimeout(timer);socket.disconnect();resolve();});
});

await new Promise((resolve,reject)=>{
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000,extraHeaders:{Origin:"https://tauri.localhost"}});
  const timer=setTimeout(()=>{socket.disconnect();reject(new Error("Origin Tauri autorizado não conseguiu conectar."));},4000);
  socket.once("connect",()=>{clearTimeout(timer);socket.disconnect();resolve();});
  socket.once("connect_error",error=>{clearTimeout(timer);socket.disconnect();reject(error);});
});

const connectAuthorized=()=>new Promise((resolve,reject)=>{
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000,extraHeaders:{Origin:"http://localhost:5173"}});
  socket.once("connect",()=>resolve(socket));
  socket.once("connect_error",reject);
});
const ack=(socket,event,data)=>new Promise((resolve,reject)=>socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result)));
const onceEvent=(socket,event,timeout=4000)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`Timeout: ${event}`)),timeout);socket.once(event,data=>{clearTimeout(timer);resolve(data);});});
const host=await connectAuthorized(),viewer=await connectAuthorized();
try{
  const created=await ack(host,"create-room",{displayName:"Security Host"});
  assert.equal(created.ok,true);
  assert.match(created.inviteToken,/^[A-Za-z0-9_-]{43}$/);
  const codeOnly=await ack(viewer,"join-room",{roomId:created.roomId,displayName:"Blocked Viewer"});
  assert.equal(codeOnly.ok,false);
  assert.match(codeOnly.error,/convite.*inválido/i);
  const authorized=await ack(viewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Authorized Viewer"});
  assert.equal(authorized.ok,true);
}finally{viewer.disconnect();host.disconnect();}

const controlSockets=[];
const controlHost=await connectAuthorized(),controlViewer=await connectAuthorized();
controlSockets.push(controlHost,controlViewer);
try{
  const created=await ack(controlHost,"create-room",{displayName:"Control Host"});
  assert.equal(created.ok,true);
  const joined=await ack(controlViewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Control Viewer"});
  assert.equal(joined.ok,true);

  const unauthorizedLock=await ack(controlViewer,"set-room-lock",{roomId:created.roomId,locked:true});
  assert.equal(unauthorizedLock.ok,false);
  assert.match(unauthorizedLock.error,/anfitrião/i);

  const locked=await ack(controlHost,"set-room-lock",{roomId:created.roomId,locked:true});
  assert.equal(locked.ok,true);
  assert.equal(locked.locked,true);
  const lockedViewer=await connectAuthorized();controlSockets.push(lockedViewer);
  const lockedJoin=await ack(lockedViewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Locked Viewer"});
  assert.equal(lockedJoin.ok,false);
  assert.match(lockedJoin.error,/trancada/i);
  const unlocked=await ack(controlHost,"set-room-lock",{roomId:created.roomId,locked:false});
  assert.equal(unlocked.ok,true);
  assert.equal(unlocked.locked,false);

  const rotated=await ack(controlHost,"rotate-room-invite",{roomId:created.roomId});
  assert.equal(rotated.ok,true);
  assert.match(rotated.inviteToken,/^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(rotated.inviteToken,created.inviteToken);
  const oldInviteViewer=await connectAuthorized();controlSockets.push(oldInviteViewer);
  const oldInviteJoin=await ack(oldInviteViewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Old Invite"});
  assert.equal(oldInviteJoin.ok,false);
  assert.match(oldInviteJoin.error,/convite|código/i);
  const newInviteViewer=await connectAuthorized();controlSockets.push(newInviteViewer);
  const newInviteJoin=await ack(newInviteViewer,"join-room",{roomId:created.roomId,inviteToken:rotated.inviteToken,displayName:"New Invite"});
  assert.equal(newInviteJoin.ok,true);

  const guest1=await ack(controlHost,"rotate-room-guest-code",{roomId:created.roomId});
  assert.equal(guest1.ok,true);
  assert.match(guest1.guestCode,/^[A-Z2-9]{6}$/);
  const guestViewer=await connectAuthorized();controlSockets.push(guestViewer);
  const guestJoin=await ack(guestViewer,"join-room",{roomId:created.roomId,guestCode:guest1.guestCode,displayName:"Guest Code"});
  assert.equal(guestJoin.ok,true);

  const guest2=await ack(controlHost,"rotate-room-guest-code",{roomId:created.roomId});
  assert.equal(guest2.ok,true);
  assert.match(guest2.guestCode,/^[A-Z2-9]{6}$/);
  assert.notEqual(guest2.guestCode,guest1.guestCode);
  const staleGuestViewer=await connectAuthorized();controlSockets.push(staleGuestViewer);
  const staleGuestJoin=await ack(staleGuestViewer,"join-room",{roomId:created.roomId,guestCode:guest1.guestCode,displayName:"Stale Code"});
  assert.equal(staleGuestJoin.ok,false);
  const currentGuestViewer=await connectAuthorized();controlSockets.push(currentGuestViewer);
  const currentGuestJoin=await ack(currentGuestViewer,"join-room",{roomId:created.roomId,guestCode:guest2.guestCode,displayName:"Current Code"});
  assert.equal(currentGuestJoin.ok,true);
  const disabled=await ack(controlHost,"disable-room-guest-code",{roomId:created.roomId});
  assert.equal(disabled.ok,true);
  const disabledGuestViewer=await connectAuthorized();controlSockets.push(disabledGuestViewer);
  const disabledGuestJoin=await ack(disabledGuestViewer,"join-room",{roomId:created.roomId,guestCode:guest2.guestCode,displayName:"Disabled Code"});
  assert.equal(disabledGuestJoin.ok,false);

  const kickedEvent=onceEvent(controlViewer,"kicked");
  const kicked=await ack(controlHost,"kick-participant",{roomId:created.roomId,participantId:controlViewer.id});
  assert.equal(kicked.ok,true);
  const kickedPayload=await kickedEvent;
  assert.match(kickedPayload.reason,/removido/i);
  const afterKick=await ack(controlViewer,"request-screen-share",{roomId:created.roomId});
  assert.equal(afterKick.ok,false);
  assert.match(afterKick.error,/autorizado/i);
}finally{controlSockets.forEach(socket=>socket.disconnect());}

const telemetry=await fetch(url+"/api/telemetry",{
  method:"POST",
  headers:{Origin:"http://localhost:5173","content-type":"application/json"},
  body:JSON.stringify({kind:"security-smoke",runtime:{href:"http://localhost:5173/?token="+newSecret(),online:true,userAgent:"smoke"},room:{roomId:"ABCDEFGH",status:"Conectado",provider:"agora",live:false,participantCount:1,cameraCount:0},events:[{at:new Date().toISOString(),level:"info",scope:"test",message:"telemetry accepted",detail:"token="+newSecret()}]})
});
assert.equal(telemetry.status,202);
assert.equal((await telemetry.json()).ok,true);

const health=await fetch(url+"/api/health",{headers:{Origin:"http://localhost:5173"}});
const healthBody=await health.json();
assert.equal("issues" in healthBody,false);
assert.equal("message" in healthBody,false);
assert.match(health.headers.get("content-security-policy")||"",/script-src 'self'/);

console.log(JSON.stringify({ok:true,hashedPersistence:true,inviteSecretProtected:true,originRejected:true,originlessRejected:true,tauriOriginAccepted:true,healthRedacted:true,cspPresent:true,displayNameBounded:true,hostControls:true,inviteRotation:true,guestCodeLifecycle:true,kickEnforced:true,telemetryAccepted:true}));
