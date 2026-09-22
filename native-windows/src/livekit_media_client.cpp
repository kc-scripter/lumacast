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

    StopLocalCamera();
    StopSystemAudio();

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

bool LiveKitMediaClient::StartLocalCamera(int width, int height) {
    if (width <= 0 || height <= 0 || !connected_.load()) return false;

    std::scoped_lock lock(mutex_);
    if (!room_) return false;

    if (localCameraSource_ &&
        localCameraTrack_ &&
        localCameraWidth_ == width &&
        localCameraHeight_ == height) {
        return true;
    }

    if (localCameraTrack_) {
        if (auto participant = room_->localParticipant().lock()) {
            participant->unpublishTrack(localCameraTrack_->sid());
        }
        localCameraTrack_.reset();
        localCameraSource_.reset();
    }

    try {
        auto participant = room_->localParticipant().lock();
        if (!participant) return false;

        auto source = std::make_shared<livekit::VideoSource>(width, height);
        auto track = participant->publishVideoTrack(
            "camera0",
            source,
            livekit::TrackSource::SOURCE_CAMERA);

        if (!track) return false;

        localCameraSource_ = std::move(source);
        localCameraTrack_ = std::move(track);
        localCameraWidth_ = width;
        localCameraHeight_ = height;
        return true;
    } catch (...) {
        localCameraSource_.reset();
        localCameraTrack_.reset();
        localCameraWidth_ = 0;
        localCameraHeight_ = 0;
        return false;
    }
}

bool LiveKitMediaClient::PushLocalCameraFrame(
    const std::uint8_t* bgra,
    size_t bytes,
    int width,
    int height) {
    if (!bgra || width <= 0 || height <= 0) return false;

    const size_t required =
        static_cast<size_t>(width) *
        static_cast<size_t>(height) * 4u;
    if (bytes < required) return false;

    std::shared_ptr<livekit::VideoSource> source;
    {
        std::scoped_lock lock(mutex_);
        source = localCameraSource_;
    }

    if (!source) {
        if (!StartLocalCamera(width, height)) return false;
        std::scoped_lock lock(mutex_);
        source = localCameraSource_;
    }

    if (!source) return false;

    try {
        auto frame = livekit::VideoFrame::create(
            width,
            height,
            livekit::VideoBufferType::BGRA);
        if (!frame.data() || frame.dataSize() < required) return false;

        std::memcpy(frame.data(), bgra, required);
        source->captureFrame(frame);
        return true;
    } catch (...) {
        return false;
    }
}

void LiveKitMediaClient::StopLocalCamera() {
    std::scoped_lock lock(mutex_);

    if (room_ && localCameraTrack_) {
        try {
            if (auto participant = room_->localParticipant().lock()) {
                participant->unpublishTrack(localCameraTrack_->sid());
            }
        } catch (...) {
        }
    }

    localCameraTrack_.reset();
    localCameraSource_.reset();
    localCameraWidth_ = 0;
    localCameraHeight_ = 0;
}

bool LiveKitMediaClient::StartSystemAudio(int sampleRate, int channels) {
    if (sampleRate <= 0 || channels <= 0 || !connected_.load()) return false;
    std::scoped_lock lock(mutex_);
    if (!room_) return false;
    if (systemAudioSource_ && systemAudioTrack_ &&
        systemAudioSampleRate_ == sampleRate && systemAudioChannels_ == channels) return true;

    if (systemAudioTrack_) {
        if (auto participant = room_->localParticipant().lock()) {
            participant->unpublishTrack(systemAudioTrack_->sid());
        }
    }
    systemAudioTrack_.reset();
    systemAudioSource_.reset();

    try {
        auto participant = room_->localParticipant().lock();
        if (!participant) return false;
        auto source = std::make_shared<livekit::AudioSource>(sampleRate, channels);
        auto track = participant->publishAudioTrack(
            "screen-audio", source, livekit::TrackSource::SOURCE_SCREENSHARE_AUDIO);
        if (!track) return false;
        systemAudioSource_ = std::move(source);
        systemAudioTrack_ = std::move(track);
        systemAudioSampleRate_ = sampleRate;
        systemAudioChannels_ = channels;
        return true;
    } catch (...) {
        systemAudioSource_.reset();
        systemAudioTrack_.reset();
        systemAudioSampleRate_ = 0;
        systemAudioChannels_ = 0;
        return false;
    }
}

bool LiveKitMediaClient::PushSystemAudioFrame(const std::int16_t* samples, size_t sampleCount,
                                               int sampleRate, int channels) {
    if (!samples || sampleCount == 0 || sampleRate <= 0 || channels <= 0 ||
        sampleCount % static_cast<size_t>(channels) != 0) return false;
    std::shared_ptr<livekit::AudioSource> source;
    {
        std::scoped_lock lock(mutex_);
        source = systemAudioSource_;
    }
    if (!source) {
        if (!StartSystemAudio(sampleRate, channels)) return false;
        std::scoped_lock lock(mutex_);
        source = systemAudioSource_;
    }
    if (!source) return false;
    try {
        std::vector<std::int16_t> copy(samples, samples + sampleCount);
        livekit::AudioFrame frame(std::move(copy), sampleRate, channels,
            static_cast<int>(sampleCount / static_cast<size_t>(channels)));
        source->captureFrame(frame, 100);
        return true;
    } catch (...) {
        return false;
    }
}

void LiveKitMediaClient::StopSystemAudio() {
    std::scoped_lock lock(mutex_);
    if (room_ && systemAudioTrack_) {
        try {
            if (auto participant = room_->localParticipant().lock()) {
                participant->unpublishTrack(systemAudioTrack_->sid());
            }
        } catch (...) {
        }
    }
    systemAudioTrack_.reset();
    systemAudioSource_.reset();
    systemAudioSampleRate_ = 0;
    systemAudioChannels_ = 0;
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
