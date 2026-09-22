#include "socket_io_client.h"

#include <algorithm>
#include <array>
#include <charconv>
#include <chrono>
#include <cstdint>
#include <limits>
#include <sstream>
#include <string_view>

#pragma comment(lib, "winhttp.lib")

namespace lunira {
namespace {

constexpr wchar_t kHost[] = L"lunirascreen.mooo.com";
constexpr wchar_t kBasePath[] = L"/socket.io/?EIO=4&transport=polling";
constexpr size_t kMaxPayloadBytes = 256 * 1024;

std::wstring Utf8ToWide(std::string_view value) {
    if (value.empty()) return {};
    const int count = MultiByteToWideChar(
        CP_UTF8,
        MB_ERR_INVALID_CHARS,
        value.data(),
        static_cast<int>(value.size()),
        nullptr,
        0);
    if (count <= 0) return {};

    std::wstring result(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(
        CP_UTF8,
        MB_ERR_INVALID_CHARS,
        value.data(),
        static_cast<int>(value.size()),
        result.data(),
        count);
    return result;
}

std::string WideToUtf8(std::wstring_view value) {
    if (value.empty()) return {};
    const int count = WideCharToMultiByte(
        CP_UTF8,
        WC_ERR_INVALID_CHARS,
        value.data(),
        static_cast<int>(value.size()),
        nullptr,
        0,
        nullptr,
        nullptr);
    if (count <= 0) return {};

    std::string result(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(
        CP_UTF8,
        WC_ERR_INVALID_CHARS,
        value.data(),
        static_cast<int>(value.size()),
        result.data(),
        count,
        nullptr,
        nullptr);
    return result;
}

std::string JsonEscapeUtf8(std::wstring_view input) {
    const std::string utf8 = WideToUtf8(input);
    std::string out;
    out.reserve(utf8.size() + 8);

    for (unsigned char ch : utf8) {
        switch (ch) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        case '\n': out += "\\n"; break;
        case '\r': out += "\\r"; break;
        case '\t': out += "\\t"; break;
        default:
            if (ch < 0x20) {
                static constexpr char hex[] = "0123456789abcdef";
                out += "\\u00";
                out += hex[(ch >> 4) & 0xf];
                out += hex[ch & 0xf];
            } else {
                out.push_back(static_cast<char>(ch));
            }
            break;
        }
    }
    return out;
}

bool ParseJsonStringAt(std::string_view json, size_t quote, std::string& output, size_t* end = nullptr) {
    if (quote >= json.size() || json[quote] != '"') return false;

    std::string result;
    result.reserve(32);

    for (size_t i = quote + 1; i < json.size(); ++i) {
        const char ch = json[i];
        if (ch == '"') {
            output = std::move(result);
            if (end) *end = i + 1;
            return true;
        }

        if (ch != '\\') {
            result.push_back(ch);
            continue;
        }

        if (++i >= json.size()) return false;
        switch (json[i]) {
        case '"': result.push_back('"'); break;
        case '\\': result.push_back('\\'); break;
        case '/': result.push_back('/'); break;
        case 'b': result.push_back('\b'); break;
        case 'f': result.push_back('\f'); break;
        case 'n': result.push_back('\n'); break;
        case 'r': result.push_back('\r'); break;
        case 't': result.push_back('\t'); break;
        case 'u': {
            if (i + 4 >= json.size()) return false;
            unsigned value = 0;
            for (int n = 0; n < 4; ++n) {
                const char h = json[++i];
                value <<= 4;
                if (h >= '0' && h <= '9') value |= static_cast<unsigned>(h - '0');
                else if (h >= 'a' && h <= 'f') value |= static_cast<unsigned>(h - 'a' + 10);
                else if (h >= 'A' && h <= 'F') value |= static_cast<unsigned>(h - 'A' + 10);
                else return false;
            }

            wchar_t wide[2] = { static_cast<wchar_t>(value), L'\0' };
            result += WideToUtf8(std::wstring_view(wide, 1));
            break;
        }
        default:
            return false;
        }
    }
    return false;
}

size_t FindValue(std::string_view json, std::string_view key) {
    std::string token;
    token.reserve(key.size() + 2);
    token.push_back('"');
    token.append(key);
    token.push_back('"');

    size_t position = json.find(token);
    if (position == std::string_view::npos) return position;
    position = json.find(':', position + token.size());
    if (position == std::string_view::npos) return position;
    ++position;
    while (position < json.size() &&
           (json[position] == ' ' || json[position] == '\t' ||
            json[position] == '\r' || json[position] == '\n')) {
        ++position;
    }
    return position;
}

std::wstring FindString(std::string_view json, std::string_view key) {
    const size_t value = FindValue(json, key);
    if (value == std::string_view::npos || value >= json.size() || json[value] != '"') return {};
    std::string parsed;
    if (!ParseJsonStringAt(json, value, parsed)) return {};
    return Utf8ToWide(parsed);
}

bool FindBool(std::string_view json, std::string_view key, bool fallback = false) {
    const size_t value = FindValue(json, key);
    if (value == std::string_view::npos) return fallback;
    if (json.substr(value, 4) == "true") return true;
    if (json.substr(value, 5) == "false") return false;
    return fallback;
}

int FindInt(std::string_view json, std::string_view key, int fallback = 0) {
    const size_t value = FindValue(json, key);
    if (value == std::string_view::npos) return fallback;

    size_t end = value;
    if (end < json.size() && (json[end] == '-' || json[end] == '+')) ++end;
    while (end < json.size() && json[end] >= '0' && json[end] <= '9') ++end;
    if (end == value) return fallback;

    int parsed = fallback;
    const auto result = std::from_chars(json.data() + value, json.data() + end, parsed);
    return result.ec == std::errc{} ? parsed : fallback;
}

std::vector<Participant> FindParticipants(std::string_view json) {
    std::vector<Participant> participants;
    const size_t value = FindValue(json, "participants");
    if (value == std::string_view::npos || value >= json.size() || json[value] != '[') return participants;

    int depth = 0;
    bool inString = false;
    bool escaped = false;
    size_t objectStart = std::string_view::npos;

    for (size_t i = value + 1; i < json.size(); ++i) {
        const char ch = json[i];

        if (inString) {
            if (escaped) escaped = false;
            else if (ch == '\\') escaped = true;
            else if (ch == '"') inString = false;
            continue;
        }

        if (ch == '"') {
            inString = true;
            continue;
        }

        if (ch == '{') {
            if (depth == 0) objectStart = i;
            ++depth;
            continue;
        }

        if (ch == '}') {
            if (depth > 0) --depth;
            if (depth == 0 && objectStart != std::string_view::npos) {
                const auto object = json.substr(objectStart, i - objectStart + 1);
                Participant participant;
                participant.id = FindString(object, "id");
                participant.displayName = FindString(object, "displayName");
                if (!participant.id.empty() && !participant.displayName.empty()) {
                    participants.push_back(std::move(participant));
                }
                objectStart = std::string_view::npos;
            }
            continue;
        }

        if (ch == ']' && depth == 0) break;
    }

    return participants;
}

RoomSnapshot ParseRoom(std::string_view json) {
    RoomSnapshot room;
    room.live = FindBool(json, "live");
    room.livekitActive = FindBool(json, "livekitActive");
    room.count = FindInt(json, "count");
    room.activeScreenSharerId = FindString(json, "activeScreenSharerId");
    room.activeScreenSharerName = FindString(json, "activeScreenSharerName");
    room.screenProvider = FindString(json, "screenProvider");
    if (room.screenProvider.empty()) room.screenProvider = L"agora";
    room.ownerName = FindString(json, "ownerName");
    room.participants = FindParticipants(json);
    if (room.count == 0 && !room.participants.empty()) {
        room.count = std::max(0, static_cast<int>(room.participants.size()) - 1);
    }
    return room;
}

SocketEvent ParseAck(int ackId, std::string_view json) {
    SocketEvent event;
    event.type = SocketEventType::Ack;
    event.ackId = ackId;
    event.ok = FindBool(json, "ok");
    event.roomId = FindString(json, "roomId");
    event.displayName = FindString(json, "displayName");
    event.ownerToken = FindString(json, "ownerToken");
    event.participantToken = FindString(json, "participantToken");
    event.agoraAppId = FindString(json, "agoraAppId");
    event.agoraChannel = FindString(json, "agoraChannel");
    event.agoraToken = FindString(json, "agoraToken");
    event.agoraUid = FindInt(json, "agoraUid");
    event.livekitUrl = FindString(json, "livekitUrl");
    event.livekitToken = FindString(json, "livekitToken");
    event.error = FindString(json, "error");
    event.room = ParseRoom(json);
    return event;
}

std::wstring ErrorMessage(std::wstring_view prefix, DWORD error) {
    std::wstringstream stream;
    stream << prefix << L" (" << error << L")";
    return stream.str();
}

bool ReadResponseBody(HINTERNET request, std::string& body) {
    body.clear();

    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request, &available)) return false;
        if (available == 0) break;

