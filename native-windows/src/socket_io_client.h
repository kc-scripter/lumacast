#pragma once

#include <windows.h>
#include <winhttp.h>

#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace lunira {

struct Participant {
    std::wstring id;
    std::wstring displayName;
};

struct RoomSnapshot {
    bool live = false;
    bool livekitActive = false;
    int count = 0;
    std::wstring activeScreenSharerId;
    std::wstring activeScreenSharerName;
    std::wstring screenProvider = L"agora";
    std::wstring ownerName;
    std::vector<Participant> participants;
};

enum class SocketEventType {
    Connected,
    Disconnected,
    Ack,
    RoomState,
    BroadcastStarted,
    BroadcastEnded,
    RoomExpired,
    Error
};

struct SocketEvent {
    SocketEventType type = SocketEventType::Error;
    int ackId = -1;
    bool ok = false;
    std::wstring roomId;
    std::wstring displayName;
    std::wstring ownerToken;
    std::wstring participantToken;
    std::wstring agoraAppId;
    std::wstring agoraChannel;
    std::wstring agoraToken;
    int agoraUid = 0;
    std::wstring livekitUrl;
    std::wstring livekitToken;
    std::wstring socketId;
    std::wstring error;
    RoomSnapshot room;
};

class SocketIoClient {
public:
    using Callback = std::function<void(SocketEvent)>;

    SocketIoClient();
    ~SocketIoClient();

    SocketIoClient(const SocketIoClient&) = delete;
    SocketIoClient& operator=(const SocketIoClient&) = delete;

    bool Start(Callback callback);
    void Stop();

    bool IsConnected() const noexcept;
    bool IsRunning() const noexcept;

    int EmitWithAck(std::string_view eventName, std::string_view jsonObject);
    bool Emit(std::string_view eventName, std::string_view jsonObject = "{}");

    static std::string JsonQuote(std::wstring_view value);

private:
    void Run();
    bool ConnectPolling();
    void PollLoop();

    bool HttpGet(std::wstring_view path, std::string& body, DWORD& statusCode);
    bool HttpPost(std::wstring_view path, std::string_view body, DWORD& statusCode);
    std::wstring PollingPath(bool includeSession);

    bool SendText(std::string_view text);
    void HandlePayload(std::string_view payload);
    void HandlePacket(std::string_view packet);
    void HandleSocketEventPacket(std::string_view packet);
    void HandleAckPacket(std::string_view packet);
    void Notify(SocketEvent event);
    void Cleanup();

    Callback callback_;
    std::thread thread_;
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
    std::atomic<bool> connected_{false};
    std::atomic<int> nextAckId_{1};
    std::atomic<unsigned long long> requestCounter_{1};

    std::mutex sendMutex_;
    std::mutex handleMutex_;

    std::string sessionId_;
    HINTERNET session_ = nullptr;
    HINTERNET connection_ = nullptr;
    HINTERNET activePollRequest_ = nullptr;
};

} // namespace lunira
