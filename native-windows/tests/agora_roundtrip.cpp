#include "../src/agora_screen_client.h"
#include "../src/socket_io_client.h"

#include <IAgoraMediaEngine.h>
#include <IAgoraRtcEngine.h>
#include <windows.h>

#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <optional>
#include <string>
#include <thread>
#include <vector>

namespace {
using namespace std::chrono_literals;

std::wstring Utf8ToWide(std::string_view value) {
    if (value.empty()) return {};
    const int count = MultiByteToWideChar(CP_UTF8, 0, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    std::wstring output(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
        output.data(), count);
    return output;
}

std::string WideToUtf8(std::wstring_view value) {
    if (value.empty()) return {};
    const int count = WideCharToMultiByte(CP_UTF8, 0, value.data(),
        static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    std::string output(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
        output.data(), count, nullptr, nullptr);
    return output;
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

bool ConnectSignal(
    lunira::SocketIoClient& client,
    SignalProbe& probe,
    std::string_view label) {
    for (int attempt = 1; attempt <= 3; ++attempt) {
        probe.Reset();
        const bool started = client.Start(
            [&probe](lunira::SocketEvent event) { probe.OnEvent(std::move(event)); });
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

struct VideoProbe {
    std::mutex mutex;
    std::condition_variable cv;
    bool connected = false;
    bool failed = false;
    int width = 0;
    int height = 0;
    size_t bytes = 0;
    std::wstring error;

    void OnEvent(lunira::AgoraEvent event) {
        std::scoped_lock lock(mutex);
        if (event.type == lunira::AgoraEventType::Connected) connected = true;
        else if (event.type == lunira::AgoraEventType::ScreenFrame) {
            width = event.width;
            height = event.height;
            bytes = event.bgra.size();
        } else if (event.type == lunira::AgoraEventType::Error) {
            failed = true;
            error = std::move(event.error);
        }
        cv.notify_all();
    }

    bool WaitConnected() {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, 20s, [&] { return connected || failed; }) && connected;
    }

    bool WaitFrame() {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, 20s, [&] { return bytes > 0 || failed; }) && bytes > 0;
    }
};

class PublisherHandler final : public agora::rtc::IRtcEngineEventHandler {
public:
    void onJoinChannelSuccess(const char*, agora::rtc::uid_t, int) override {
        std::scoped_lock lock(mutex);
        joined = true;
        cv.notify_all();
    }
    void onConnectionStateChanged(agora::rtc::CONNECTION_STATE_TYPE state,
                                  agora::rtc::CONNECTION_CHANGED_REASON_TYPE) override {
        if (state == agora::rtc::CONNECTION_STATE_FAILED) {
            std::scoped_lock lock(mutex);
            failed = true;
            cv.notify_all();
        }
    }
    bool Wait() {
        std::unique_lock lock(mutex);
        return cv.wait_for(lock, 20s, [&] { return joined || failed; }) && joined;
    }
private:
    std::mutex mutex;
    std::condition_variable cv;
    bool joined = false;
    bool failed = false;
};

int PublishSynthetic(const lunira::AgoraCredentials& credentials) {
    PublisherHandler handler;
    auto* engine = createAgoraRtcEngine();
    if (!engine) return 20;
    const std::string appId = WideToUtf8(credentials.appId);
    const std::string channel = WideToUtf8(credentials.channel);
    const std::string token = WideToUtf8(credentials.token);
    agora::rtc::RtcEngineContext context;
    context.appId = appId.c_str();
    context.eventHandler = &handler;
    context.channelProfile = agora::CHANNEL_PROFILE_LIVE_BROADCASTING;
    if (engine->initialize(context) != 0) return 21;
    if (engine->enableVideo() != 0) {
        agora::rtc::IRtcEngine::release(nullptr);
        return 25;
    }

    void* rawMedia = nullptr;
    if (engine->queryInterface(agora::rtc::AGORA_IID_MEDIA_ENGINE, &rawMedia) != 0 || !rawMedia) {
        agora::rtc::IRtcEngine::release(nullptr);
        return 22;
    }
    auto* media = static_cast<agora::media::IMediaEngine*>(rawMedia);
    if (media->setExternalVideoSource(true, false) != 0) {
        media->release();
        agora::rtc::IRtcEngine::release(nullptr);
        return 23;
    }

    agora::rtc::ChannelMediaOptions options;
    options.channelProfile = agora::CHANNEL_PROFILE_LIVE_BROADCASTING;
    options.clientRoleType = agora::rtc::CLIENT_ROLE_BROADCASTER;
    options.autoSubscribeAudio = false;
    options.autoSubscribeVideo = false;
    options.publishMicrophoneTrack = false;
    options.publishCameraTrack = false;
    options.publishCustomVideoTrack = true;
    options.customVideoTrackId = 0;
    if (engine->joinChannel(token.c_str(), channel.c_str(), credentials.uid, options) != 0 ||
        !handler.Wait()) {
        media->release();
        agora::rtc::IRtcEngine::release(nullptr);
        return 24;
    }

    constexpr int width = 320;
    constexpr int height = 180;
    std::vector<std::uint8_t> pixels(static_cast<size_t>(width * height * 3 / 2));
    for (int frameIndex = 0; frameIndex < 120; ++frameIndex) {
        std::fill(pixels.begin(), pixels.begin() + width * height,
            static_cast<std::uint8_t>(48 + frameIndex % 96));
        std::fill(pixels.begin() + width * height, pixels.end(), 128);
        agora::media::base::ExternalVideoFrame frame;
        frame.type = agora::media::base::ExternalVideoFrame::VIDEO_BUFFER_RAW_DATA;
        frame.format = agora::media::base::VIDEO_PIXEL_I420;
        frame.buffer = pixels.data();
        frame.stride = width;
        frame.height = height;
        frame.timestamp = GetTickCount64();
        if (media->pushVideoFrame(&frame) != 0) break;
        std::this_thread::sleep_for(33ms);
    }

    engine->leaveChannel();
    media->setExternalVideoSource(false, false);
    media->release();
    agora::rtc::IRtcEngine::release(nullptr);
    return 0;
}

std::wstring Quote(std::wstring_view value) {
    return L"\"" + std::wstring(value) + L"\"";
}

int RunPublisherProcess(const lunira::AgoraCredentials& credentials) {
    wchar_t exePath[MAX_PATH]{};
    GetModuleFileNameW(nullptr, exePath, MAX_PATH);
    std::wstring command = Quote(exePath) + L" --publish " +
        Quote(credentials.appId) + L" " + Quote(credentials.channel) + L" " +
        Quote(credentials.token) + L" " + std::to_wstring(credentials.uid);
    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE,
            CREATE_NO_WINDOW, nullptr, nullptr, &startup, &process)) return -1;
    WaitForSingleObject(process.hProcess, 30000);
    DWORD exitCode = 99;
    GetExitCodeProcess(process.hProcess, &exitCode);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return static_cast<int>(exitCode);
}
} // namespace

int main(int argc, char** argv) {
    if (argc == 6 && std::string_view(argv[1]) == "--publish") {
        lunira::AgoraCredentials credentials;
        credentials.appId = Utf8ToWide(argv[2]);
        credentials.channel = Utf8ToWide(argv[3]);
        credentials.token = Utf8ToWide(argv[4]);
        credentials.uid = static_cast<unsigned int>(std::stoul(argv[5]));
        return PublishSynthetic(credentials);
    }

    lunira::SocketIoClient owner;
    lunira::SocketIoClient viewer;
    SignalProbe ownerProbe;
    SignalProbe viewerProbe;
    if (!ConnectSignal(owner, ownerProbe, "Agora owner")) return 1;

    auto createRoom = [&]() -> std::optional<lunira::SocketEvent> {
        const int id = owner.EmitWithAck(
            "create-room", "{\"displayName\":\"AgoraSynthetic\"}");
        if (id < 0) return std::nullopt;
        return ownerProbe.WaitAck(id, 15s);
    };
    auto create = createRoom();
    if (create && !create->ok) {
        std::cerr << "Agora create-room first rejection: "
                  << WideToUtf8(create->error) << "\n";
        std::cout << "waiting 65s before one controlled retry...\n";
        std::this_thread::sleep_for(65s);
        create = createRoom();
    }
    if (!create || !create->ok || create->roomId.size() != 8) {
        std::cerr << "Agora create-room failed";
        if (create && !create->error.empty()) {
            std::cerr << ": " << WideToUtf8(create->error);
        }
        std::cerr << "\n";
        owner.Stop();
        return 2;
    }

    if (!ConnectSignal(viewer, viewerProbe, "Agora viewer")) {
        owner.Stop();
        return 3;
    }
    std::string joinPayload = "{\"displayName\":\"AgoraReceiver\",\"roomId\":";
    joinPayload += lunira::SocketIoClient::JsonQuote(create->roomId);
    joinPayload += "}";
    auto join = viewerProbe.WaitAck(viewer.EmitWithAck("join-room", joinPayload), 15s);
    if (!join || !join->ok) {
        std::cerr << "Agora join-room failed";
        if (join && !join->error.empty()) std::cerr << ": " << WideToUtf8(join->error);
        std::cerr << "\n";
        viewer.Stop();
        owner.Stop();
        return 4;
    }

    std::string sharePayload = "{\"roomId\":";
    sharePayload += lunira::SocketIoClient::JsonQuote(create->roomId);
    sharePayload += "}";
    auto share = ownerProbe.WaitAck(
        owner.EmitWithAck("request-screen-share", sharePayload), 15s);
    if (!share || !share->ok) {
        std::cerr << "Agora request-screen-share failed";
        if (share && !share->error.empty()) std::cerr << ": " << WideToUtf8(share->error);
        std::cerr << "\n";
        viewer.Stop();
        owner.Stop();
        return 5;
    }

    lunira::AgoraCredentials receiverCredentials{
        join->agoraAppId, join->agoraChannel, join->agoraToken,
        static_cast<unsigned int>(join->agoraUid)};
    lunira::AgoraCredentials publisherCredentials{
        share->agoraAppId, share->agoraChannel, share->agoraToken,
        static_cast<unsigned int>(share->agoraUid)};
    VideoProbe videoProbe;
    lunira::AgoraScreenClient receiver;
    if (!receiver.StartViewer(receiverCredentials,
            [&](lunira::AgoraEvent event) { videoProbe.OnEvent(std::move(event)); }) ||
        !videoProbe.WaitConnected()) {
        std::cerr << "Agora receiver failed: " << WideToUtf8(videoProbe.error) << "\n";
        return 6;
    }

    const int publisherExit = RunPublisherProcess(publisherCredentials);
    const bool frameReceived = videoProbe.WaitFrame();
    const bool valid = publisherExit == 0 && frameReceived &&
        videoProbe.width == 320 && videoProbe.height == 180 &&
        videoProbe.bytes >= static_cast<size_t>(320 * 180 * 4);
    std::cerr << "Agora synthetic screen roundtrip: " << (valid ? "ok" : "failed")
              << " (" << videoProbe.width << "x" << videoProbe.height
              << ", publisher=" << publisherExit
              << ", receiver=" << WideToUtf8(videoProbe.error) << ")\n";
    receiver.Stop();
    viewer.Stop();
    owner.Stop();
    return valid ? 0 : 7;
}