        if (body.size() + available > kMaxPayloadBytes) return false;

        const size_t oldSize = body.size();
        body.resize(oldSize + available);

        DWORD read = 0;
        if (!WinHttpReadData(
                request,
                body.data() + oldSize,
                available,
                &read)) {
            return false;
        }

        body.resize(oldSize + read);
        if (read == 0) break;
    }

    return true;
}

bool QueryStatus(HINTERNET request, DWORD& status) {
    DWORD size = sizeof(status);
    status = 0;
    return WinHttpQueryHeaders(
               request,
               WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
               WINHTTP_HEADER_NAME_BY_INDEX,
               &status,
               &size,
               WINHTTP_NO_HEADER_INDEX) == TRUE;
}

} // namespace

SocketIoClient::SocketIoClient() = default;

SocketIoClient::~SocketIoClient() {
    Stop();
}

bool SocketIoClient::Start(Callback callback) {
    if (running_.exchange(true)) return true;

    callback_ = std::move(callback);
    stop_.store(false);
    connected_.store(false);
    sessionId_.clear();

    try {
        thread_ = std::thread([this] { Run(); });
        return true;
    } catch (...) {
        running_.store(false);
        return false;
    }
}

void SocketIoClient::Stop() {
    stop_.store(true);

    HINTERNET poll = nullptr;
    {
        std::scoped_lock lock(handleMutex_);
        poll = activePollRequest_;
        activePollRequest_ = nullptr;
    }
    if (poll) WinHttpCloseHandle(poll);

    if (thread_.joinable()) thread_.join();

    if (!sessionId_.empty()) {
        DWORD status = 0;
        SendText("41");
        HttpPost(PollingPath(true), "1", status);
    }

    Cleanup();
    connected_.store(false);
    running_.store(false);
}

