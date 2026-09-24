const qs=(selector,root=document)=>root.querySelector(selector);

/*
 * Native Windows display capture.
 *
 * The desktop build replaces WebView2/Chromium getDisplayMedia with a DXGI
 * Desktop Duplication source supplied by the Tauri backend. The resulting
 * CanvasCaptureMediaStreamTrack is a normal WebRTC video track, so Agora and
 * LiveKit continue to work without opening the Edge screen picker or drawing
 * a capture border/toolbar over the desktop.
 *
 * Browser builds are untouched: when Tauri commands are unavailable we call
 * the original getDisplayMedia implementation.
 */
const originalGetDisplayMedia=navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
let nativeDisplayCapture=null;

function tauriCommand(command,args={}){
  const internals=window.__TAURI_INTERNALS__;
  if(!internals?.invoke) return Promise.reject(new Error("Tauri runtime indisponível"));
  return internals.invoke(command,args);
}

function numericConstraint(value,fallback){
  if(typeof value==="number"&&Number.isFinite(value)) return value;
  if(value&&typeof value==="object"){
    for(const key of ["ideal","exact","max","min"]){
      const candidate=Number(value[key]);
      if(Number.isFinite(candidate)&&candidate>0) return candidate;
    }
  }
  return fallback;
}

function nativeTargetSize(constraints,sourceWidth,sourceHeight){
  const video=constraints?.video&&typeof constraints.video==="object"?constraints.video:{};
  const requestedWidth=numericConstraint(video.width,sourceWidth);
  const requestedHeight=numericConstraint(video.height,sourceHeight);
  const scale=Math.min(1,requestedWidth/sourceWidth,requestedHeight/sourceHeight);
  return{
    width:Math.max(2,Math.round(sourceWidth*scale/2)*2),
    height:Math.max(2,Math.round(sourceHeight*scale/2)*2),
    fps:Math.min(60,Math.max(1,Math.round(numericConstraint(video.frameRate,60))))
  };
}

function createNativeRenderer(canvas,width,height,bgra){
  const options={alpha:false,antialias:false,depth:false,stencil:false,desynchronized:true,preserveDrawingBuffer:false};
  const gl=canvas.getContext("webgl2",options)||canvas.getContext("webgl",options);
  if(gl){
    const compile=(type,source)=>{
      const shader=gl.createShader(type);
      gl.shaderSource(shader,source);
      gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader)||"Falha ao compilar shader de captura.");
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,"attribute vec2 a_position; varying vec2 v_uv; void main(){v_uv=(a_position+1.0)*0.5;gl_Position=vec4(a_position,0.0,1.0);}");
    const fragment=compile(gl.FRAGMENT_SHADER,"precision mediump float; varying vec2 v_uv; uniform sampler2D u_texture; uniform float u_bgra; void main(){vec4 c=texture2D(u_texture,vec2(v_uv.x,1.0-v_uv.y));gl_FragColor=mix(c,c.bgra,u_bgra);}");
    const program=gl.createProgram();
    gl.attachShader(program,vertex);
    gl.attachShader(program,fragment);
    gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)||"Falha ao ligar shader de captura.");
    gl.useProgram(program);

    const positions=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,positions);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const positionLocation=gl.getAttribLocation(program,"a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation,2,gl.FLOAT,false,0,0);

    const texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.uniform1i(gl.getUniformLocation(program,"u_texture"),0);
    gl.uniform1f(gl.getUniformLocation(program,"u_bgra"),bgra?1:0);
    gl.viewport(0,0,width,height);

    return bytes=>{
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
      gl.flush();
    };
  }

  const context=canvas.getContext("2d",{alpha:false,desynchronized:true});
  if(!context) throw new Error("Canvas indisponível para captura nativa.");
  const imageData=context.createImageData(width,height);
  return bytes=>{
    imageData.data.set(bytes);
    if(bgra){
      for(let i=0;i<imageData.data.length;i+=4){
        const red=imageData.data[i];
        imageData.data[i]=imageData.data[i+2];
        imageData.data[i+2]=red;
      }
    }
    context.putImageData(imageData,0,0);
  };
}

