import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const configured = import.meta.env.VITE_SIGNALING_URL?.trim();
    socket = io(configured || undefined, { autoConnect:false, reconnection:true, reconnectionAttempts:8, reconnectionDelay:800, timeout:8000 });
  }
  return socket;
}

export function connectSocket(): Socket {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}
