import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base=process.env.DESKTOP_PREVIEW_URL||"http://127.0.0.1:1420";
const output=process.env.DESKTOP_VISUAL_DIR||"/tmp/lunira-visual";
await mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
await page.goto(base,{waitUntil:"domcontentloaded"});
await page.getByRole("button",{name:/Começar agora/i}).waitFor({state:"visible",timeout:15000});
const waveBefore=await page.locator(".wave-layer-top").evaluate(element=>getComputedStyle(element).transform);
await page.waitForTimeout(900);
const waveAfter=await page.locator(".wave-layer-top").evaluate(element=>getComputedStyle(element).transform);
if(waveBefore===waveAfter)throw new Error("Animated background wave did not move.");
await page.screenshot({path:output+"/welcome.png",fullPage:true});

await page.getByRole("button",{name:/Começar agora/i}).click();
await page.locator("#display-name").waitFor({state:"visible",timeout:15000});
await page.getByText(/Servidor disponível|Preparando servidor/).first().waitFor({timeout:15000});
const titleBefore=await page.locator(".hero-flow-title span").first().evaluate(element=>getComputedStyle(element).backgroundPosition);
await page.waitForTimeout(900);
const titleAfter=await page.locator(".hero-flow-title span").first().evaluate(element=>getComputedStyle(element).backgroundPosition);
if(titleBefore===titleAfter)throw new Error("Hero purple sweep did not animate.");
await page.screenshot({path:output+"/home.png",fullPage:true});

await page.locator("#display-name").fill("Kauã");
await page.getByRole("button",{name:/Começar a transmitir/i}).click();
await page.getByText(/Pronto para compartilhar|Preparando sua tela|Tela principal/i).first().waitFor({timeout:15000});
await page.screenshot({path:output+"/room.png",fullPage:true});

await page.getByRole("button",{name:"Configurações"}).last().click();
await page.getByRole("dialog",{name:"Configurações"}).waitFor();
await page.screenshot({path:output+"/settings.png",fullPage:true});

await browser.close();
console.log(JSON.stringify({ok:true,shots:["welcome.png","home.png","room.png","settings.png"]}));
