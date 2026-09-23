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
assert.ok(ownerToken);
await savedOnce;
assert.ok(saved?.ownerTokenHash);
assert.equal(saved?.ownerToken,undefined);
assert.equal(JSON.stringify(saved).includes(ownerToken),false);

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
  const socket=io(url,{forceNew:true,transports:["websocket"],reconnection:false,timeout:3000,extraHeaders:{Origin:"http://tauri.localhost"}});
  const timer=setTimeout(()=>{socket.disconnect();reject(new Error("Origin Tauri autorizado não conseguiu conectar."));},4000);
  socket.once("connect",()=>{clearTimeout(timer);socket.disconnect();resolve();});
  socket.once("connect_error",error=>{clearTimeout(timer);socket.disconnect();reject(error);});
});

console.log(JSON.stringify({ok:true,hashedPersistence:true,originRejected:true,tauriOriginAccepted:true,displayNameBounded:true}));