bool SocketIoClient::IsConnected() const noexcept {
    return connected_.load();
}

bool SocketIoClient::IsRunning() const noexcept {
    return running_.load();
}

int SocketIoClient::EmitWithAck(std::string_view eventName, std::string_view jsonObject) {
    if (!connected_.load()) return -1;

    const int ackId = nextAckId_.fetch_add(1);
    std::string packet = "42";
    packet += std::to_string(ackId);
    packet += "[\"";
    packet.append(eventName);
    packet += "\",";
    packet.append(jsonObject);
    packet += "]";

    return SendText(packet) ? ackId : -1;
}

bool SocketIoClient::Emit(std::string_view eventName, std::string_view jsonObject) {
    if (!connected_.load()) return false;

    std::string packet = "42[\"";
    packet.append(eventName);
    packet += "\",";
    packet.append(jsonObject);
    packet += "]";
    return SendText(packet);
}

std::string SocketIoClient::JsonQuote(std::wstring_view value) {
    return "\"" + JsonEscapeUtf8(value) + "\"";
}

void SocketIoClient::Run() {
    if (!ConnectPolling()) {
        connected_.store(false);
        running_.store(false);
        Cleanup();
        return;
    }

    PollLoop();

    const bool wasConnected = connected_.exchange(false);
    running_.store(false);
    Cleanup();

    if (wasConnected && !stop_.load()) {
        SocketEvent event;
        event.type = SocketEventType::Disconnected;
        Notify(std::move(event));
    }
}

bool SocketIoClient::ConnectPolling() {
    session_ = WinHttpOpen(
        L"LuniraScreenNative/0.6",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);

    if (!session_) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Não foi possível iniciar a conexão", GetLastError());
        Notify(std::move(event));
        return false;
    }

    WinHttpSetTimeouts(session_, 10000, 15000, 10000, 65000);

    connection_ = WinHttpConnect(
        session_,
        kHost,
        INTERNET_DEFAULT_HTTPS_PORT,
        0);

    if (!connection_) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Não foi possível alcançar o servidor", GetLastError());
        Notify(std::move(event));
        return false;
    }

    std::string handshake;
    DWORD status = 0;
    const bool handshakeOk = HttpGet(PollingPath(false), handshake, status);
    if (!handshakeOk || status != 200 || handshake.empty() || handshake[0] != '0') {
        SocketEvent event;
        event.type = SocketEventType::Error;

        if (!handshakeOk) {
            event.error = ErrorMessage(L"Falha HTTP no signaling", GetLastError());
        } else if (status != 200) {
            event.error = L"Signaling respondeu HTTP " + std::to_wstring(status) + L".";
        } else {
            const std::string prefix = handshake.substr(0, std::min<size_t>(handshake.size(), 96));
            event.error = L"Resposta inválida do signaling: " + Utf8ToWide(prefix);
        }

        Notify(std::move(event));
        return false;
    }

    sessionId_ = WideToUtf8(FindString(handshake.substr(1), "sid"));
    if (sessionId_.empty()) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = L"O servidor respondeu sem uma sessão válida.";
        Notify(std::move(event));
        return false;
    }

    if (!HttpPost(PollingPath(true), "40", status) || status != 200) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = L"Não foi possível abrir a sessão Socket.IO.";
        Notify(std::move(event));
        return false;
    }

    return true;
}

