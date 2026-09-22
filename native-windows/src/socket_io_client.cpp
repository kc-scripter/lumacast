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

constexpr wchar_t kHost[] = L"lumacast-live-kc.onrender.com";
constexpr wchar_t kPath[] = L"/socket.io/?EIO=4&transport=websocket";

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
            if (escaped) {
                escaped = false;
            } else if (ch == '\\') {
                escaped = true;
            } else if (ch == '"') {
                inString = false;
            }
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
    event.error = FindString(json, "error");
    event.room = ParseRoom(json);
    return event;
}

std::wstring ErrorMessage(std::wstring_view prefix, DWORD error) {
    std::wstringstream stream;
    stream << prefix << L" (" << error << L")";
    return stream.str();
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

    HINTERNET socket = nullptr;
    {
        std::scoped_lock lock(handleMutex_);
        socket = webSocket_;
    }

    if (socket) {
        const char closePacket[] = "41";
        {
            std::scoped_lock sendLock(sendMutex_);
            WinHttpWebSocketSend(
                socket,
                WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
                const_cast<char*>(closePacket),
                static_cast<DWORD>(sizeof(closePacket) - 1));

            const char engineClose[] = "1";
            WinHttpWebSocketSend(
                socket,
                WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
                const_cast<char*>(engineClose),
                static_cast<DWORD>(sizeof(engineClose) - 1));

            WinHttpWebSocketShutdown(
                socket,
                WINHTTP_WEB_SOCKET_SUCCESS_CLOSE_STATUS,
                nullptr,
                0);
        }
    }

    if (thread_.joinable()) thread_.join();
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
    if (!ConnectWebSocket()) {
        connected_.store(false);
        running_.store(false);
        Cleanup();
        return;
    }

    ReceiveLoop();
    const bool wasConnected = connected_.exchange(false);
    running_.store(false);
    Cleanup();

    if (wasConnected && !stop_.load()) {
        SocketEvent event;
        event.type = SocketEventType::Disconnected;
        Notify(std::move(event));
    }
}

bool SocketIoClient::ConnectWebSocket() {
    session_ = WinHttpOpen(
        L"LuniraScreenNative/0.3",
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);

    if (!session_) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"WinHTTP não iniciou", GetLastError());
        Notify(std::move(event));
        return false;
    }

    WinHttpSetTimeouts(session_, 10000, 30000, 30000, 0);

    connection_ = WinHttpConnect(
        session_,
        kHost,
        INTERNET_DEFAULT_HTTPS_PORT,
        0);

    if (!connection_) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Não foi possível conectar ao servidor", GetLastError());
        Notify(std::move(event));
        return false;
    }

    HINTERNET request = WinHttpOpenRequest(
        connection_,
        L"GET",
        kPath,
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        WINHTTP_FLAG_SECURE);

    if (!request) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Falha ao preparar WebSocket", GetLastError());
        Notify(std::move(event));
        return false;
    }

    if (!WinHttpSetOption(
            request,
            WINHTTP_OPTION_UPGRADE_TO_WEB_SOCKET,
            nullptr,
            0)) {
        const DWORD error = GetLastError();
        WinHttpCloseHandle(request);
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"WebSocket não disponível", error);
        Notify(std::move(event));
        return false;
    }

    const BOOL sent = WinHttpSendRequest(
        request,
        WINHTTP_NO_ADDITIONAL_HEADERS,
        0,
        WINHTTP_NO_REQUEST_DATA,
        0,
        0,
        0);

    if (!sent || !WinHttpReceiveResponse(request, nullptr)) {
        const DWORD error = GetLastError();
        WinHttpCloseHandle(request);
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Servidor indisponível", error);
        Notify(std::move(event));
        return false;
    }

    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    if (!WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX,
            &status,
            &statusSize,
            WINHTTP_NO_HEADER_INDEX) ||
        status != 101) {
        WinHttpCloseHandle(request);
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = L"O servidor recusou o WebSocket.";
        Notify(std::move(event));
        return false;
    }

    HINTERNET socket = WinHttpWebSocketCompleteUpgrade(request, 0);
    WinHttpCloseHandle(request);

    if (!socket) {
        SocketEvent event;
        event.type = SocketEventType::Error;
        event.error = ErrorMessage(L"Falha no upgrade WebSocket", GetLastError());
        Notify(std::move(event));
        return false;
    }

    {
        std::scoped_lock lock(handleMutex_);
        webSocket_ = socket;
    }

    return true;
}

void SocketIoClient::ReceiveLoop() {
    while (!stop_.load()) {
        std::string message;
        if (!ReceiveMessage(message)) break;
        if (message.empty()) continue;
        HandlePacket(message);
    }
}

bool SocketIoClient::ReceiveMessage(std::string& message) {
    HINTERNET socket = nullptr;
    {
        std::scoped_lock lock(handleMutex_);
        socket = webSocket_;
    }
    if (!socket) return false;

    std::array<char, 8192> buffer{};
    std::string accumulated;

    while (!stop_.load()) {
        DWORD bytesRead = 0;
        WINHTTP_WEB_SOCKET_BUFFER_TYPE type = WINHTTP_WEB_SOCKET_BINARY_MESSAGE_BUFFER_TYPE;
        const DWORD result = WinHttpWebSocketReceive(
            socket,
            buffer.data(),
            static_cast<DWORD>(buffer.size()),
            &bytesRead,
            &type);

        if (result != NO_ERROR) return false;
        if (type == WINHTTP_WEB_SOCKET_CLOSE_BUFFER_TYPE) return false;

        if (type != WINHTTP_WEB_SOCKET_UTF8_FRAGMENT_BUFFER_TYPE &&
            type != WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE) {
            continue;
        }

        if (bytesRead > 0) accumulated.append(buffer.data(), bytesRead);
        if (accumulated.size() > 64 * 1024) return false;

        if (type == WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE) {
            message = std::move(accumulated);
            return true;
        }
    }

    return false;
}

bool SocketIoClient::SendText(std::string_view text) {
    if (stop_.load()) return false;

    HINTERNET socket = nullptr;
    {
        std::scoped_lock lock(handleMutex_);
        socket = webSocket_;
    }
    if (!socket) return false;

    std::scoped_lock lock(sendMutex_);
    const DWORD result = WinHttpWebSocketSend(
        socket,
        WINHTTP_WEB_SOCKET_UTF8_MESSAGE_BUFFER_TYPE,
        const_cast<char*>(text.data()),
        static_cast<DWORD>(text.size()));

    return result == NO_ERROR;
}

void SocketIoClient::HandlePacket(std::string_view packet) {
    if (packet.empty()) return;

    if (packet[0] == '0') {
        SendText("40");
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
        event.error = L"O servidor recusou a conexão Socket.IO.";
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

    if (webSocket_) {
        WinHttpCloseHandle(webSocket_);
        webSocket_ = nullptr;
    }
    if (connection_) {
        WinHttpCloseHandle(connection_);
        connection_ = nullptr;
    }
    if (session_) {
        WinHttpCloseHandle(session_);
        session_ = nullptr;
    }
}

} // namespace lunira
