import { createAgoraCredentials, createAgoraUid } from "./agora.js";
import { createLiveKitToken } from "./livekit.js";
import { newSecret, normalizeDisplayName, RoomStore, validRoomId } from "./rooms.js";
const reply = (ack, payload) => { if (typeof ack === "function")
    ack(payload); };
const limiter = new Map();
function allowed(socket, limit = 140, windowMs = 10_000) { const now = Date.now(), key = socket.handshake.address; let state = limiter.get(key); if (!state || now - state.start > windowMs)
    state = { start: now, count: 0 }; state.count++; limiter.set(key, state); return state.count <= limit; }
const livekitActive = (room) => room.ownerLivekitActive || [...room.participants.values()].some(p => p.livekitActive) || room.live && room.screenProvider === "livekit";
const state = (room) => ({ live: room.live, count: room.participants.size, activeScreenSharerId: room.activeScreenSharerId, activeScreenUid: room.activeScreenUid, activeScreenSharerName: room.activeScreenSharerId === room.ownerId ? room.ownerName : room.participants.get(room.activeScreenSharerId || "")?.displayName || null, screenProvider: room.screenProvider, livekitActive: livekitActive(room), ownerName: room.ownerName, participants: [{ id: room.ownerId, displayName: room.ownerName }, ...[...room.participants.values()].map(p => ({ id: p.socketId, displayName: p.displayName }))] });
export function registerSignaling(io) {
    const rooms = new RoomStore();
    const announce = (room) => { io.to(room.id).emit("room-state", state(room)); io.to(room.ownerId).emit("viewer-count", { count: room.participants.size }); };
    const release = (room) => { if (room.screenDisconnectTimer)
        clearTimeout(room.screenDisconnectTimer); room.screenDisconnectTimer = undefined; room.activeScreenSharerId = null; room.activeScreenUid = null; room.screenProvider = "agora"; room.live = false; io.to(room.id).emit("broadcast-ended"); announce(room); };
    io.on("connection", socket => {
        const member = (input) => { const id = input?.roomId; if (!validRoomId(id))
            return null; const room = rooms.get(id); return room && rooms.isMember(room, socket.id) ? room : null; };
        socket.on("create-room", (input, ack) => { if (!allowed(socket, 5, 60_000))
            return reply(ack, { ok: false, error: "Muitas tentativas. Aguarde um minuto." }); const requested = normalizeDisplayName(input?.displayName); if (!requested)
            return reply(ack, { ok: false, error: "Informe um nome entre 2 e 20 caracteres." }); try {
            const existing = rooms.findByOwner(socket.id), room = existing ?? rooms.create(rooms.newId(), socket.id, requested, createAgoraUid());
            socket.join(room.id);
            reply(ack, { ok: true, roomId: room.id, ownerToken: room.ownerToken, broadcasterToken: room.ownerToken, displayName: room.ownerName, ...createAgoraCredentials(room.id, room.ownerUid, "viewer"), ...state(room) });
        }
        catch (error) {
            console.error("Room creation error", error);
            reply(ack, { ok: false, error: "Não foi possível criar a sala." });
        } });
        socket.on("reclaim-room", (input, ack) => { if (!allowed(socket))
            return reply(ack, { ok: false, error: "Muitas tentativas." }); const data = input; if (!validRoomId(data?.roomId) || typeof data.token !== "string")
            return reply(ack, { ok: false, error: "Credenciais inválidas." }); const room = rooms.get(data.roomId); if (!room || !rooms.reclaim(room, data.token, socket.id))
            return reply(ack, { ok: false, error: "Sala expirada ou credenciais inválidas." }); try {
            socket.join(room.id);
            reply(ack, { ok: true, roomId: room.id, ...createAgoraCredentials(room.id, room.ownerUid, "viewer"), ...state(room) });
            announce(room);
        }
        catch (error) {
            console.error("Owner reclaim error", error);
            reply(ack, { ok: false, error: "Não foi possível retomar a sala." });
        } });
        socket.on("join-room", (input, ack) => { if (!allowed(socket))
            return reply(ack, { ok: false, error: "Muitas tentativas." }); const data = input; if (!validRoomId(data?.roomId))
            return reply(ack, { ok: false, error: "Código de sala inválido." }); const room = rooms.get(data.roomId); if (!room)
            return reply(ack, { ok: false, error: "Sala não encontrada." }); try {
            const old = typeof data.participantToken === "string" ? [...room.participants.values()].find(p => p.token === data.participantToken) : undefined;
            let participant = room.participants.get(socket.id);
            if (!participant) {
                if (old) {
                    if (old.disconnectTimer)
                        clearTimeout(old.disconnectTimer);
                    room.participants.delete(old.socketId);
                    participant = { ...old, socketId: socket.id, disconnectTimer: undefined };
                    if (room.activeScreenSharerId === old.socketId) {
                        if (room.screenDisconnectTimer)
                            clearTimeout(room.screenDisconnectTimer);
                        room.screenDisconnectTimer = undefined;
                        room.activeScreenSharerId = socket.id;
                    }
                }
                else {
                    const requested = normalizeDisplayName(data.displayName);
                    if (!requested)
                        return reply(ack, { ok: false, error: "Informe um nome entre 2 e 20 caracteres." });
                    let uid;
                    do {
                        uid = createAgoraUid();
                    } while (uid === room.ownerUid || [...room.participants.values()].some(p => p.agoraUid === uid));
                    participant = { socketId: socket.id, displayName: rooms.nameFor(room, requested), agoraUid: uid, token: newSecret(), livekitActive: false };
                }
                room.participants.set(socket.id, participant);
            }
            socket.join(room.id);
            reply(ack, { ok: true, participantToken: participant.token, displayName: participant.displayName, ...createAgoraCredentials(room.id, participant.agoraUid, "viewer"), ...state(room) });
            announce(room);
        }
        catch (error) {
            console.error("Room join error", error);
            reply(ack, { ok: false, error: "Não foi possível entrar na sala." });
        } });
        socket.on("request-screen-share", (input, ack) => { if (!allowed(socket))
            return reply(ack, { ok: false, error: "Muitas tentativas." }); const room = member(input); if (!room)
            return reply(ack, { ok: false, error: "Participante não autorizado." }); if (room.activeScreenSharerId && room.activeScreenSharerId !== socket.id)
            return reply(ack, { ok: false, error: "Outra pessoa já está compartilhando a tela." }); try {
            if (!room.activeScreenSharerId) {
                room.activeScreenSharerId = socket.id;
                let uid;
                do {
                    uid = createAgoraUid();
                } while (uid === room.ownerUid || [...room.participants.values()].some(p => p.agoraUid === uid));
                room.activeScreenUid = uid;
                room.screenProvider = "agora";
            }
            reply(ack, { ok: true, ...createAgoraCredentials(room.id, room.activeScreenUid, "broadcaster"), ...state(room) });
            announce(room);
        }
        catch (error) {
            console.error("Screen lock error", error);
            reply(ack, { ok: false, error: "Não foi possível preparar a tela." });
        } });
        socket.on("release-screen-share", (input, ack) => { const room = member(input); if (!room || room.activeScreenSharerId !== socket.id)
            return reply(ack, { ok: false, error: "Participante não autorizado." }); release(room); reply(ack, { ok: true }); });
        socket.on("screen-provider-changed", (input, ack) => { const room = member(input), provider = input?.provider; if (!room || room.activeScreenSharerId !== socket.id || provider !== "livekit")
            return reply(ack, { ok: false, error: "Participante não autorizado." }); room.screenProvider = "livekit"; io.to(room.id).emit("screen-provider-changed", { screenProvider: "livekit" }); announce(room); reply(ack, { ok: true }); });
        socket.on("broadcast-started", (input) => { const room = member(input); if (!room || room.activeScreenSharerId !== socket.id)
            return; room.live = true; io.to(room.id).emit("broadcast-started"); announce(room); });
        socket.on("broadcast-ended", (input) => { const room = member(input); if (room && room.activeScreenSharerId === socket.id)
            release(room); });
        socket.on("renew-agora-token", (input, ack) => { if (!allowed(socket))
            return reply(ack, { ok: false, error: "Muitas tentativas." }); const room = member(input); if (!room)
            return reply(ack, { ok: false, error: "Participante não autorizado." }); try {
            const screen = room.activeScreenSharerId === socket.id && input?.screen === true, uid = screen ? room.activeScreenUid : rooms.getUid(room, socket.id);
            if (uid == null)
                return reply(ack, { ok: false, error: "UID inválido." });
            reply(ack, { ok: true, agoraToken: createAgoraCredentials(room.id, uid, screen ? "broadcaster" : "viewer").agoraToken });
        }
        catch (error) {
            console.error("Agora renewal error", error);
            reply(ack, { ok: false, error: "Não foi possível renovar a conexão." });
        } });
        socket.on("get-livekit-token", async (input, ack) => { if (!allowed(socket))
            return reply(ack, { ok: false, error: "Muitas tentativas." }); const room = member(input); if (!room)
            return reply(ack, { ok: false, error: "Participante não autorizado." }); try {
            const screen = room.activeScreenSharerId === socket.id && room.screenProvider === "livekit", token = await createLiveKitToken(room.id, socket.id, screen);
            reply(ack, { ok: true, livekitUrl: process.env.LIVEKIT_URL, livekitToken: token });
        }
        catch (error) {
            console.error("LiveKit token error", error);
            reply(ack, { ok: false, error: "Não foi possível conectar ao LiveKit." });
        } });
        socket.on("livekit-media-active", (input) => { const room = member(input), participant = room?.participants.get(socket.id); if (!room)
            return; if (participant)
            participant.livekitActive = !!input.active;
        else
            room.ownerLivekitActive = !!input.active; announce(room); });
        socket.on("leave-room", (input) => { const room = member(input); if (!room)
            return; const participant = room.participants.get(socket.id); if (participant) {
            room.participants.delete(socket.id);
            socket.leave(room.id);
            if (room.activeScreenSharerId === socket.id)
                release(room);
            announce(room);
        } });
        socket.on("disconnect", () => { const owner = rooms.findByOwner(socket.id); if (owner) {
            owner.ownerLivekitActive = false;
            io.to(owner.id).emit("owner-disconnected");
            owner.ownerDisconnectTimer = setTimeout(() => { if (rooms.get(owner.id) === owner && owner.ownerId === socket.id) {
                rooms.remove(owner.id);
                io.to(owner.id).emit("broadcast-ended");
                io.to(owner.id).emit("room-expired");
            } }, 30_000);
        } const room = rooms.findByParticipant(socket.id); if (room) {
            const participant = room.participants.get(socket.id);
            participant.livekitActive = false;
            participant.disconnectTimer = setTimeout(() => { if (room.participants.get(socket.id) === participant) {
                room.participants.delete(socket.id);
                if (room.activeScreenSharerId === socket.id)
                    release(room);
                announce(room);
            } }, 10_000);
            announce(room);
        } const screen = owner?.activeScreenSharerId === socket.id ? owner : room?.activeScreenSharerId === socket.id ? room : null; if (screen) {
            screen.screenDisconnectTimer = setTimeout(() => { if (screen.activeScreenSharerId === socket.id)
                release(screen); }, 10_000);
        } });
    });
    return rooms;
}
