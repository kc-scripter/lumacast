import { randomBytes } from "node:crypto";
const ROOM_RE = /^[A-Z2-9]{8}$/;
export const validRoomId = (value) => typeof value === "string" && ROOM_RE.test(value);
export const newSecret = () => randomBytes(32).toString("base64url");
export class RoomStore {
    rooms = new Map();
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    newId() { let id = ""; do {
        const bytes = randomBytes(8);
        id = Array.from(bytes, b => this.alphabet[b % this.alphabet.length]).join("");
    } while (this.rooms.has(id)); return id; }
    create(id, ownerId, ownerUid) { const room = { id, ownerId, ownerUid, ownerToken: newSecret(), ownerLivekitActive: false, participants: new Map(), activeScreenSharerId: null, activeScreenUid: null, screenProvider: "agora", live: false }; this.rooms.set(id, room); return room; }
    get(id) { return this.rooms.get(id); }
    findByOwner(id) { return [...this.rooms.values()].find(room => room.ownerId === id); }
    findByParticipant(id) { return [...this.rooms.values()].find(room => room.participants.has(id)); }
    isMember(room, id) { return room.ownerId === id || room.participants.has(id); }
    getUid(room, id) { return room.ownerId === id ? room.ownerUid : room.participants.get(id)?.agoraUid; }
    reclaim(room, token, id) { if (room.ownerToken !== token)
        return false; if (room.ownerDisconnectTimer)
        clearTimeout(room.ownerDisconnectTimer); room.ownerDisconnectTimer = undefined; const old = room.ownerId; room.ownerId = id; if (room.activeScreenSharerId === old) {
        if (room.screenDisconnectTimer)
            clearTimeout(room.screenDisconnectTimer);
        room.screenDisconnectTimer = undefined;
        room.activeScreenSharerId = id;
    } return true; }
    remove(id) { const room = this.rooms.get(id); if (!room)
        return; if (room.ownerDisconnectTimer)
        clearTimeout(room.ownerDisconnectTimer); if (room.screenDisconnectTimer)
        clearTimeout(room.screenDisconnectTimer); for (const participant of room.participants.values())
        if (participant.disconnectTimer)
            clearTimeout(participant.disconnectTimer); this.rooms.delete(id); }
    count() { return this.rooms.size; }
}
