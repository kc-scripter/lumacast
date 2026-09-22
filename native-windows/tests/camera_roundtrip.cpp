#include "../src/livekit_media_client.h"
#include "../src/socket_io_client.h"

#include <livekit/livekit.h>

#include <windows.h>

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <string>
#include <thread>

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

struct SignalProbe {
    std::mutex mutex;
    std::condition_variable cv;
    bool connected = false;
    bool failed = false;
    std::wstring error;
    std::optional<lunira::SocketEvent> ack;

    void OnEvent(lunira::SocketEvent event) {
        std::scoped_lock lock(mutex);
        if (event.type == lunira::SocketEventType::Connected) connected = true;
        else if (event.type == lunira::SocketEventType::Ack) ack = std::move(event);
        else if (event.type == lunira::SocketEventType::Error) {
            failed = true;
            error = std::move(event.error);
        }
        cv.notify_all();
    }

    void Reset() {
        std::scoped_lock lock(mutex);
        connected = false;
        failed = false;
        error.clear();
        ack.reset();
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

struct MediaProbe {
    std::mutex mutex;
    std::condition_variable cv;
    bool connected = false;
    bool failed = false;
    bool gotFrame = false;
    std::wstring identity;
    int width = 0;
    int height = 0;
    size_t bytes = 0;

    void OnEvent(lunira::MediaEvent event) {
        std::scoped_lock lock(mutex);
        if (event.type == lunira::MediaEventType::Connected) {
            connected = true;
        } else if (event.type == lunira::MediaEventType::CameraFrame) {
            gotFrame = true;
            identity = std::move(event.identity);
            width = event.width;
            height = event.height;
            bytes = event.bgra.size();
        } else if (event.type == lunira::MediaEventType::Error) {
            failed = true;
        }
        cv.notify_all();
    }

    bool WaitConnected(std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, timeout, [&] { return connected || failed; }) && connected;
    }

    bool WaitFrame(std::chrono::seconds timeout) {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, timeout, [&] { return gotFrame || failed; }) && gotFrame;
    }
};

bool ConnectSignal(
    lunira::SocketIoClient& client,
    SignalProbe& probe,
    std::string_view label) {
    for (int attempt = 1; attempt <= 3; ++attempt) {
        probe.Reset();

        const bool started = client.Start(
            [&probe](lunira::SocketEvent event) {
                probe.OnEvent(std::move(event));
            });

        if (started && probe.WaitConnected(40s)) {
            std::cout << label << " signaling: ok (attempt " << attempt << ")\n";
            return true;
        }

        std::wstring error;
        {
            std::scoped_lock lock(probe.mutex);
            error = probe.error;
        }

        client.Stop();
        std::cerr << label << " signaling attempt " << attempt << " failed";
        if (!error.empty()) std::cerr << ": " << WideToUtf8(error);
        std::cerr << "\n";

        if (attempt < 3) std::this_thread::sleep_for(5s);
    }

    return false;
}

std::optional<lunira::SocketEvent> RequestLiveKitToken(
    lunira::SocketIoClient& client,
    SignalProbe& probe,
    std::wstring_view roomId) {
    std::string payload = "{\"roomId\":";
    payload += lunira::SocketIoClient::JsonQuote(roomId);
    payload += "}";

    const int id = client.EmitWithAck("get-livekit-token", payload);
    if (id < 0) return std::nullopt;
    return probe.WaitAck(id, 15s);
}

} // namespace

