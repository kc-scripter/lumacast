import { app, BrowserWindow, desktopCapturer, ipcMain, session } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname=dirname(fileURLToPath(import.meta.url));
const DEV_URL=process.env.LUNIRA_DEV_SERVER_URL;

let mainWindow=null;
let selectedCaptureSourceId=null;

function isMainRenderer(sender){
  return !!mainWindow&&!mainWindow.isDestroyed()&&mainWindow.webContents===sender;
}

async function captureSources(){
  const sources=await desktopCapturer.getSources({
    types:["screen","window"],
    thumbnailSize:{width:360,height:203},
    fetchWindowIcons:true
  });

  return sources.map(source=>({
    id:source.id,
    name:source.name,
    kind:source.id.startsWith("screen:")?"screen":"window",
    thumbnail:source.thumbnail.isEmpty()?null:source.thumbnail.toDataURL(),
    appIcon:source.appIcon&&!source.appIcon.isEmpty()?source.appIcon.toDataURL():null
  }));
}

function registerIpc(){
  ipcMain.handle("lunira:capture:list",async event=>{
    if(!isMainRenderer(event.sender))throw new Error("Renderer não autorizado.");
    return captureSources();
  });

  ipcMain.handle("lunira:capture:select",async(event,sourceId)=>{
    if(!isMainRenderer(event.sender)||typeof sourceId!=="string")return false;
    const sources=await desktopCapturer.getSources({types:["screen","window"],thumbnailSize:{width:0,height:0}});
    if(!sources.some(source=>source.id===sourceId))return false;
    selectedCaptureSourceId=sourceId;
    return true;
  });

  ipcMain.handle("lunira:window:control",(event,action)=>{
    if(!isMainRenderer(event.sender)||!mainWindow)return false;
    if(action==="minimize")mainWindow.minimize();
    else if(action==="maximize")mainWindow.isMaximized()?mainWindow.unmaximize():mainWindow.maximize();
    else if(action==="close")mainWindow.close();
    else return false;
    return true;
  });
}

function configureMediaSession(){
  const ses=session.defaultSession;

  ses.setDisplayMediaRequestHandler(async(request,callback)=>{
    try{
      const sourceId=selectedCaptureSourceId;
      selectedCaptureSourceId=null;
      if(!sourceId){
        callback({});
        return;
      }

      const sources=await desktopCapturer.getSources({types:["screen","window"],thumbnailSize:{width:0,height:0}});
      const source=sources.find(item=>item.id===sourceId);
      if(!source){
        callback({});
        return;
      }

      callback({
        video:source,
        ...(request.audioRequested?{audio:"loopback"}:{})
      });
    }catch(error){
      console.error("Falha ao autorizar captura do desktop",error);
      callback({});
    }
  });

  ses.setPermissionRequestHandler((webContents,permission,callback)=>{
    callback(isMainRenderer(webContents)&&permission==="media");
  });
}

function createWindow(){
  mainWindow=new BrowserWindow({
    width:1280,
    height:800,
    minWidth:1024,
    minHeight:640,
    frame:false,
    show:false,
    backgroundColor:"#08070d",
    webPreferences:{
      preload:join(__dirname,"preload.js"),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
      webSecurity:true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(()=>({action:"deny"}));
  mainWindow.webContents.on("will-navigate",(event,url)=>{
    const destination=new URL(url);
    if(DEV_URL){
      if(destination.origin!==new URL(DEV_URL).origin)event.preventDefault();
    }else if(destination.protocol!=="file:")event.preventDefault();
  });
  mainWindow.once("ready-to-show",()=>mainWindow?.show());
  mainWindow.on("closed",()=>{mainWindow=null;selectedCaptureSourceId=null;});

  if(DEV_URL)void mainWindow.loadURL(DEV_URL);
  else void mainWindow.loadFile(join(__dirname,"dist","index.html"));
}

app.whenReady().then(()=>{
  registerIpc();
  configureMediaSession();
  createWindow();
  app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});

app.on("window-all-closed",()=>{
  if(process.platform!=="darwin")app.quit();
});
