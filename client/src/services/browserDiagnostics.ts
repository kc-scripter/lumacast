export type BrowserDiagnostics={webRtc:boolean;mediaDevices:boolean;displayCapture:boolean;secureContext:boolean;warnings:string[]};

export function getBrowserDiagnostics():BrowserDiagnostics{
  const webRtc=typeof RTCPeerConnection!=="undefined";
  const mediaDevices=typeof navigator!=="undefined"&&!!navigator.mediaDevices;
  const displayCapture=mediaDevices&&typeof navigator.mediaDevices.getDisplayMedia==="function";
  const secureContext=typeof window==="undefined"||window.isSecureContext||location.hostname==="localhost"||location.hostname==="127.0.0.1";
  const warnings:string[]=[];
  if(!webRtc)warnings.push("Este navegador não oferece WebRTC completo; vídeo em tempo real pode não funcionar.");
  if(!secureContext)warnings.push("Abra o LumaCast por HTTPS para liberar os recursos de mídia do navegador.");
  else if(!mediaDevices)warnings.push("Este navegador não expõe câmera e captura de tela.");
  else if(!displayCapture)warnings.push("Assistir funciona, mas este navegador não permite compartilhar a própria tela.");
  return{webRtc,mediaDevices,displayCapture,secureContext,warnings};
}