async function stopNativeDisplayCapture(capture){
  if(!capture||capture.stopped) return;
  capture.stopped=true;
  if(capture.raf) cancelAnimationFrame(capture.raf);
  try{await tauriCommand("native_capture_stop");}catch(error){console.warn("[Lunira] native capture stop failed",error);}
  if(nativeDisplayCapture===capture) nativeDisplayCapture=null;
}

async function nativeGetDisplayMedia(constraints={}){
  if(!window.__TAURI_INTERNALS__?.invoke){
    if(!originalGetDisplayMedia) throw new DOMException("Captura de tela indisponível.","NotSupportedError");
    return originalGetDisplayMedia(constraints);
  }

  if(nativeDisplayCapture) await stopNativeDisplayCapture(nativeDisplayCapture);

  let info;
  try{info=await tauriCommand("native_capture_start");}
  catch(error){
    console.error("[Lunira] DXGI start failed",error);
    if(originalGetDisplayMedia) return originalGetDisplayMedia(constraints);
    throw error;
  }

  const sourceWidth=Number(info?.[0])||1920;
  const sourceHeight=Number(info?.[1])||1080;
  const target=nativeTargetSize(constraints,sourceWidth,sourceHeight);
  const canvas=document.createElement("canvas");
  canvas.width=target.width;
  canvas.height=target.height;
  const formatCode=Number(info?.[4]);
  const renderer=createNativeRenderer(canvas,target.width,target.height,formatCode===1);

  let stream=canvas.captureStream(0);
  let videoTrack=stream.getVideoTracks()[0];
  const manualFrames=Boolean(videoTrack&&typeof videoTrack.requestFrame==="function");
  if(videoTrack&&!manualFrames){
    videoTrack.stop();
    stream=canvas.captureStream(target.fps);
    videoTrack=stream.getVideoTracks()[0];
  }
  if(!videoTrack){
    await tauriCommand("native_capture_stop").catch(()=>undefined);
    throw new Error("A captura nativa não criou uma faixa de vídeo.");
  }

  const capture={stopped:false,raf:0,stream,videoTrack};
  nativeDisplayCapture=capture;
  const originalStop=videoTrack.stop.bind(videoTrack);
  videoTrack.stop=()=>{void stopNativeDisplayCapture(capture);originalStop();};
  try{videoTrack.contentHint="motion";}catch{}

  let busy=false;
  let lastFrameAt=0;
  const minFrameInterval=1000/target.fps;
  const frameGate=minFrameInterval*.9;
  const expectedBytes=target.width*target.height*4;
  const render=async now=>{
    if(capture.stopped) return;
    capture.raf=requestAnimationFrame(render);
    // rAF timestamps around 60 Hz fluctuate slightly below 16.67 ms. A small
    // tolerance prevents every other frame from being discarded at 60 FPS,
    // while 30 FPS still naturally runs on every second refresh.
    if(busy||now-lastFrameAt<frameGate) return;
    busy=true;
    lastFrameAt=now;
    try{
      const payload=await tauriCommand("native_capture_frame",{width:target.width,height:target.height});
      if(capture.stopped) return;
      const bytes=payload instanceof Uint8Array?payload:new Uint8Array(payload||0);
      if(bytes.byteLength===0) return;
      if(bytes.byteLength!==expectedBytes){
        throw new Error(`Quadro DXGI inválido: ${bytes.byteLength} bytes; esperado ${expectedBytes}.`);
      }
      renderer(bytes);
      if(manualFrames) videoTrack.requestFrame();
    }catch(error){
      console.error("[Lunira] DXGI frame failed",error);
      if(String(error).includes("DXGI_ACCESS_LOST")){
        try{
          const restarted=await tauriCommand("native_capture_start");
          if(Number(restarted?.[0])!==sourceWidth||Number(restarted?.[1])!==sourceHeight){
            throw new Error("A resolução do monitor mudou durante a captura.");
          }
        }catch(restartError){
          console.error("[Lunira] DXGI restart failed",restartError);
          videoTrack.stop();
        }
      }
    }finally{busy=false;}
  };

  capture.raf=requestAnimationFrame(render);
  console.info("[Lunira] native DXGI capture active",{
    source:`${sourceWidth}x${sourceHeight}`,
    output:`${target.width}x${target.height}`,
    fps:target.fps,
    renderer:formatCode===1?"webgl-bgra":"webgl-rgba",
    refreshHz:info?.[3]?Math.round(Number(info[2])/Number(info[3])):undefined
  });
  return stream;
}

