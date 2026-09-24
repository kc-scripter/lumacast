import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here=dirname(fileURLToPath(import.meta.url));
const repoRoot=resolve(here,"../..");
const npm=process.platform==="win32"?"npm.cmd":"npm";
const signalingUrl=process.env.LUNIRA_SIGNALING_URL?.trim()||"https://lunirascreen.onrender.com";

const result=spawnSync(npm,["run","build:client"],{
  cwd:repoRoot,
  stdio:"inherit",
  env:{
    ...process.env,
    VITE_ANDROID_APP:"true",
    VITE_SIGNALING_URL:signalingUrl
  }
});

if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);

console.log(`Android web bundle ready. Signaling: ${signalingUrl}`);
