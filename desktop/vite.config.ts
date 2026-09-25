import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const rootDir=fileURLToPath(new URL(".",import.meta.url));

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,rootDir,"");
  return {
    root:rootDir,
    base:"./",
    plugins:[react()],
    resolve:{
      dedupe:["react","react-dom"]
    },
    define:{
      "import.meta.env.VITE_SIGNALING_URL":JSON.stringify(env.VITE_SIGNALING_URL||"https://lunirascreen.onrender.com"),
      "import.meta.env.VITE_PUBLIC_WEB_URL":JSON.stringify(env.VITE_PUBLIC_WEB_URL||"https://lunirascreen.onrender.com")
    },
    server:{
      host:"127.0.0.1",
      port:1420,
      strictPort:true,
      fs:{allow:[resolve(rootDir,"..")]}
    },
    build:{
      outDir:"dist",
      emptyOutDir:true,
      sourcemap:false,
      target:"es2022"
    },
    clearScreen:false
  };
});
