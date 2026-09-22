import "dotenv/config";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { registerSignaling } from "./signaling.js";

const port=Number(process.env.PORT||3001),origin=process.env.CLIENT_ORIGIN||process.env.PUBLIC_URL||"http://localhost:5173";
const app=express();app.disable("x-powered-by");app.use(cors({origin,methods:["GET","POST"]}));app.use(rateLimit({windowMs:60_000,limit:120,standardHeaders:"draft-8",legacyHeaders:false}));app.get("/api/health",(_req,res)=>res.json({ok:true,service:"lumacast-signaling"}));
const httpServer=createServer(app);const io=new Server(httpServer,{cors:{origin,methods:["GET","POST"]},maxHttpBufferSize:1e6,pingTimeout:20_000,pingInterval:25_000});const rooms=await registerSignaling(io);
const here=dirname(fileURLToPath(import.meta.url)),clientDist=join(here,"../../dist");app.use(express.static(clientDist,{index:"index.html"}));app.get(/.*/,(_req,res)=>res.sendFile(join(clientDist,"index.html")));
httpServer.listen(port,()=>console.log(`LumaCast signaling on http://localhost:${port} · ${rooms.count()} active rooms`));
