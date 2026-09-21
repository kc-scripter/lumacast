import { RoomStore, validRoomId } from "./rooms.js";
const safeAck = (ack, payload) => { if (typeof ack === "function")
    ack(payload); };
const limiter = new Map();
function allowed(socket, limit = 140, windowMs = 10_000) { const now = Date.now(), key = socket.handshake.address; let state = limiter.get(key); if (!state || now - state.start > windowMs)
    state = { start: now, count: 0 }; state.count++; limiter.set(key, state); return state.count <= limit; }
export function registerSignaling(io) {
    const rooms = new RoomStore();
    io.on("connection", socket => {
        socket.on("create-room", (ack) => { const existing = rooms.findByBroadcaster(socket.id); if (existing)
            return safeAck(ack, { ok: true, roomId: existing.id, broadcasterToken: existing.token, live: existing.live, viewers: existing.viewers.size }); if (!allowed(socket, 5, 60_000))
            return safeAck(ack, { ok: false, error: "Muitas tentativas. Aguarde um minuto." }); const room = rooms.create(socket.id); socket.join(room.id); safeAck(ack, { ok: true, roomId: room.id, broadcasterToken: room.token, viewers: 0 }); });
        socket.on("reclaim-room", (input, ack) => { if (!allowed(socket))
            return; const data = input; if (!validRoomId(data?.roomId) || typeof data.token !== "string")
            return safeAck(ack, { ok: false, error: "Credenciais inválidas." }); const room = rooms.reclaim(data.roomId, data.token, socket.id); if (!room)
            return safeAck(ack, { ok: false, error: "Sala expirada ou credenciais inválidas." }); socket.join(room.id); safeAck(ack, { ok: true, roomId: room.id, live: room.live, viewers: room.viewers.size }); io.to([...room.viewers]).emit("room-state", { live: room.live, count: room.viewers.size }); for (const viewerId of room.viewers)
            socket.emit("viewer-joined", { viewerId, count: room.viewers.size }); });
        socket.on("join-room", (input, ack) => { if (!allowed(socket))
            return; const id = input?.roomId; if (!validRoomId(id))
            return safeAck(ack, { ok: false, error: "Código de sala inválido." }); const room = rooms.get(id); if (!room)
            return safeAck(ack, { ok: false, error: "Sala não encontrada." }); const previous = rooms.findByViewer(socket.id); if (previous && previous.id !== id) {
            previous.viewers.delete(socket.id);
            socket.leave(previous.id);
        } room.viewers.add(socket.id); socket.join(id); safeAck(ack, { ok: true, live: room.live }); io.to(room.broadcasterId).emit("viewer-joined", { viewerId: socket.id, count: room.viewers.size }); io.to([...room.viewers]).emit("room-state", { live: room.live, count: room.viewers.size }); });
        socket.on("leave-room", (input) => { const id = input?.roomId; if (!validRoomId(id))
            return; const room = rooms.get(id); if (!room)
            return; room.viewers.delete(socket.id); socket.leave(id); io.to(room.broadcasterId).emit("viewer-left", { viewerId: socket.id, count: room.viewers.size }); io.to([...room.viewers]).emit("room-state", { live: room.live, count: room.viewers.size }); });
        socket.on("broadcast-started", (input) => { if (!allowed(socket))
            return; const id = input?.roomId; if (!validRoomId(id) || !rooms.isBroadcaster(id, socket.id))
            return; const room = rooms.get(id); room.live = true; socket.to(id).emit("broadcast-started"); socket.to(id).emit("room-state", { live: true, count: room.viewers.size }); });
        socket.on("broadcast-ended", (input) => { const id = input?.roomId; if (!validRoomId(id) || !rooms.isBroadcaster(id, socket.id))
            return; const room = rooms.get(id); room.live = false; socket.to(id).emit("broadcast-ended"); });
        socket.on("request-offer", (input) => { const id = input?.roomId; if (!validRoomId(id))
            return; const room = rooms.get(id); if (room?.viewers.has(socket.id))
            io.to(room.broadcasterId).emit("viewer-joined", { viewerId: socket.id, count: room.viewers.size }); });
        socket.on("offer", (data) => { if (!allowed(socket) || !validRoomId(data.roomId) || typeof data.viewerId !== "string" || !rooms.isBroadcaster(data.roomId, socket.id))
            return; const room = rooms.get(data.roomId); if (room?.viewers.has(data.viewerId))
            io.to(data.viewerId).emit("offer", { viewerId: data.viewerId, sdp: data.sdp }); });
        socket.on("answer", (data) => { if (!allowed(socket) || !validRoomId(data.roomId) || typeof data.viewerId !== "string" || data.viewerId !== socket.id)
            return; const room = rooms.get(data.roomId); if (room?.viewers.has(socket.id))
            io.to(room.broadcasterId).emit("answer", { viewerId: socket.id, sdp: data.sdp }); });
        socket.on("ice-candidate", (data) => { if (!allowed(socket) || !validRoomId(data.roomId) || typeof data.viewerId !== "string")
            return; const room = rooms.get(data.roomId); if (!room)
            return; if (socket.id === room.broadcasterId && room.viewers.has(data.viewerId))
            io.to(data.viewerId).emit("ice-candidate", { viewerId: data.viewerId, candidate: data.candidate });
        else if (socket.id === data.viewerId && room.viewers.has(socket.id))
            io.to(room.broadcasterId).emit("ice-candidate", { viewerId: socket.id, candidate: data.candidate }); });
        socket.on("disconnect", () => { const broadcast = rooms.findByBroadcaster(socket.id); if (broadcast) {
            broadcast.live = false;
            io.to([...broadcast.viewers]).emit("broadcaster-disconnected");
            rooms.scheduleBroadcasterRemoval(broadcast.id, room => io.to([...room.viewers]).emit("broadcast-ended"));
        } const viewed = rooms.findByViewer(socket.id); if (viewed) {
            viewed.viewers.delete(socket.id);
            io.to(viewed.broadcasterId).emit("viewer-left", { viewerId: socket.id, count: viewed.viewers.size });
            io.to([...viewed.viewers]).emit("room-state", { live: viewed.live, count: viewed.viewers.size });
        } });
    });
    return rooms;
}
