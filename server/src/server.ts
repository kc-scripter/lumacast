import "dotenv/config";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors, { type CorsOptions } from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { registerSignaling } from "./signaling.js";
import { logRuntimeEnvironment,runtimeEnvironmentStatus } from "./environment.js";

const port=Number(process.env.PORT||3001);
const configuredOrigins=(process.env.CLIENT_ORIGIN||process.env.PUBLIC_URL||"http://localhost:5173")
  .split(",").map(value=>value.trim()).filter(Boolean);
const allowedOrigins=new Set(configuredOrigins);
const desktopOrigins=new Set(["http://tauri.localhost","https://tauri.localhost","tauri://localhost"]);
const desktopOriginAllowed=(value?:string)=>{
  if(!value||value==="null")return true;
  if(desktopOrigins.has(value))return true;
  try{
    const parsed=new URL(value);
    const loopbackHosts=new Set(["tauri.localhost","localhost","127.0.0.1","::1"]);
    return loopbackHosts.has(parsed.hostname)&&["http:","https:","tauri:"].includes(parsed.protocol);
  }catch{
    return false;
  }
};
const originAllowed=(value?:string)=>desktopOriginAllowed(value)||Boolean(value&&allowedOrigins.has(value));
const corsOptions:CorsOptions={
  origin(origin,callback){callback(null,originAllowed(origin));},
  methods:["GET","POST"]
};

const defaultProxyHops=process.env.RENDER_SERVICE_TYPE==="web"?1:0;
const proxyHopsRaw=Number(process.env.TRUST_PROXY_HOPS??defaultProxyHops);
const proxyHops=Number.isInteger(proxyHopsRaw)&&proxyHopsRaw>=0&&proxyHopsRaw<=10?proxyHopsRaw:defaultProxyHops;

const app=express();
if(proxyHops>0)app.set("trust proxy",proxyHops);
app.disable("x-powered-by");
app.use((_req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(self), microphone=(self), display-capture=(self)");
  res.setHeader("Cross-Origin-Resource-Policy","same-origin");
  next();
});
app.use(cors(corsOptions));
app.use("/api",rateLimit({windowMs:60_000,limit:120,standardHeaders:"draft-8",legacyHeaders:false}));
const environmentMiddleware:RequestHandler=(_req,res,next)=>{
  res.locals.runtimeEnvironment=runtimeEnvironmentStatus();
  next();
};
app.use("/api",environmentMiddleware);
app.get("/api/wake",(_req,res)=>{
  const status=res.locals.runtimeEnvironment as ReturnType<typeof runtimeEnvironmentStatus>;
  res.setHeader("Cache-Control","no-store");
  res.status(status.ready?200:503).json({
    ok:status.ready,
    service:"lunira-screen-signaling",
    ready:status.ready,
    code:status.ready?undefined:"RTC_CONFIGURATION_INCOMPLETE",
    message:status.ready?undefined:status.message,
    issues:status.issues,
    uptimeSeconds:Math.floor(process.uptime())
  });
});
app.get("/api/health",(_req,res)=>{
  const status=res.locals.runtimeEnvironment as ReturnType<typeof runtimeEnvironmentStatus>;
  res.setHeader("Cache-Control","no-store");
  res.status(status.ready?200:503).json({ok:status.ready,service:"lunira-screen-signaling",code:status.ready?undefined:"RTC_CONFIGURATION_INCOMPLETE",message:status.ready?undefined:status.message,issues:status.issues});
});
app.use("/api",(_req,res)=>res.status(404).json({ok:false,error:"Not found"}));

const httpServer=createServer(app);
const io=new Server(httpServer,{
  cors:corsOptions,
  allowRequest:(req,callback)=>callback(null,originAllowed(req.headers.origin)),
  maxHttpBufferSize:64*1024,
  pingTimeout:20_000,
  pingInterval:25_000
});
const rooms=await registerSignaling(io);

const here=dirname(fileURLToPath(import.meta.url)),clientDist=join(here,"../../dist");
app.use(express.static(clientDist,{
  index:"index.html",
  setHeaders(res,path){if(path.includes("/assets/"))res.setHeader("Cache-Control","public, max-age=31536000, immutable");}
}));
app.get(/.*/,(_req,res)=>{res.setHeader("Cache-Control","no-cache");res.sendFile(join(clientDist,"index.html"));});
httpServer.listen(port,()=>{
  logRuntimeEnvironment();
  console.log(`Lunira Screen signaling on http://localhost:${port} · ${rooms.count()} active rooms`);
});
