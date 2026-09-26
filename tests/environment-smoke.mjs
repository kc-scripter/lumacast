import assert from "node:assert/strict";
import { runtimeEnvironmentStatus } from "../server/dist/environment.js";

const keys=["CLIENT_ORIGIN","PUBLIC_URL","AGORA_APP_ID","AGORA_APP_CERTIFICATE","LIVEKIT_URL","LIVEKIT_API_KEY","LIVEKIT_API_SECRET"];
const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
const clear=()=>{for(const key of keys)delete process.env[key];};

try{
  clear();
  let status=runtimeEnvironmentStatus();
  assert.equal(status.ready,false);
  assert.ok(status.issues.includes("CLIENT_ORIGIN/PUBLIC_URL"));
  assert.ok(status.issues.includes("AGORA ou LIVEKIT"));
  process.env.CLIENT_ORIGIN="https://example.com";
  process.env.AGORA_APP_ID="0123456789abcdef0123456789abcdef";
  process.env.AGORA_APP_CERTIFICATE="abcdef0123456789abcdef0123456789";
  status=runtimeEnvironmentStatus();
  assert.equal(status.ready,true);
  delete process.env.AGORA_APP_ID;
  delete process.env.AGORA_APP_CERTIFICATE;
  process.env.LIVEKIT_URL="wss://example.livekit.cloud";
  process.env.LIVEKIT_API_KEY="key";
  process.env.LIVEKIT_API_SECRET="secret";
  status=runtimeEnvironmentStatus();
  assert.equal(status.ready,true);
}finally{
  clear();
  for(const [key,value] of Object.entries(saved))if(value!==undefined)process.env[key]=value;
}

console.log("Environment readiness smoke test passed.");
