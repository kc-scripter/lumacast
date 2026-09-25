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
const originAllowed=(value?:string)=>Boolean(value&&value!=="null"&&(desktopOrigins.has(value)||allowedOrigins.has(value)));
const telemetryText=(value:unknown,max:number)=>typeof value==="string"?value.replace(/([?&](?:invite|token|guest|code)=)[^&#\s]+/gi,"$1[redacted]").replace(/\b[A-Za-z0-9_-]{43}\b/g,"[secret]").slice(0,max):undefined;
const telemetryNumber=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:undefined;
const corsOptions:CorsOptions={
  origin(origin,callback){callback(null,originAllowed(origin));},
  methods:["GET","POST"]
};
const contentSecurityPolicy=[
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self' https: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'"
].join("; ");

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
  res.setHeader("Content-Security-Policy",contentSecurityPolicy);
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
    code:status.ready?undefined:"SERVICE_NOT_READY"
  });
});
app.get("/api/health",(_req,res)=>{
  const status=res.locals.runtimeEnvironment as ReturnType<typeof runtimeEnvironmentStatus>;
  res.setHeader("Cache-Control","no-store");
  res.status(status.ready?200:503).json({ok:status.ready,service:"lunira-screen-signaling",code:status.ready?undefined:"SERVICE_NOT_READY"});
});
app.post("/api/telemetry",express.json({limit:"16kb"}),(req,res)=>{
  const body=req.body as {generatedAt?:unknown;runtime?:Record<string,unknown>;room?:Record<string,unknown>;stats?:Record<string,unknown>|null;kind?:unknown;events?:unknown};
  const runtime=body?.runtime&&typeof body.runtime==="object"?body.runtime:{};
  const room=body?.room&&typeof body.room==="object"?body.room:{};
  const stats=body?.stats&&typeof body.stats==="object"?body.stats:{};
  const events=Array.isArray(body?.events)?body.events.slice(-20).map((item:unknown)=>{
    const event=item as Record<string,unknown>;
    return{at:telemetryText(event.at,40)||"",level:telemetryText(event.level,12)||"",scope:telemetryText(event.scope,40)||"",message:telemetryText(event.message,500)||"",detail:telemetryText(event.detail,2000)};
  }):[];
  const payload={
    generatedAt:telemetryText(body?.generatedAt,40)||new Date().toISOString(),
    kind:telemetryText(body?.kind,80)||"diagnostic",
    runtime:{href:telemetryText(runtime.href,500),online:typeof runtime.online==="boolean"?runtime.online:undefined,userAgent:telemetryText(runtime.userAgent,500),language:telemetryText(runtime.language,40),viewport:telemetryText(runtime.viewport,40),devicePixelRatio:telemetryNumber(runtime.devicePixelRatio)},
    room:{roomId:telemetryText(room.roomId,20),status:telemetryText(room.status,40),provider:telemetryText(room.provider,20),live:typeof room.live==="boolean"?room.live:undefined,participantCount:telemetryNumber(room.participantCount),cameraCount:telemetryNumber(room.cameraCount)},
    stats:{resolution:telemetryText(stats.resolution,40),fps:telemetryNumber(stats.fps),bitrateKbps:telemetryNumber(stats.bitrateKbps),rttMs:telemetryNumber(stats.rttMs),packetsLost:telemetryNumber(stats.packetsLost),iceState:telemetryText(stats.iceState,40),peerState:telemetryText(stats.peerState,40)},
    events
  };
  console.error("Lunira client telemetry",JSON.stringify(payload));
  res.status(202).json({ok:true});
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
