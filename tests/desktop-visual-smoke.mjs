import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base=process.env.DESKTOP_PREVIEW_URL||"http://127.0.0.1:1420";
const output=process.env.DESKTOP_VISUAL_DIR||"/tmp/lunira-visual";
await mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
await page.addInitScript(()=>{
  const mediaDevices=navigator.mediaDevices||{};
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:mediaDevices});
  Object.defineProperty(mediaDevices,"getDisplayMedia",{configurable:true,value:async()=>{
    const canvas=document.createElement("canvas");
    canvas.width=1920;canvas.height=1080;
    const context=canvas.getContext("2d");
    if(context){
      context.fillStyle="#060a16";context.fillRect(0,0,canvas.width,canvas.height);
      context.fillStyle="#7560d9";context.font="72px sans-serif";context.fillText("Lunira Screen QA",120,180);
    }
    return canvas.captureStream(30);
  }});
});

await page.goto(base,{waitUntil:"domcontentloaded"});
await page.locator(".approved-lobby-page").waitFor({state:"visible",timeout:15000});
const waveBefore=await page.locator(".wave-layer-top").evaluate(element=>getComputedStyle(element).transform);
await page.waitForTimeout(900);
const waveAfter=await page.locator(".wave-layer-top").evaluate(element=>getComputedStyle(element).transform);
if(waveBefore===waveAfter)throw new Error("Animated background wave did not move.");
await page.screenshot({path:output+"/lobby.png",fullPage:true});

await page.getByText(/Servidor disponível/).first().waitFor({timeout:30000});
await page.locator("#display-name").fill("Kauã");
await page.getByRole("button",{name:/Criar sala/i}).click();
await page.locator(".approved-room-page").waitFor({state:"visible",timeout:15000});
await page.screenshot({path:output+"/room-collapsed-controls.png",fullPage:true});

const controlsToggle=page.getByRole("button",{name:"Expandir controles"});
await controlsToggle.click();
await page.locator(".approved-controls-panel").waitFor({state:"visible"});
const micCount=await page.getByText(/microfone|microphone/i).count();
if(micCount!==0)throw new Error("Microphone UI must not exist in the desktop app.");
await page.screenshot({path:output+"/room-controls-open.png",fullPage:true});

await page.getByRole("button",{name:"Recolher participantes"}).click();
await page.getByRole("button",{name:"Expandir participantes"}).waitFor();
await page.screenshot({path:output+"/room-sidebar-collapsed.png",fullPage:true});
await page.getByRole("button",{name:"Expandir participantes"}).click();

await page.getByRole("button",{name:"Compartilhar",exact:true}).click();
await page.getByRole("dialog",{name:"Compartilhar tela"}).waitFor();
await page.getByRole("button",{name:/Escolher tela ou janela/i}).click();
await page.locator(".screen-picker-preview video").waitFor({state:"visible"});
await page.screenshot({path:output+"/share-dialog.png",fullPage:true});
await page.getByRole("dialog",{name:"Compartilhar tela"}).getByRole("button",{name:"Fechar"}).click();

await page.getByRole("button",{name:"Configurações"}).first().click();
await page.getByRole("dialog",{name:"Configurações"}).waitFor();
await page.screenshot({path:output+"/settings.png",fullPage:true});

await browser.close();
console.log(JSON.stringify({ok:true,shots:["lobby.png","room-collapsed-controls.png","room-controls-open.png","room-sidebar-collapsed.png","share-dialog.png","settings.png"]}));
