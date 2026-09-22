#include "livekit_media_client.h"

#include <windows.h>

#include <algorithm>
#include <cstring>
#include <exception>
#include <string_view>

namespace lunira {
namespace {

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

} // namespace

LiveKitMediaClient::LiveKitMediaClient() = default;

LiveKitMediaClient::~LiveKitMediaClient() {
    Stop();
}

bool LiveKitMediaClient::Start(
    std::wstring url,
    std::wstring token,
    Callback callback) {
    Stop();

    callback_ = std::move(callback);
    stopping_.store(false);
    connected_.store(false);

    try {
        connectThread_ = std::thread(
            [this, url = std::move(url), token = std::move(token)]() mutable {
                ConnectWorker(std::move(url), std::move(token));
            });
        return true;
    } catch (const std::exception& exception) {
        MediaEvent event;
        event.type = MediaEventType::Error;
        event.error = L"Não foi possível iniciar a thread de mídia: " +
            Utf8ToWide(exception.what());
        Notify(std::move(event));
        return false;
    }
}

void LiveKitMediaClient::Stop() {
    stopping_.store(true);

    if (connectThread_.joinable()) {
        connectThread_.join();
    }

    std::unique_ptr<livekit::Room> oldRoom;
    {
        std::scoped_lock lock(mutex_);
        oldRoom = std::move(room_);
    }

    if (oldRoom) {
        oldRoom->setDelegate(nullptr);
        oldRoom->disconnect();
        oldRoom.reset();
    }

    connected_.store(false);

    if (initialized_) {
        livekit::shutdown();
        initialized_ = false;
    }

    callback_ = {};
}

bool LiveKitMediaClient::IsConnected() const noexcept {
    return connected_.load();
}

void LiveKitMediaClient::ConnectWorker(
    std::wstring url,
    std::wstring token) {
    try {
        if (!livekit::initialize(livekit::LogLevel::Warn)) {
            // Already initialized in this process is valid.
        }
        initialized_ = true;

        auto room = std::make_unique<livekit::Room>();
        room->setDelegate(this);

        livekit::RoomOptions options;
        options.auto_subscribe = true;

        if (stopping_.load()) {
            room->setDelegate(nullptr);
            return;
        }

        if (!room->connect(
                WideToUtf8(url),
                WideToUtf8(token),
                options)) {
            room->setDelegate(nullptr);
            MediaEvent event;
            event.type = MediaEventType::Error;
            event.error = L"Não foi possível conectar às câmeras da sala.";
            Notify(std::move(event));
            return;
        }

        if (stopping_.load()) {
            room->setDelegate(nullptr);
            room->disconnect();
            return;
        }

        {
            std::scoped_lock lock(mutex_);
            room_ = std::move(room);
        }

        connected_.store(true);
        MediaEvent event;
        event.type = MediaEventType::Connected;
        Notify(std::move(event));
    } catch (const std::exception& exception) {
        MediaEvent event;
        event.type = MediaEventType::Error;
        event.error = L"Erro LiveKit: " + Utf8ToWide(exception.what());
        Notify(std::move(event));
    }
}

void LiveKitMediaClient::Notify(MediaEvent event) {
    if (callback_ && !stopping_.load()) {
        callback_(std::move(event));
    }
}

void LiveKitMediaClient::onTrackSubscribed(
    livekit::Room& room,
    const livekit::TrackSubscribedEvent& event) {
    if (stopping_.load() ||
        !event.track ||
        !event.publication ||
        !event.participant) {
        return;
    }

    if (event.track->kind() != livekit::TrackKind::KIND_VIDEO ||
        event.publication->source() != livekit::TrackSource::SOURCE_CAMERA) {
        return;
    }

    const std::string identity = event.participant->identity();
    const std::string trackName = event.track->name();

    livekit::VideoStream::Options options;
    options.format = livekit::VideoBufferType::BGRA;
    options.capacity = 1;

    room.setOnVideoFrameCallback(
        identity,
        trackName,
        [this, identity](const livekit::VideoFrame& frame, std::int64_t) {
            if (stopping_.load() ||
                frame.width() <= 0 ||
                frame.height() <= 0 ||
                frame.data() == nullptr ||
                frame.dataSize() == 0) {
                return;
            }

            MediaEvent event;
            event.type = MediaEventType::CameraFrame;
            event.identity = Utf8ToWide(identity);
            event.width = frame.width();
            event.height = frame.height();
            event.bgra.assign(
                frame.data(),
                frame.data() + frame.dataSize());
            Notify(std::move(event));
        },
        options);
}

void LiveKitMediaClient::onTrackUnsubscribed(
    livekit::Room&,
    const livekit::TrackUnsubscribedEvent& event) {
    if (!event.participant ||
        !event.publication ||
        event.publication->source() != livekit::TrackSource::SOURCE_CAMERA) {
        return;
    }

    MediaEvent mediaEvent;
    mediaEvent.type = MediaEventType::CameraRemoved;
    mediaEvent.identity = Utf8ToWide(event.participant->identity());
    Notify(std::move(mediaEvent));
}

void LiveKitMediaClient::onParticipantDisconnected(
    livekit::Room&,
    const livekit::ParticipantDisconnectedEvent& event) {
    if (!event.participant) return;

    MediaEvent mediaEvent;
    mediaEvent.type = MediaEventType::CameraRemoved;
    mediaEvent.identity = Utf8ToWide(event.participant->identity());
    Notify(std::move(mediaEvent));
}

void LiveKitMediaClient::onDisconnected(
    livekit::Room&,
    const livekit::DisconnectedEvent&) {
    connected_.store(false);

    MediaEvent event;
    event.type = MediaEventType::Disconnected;
    Notify(std::move(event));
}

} // namespace lunira