if(navigator.mediaDevices?.getDisplayMedia){
  try{navigator.mediaDevices.getDisplayMedia=nativeGetDisplayMedia;}
  catch(error){console.warn("[Lunira] unable to install native display capture",error);}
}

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
  focusedTile?.classList.remove("lunira-camera-source-focused");
  focusedTile=null;
  qs(".lunira-focus-layer")?.remove();
  document.body.classList.remove("lunira-camera-focus");
}
function focusCamera(tile){
  clearCameraFocus();
  focusedTile=tile;
  tile.classList.add("lunira-camera-source-focused");
  const layer=document.createElement("div");
  layer.className="lunira-focus-layer";
  const backdrop=document.createElement("div");
  backdrop.className="lunira-focus-backdrop";
  backdrop.addEventListener("click",clearCameraFocus);
  const clone=tile.cloneNode(true);
  clone.classList.remove("lunira-camera-source-focused");
  clone.classList.add("lunira-camera-focused");
  const sourceVideo=qs("video",tile);
  const cloneVideo=qs("video",clone);
  if(sourceVideo&&cloneVideo){
    try{cloneVideo.srcObject=sourceVideo.srcObject;}catch{}
    cloneVideo.muted=true;
    cloneVideo.autoplay=true;
    cloneVideo.playsInline=true;
    cloneVideo.play?.().catch(()=>undefined);
  }
  clone.addEventListener("click",event=>{event.stopPropagation();clearCameraFocus();});
  layer.append(backdrop,clone);
  document.body.appendChild(layer);
  document.body.classList.add("lunira-camera-focus");
}
document.addEventListener("click",event=>{
  if(event.target.closest?.(".lunira-focus-layer")) return;
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

/* Desktop conveniences: keyboard access and native title-bar behavior. */
function focusRoomCode(){
  const input=qs("#room-code");
  if(!(input instanceof HTMLInputElement)) return false;
  input.focus();
  input.select();
  return true;
}
function copyCurrentRoomCode(){
  const button=qs(".code-chip");
  if(!(button instanceof HTMLButtonElement)||button.disabled) return false;
  button.click();
  return true;
}
function enhanceConvenienceHints(){
  const roomCode=qs("#room-code");
  if(roomCode&&!roomCode.getAttribute("title")) roomCode.setAttribute("title","Ctrl+K para focar o código da sala");
  const codeButton=qs(".code-chip");
  if(codeButton) codeButton.setAttribute("title","Copiar código da sala · Ctrl+Shift+C");
  const howButton=[...document.querySelectorAll(".launcher-tools button")].find(button=>button.textContent?.toLowerCase().includes("como funciona"));
  if(howButton) howButton.setAttribute("title","Abrir guia rápido · F1");
}
document.addEventListener("keydown",event=>{
  if(event.key==="F1"){
    event.preventDefault();
    openHow();
    return;
  }
  if(event.ctrlKey&&!event.shiftKey&&!event.altKey&&event.key.toLowerCase()==="k"){
    if(focusRoomCode()) event.preventDefault();
    return;
  }
  if(event.ctrlKey&&event.shiftKey&&!event.altKey&&event.key.toLowerCase()==="c"){
    if(copyCurrentRoomCode()) event.preventDefault();
  }
});
document.addEventListener("dblclick",event=>{
  const titlebar=event.target.closest?.(".titlebar");
  if(!titlebar||event.target.closest?.("button,input,a,select,textarea")) return;
  windowCommand("toggle_maximize").catch(()=>{});
});
const convenienceObserver=new MutationObserver(()=>requestAnimationFrame(enhanceConvenienceHints));
convenienceObserver.observe(document.documentElement,{subtree:true,childList:true});
window.addEventListener("DOMContentLoaded",enhanceConvenienceHints);
setTimeout(enhanceConvenienceHints,0);


const LUNIRA_SIGNALING_URL="https://lunirascreen.onrender.com";
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