void SocketIoClient::PollLoop() {
    while (!stop_.load()) {
        std::string payload;
        DWORD status = 0;

        if (!HttpGet(PollingPath(true), payload, status)) {
            if (!stop_.load()) {
                SocketEvent event;
                event.type = SocketEventType::Error;
                event.error = L"A conexão com o servidor foi interrompida.";
                Notify(std::move(event));
            }
            break;
        }

        if (status != 200) {
            if (!stop_.load()) {
                SocketEvent event;
                event.type = SocketEventType::Error;
                event.error = L"O servidor encerrou a sessão.";
                Notify(std::move(event));
            }
            break;
        }

        if (!payload.empty()) HandlePayload(payload);
    }
}

bool SocketIoClient::HttpGet(std::wstring_view path, std::string& body, DWORD& statusCode) {
    if (!connection_ || stop_.load()) return false;

    std::wstring pathCopy(path);
    HINTERNET request = WinHttpOpenRequest(
        connection_,
        L"GET",
        pathCopy.c_str(),
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        WINHTTP_FLAG_SECURE);

    if (!request) return false;

    {
        std::scoped_lock lock(handleMutex_);
        if (stop_.load()) {
            WinHttpCloseHandle(request);
            return false;
        }
        activePollRequest_ = request;
    }

    const wchar_t* headers =
        L"Accept: */*\r\n"
        L"Cache-Control: no-cache\r\n"
        L"Pragma: no-cache\r\n";

    bool ok =
        WinHttpSendRequest(
            request,
            headers,
            static_cast<DWORD>(-1L),
            WINHTTP_NO_REQUEST_DATA,
            0,
            0,
            0) == TRUE &&
        WinHttpReceiveResponse(request, nullptr) == TRUE &&
        QueryStatus(request, statusCode) &&
        ReadResponseBody(request, body);

    bool closeHere = false;
    {
        std::scoped_lock lock(handleMutex_);
        if (activePollRequest_ == request) {
            activePollRequest_ = nullptr;
            closeHere = true;
        }
    }

    if (closeHere) WinHttpCloseHandle(request);
    return ok;
}

bool SocketIoClient::HttpPost(
    std::wstring_view path,
    std::string_view body,
    DWORD& statusCode) {
    if (!connection_ || stop_.load()) return false;

    std::wstring pathCopy(path);
    HINTERNET request = WinHttpOpenRequest(
        connection_,
        L"POST",
        pathCopy.c_str(),
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        WINHTTP_FLAG_SECURE);

    if (!request) return false;

    const wchar_t* headers =
        L"Content-Type: text/plain;charset=UTF-8\r\n"
        L"Accept: */*\r\n"
        L"Cache-Control: no-cache\r\n";

    const BOOL sent = WinHttpSendRequest(
        request,
        headers,
        static_cast<DWORD>(-1L),
        body.empty() ? WINHTTP_NO_REQUEST_DATA : const_cast<char*>(body.data()),
        static_cast<DWORD>(body.size()),
        static_cast<DWORD>(body.size()),
        0);

    std::string response;
    const bool ok =
        sent == TRUE &&
        WinHttpReceiveResponse(request, nullptr) == TRUE &&
        QueryStatus(request, statusCode) &&
        ReadResponseBody(request, response);

    WinHttpCloseHandle(request);

    if (!ok) return false;
    return statusCode == 200 && (response.empty() || response == "ok");
}

std::wstring SocketIoClient::PollingPath(bool includeSession) {
    std::wstring path = kBasePath;

    if (includeSession && !sessionId_.empty()) {
        path += L"&sid=";
        path += Utf8ToWide(sessionId_);
    }

    path += L"&t=";
    path += std::to_wstring(requestCounter_.fetch_add(1));
    return path;
}

