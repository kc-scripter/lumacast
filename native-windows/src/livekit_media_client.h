#pragma once

#include <livekit/livekit.h>

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace lunira {

enum class MediaEventType {
    Connected,
    Disconnected,
    CameraFrame,
    CameraRemoved,
    CameraError,
    Error
};

struct MediaEvent {
    MediaEventType type = MediaEventType::Error;
    std::wstring identity;
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> bgra;
    std::wstring error;
};

class LiveKitMediaClient final : private livekit::RoomDelegate {
public:
    using Callback = std::function<void(MediaEvent)>;

    LiveKitMediaClient();
    ~LiveKitMediaClient();

    LiveKitMediaClient(const LiveKitMediaClient&) = delete;
    LiveKitMediaClient& operator=(const LiveKitMediaClient&) = delete;

    bool Start(std::wstring url, std::wstring token, Callback callback);
    void Stop();

    bool IsConnected() const noexcept;

    bool StartLocalCamera(int width, int height);
    bool PushLocalCameraFrame(
        const std::uint8_t* bgra,
        size_t bytes,
        int width,
        int height);
    void StopLocalCamera();
    bool StartSystemAudio(int sampleRate = 48000, int channels = 2);
    bool PushSystemAudioFrame(const std::int16_t* samples, size_t sampleCount,
                              int sampleRate, int channels);
    void StopSystemAudio();

private:
    void ConnectWorker(std::wstring url, std::wstring token);
    void Notify(MediaEvent event);

    void onTrackSubscribed(
        livekit::Room& room,
        const livekit::TrackSubscribedEvent& event) override;

    void onTrackUnsubscribed(
        livekit::Room& room,
        const livekit::TrackUnsubscribedEvent& event) override;

    void onParticipantDisconnected(
        livekit::Room& room,
        const livekit::ParticipantDisconnectedEvent& event) override;

    void onDisconnected(
        livekit::Room& room,
        const livekit::DisconnectedEvent& event) override;

    Callback callback_;
    std::thread connectThread_;
    std::unique_ptr<livekit::Room> room_;
    mutable std::mutex mutex_;
    std::atomic<bool> stopping_{false};
    std::atomic<bool> connected_{false};
    bool initialized_ = false;

    std::shared_ptr<livekit::VideoSource> localCameraSource_;
    std::shared_ptr<livekit::LocalVideoTrack> localCameraTrack_;
    int localCameraWidth_ = 0;
    int localCameraHeight_ = 0;
    std::shared_ptr<livekit::AudioSource> systemAudioSource_;
    std::shared_ptr<livekit::LocalAudioTrack> systemAudioTrack_;
    int systemAudioSampleRate_ = 0;
    int systemAudioChannels_ = 0;
};

} // namespace lunira
