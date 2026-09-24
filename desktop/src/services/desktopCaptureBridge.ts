function sourcePicker(sources:DesktopCaptureSource[]):Promise<DesktopCaptureSource|null>{
  return new Promise(resolve=>{
    const overlay=document.createElement("div");
    overlay.className="desktop-source-overlay";
    overlay.setAttribute("role","presentation");

    const dialog=document.createElement("section");
    dialog.className="desktop-source-dialog";
    dialog.setAttribute("role","dialog");
    dialog.setAttribute("aria-modal","true");
    dialog.setAttribute("aria-labelledby","desktop-source-title");

    const header=document.createElement("header");
    const heading=document.createElement("div");
    const title=document.createElement("h2");
    title.id="desktop-source-title";
    title.textContent="Escolha o que compartilhar";
    const subtitle=document.createElement("p");
    subtitle.textContent="Selecione uma tela inteira ou uma janela aberta.";
    heading.append(title,subtitle);

    const cancel=document.createElement("button");
    cancel.type="button";
    cancel.className="desktop-source-cancel";
    cancel.textContent="Cancelar";
    header.append(heading,cancel);

    const grid=document.createElement("div");
    grid.className="desktop-source-grid";

    let settled=false;
    const finish=(source:DesktopCaptureSource|null)=>{
      if(settled)return;
      settled=true;
      document.removeEventListener("keydown",onKeyDown,true);
      overlay.remove();
      resolve(source);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();finish(null);}
    };

    for(const source of sources){
      const button=document.createElement("button");
      button.type="button";
      button.className="desktop-source-card";
      button.dataset.kind=source.kind;

      const preview=document.createElement("div");
      preview.className="desktop-source-preview";
      if(source.thumbnail){
        const image=document.createElement("img");
        image.src=source.thumbnail;
        image.alt="";
        preview.append(image);
      }

      const meta=document.createElement("div");
      meta.className="desktop-source-meta";
      if(source.appIcon){
        const icon=document.createElement("img");
        icon.src=source.appIcon;
        icon.alt="";
        meta.append(icon);
      }
      const copy=document.createElement("span");
      const name=document.createElement("strong");
      name.textContent=source.name;
      const kind=document.createElement("small");
      kind.textContent=source.kind==="screen"?"Tela":"Janela";
      copy.append(name,kind);
      meta.append(copy);
      button.append(preview,meta);
      button.addEventListener("click",()=>finish(source));
      grid.append(button);
    }

    cancel.addEventListener("click",()=>finish(null));
    overlay.addEventListener("mousedown",event=>{if(event.target===overlay)finish(null);});
    document.addEventListener("keydown",onKeyDown,true);
    dialog.append(header,grid);
    overlay.append(dialog);
    document.body.append(overlay);
    cancel.focus();
  });
}

export function installDesktopCaptureBridge(){
  const api=window.luniraDesktop;
  const mediaDevices=navigator.mediaDevices;
  if(!api||!mediaDevices||typeof mediaDevices.getDisplayMedia!=="function")return;

  const browserGetDisplayMedia=mediaDevices.getDisplayMedia.bind(mediaDevices);
  const electronGetDisplayMedia:typeof mediaDevices.getDisplayMedia=async constraints=>{
    const sources=await api.listCaptureSources();
    if(!sources.length)throw new DOMException("Nenhuma tela ou janela disponível.","NotFoundError");
    const source=await sourcePicker(sources);
    if(!source)throw new DOMException("Compartilhamento cancelado.","NotAllowedError");
    if(!await api.selectCaptureSource(source.id))throw new DOMException("A fonte selecionada não está mais disponível.","NotFoundError");
    return browserGetDisplayMedia(constraints);
  };

  try{
    Object.defineProperty(mediaDevices,"getDisplayMedia",{configurable:true,value:electronGetDisplayMedia});
  }catch(error){
    console.error("Não foi possível instalar a ponte de captura do Electron",error);
  }
}
