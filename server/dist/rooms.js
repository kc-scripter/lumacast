import { randomBytes } from "node:crypto";
const ROOM_RE = /^[A-Z2-9]{8}$/;
export const validRoomId = (value) => typeof value === "string" && ROOM_RE.test(value);
export class RoomStore {
    rooms = new Map();
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    roomId() { let id = ""; do {
        const bytes = randomBytes(8);
        id = Array.from(bytes, b => this.alphabet[b % this.alphabet.length]).join("");
    } while (this.rooms.has(id)); return id; }
    create(broadcasterId) { const room = { id: this.roomId(), broadcasterId, token: randomBytes(32).toString("base64url"), viewers: new Set(), live: false }; this.rooms.set(room.id, room); return room; }
    get(id) { return this.rooms.get(id); }
    findByBroadcaster(socketId) { return [...this.rooms.values()].find(r => r.broadcasterId === socketId); }
    findByViewer(socketId) { return [...this.rooms.values()].find(r => r.viewers.has(socketId)); }
    isBroadcaster(id, socketId) { return this.rooms.get(id)?.broadcasterId === socketId; }
    reclaim(id, token, newSocketId) { const room = this.rooms.get(id); if (!room || room.token !== token)
        return null; if (room.disconnectTimer)
        clearTimeout(room.disconnectTimer); room.disconnectTimer = undefined; room.broadcasterId = newSocketId; return room; }
    scheduleBroadcasterRemoval(id, onExpired) { const room = this.rooms.get(id); if (!room)
        return; room.disconnectTimer = setTimeout(() => { if (this.rooms.get(id) === room) {
        this.rooms.delete(id);
        onExpired(room);
    } }, 30_000); }
    delete(id) { const room = this.rooms.get(id); if (room?.disconnectTimer)
        clearTimeout(room.disconnectTimer); this.rooms.delete(id); }
    count() { return this.rooms.size; }
}
