import type { FrameRate, Quality, StreamStats } from "../types";

const fallbackIceServers:RTCIceServer[]=[{urls:"stun:stun.l.google.com:19302"}];
let iceServersPromise:Promise<RTCIceServer[]>|null=null;
export function getIceServers(): Promise<RTCIceServer[]> {
  if(!iceServersPromise)iceServersPromise=fetch("/api/ice-servers").then(async response=>{if(!response.ok)throw new Error(`ICE server request returned ${response.status}`);const body=await response.json() as {iceServers?:unknown};return Array.isArray(body.iceServers)&&body.iceServers.length?body.iceServers as RTCIceServer[]:fallbackIceServers;}).catch(error=>{console.warn("TURN unavailable; using STUN fallback",error);return fallbackIceServers;});
  return iceServersPromise;
}

export function displayConstraints(quality:Quality, frameRate:FrameRate): DisplayMediaStreamOptions {
  const height = quality === "1080p" ? 1080 : quality === "720p" ? 720 : undefined;
  const width = quality === "1080p" ? 1920 : quality === "720p" ? 1280 : undefined;
  return { video:{ frameRate:{ ideal:frameRate, max:frameRate }, ...(width ? { width:{ ideal:width }, height:{ ideal:height } } : {}) }, audio:true };
}

export async function tuneSender(sender:RTCRtpSender, quality:Quality, frameRate:FrameRate) {
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  const maxBitrate = quality === "1080p" ? (frameRate === 60 ? 8_000_000 : 6_000_000) : quality === "720p" ? (frameRate === 60 ? 5_000_000 : 3_000_000) : 4_000_000;
  params.encodings[0].maxBitrate = maxBitrate;
  params.encodings[0].maxFramerate = frameRate;
  params.degradationPreference = "maintain-resolution";
  try { await sender.setParameters(params); } catch { /* Some browsers expose read-only sender parameters. */ }
}

type Counter = { bytes:number; at:number };
const counters = new WeakMap<RTCPeerConnection,Counter>();

export async function readStats(pc:RTCPeerConnection): Promise<StreamStats> {
  const reports = await pc.getStats();
  let width=0,height=0,fps=0,bytes=0,rtt=0,packetsLost=0;
  reports.forEach((report) => {
    if ((report.type === "inbound-rtp" || report.type === "outbound-rtp") && report.kind === "video") {
      width = report.frameWidth || width; height = report.frameHeight || height; fps = report.framesPerSecond || fps; bytes = report.bytesReceived || report.bytesSent || bytes; packetsLost = report.packetsLost || packetsLost;
    }
    if (report.type === "candidate-pair" && report.state === "succeeded") rtt = (report.currentRoundTripTime || 0) * 1000;
  });
  const now=Date.now(), previous=counters.get(pc); let bitrateKbps=0;
  if (previous && bytes >= previous.bytes) bitrateKbps=Math.round(((bytes-previous.bytes)*8)/(now-previous.at));
  counters.set(pc,{bytes,at:now});
  return { resolution:width&&height?`${width} × ${height}`:"—", fps:Math.round(fps), bitrateKbps, rttMs:Math.round(rtt), packetsLost, iceState:pc.iceConnectionState, peerState:pc.connectionState };
}
