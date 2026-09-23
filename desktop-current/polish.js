const qs=(selector,root=document)=>root.querySelector(selector);

function tauriInvoke(command,args={}){
  const internals=window.__TAURI_INTERNALS__;
  if(!internals?.invoke) return Promise.reject(new Error("Tauri runtime indisponível"));
  return internals.invoke(command,args);
}
function windowLabel(){return window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label||"main";}
async function windowCommand(command){
  try{return await tauriInvoke(`plugin:window|${command}`,{label:windowLabel()});}
  catch(error){console.error(`[Lunira] window command ${command} failed`,error);throw error;}
}

/* Capture titlebar controls before React so command failures are never silent. */
document.addEventListener("click",event=>{
  const button=event.target.closest?.(".window-controls button");
  if(!button) return;
  let command=null;
  if(button.classList.contains("close-control")) command="close";
  else if(button.getAttribute("aria-label")==="Minimizar") command="minimize";
  else if(button.getAttribute("aria-label")?.startsWith("Maximizar")) command="toggle_maximize";
  if(!command) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  windowCommand(command).catch(()=>{if(command==="close") window.close();});
},true);

function closeHow(){qs(".lunira-how-overlay")?.remove();}
function openHow(){
  if(qs(".lunira-how-overlay")) return;
  const overlay=document.createElement("div");
  overlay.className="lunira-how-overlay";
  overlay.innerHTML=`
    <section class="lunira-how-modal" role="dialog" aria-modal="true" aria-labelledby="lunira-how-title">
      <button class="lunira-how-close" type="button" aria-label="Fechar">×</button>
      <span class="section-kicker">COMO FUNCIONA</span>
      <h2 id="lunira-how-title">Compartilhe sua tela em poucos segundos.</h2>
      <p>O Lunira cria uma sala única que funciona no aplicativo e no navegador. Você compartilha o código da sala, escolhe a tela ou janela e quem entrar acompanha a transmissão em tempo real.</p>
      <div class="lunira-flow">
        <article><b><span>01</span>Crie ou entre em uma sala</b><p>Use “Compartilhar Tela” para criar uma sala nova ou digite um código de 8 caracteres para entrar em uma sala existente.</p></article>
        <article><b><span>02</span>Convide outras pessoas</b><p>Copie o código exibido no topo da sala e envie para quem vai assistir. App e site usam o mesmo código.</p></article>
        <article><b><span>03</span>Escolha o que transmitir</b><p>Clique em “Compartilhar tela”, selecione um monitor ou uma janela e escolha 720p ou 1080p em 30 ou 60 FPS.</p></article>
        <article><b><span>04</span>Use a sala como uma call</b><p>Os participantes ficam na lateral. Você pode ativar câmera, áudio da tela e focar um participante sem interromper a transmissão.</p></article>
      </div>
      <div class="lunira-techline"><span>Sala sincronizada entre app e web</span><span>Tela em baixa latência</span><span>Câmera e áudio em tempo real</span><span>Sem gravação automática</span></div>
    </section>`;
  overlay.addEventListener("mousedown",e=>{if(e.target===overlay) closeHow();});
  qs(".lunira-how-close",overlay)?.addEventListener("click",closeHow);
  document.body.appendChild(overlay);
}

/* Reliable launcher help action. */
document.addEventListener("click",event=>{
  const button=event.target.closest?.(".launcher-tools button");
  if(!button||!button.textContent?.toLowerCase().includes("como funciona")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openHow();
},true);

let focusedTile=null;
function clearCameraFocus(){
  focusedTile?.classList.remove("lunira-camera-focused");
  focusedTile=null;
  qs(".lunira-focus-backdrop")?.remove();
  document.body.classList.remove("lunira-camera-focus");
}
function focusCamera(tile){
  clearCameraFocus();
  focusedTile=tile;
  tile.classList.add("lunira-camera-focused");
  const backdrop=document.createElement("div");
  backdrop.className="lunira-focus-backdrop";
  backdrop.addEventListener("click",clearCameraFocus);
  document.body.appendChild(backdrop);
  document.body.classList.add("lunira-camera-focus");
}
document.addEventListener("click",event=>{
  const tile=event.target.closest?.(".camera-tile");
  if(!tile) return;
  if(tile===focusedTile) clearCameraFocus(); else focusCamera(tile);
});
document.addEventListener("keydown",event=>{
  if(event.key!=="Escape") return;
  if(qs(".lunira-how-overlay")) closeHow();
  else if(focusedTile) clearCameraFocus();
});

/* Replace decorative title-bar copy with current application state. */
function syncStatus(){
  const status=qs(".titlebar-status");
  if(!status) return;
  let label="Pronto";
  const footer=qs(".stage-panel footer span:first-child");
  const live=qs(".live-chip");
  if(footer){
    const text=footer.textContent||"";
    label=text.includes("Ligado ao servidor")||text.includes("Conectado ao servidor")?"Conectado":text.trim()||"Conectando";
  }else if(qs(".onboarding")) label="Configuração inicial";
  else if(qs(".launcher")) label="Pronto para conectar";
  if(live?.classList.contains("live")) label="Ao vivo";
  if(status.dataset.luniraState===label) return;
  status.dataset.luniraState=label;
  const dot=status.querySelector("i")?.outerHTML||"<i></i>";
  status.innerHTML=`${dot} ${label}`;
}
const observer=new MutationObserver(syncStatus);
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class"]});
window.addEventListener("DOMContentLoaded",syncStatus);
setTimeout(syncStatus,0);


const LUNIRA_SIGNALING_URL="https://lunira-screen.onrender.com";
async function prewarmSignaling(){
  try{
    const response=await fetch(`${LUNIRA_SIGNALING_URL}/api/health`,{
      method:"GET",
      cache:"no-store",
      credentials:"omit"
    });
    console.info("[Lunira] signaling warmup",response.status);
  }catch(error){
    console.warn("[Lunira] signaling warmup failed",error);
  }
}
window.addEventListener("DOMContentLoaded",()=>{void prewarmSignaling()},{once:true});
window.addEventListener("online",()=>{void prewarmSignaling()});
