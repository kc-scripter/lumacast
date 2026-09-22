import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const desktopDir=fileURLToPath(new URL(".",import.meta.url));

export default defineConfig({
  root:desktopDir,
  base:"/__desktop__/",
  plugins:[react()],
  build:{
    outDir:resolve(desktopDir,"dist"),
    emptyOutDir:true,
    sourcemap:false
  },
  server:{
    fs:{allow:[resolve(desktopDir,"..")]}
  }
});
