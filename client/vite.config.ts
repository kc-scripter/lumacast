import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const clientDir=fileURLToPath(new URL(".",import.meta.url));
export default defineConfig({root:clientDir,plugins:[react()],build:{outDir:resolve(clientDir,"../dist"),emptyOutDir:true},server:{port:5173,proxy:{"/socket.io":"http://localhost:3001","/api":"http://localhost:3001"}}});
