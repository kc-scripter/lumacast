#include "../src/socket_io_client.h"

#include <livekit/livekit.h>

#include <windows.h>

#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <optional>
#include <string>

namespace {

using namespace std::chrono_literals;

std::string WideToUtf8(std::wstring_view value) {
    if (value.empty()) return {};
    const int count = WideCharToMultiByte(
        CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
        nullptr, 0, nullptr, nullptr);
    if (count <= 0) return {};
    std::string result(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(
        CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
        result.data(), count, nullptr, nullptr);
    return result;
}

struct Probe {
    std::mutex mutex;
    std::condition_variable cv;
    bool connected = false;
    bool failed = false;
    std::wstring error;
    std::optional<lunira::SocketEvent> ack;

    void OnEvent(lunira::SocketEvent event) {
        std::scoped_lock lock(mutex);
        if (event.type == lunira::SocketEventType::Connected) {
            connected = true;
        } else if (event.type == lunira::SocketEventType::Ack) {
            ack = std::move(event);
        } else if (event.type == lunira::SocketEventType::Error) {
            failed = true;
            error = std::move(event.error);
        }
        cv.notify_all();
    }

    bool WaitConnected(std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, timeout, [&] { return connected || failed; }) && connected;
    }

    std::optional<lunira::SocketEvent> WaitAck(int id, std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        const bool ready = cv.wait_for(lock, timeout, [&] {
            return failed || (ack && ack->ackId == id);
        });
        if (!ready || failed || !ack || ack->ackId != id) return std::nullopt;
        auto result = std::move(ack);
        ack.reset();
        return result;
    }
};

} // namespace

int main() {
    lunira::SocketIoClient signaling;
    Probe probe;

    if (!signaling.Start([&](lunira::SocketEvent event) {
            probe.OnEvent(std::move(event));
        })) {
        std::cerr << "signaling start failed\n";
        return 1;
    }

    if (!probe.WaitConnected(40s)) {
        std::cerr << "signaling connect failed\n";
        signaling.Stop();
        return 2;
    }

    const int createId = signaling.EmitWithAck(
        "create-room",
        "{\"displayName\":\"NativeMediaSmoke\"}");
    auto create = probe.WaitAck(createId, 15s);

    if (!create || !create->ok || create->roomId.empty()) {
        std::cerr << "create-room failed\n";
        signaling.Stop();
        return 3;
    }

    std::string tokenPayload = "{\"roomId\":";
    tokenPayload += lunira::SocketIoClient::JsonQuote(create->roomId);
    tokenPayload += "}";

    const int tokenId = signaling.EmitWithAck("get-livekit-token", tokenPayload);
    auto token = probe.WaitAck(tokenId, 15s);

    if (!token || !token->ok || token->livekitUrl.empty() || token->livekitToken.empty()) {
        std::cerr << "get-livekit-token failed\n";
        signaling.Stop();
        return 4;
    }

    livekit::initialize(livekit::LogLevel::Warning);

    auto room = std::make_unique<livekit::Room>();
    livekit::RoomOptions options;
    options.auto_subscribe = true;

    const bool mediaConnected = room->connect(
        WideToUtf8(token->livekitUrl),
        WideToUtf8(token->livekitToken),
        options);

    if (!mediaConnected) {
        std::cerr << "LiveKit connect failed\n";
        room.reset();
        livekit::shutdown();
        signaling.Stop();
        return 5;
    }

    std::cout << "livekit room connect: ok\n";

    room->disconnect();
    room.reset();
    livekit::shutdown();
    signaling.Stop();
    return 0;
}
