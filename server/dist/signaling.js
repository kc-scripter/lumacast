import { createAgoraCredentials, createAgoraUid } from "./agora.js";
import { RoomStore, validRoomId } from "./rooms.js";
const safeAck = (ack, payload) => { if (typeof ack === "function")
    ack(payload); };
const limiter = new Map();
function allowed(socket, limit = 140, windowMs = 10_000) { const now = Date.now(), key = socket.handshake.address; let state = limiter.get(key); if (!state || now - state.start > windowMs)
    state = { start: now, count: 0 }; state.count++; limiter.set(key, state); return state.count <= limit; }
export function registerSignaling(io) {
    const rooms = new RoomStore();
    io.on("connection", socket => {
        socket.on("create-room", (ack) => { const existing = rooms.findByBroadcaster(socket.id); if (existing) {
            try {
                return safeAck(ack, { ok: true, roomId: existing.id, broadcasterToken: existing.token, ...createAgoraCredentials(existing.id, existing.broadcasterUid, "broadcaster"), live: existing.live, viewers: existing.viewers.size });
            }
            catch (error) {
                console.error("Agora token error", error);
                return safeAck(ack, { ok: false, error: "Não foi possível preparar a transmissão." });
            }
        } if (!allowed(socket, 5, 60_000))
            return safeAck(ack, { ok: false, error: "Muitas tentativas. Aguarde um minuto." }); try {
            const roomId = rooms.newId(), room = rooms.create(roomId, socket.id, createAgoraUid());
            socket.join(room.id);
            safeAck(ack, { ok: true, roomId: room.id, broadcasterToken: room.token, ...createAgoraCredentials(room.id, room.broadcasterUid, "broadcaster"), viewers: 0 });
        }
        catch (error) {
            console.error("Agora room creation error", error);
            safeAck(ack, { ok: false, error: "Não foi possível criar a sala de transmissão." });
        } });
        socket.on("reclaim-room", (input, ack) => { if (!allowed(socket))
            return; const data = input; if (!validRoomId(data?.roomId) || typeof data.token !== "string")
            return safeAck(ack, { ok: false, error: "Credenciais inválidas." }); const room = rooms.reclaim(data.roomId, data.token, socket.id); if (!room)
            return safeAck(ack, { ok: false, error: "Sala expirada ou credenciais inválidas." }); try {
            socket.join(room.id);
            safeAck(ack, { ok: true, roomId: room.id, ...createAgoraCredentials(room.id, room.broadcasterUid, "broadcaster"), live: room.live, viewers: room.viewers.size });
            io.to([...room.viewers.keys()]).emit("room-state", { live: room.live, count: room.viewers.size });
        }
        catch (error) {
            console.error("Agora token error", error);
            safeAck(ack, { ok: false, error: "Não foi possível retomar a transmissão." });
        } });
        socket.on("join-room", (input, ack) => { if (!allowed(socket))
            return; const id = input?.roomId; if (!validRoomId(id))
            return safeAck(ack, { ok: false, error: "Código de sala inválido." }); const room = rooms.get(id); if (!room)
            return safeAck(ack, { ok: false, error: "Sala não encontrada." }); try {
            const previous = rooms.findByViewer(socket.id);
            if (previous && previous.id !== id) {
                previous.viewers.delete(socket.id);
                socket.leave(previous.id);
            }
            let uid = room.viewers.get(socket.id);
            while (uid === undefined || uid === room.broadcasterUid || [...room.viewers.values()].some(existing => existing === uid && room.viewers.get(socket.id) !== uid))
                uid = createAgoraUid();
            room.viewers.set(socket.id, uid);
            socket.join(id);
            safeAck(ack, { ok: true, live: room.live, ...createAgoraCredentials(room.id, uid, "viewer") });
            io.to(room.broadcasterId).emit("viewer-count", { count: room.viewers.size });
            io.to([...room.viewers.keys()]).emit("room-state", { live: room.live, count: room.viewers.size });
        }
        catch (error) {
            console.error("Agora viewer token error", error);
            safeAck(ack, { ok: false, error: "Não foi possível entrar na transmissão." });
        } });
        socket.on("renew-agora-token", (input, ack) => { if (!allowed(socket))
            return safeAck(ack, { ok: false, error: "Muitas tentativas." }); const id = input?.roomId; if (!validRoomId(id))
            return safeAck(ack, { ok: false, error: "Código de sala inválido." }); const room = rooms.get(id); if (!room)
            return safeAck(ack, { ok: false, error: "Sala não encontrada." }); try {
            if (room.broadcasterId === socket.id)
                return safeAck(ack, { ok: true, agoraToken: createAgoraCredentials(room.id, room.broadcasterUid, "broadcaster").agoraToken });
            const uid = room.viewers.get(socket.id);
            if (uid === undefined)
                return safeAck(ack, { ok: false, error: "Participante não autorizado." });
            safeAck(ack, { ok: true, agoraToken: createAgoraCredentials(room.id, uid, "viewer").agoraToken });
        }
        catch (error) {
            console.error("Agora token renewal error", error);
            safeAck(ack, { ok: false, error: "Não foi possível renovar a conexão." });
        } });
        socket.on("leave-room", (input) => { const id = input?.roomId; if (!validRoomId(id))
            return; const room = rooms.get(id); if (!room)
            return; room.viewers.delete(socket.id); socket.leave(id); io.to(room.broadcasterId).emit("viewer-count", { count: room.viewers.size }); io.to([...room.viewers.keys()]).emit("room-state", { live: room.live, count: room.viewers.size }); });
        socket.on("broadcast-started", (input) => { if (!allowed(socket))
            return; const id = input?.roomId; if (!validRoomId(id) || !rooms.isBroadcaster(id, socket.id))
            return; const room = rooms.get(id); room.live = true; socket.to(id).emit("broadcast-started"); socket.to(id).emit("room-state", { live: true, count: room.viewers.size }); });
        socket.on("broadcast-ended", (input) => { const id = input?.roomId; if (!validRoomId(id) || !rooms.isBroadcaster(id, socket.id))
            return; const room = rooms.get(id); room.live = false; socket.to(id).emit("broadcast-ended"); socket.to(id).emit("room-state", { live: false, count: room.viewers.size }); });
        socket.on("disconnect", () => { const broadcast = rooms.findByBroadcaster(socket.id); if (broadcast) {
            broadcast.live = false;
            io.to([...broadcast.viewers.keys()]).emit("broadcaster-disconnected");
            rooms.scheduleBroadcasterRemoval(broadcast.id, room => { io.to([...room.viewers.keys()]).emit("broadcast-ended"); });
        } const viewed = rooms.findByViewer(socket.id); if (viewed) {
            viewed.viewers.delete(socket.id);
            io.to(viewed.broadcasterId).emit("viewer-count", { count: viewed.viewers.size });
            io.to([...viewed.viewers.keys()]).emit("room-state", { live: viewed.live, count: viewed.viewers.size });
        } });
    });
    return rooms;
}
