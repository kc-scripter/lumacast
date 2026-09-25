import { io } from "socket.io-client";
import assert from "node:assert/strict";

const url=process.env.TEST_SIGNALING_URL||"http://localhost:3001";
const webOrigin=process.env.TEST_WEB_ORIGIN||"http://localhost:5173";
const desktopOrigin="https://tauri.localhost";

const wakeResponse=await fetch(url+"/api/wake",{headers:{Origin:desktopOrigin}});
assert.equal(wakeResponse.status,200);
const wakeBody=await wakeResponse.json();
assert.equal(wakeBody.ok,true);
assert.equal(wakeBody.ready,true);

const ack=(socket,event,data)=>new Promise((resolve,reject)=>{
  socket.timeout(5000).emit(event,data,(error,result)=>error?reject(error):resolve(result));
});

const connect=(origin)=>new Promise((resolve,reject)=>{
  const socket=io(url,{
    forceNew:true,
    transports:["websocket"],
    reconnection:false,
    extraHeaders:{Origin:origin}
  });
  socket.once("connect",()=>resolve(socket));
  socket.once("connect_error",reject);
});

async function scenario(hostOrigin,viewerOrigin,label){
  const host=await connect(hostOrigin);
  const viewer=await connect(viewerOrigin);
  try{
    const created=await ack(host,"create-room",{displayName:label+" Host"});
    assert.equal(created.ok,true);
    assert.match(created.roomId,/^[A-Z2-9]{8}$/);
    assert.match(created.inviteToken,/^[A-Za-z0-9_-]{43}$/);

    const joined=await ack(viewer,"join-room",{roomId:created.roomId,inviteToken:created.inviteToken,displayName:label+" Viewer"});
    assert.equal(joined.ok,true);

    const lock=await ack(viewer,"request-screen-share",{roomId:created.roomId});
    assert.equal(lock.ok,true);
    assert.equal(lock.activeScreenSharerId,viewer.id);

    viewer.emit("broadcast-started",{roomId:created.roomId});
    const token=await ack(viewer,"renew-agora-token",{roomId:created.roomId,screen:true});
    assert.equal(token.ok,true);
    assert.ok(token.agoraToken);

    const released=await ack(viewer,"release-screen-share",{roomId:created.roomId});
    assert.equal(released.ok,true);

    return created.roomId;
  }finally{
    viewer.disconnect();
    host.disconnect();
  }
}

const desktopToWeb=await scenario(desktopOrigin,webOrigin,"Desktop-Web");
const webToDesktop=await scenario(webOrigin,desktopOrigin,"Web-Desktop");

console.log(JSON.stringify({
  ok:true,
  desktopToWeb,
  webToDesktop,
  sameSignalingContract:true
}));
