const DAILY_API = "https://api.daily.co/v1";
function apiKey() { const key = process.env.DAILY_API_KEY; if (!key)
    throw new Error("DAILY_API_KEY não configurada."); return key; }
async function dailyRequest(path, init) { const response = await fetch(`${DAILY_API}${path}`, { ...init, headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", ...init.headers } }); if (!response.ok)
    throw new Error(`Daily API ${response.status}: ${await response.text()}`); if (response.status === 204)
    return undefined; return response.json(); }
export async function createDailyRoom(roomId) { const name = `lumacast-${roomId.toLowerCase()}`, exp = Math.floor(Date.now() / 1000) + 86_400; return dailyRequest("/rooms", { method: "POST", body: JSON.stringify({ name, privacy: "private", properties: { exp, eject_at_room_exp: true, enable_screenshare: true, start_video_off: true, start_audio_off: true, sfu_switchover: 0 } }) }); }
export async function createDailyToken(roomName, role, userId) { const exp = Math.floor(Date.now() / 1000) + 86_400, canSend = role === "broadcaster" ? ["screenVideo", "screenAudio"] : false; const result = await dailyRequest("/meeting-tokens", { method: "POST", body: JSON.stringify({ properties: { room_name: roomName, exp, user_id: userId, user_name: role === "broadcaster" ? "Transmissor" : "Espectador", start_video_off: true, start_audio_off: true, enable_screenshare: role === "broadcaster", permissions: { canSend, canReceive: { base: true }, canAdmin: false } } }) }); return result.token; }
export async function deleteDailyRoom(roomName) { try {
    await dailyRequest(`/rooms/${encodeURIComponent(roomName)}`, { method: "DELETE" });
}
catch (error) {
    console.error("Daily room cleanup error", error);
} }
