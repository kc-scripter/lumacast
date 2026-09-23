#pragma once

#include <IAgoraMediaEngine.h>
#include <IAgoraRtcEngine.h>

#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace lunira {

struct AgoraCredentials {
    std::wstring appId;
    std::wstring channel;
    std::wstring token;
    unsigned int uid = 0;

    bool Valid() const noexcept {
        return !appId.empty() && !channel.empty() && !token.empty() && uid != 0;
    }
};

struct ScreenSource {
    enum class Kind { Monitor, Window };
    Kind kind = Kind::Monitor;
    std::int64_t id = 0;
    std::wstring title;
};

enum class AgoraEventType {
    Connected,
    Disconnected,
    ConnectionState,
    ScreenFrame,
    CaptureEnded,
    TokenExpiring,
    Error
};

struct AgoraEvent {
    AgoraEventType type = AgoraEventType::Error;
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> bgra;
    std::wstring error;
    int code = 0;
    int detail = 0;
};

class AgoraScreenClient final : private agora::rtc::IRtcEngineEventHandler,
                                private agora::media::IVideoFrameObserver {
public:
    using Callback = std::function<void(AgoraEvent)>;

    AgoraScreenClient();
    ~AgoraScreenClient();

    AgoraScreenClient(const AgoraScreenClient&) = delete;
    AgoraScreenClient& operator=(const AgoraScreenClient&) = delete;

    bool StartViewer(const AgoraCredentials& credentials, Callback callback);
    bool StartSharing(const AgoraCredentials& credentials, const ScreenSource& source,
                      int width, int height, int fps, Callback callback);
    void Stop();
    bool UpdateFrameRate(int fps);
    bool UpdateCaptureQuality(int width, int height, int fps);
    bool RenewToken(std::wstring_view token);
    std::vector<ScreenSource> ListSources();
    bool IsSharing() const noexcept { return sharing_.load(); }

private:
    bool StartEngine(const AgoraCredentials& credentials, bool publisher,
                     const ScreenSource* source, int width, int height, int fps, Callback callback);
    void Notify(AgoraEvent event);
    static std::string WideToUtf8(std::wstring_view value);
    static std::wstring Utf8ToWide(std::string_view value);

    void onJoinChannelSuccess(const char*, agora::rtc::uid_t, int) override;
    void onError(int err, const char* msg) override;
    void onConnectionStateChanged(agora::rtc::CONNECTION_STATE_TYPE state,
                                  agora::rtc::CONNECTION_CHANGED_REASON_TYPE reason) override;
    void onLocalVideoStateChanged(agora::rtc::VIDEO_SOURCE_TYPE source,
                                  agora::rtc::LOCAL_VIDEO_STREAM_STATE state,
                                  agora::rtc::LOCAL_VIDEO_STREAM_REASON reason) override;
    void onTokenPrivilegeWillExpire(const char*) override;
    void onRequestToken() override;

    bool onCaptureVideoFrame(agora::rtc::VIDEO_SOURCE_TYPE,
                             agora::media::base::VideoFrame& frame) override;
    bool onPreEncodeVideoFrame(agora::rtc::VIDEO_SOURCE_TYPE,
                               agora::media::base::VideoFrame&) override { return true; }
    bool onMediaPlayerVideoFrame(agora::media::base::VideoFrame&, int) override { return true; }
    bool onRenderVideoFrame(const char*, agora::rtc::uid_t,
                            agora::media::base::VideoFrame& frame) override;
    bool onTranscodedVideoFrame(agora::media::base::VideoFrame&) override { return true; }
    agora::media::base::VIDEO_PIXEL_FORMAT getVideoFormatPreference() override {
        return agora::media::base::VIDEO_PIXEL_BGRA;
    }
    std::uint32_t getObservedFramePosition() override {
        return agora::media::base::POSITION_POST_CAPTURER |
               agora::media::base::POSITION_PRE_RENDERER;
    }

    agora::rtc::IRtcEngine* engine_ = nullptr;
    Callback callback_;
    std::mutex mutex_;
    std::atomic<bool> stopping_{false};
    std::atomic<bool> sharing_{false};
    agora::rtc::ScreenCaptureParameters captureParameters_{};
};

} // namespace lunira
