import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here=dirname(fileURLToPath(import.meta.url));
const appRoot=resolve(here,"..");
const androidRoot=resolve(appRoot,"android");
const npx=process.platform==="win32"?"npx.cmd":"npx";

if(!existsSync(androidRoot)){
  const result=spawnSync(npx,["cap","add","android"],{cwd:appRoot,stdio:"inherit"});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}

const manifestPath=resolve(androidRoot,"app/src/main/AndroidManifest.xml");
let manifest=readFileSync(manifestPath,"utf8");

const declarations=[
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
  '<uses-feature android:name="android.hardware.microphone" android:required="false" />'
];

const missing=declarations.filter(entry=>!manifest.includes(entry));
if(missing.length){
  manifest=manifest.replace(/<manifest([^>]*)>/,match=>`${match}\n    ${missing.join("\n    ")}`);
  writeFileSync(manifestPath,manifest);
}

console.log("Android platform initialized with camera and microphone permissions.");