bool SocketIoClient::SendText(std::string_view text) {
    if (stop_.load() || sessionId_.empty()) return false;

    std::scoped_lock lock(sendMutex_);
    DWORD status = 0;
    return HttpPost(PollingPath(true), text, status) && status == 200;
}

void SocketIoClient::HandlePayload(std::string_view payload) {
    size_t start = 0;

    while (start <= payload.size()) {
        const size_t separator = payload.find('\x1e', start);
        const size_t end = separator == std::string_view::npos
            ? payload.size()
            : separator;

        const std::string_view packet = payload.substr(start, end - start);
        if (!packet.empty()) HandlePacket(packet);

        if (separator == std::string_view::npos) break;
        start = separator + 1;
    }
}

void SocketIoClient::HandlePacket(std::string_view packet) {
    if (packet.empty()) return;

    if (packet[0] == '0') {
        return;
    }

    if (packet[0] == '2') {
        std::string pong = "3";
        pong.append(packet.substr(1));
        SendText(pong);
        return;
    }

    if (packet == "40" || packet.starts_with("40{")) {
        if (!connected_.exchange(true)) {
            SocketEvent event;
            event.type = SocketEventType::Connected;
            event.ok = true;
            if (packet.size() > 2) {
                event.socketId = FindString(packet.substr(2), "sid");
            }
            Notify(std::move(event));
        }
        return;
    }

    if (packet.starts_with("42")) {
        HandleSocketEventPacket(packet);
        return;
    }

    if (packet.starts_with("43")) {
        HandleAckPacket(packet);
        return;
    }

    if (packet.starts_with("44")) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = L"O servidor recusou a sessão Socket.IO.";
        Notify(std::move(event));
    }
}

void SocketIoClient::HandleSocketEventPacket(std::string_view packet) {
    const size_t array = packet.find('[');
    if (array == std::string_view::npos) return;

    size_t end = 0;
    std::string eventName;
    if (!ParseJsonStringAt(packet, array + 1, eventName, &end)) return;

    const size_t objectStart = packet.find('{', end);
    const size_t objectEnd = objectStart == std::string_view::npos
        ? std::string_view::npos
        : packet.rfind('}');

    const std::string_view payload =
        objectStart != std::string_view::npos &&
        objectEnd != std::string_view::npos &&
        objectEnd >= objectStart
            ? packet.substr(objectStart, objectEnd - objectStart + 1)
            : std::string_view{};

    SocketEvent event;
    if (eventName == "room-state") {
        event.type = SocketEventType::RoomState;
        event.ok = true;
        event.room = ParseRoom(payload);
    } else if (eventName == "broadcast-started") {
        event.type = SocketEventType::BroadcastStarted;
        event.ok = true;
    } else if (eventName == "broadcast-ended") {
        event.type = SocketEventType::BroadcastEnded;
        event.ok = true;
    } else if (eventName == "room-expired") {
        event.type = SocketEventType::RoomExpired;
    } else {
        return;
    }

    Notify(std::move(event));
}

void SocketIoClient::HandleAckPacket(std::string_view packet) {
    size_t position = 2;
    const size_t start = position;
    while (position < packet.size() && packet[position] >= '0' && packet[position] <= '9') ++position;
    if (position == start) return;

    int ackId = -1;
    const auto result = std::from_chars(packet.data() + start, packet.data() + position, ackId);
    if (result.ec != std::errc{}) return;

    const size_t objectStart = packet.find('{', position);
    const size_t objectEnd = objectStart == std::string_view::npos
        ? std::string_view::npos
        : packet.rfind('}');
    if (objectStart == std::string_view::npos ||
        objectEnd == std::string_view::npos ||
        objectEnd < objectStart) {
        return;
    }

    Notify(ParseAck(
        ackId,
        packet.substr(objectStart, objectEnd - objectStart + 1)));
}

void SocketIoClient::Notify(SocketEvent event) {
    if (callback_) callback_(std::move(event));
}

void SocketIoClient::Cleanup() {
    std::scoped_lock lock(handleMutex_);

    if (activePollRequest_) {
        WinHttpCloseHandle(activePollRequest_);
        activePollRequest_ = nullptr;
    }
    if (connection_) {
        WinHttpCloseHandle(connection_);
        connection_ = nullptr;
    }
    if (session_) {
        WinHttpCloseHandle(session_);
        session_ = nullptr;
    }

    sessionId_.clear();
}

} // namespace lunira
