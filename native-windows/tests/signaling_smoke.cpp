#include "../src/socket_io_client.h"

#include <windows.h>

#include <chrono>
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <optional>
#include <string>

namespace {

using namespace std::chrono_literals;

struct Probe {
    std::mutex mutex;
    std::condition_variable cv;
    bool connected = false;
    bool failed = false;
    std::wstring error;
    std::optional<lunira::SocketEvent> ack;
    lunira::RoomSnapshot lastState;

    void OnEvent(lunira::SocketEvent event) {
        std::scoped_lock lock(mutex);
        switch (event.type) {
        case lunira::SocketEventType::Connected:
            connected = true;
            break;
        case lunira::SocketEventType::Ack:
            ack = std::move(event);
            break;
        case lunira::SocketEventType::RoomState:
            lastState = std::move(event.room);
            break;
        case lunira::SocketEventType::Error:
            failed = true;
            error = std::move(event.error);
            break;
        case lunira::SocketEventType::Disconnected:
            if (!connected) {
                failed = true;
                error = L"desconectou antes do handshake";
            }
            break;
        default:
            break;
        }
        cv.notify_all();
    }

    bool WaitConnected(std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, timeout, [&] { return connected || failed; }) && connected;
    }

    std::optional<lunira::SocketEvent> WaitAck(int ackId, std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        const bool ready = cv.wait_for(lock, timeout, [&] {
            return failed || (ack.has_value() && ack->ackId == ackId);
        });
        if (!ready || failed || !ack || ack->ackId != ackId) return std::nullopt;
        auto result = std::move(ack);
        ack.reset();
        return result;
    }

    bool WaitParticipants(size_t minimum, std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, timeout, [&] {
            return failed || lastState.participants.size() >= minimum;
        }) && !failed && lastState.participants.size() >= minimum;
    }
};

void PrintWide(std::wstring_view value) {
    if (value.empty()) return;
    const int count = WideCharToMultiByte(
        CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
        nullptr, 0, nullptr, nullptr);
    std::string utf8(static_cast<size_t>(std::max(0, count)), '\0');
    if (count > 0) {
        WideCharToMultiByte(
            CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
            utf8.data(), count, nullptr, nullptr);
    }
    std::cerr << utf8;
}

} // namespace

int main() {
    SetConsoleOutputCP(CP_UTF8);

    lunira::SocketIoClient owner;
    Probe ownerProbe;

    if (!owner.Start([&](lunira::SocketEvent event) {
            ownerProbe.OnEvent(std::move(event));
        })) {
        std::cerr << "owner client failed to start\n";
        return 1;
    }

    if (!ownerProbe.WaitConnected(40s)) {
        std::cerr << "owner websocket handshake failed: ";
        PrintWide(ownerProbe.error);
        std::cerr << "\n";
        owner.Stop();
        return 2;
    }

    const int createAckId = owner.EmitWithAck(
        "create-room",
        "{\"displayName\":\"NativeSmoke\"}");

    if (createAckId < 0) {
        std::cerr << "create-room send failed\n";
        owner.Stop();
        return 3;
    }

    auto createAck = ownerProbe.WaitAck(createAckId, 15s);
    if (!createAck || !createAck->ok || createAck->roomId.size() != 8) {
        std::cerr << "create-room ack failed: ";
        if (createAck) PrintWide(createAck->error);
        std::cerr << "\n";
        owner.Stop();
        return 4;
    }

    const std::wstring roomId = createAck->roomId;
    std::cout << "created room: ";
    PrintWide(roomId);
    std::cout << "\n";

    lunira::SocketIoClient joiner;
    Probe joinProbe;

    if (!joiner.Start([&](lunira::SocketEvent event) {
            joinProbe.OnEvent(std::move(event));
        })) {
        std::cerr << "join client failed to start\n";
        owner.Stop();
        return 5;
    }

    if (!joinProbe.WaitConnected(20s)) {
        std::cerr << "join websocket handshake failed: ";
        PrintWide(joinProbe.error);
        std::cerr << "\n";
        joiner.Stop();
        owner.Stop();
        return 6;
    }

    std::string joinPayload = "{\"displayName\":\"NativeJoin\",\"roomId\":";
    joinPayload += lunira::SocketIoClient::JsonQuote(roomId);
    joinPayload += "}";

    const int joinAckId = joiner.EmitWithAck("join-room", joinPayload);
    auto joinAck = joinProbe.WaitAck(joinAckId, 15s);

    if (!joinAck || !joinAck->ok) {
        std::cerr << "join-room ack failed: ";
        if (joinAck) PrintWide(joinAck->error);
        std::cerr << "\n";
        joiner.Stop();
        owner.Stop();
        return 7;
    }

    const bool ownerSawBoth = ownerProbe.WaitParticipants(2, 10s);
    std::cout << "join ack ok; owner room-state update: "
              << (ownerSawBoth ? "ok" : "not observed") << "\n";

    joiner.Stop();
    owner.Stop();

    return ownerSawBoth ? 0 : 8;
}
