import { app, BrowserWindow, desktopCapturer, ipcMain, net, session, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ORIGIN = "https://lunirascreen.onrender.com";
const DESKTOP_PREFIX = "/__desktop__/";
const NORMAL_MIN_SIZE = {width:1080,height:680};
const PIP_SIZE = {width:520,height:340};
let mainWindow = null;
let selectedSourceId = null;
let pipBounds = null;

const contentTypes = new Map([
  [".html","text/html; charset=utf-8"],[".js","text/javascript; charset=utf-8"],[".css","text/css; charset=utf-8"],
  [".svg","image/svg+xml"],[".png","image/png"],[".jpg","image/jpeg"],[".jpeg","image/jpeg"],[".webp","image/webp"],
  [".woff2","font/woff2"],[".ico","image/x-icon"],[".json","application/json; charset=utf-8"]
]);

function rendererRoot(){ return path.join(app.getAppPath(),"renderer"); }

async function localResponse(request){
  const url = new URL(request.url);
  if(url.origin !== ORIGIN || !url.pathname.startsWith(DESKTOP_PREFIX)){
    return net.fetch(request,{bypassCustomProtocolHandlers:true});
  }
  let relative = decodeURIComponent(url.pathname.slice(DESKTOP_PREFIX.length)) || "index.html";
  relative = relative.replace(/^[/\\]+/,"");
  const root = path.resolve(rendererRoot());
  let target = path.resolve(root,relative);
  if(!target.startsWith(root)) return new Response("Forbidden",{status:403});
  try{
    const bytes = await readFile(target);
    return new Response(bytes,{status:200,headers:{"content-type":contentTypes.get(path.extname(target).toLowerCase())||"application/octet-stream","cache-control":"no-store"}});
  }catch{
    if(path.extname(relative)) return new Response("Not found",{status:404});
    target = path.join(root,"index.html");
    const bytes = await readFile(target);
    return new Response(bytes,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store"}});
  }
}

async function getSources(){
  const sources = await desktopCapturer.getSources({types:["screen","window"],thumbnailSize:{width:420,height:236},fetchWindowIcons:false});
  return sources.filter(source=>source.name!=="Lunira Screen").map(source=>({
    id:source.id,
    name:source.name,
    kind:source.id.startsWith("screen:")?"monitor":"window",
    displayId:source.display_id,
    thumbnail:source.thumbnail.isEmpty()?"":source.thumbnail.toDataURL()
  }));
}

function isTrustedOrigin(value){
  try { return new URL(value).origin === ORIGIN; }
  catch { return typeof value === "string" && value.startsWith(ORIGIN); }
}

function installCaptureHandler(){
  const ses=session.defaultSession;

  ses.setPermissionCheckHandler((_webContents,permission,requestingOrigin,details)=>{
    if(permission!=="media")return false;
    return isTrustedOrigin(details?.securityOrigin || requestingOrigin || "");
  });

  ses.setPermissionRequestHandler((webContents,permission,callback,details)=>{
    if(permission!=="media"){callback(false);return;}
    callback(isTrustedOrigin(details?.securityOrigin || details?.requestingUrl || webContents.getURL()));
  });

  ses.setDisplayMediaRequestHandler((request,callback)=>{
    void (async()=>{
      try{
        if(!request.videoRequested || !isTrustedOrigin(request.securityOrigin)){
          callback({});
          return;
        }
        const sources=await desktopCapturer.getSources({
          types:["screen","window"],
          thumbnailSize:{width:0,height:0},
          fetchWindowIcons:false
        });
        const selected=sources.find(source=>source.id===selectedSourceId)
          || sources.find(source=>source.id.startsWith("screen:"))
          || sources[0];
        if(!selected){callback({});return;}

        const grant={
          video:selected,
          ...(request.audioRequested && process.platform==="win32" ? {audio:"loopback"} : {})
        };
        callback(grant);
      }catch(error){
        console.error("Display media grant failed",error);
        callback({});
      }
    })();
  },{useSystemPicker:false});
}

function createWindow(){
  mainWindow = new BrowserWindow({
    width:1440,height:900,minWidth:NORMAL_MIN_SIZE.width,minHeight:NORMAL_MIN_SIZE.height,frame:false,backgroundColor:"#08090d",show:false,
    title:"Lunira Screen",
    icon:path.join(app.getAppPath(),"build",process.platform==="win32"?"icon.ico":"icon.png"),
    webPreferences:{
      preload:path.join(app.getAppPath(),"preload.cjs"),
      contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false
    }
  });
  mainWindow.once("ready-to-show",()=>mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({url})=>{ if(/^https?:\/\//i.test(url))void shell.openExternal(url); return {action:"deny"}; });
  mainWindow.webContents.on("will-navigate",(event,url)=>{ if(!url.startsWith(ORIGIN)){event.preventDefault(); if(/^https?:\/\//i.test(url))void shell.openExternal(url);} });
  void mainWindow.loadURL(ORIGIN+DESKTOP_PREFIX+"index.html");
  mainWindow.on("closed",()=>{mainWindow=null;});
}

app.setName("Lunira Screen");
app.setAppUserModelId("com.lunira.screen");
app.whenReady().then(async()=>{
  await session.defaultSession.protocol.handle("https",localResponse);
  installCaptureHandler();

  ipcMain.handle("lunira:list-sources",()=>getSources());
  ipcMain.handle("lunira:select-source",(_event,id)=>{selectedSourceId=String(id||"");return true;});
  ipcMain.handle("lunira:window-action",(_event,action)=>{
    if(!mainWindow)return;
    if(action==="minimize")mainWindow.minimize();
    if(action==="maximize"){mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();}
    if(action==="close")mainWindow.close();
  });
  ipcMain.handle("lunira:pip",(_event,enabled)=>{
    if(!mainWindow)return false;
    if(enabled){
      if(!pipBounds)pipBounds=mainWindow.getBounds();
      if(mainWindow.isMaximized())mainWindow.unmaximize();
      mainWindow.setMinimumSize(420,260);
      mainWindow.setAlwaysOnTop(true,"floating");
      const base=pipBounds||mainWindow.getBounds();
      mainWindow.setBounds({
        width:PIP_SIZE.width,
        height:PIP_SIZE.height,
        x:base.x+Math.max(0,base.width-PIP_SIZE.width-18),
        y:base.y+Math.max(0,base.height-PIP_SIZE.height-18)
      },true);
    }else{
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setMinimumSize(NORMAL_MIN_SIZE.width,NORMAL_MIN_SIZE.height);
      if(pipBounds)mainWindow.setBounds(pipBounds,true);
      pipBounds=null;
    }
    return enabled;
  });
  ipcMain.handle("lunira:metrics",()=>{
    const metrics=app.getAppMetrics();
    const cpu=metrics.reduce((sum,item)=>sum+(item.cpu?.percentCPUUsage||0),0);
    const memoryBytes=metrics.reduce((sum,item)=>sum+(item.memory?.workingSetSize||0)*1024,0);
    return {cpu:Math.max(0,Math.min(999,cpu)),memoryMb:Math.round(memoryBytes/1024/1024)};
  });

  createWindow();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