int main() {
    lunira::SocketIoClient ownerSignal;
    lunira::SocketIoClient viewerSignal;
    SignalProbe ownerProbe;
    SignalProbe viewerProbe;

    if (!ConnectSignal(ownerSignal, ownerProbe, "owner")) {
        return 1;
    }

    auto createRoom = [&]() -> std::optional<lunira::SocketEvent> {
        const int createId = ownerSignal.EmitWithAck(
            "create-room",
            "{\"displayName\":\"NativePublisher\"}");
        if (createId < 0) return std::nullopt;
        return ownerProbe.WaitAck(createId, 15s);
    };

    auto create = createRoom();
    if (create && !create->ok) {
        std::cerr << "create-room first rejection: "
                  << WideToUtf8(create->error) << "\n";
        std::cout << "waiting 65s before one controlled retry...\n";
        std::this_thread::sleep_for(65s);
        create = createRoom();
    }

    if (!create || !create->ok || create->roomId.size() != 8) {
        std::cerr << "create-room failed";
        if (create && !create->error.empty()) {
            std::cerr << ": " << WideToUtf8(create->error);
        }
        std::cerr << "\n";
        ownerSignal.Stop();
        return 2;
    }

    if (!ConnectSignal(viewerSignal, viewerProbe, "viewer")) {
        ownerSignal.Stop();
        return 3;
    }

    std::string joinPayload = "{\"displayName\":\"NativeViewer\",\"roomId\":";
    joinPayload += lunira::SocketIoClient::JsonQuote(create->roomId);
    joinPayload += "}";

    const int joinId = viewerSignal.EmitWithAck("join-room", joinPayload);
    auto join = viewerProbe.WaitAck(joinId, 15s);
    if (!join || !join->ok) {
        std::cerr << "join-room failed\n";
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 4;
    }

    auto ownerToken = RequestLiveKitToken(ownerSignal, ownerProbe, create->roomId);
    auto viewerToken = RequestLiveKitToken(viewerSignal, viewerProbe, create->roomId);
    if (!ownerToken || !ownerToken->ok || ownerToken->livekitUrl.empty() || ownerToken->livekitToken.empty() ||
        !viewerToken || !viewerToken->ok || viewerToken->livekitUrl.empty() || viewerToken->livekitToken.empty()) {
        std::cerr << "livekit tokens failed\n";
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 5;
    }

    lunira::LiveKitMediaClient receiver;
    MediaProbe mediaProbe;
    if (!receiver.Start(
            viewerToken->livekitUrl,
            viewerToken->livekitToken,
            [&](lunira::MediaEvent event) { mediaProbe.OnEvent(std::move(event)); }) ||
        !mediaProbe.WaitConnected(15s)) {
        std::cerr << "native media receiver connect failed\n";
        receiver.Stop();
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 6;
    }

    auto publisherRoom = std::make_unique<livekit::Room>();
    livekit::RoomOptions options;
    options.auto_subscribe = true;

    if (!publisherRoom->connect(
            WideToUtf8(ownerToken->livekitUrl),
            WideToUtf8(ownerToken->livekitToken),
            options)) {
        std::cerr << "publisher LiveKit connect failed\n";
        receiver.Stop();
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 7;
    }

    auto participant = publisherRoom->localParticipant().lock();
    if (!participant) {
        std::cerr << "publisher local participant missing\n";
        publisherRoom->disconnect();
        receiver.Stop();
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 8;
    }

    const std::string publisherIdentity = participant->identity();
    auto source = std::make_shared<livekit::VideoSource>(160, 90);
    auto track = participant->publishVideoTrack(
        "camera0",
        source,
        livekit::TrackSource::SOURCE_CAMERA);
    if (!track) {
        std::cerr << "camera publish failed\n";
        publisherRoom->disconnect();
        receiver.Stop();
        viewerSignal.Stop();
        ownerSignal.Stop();
        return 9;
    }

    std::this_thread::sleep_for(600ms);

    for (int frameIndex = 0; frameIndex < 20; ++frameIndex) {
        auto frame = livekit::VideoFrame::create(
            160,
            90,
            livekit::VideoBufferType::BGRA);

        auto* pixels = frame.data();
        for (int y = 0; y < 90; ++y) {
            for (int x = 0; x < 160; ++x) {
                const size_t offset = static_cast<size_t>((y * 160 + x) * 4);
                pixels[offset + 0] = static_cast<std::uint8_t>(32 + (x % 180));
                pixels[offset + 1] = static_cast<std::uint8_t>(48 + (y % 160));
                pixels[offset + 2] = 190;
                pixels[offset + 3] = 255;
            }
        }

        source->captureFrame(frame);
        std::this_thread::sleep_for(80ms);
    }

    const bool gotFrame = mediaProbe.WaitFrame(8s);
    const bool correctFrame =
        gotFrame &&
        mediaProbe.identity == std::wstring(publisherIdentity.begin(), publisherIdentity.end()) &&
        mediaProbe.width == 160 &&
        mediaProbe.height == 90 &&
        mediaProbe.bytes >= static_cast<size_t>(160 * 90 * 4);

    std::cout << "native camera frame roundtrip: "
              << (correctFrame ? "ok" : "failed")
              << " (" << mediaProbe.width << "x" << mediaProbe.height
              << ", " << mediaProbe.bytes << " bytes)\n";

    participant.reset();
    publisherRoom->disconnect();
    publisherRoom.reset();
    receiver.Stop();
    viewerSignal.Stop();
    ownerSignal.Stop();

    return correctFrame ? 0 : 10;
}
