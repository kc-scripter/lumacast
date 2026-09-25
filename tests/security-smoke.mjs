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
const host=await connectAuthorized(),viewer=await connectAuthorized();
try{
  const created=await ack(host,"create-room",{displayName:"Security Host"});
  assert.equal(created.ok,true);
  assert.match(created.inviteToken,/^[A-Za-z0-9_-]{43}$/);
  const codeOnly=await ack(viewer,"join-room",{roomId:created.roomId,displayName:"Blocked Viewer"});
  assert.equal(codeOnly.ok,false);
  assert.match(codeOnly.error,/convite inválido/i);
  const authorized=await ack(viewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:"Authorized Viewer"});
  assert.equal(authorized.ok,true);
}finally{viewer.disconnect();host.disconnect();}

const health=await fetch(url+"/api/health",{headers:{Origin:"http://localhost:5173"}});
const healthBody=await health.json();
assert.equal("issues" in healthBody,false);
assert.equal("message" in healthBody,false);
assert.match(health.headers.get("content-security-policy")||"",/script-src 'self'/);

console.log(JSON.stringify({ok:true,hashedPersistence:true,inviteSecretProtected:true,originRejected:true,originlessRejected:true,tauriOriginAccepted:true,healthRedacted:true,cspPresent:true,displayNameBounded:true}));
