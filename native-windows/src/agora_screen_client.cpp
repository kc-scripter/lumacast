#include "agora_screen_client.h"

#include <windows.h>

#include <algorithm>
#include <cstring>

namespace lunira {
namespace {

void EnsureAgoraLogDirectory() {
    wchar_t localAppData[MAX_PATH]{};
    const DWORD localLength = GetEnvironmentVariableW(
        L"LOCALAPPDATA", localAppData, static_cast<DWORD>(std::size(localAppData)));
    if (localLength == 0 || localLength >= std::size(localAppData)) return;

    wchar_t exePath[MAX_PATH]{};
    const DWORD exeLength = GetModuleFileNameW(
        nullptr, exePath, static_cast<DWORD>(std::size(exePath)));
    if (exeLength == 0 || exeLength >= std::size(exePath)) return;

    std::wstring exeName(exePath, exeLength);
    const size_t slash = exeName.find_last_of(L"\\/");
    if (slash != std::wstring::npos) exeName.erase(0, slash + 1);
    const size_t dot = exeName.find_last_of(L'.');
    if (dot != std::wstring::npos) exeName.resize(dot);
    if (exeName.empty()) exeName = L"LuniraScreen";

    std::wstring agoraRoot(localAppData, localLength);
    agoraRoot += L"\\Agora";
    CreateDirectoryW(agoraRoot.c_str(), nullptr);

    std::wstring processDir = agoraRoot + L"\\" + exeName;
    CreateDirectoryW(processDir.c_str(), nullptr);
}

} // namespace

AgoraScreenClient::AgoraScreenClient() = default;
AgoraScreenClient::~AgoraScreenClient() { Stop(); }

std::string AgoraScreenClient::WideToUtf8(std::wstring_view value) {
    if (value.empty()) return {};
    const int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (count <= 0) return {};
    std::string output(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), output.data(), count, nullptr, nullptr);
    return output;
}

std::wstring AgoraScreenClient::Utf8ToWide(std::string_view value) {
    if (value.empty()) return {};
    const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    if (count <= 0) return {};
    std::wstring output(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), output.data(), count);
    return output;
}

bool AgoraScreenClient::StartViewer(const AgoraCredentials& credentials, Callback callback) {
    return StartEngine(credentials, false, nullptr, 30, std::move(callback));
}

bool AgoraScreenClient::StartSharing(const AgoraCredentials& credentials,
                                     const ScreenSource& source, int fps, Callback callback) {
    return StartEngine(credentials, true, &source, fps, std::move(callback));
}

bool AgoraScreenClient::StartEngine(const AgoraCredentials& credentials, bool publisher,
                                    const ScreenSource* source, int fps, Callback callback) {
    Stop();
    if (!credentials.Valid() || (publisher && source == nullptr)) return false;

    stopping_.store(false);
    sharing_.store(publisher);
    callback_ = std::move(callback);

    const std::string appId = WideToUtf8(credentials.appId);
    const std::string channel = WideToUtf8(credentials.channel);
    const std::string token = WideToUtf8(credentials.token);

    EnsureAgoraLogDirectory();
    engine_ = createAgoraRtcEngine();
    if (!engine_) {
        Notify({AgoraEventType::Error, 0, 0, {}, L"Não foi possível criar o motor Agora."});
        return false;
    }

    agora::rtc::RtcEngineContext context;
    context.appId = appId.c_str();
    context.eventHandler = this;
    context.channelProfile = agora::CHANNEL_PROFILE_LIVE_BROADCASTING;
    if (engine_->initialize(context) != 0) {
        Notify({AgoraEventType::Error, 0, 0, {}, L"A inicialização do Agora falhou."});
        Stop();
        return false;
    }
    if (engine_->enableVideo() != 0) {
        Notify({AgoraEventType::Error, 0, 0, {}, L"Não foi possível habilitar vídeo no Agora."});
        Stop();
        return false;
    }

    void* rawMediaEngine = nullptr;
    if (engine_->queryInterface(agora::rtc::AGORA_IID_MEDIA_ENGINE, &rawMediaEngine) != 0 ||
        rawMediaEngine == nullptr) {
        Notify({AgoraEventType::Error, 0, 0, {}, L"O renderizador de vídeo Agora não está disponível."});
        Stop();
        return false;
    }
    auto* mediaEngine = static_cast<agora::media::IMediaEngine*>(rawMediaEngine);
    const int observerResult = mediaEngine->registerVideoFrameObserver(this);
    mediaEngine->release();
    if (observerResult != 0) {
        Notify({AgoraEventType::Error, 0, 0, {}, L"Não foi possível observar os frames do Agora."});
        Stop();
        return false;
    }

    if (publisher) {
        captureParameters_ = agora::rtc::ScreenCaptureParameters(1920, 1080,
            std::clamp(fps, 30, 60), 0);
        captureParameters_.captureAudio = false;
        captureParameters_.captureMouseCursor = true;
        captureParameters_.windowFocus = false;
        captureParameters_.enableHighLight = true;
        captureParameters_.highLightWidth = 2;
        captureParameters_.highLightColor = 0xFF7857FF;

        agora::rtc::Rectangle fullRegion;
        const int captureResult = source->kind == ScreenSource::Kind::Monitor
            ? engine_->startScreenCaptureByDisplayId(source->id, fullRegion, captureParameters_)
            : engine_->startScreenCaptureByWindowId(source->id, fullRegion, captureParameters_);
        if (captureResult != 0) {
            Notify({AgoraEventType::Error, 0, 0, {},
                L"A captura nativa da tela falhou (Agora " + std::to_wstring(captureResult) + L")."});
            Stop();
            return false;
        }
        engine_->setScreenCaptureContentHint(agora::rtc::CONTENT_HINT_MOTION);
    }

    agora::rtc::ChannelMediaOptions options;
    options.channelProfile = agora::CHANNEL_PROFILE_LIVE_BROADCASTING;
    options.clientRoleType = publisher ? agora::rtc::CLIENT_ROLE_BROADCASTER
                                       : agora::rtc::CLIENT_ROLE_AUDIENCE;
    options.autoSubscribeVideo = !publisher;
    options.autoSubscribeAudio = false;
    options.publishCameraTrack = false;
    options.publishMicrophoneTrack = false;
    options.publishScreenTrack = publisher;

    const int joinResult = engine_->joinChannel(token.c_str(), channel.c_str(), credentials.uid, options);
    if (joinResult != 0) {
        Notify({AgoraEventType::Error, 0, 0, {},
            L"Não foi possível entrar no canal Agora (" + std::to_wstring(joinResult) + L")."});
        Stop();
        return false;
    }
    return true;
}

void AgoraScreenClient::Stop() {
    stopping_.store(true);
    sharing_.store(false);
    if (engine_) {
        void* rawMediaEngine = nullptr;
        if (engine_->queryInterface(agora::rtc::AGORA_IID_MEDIA_ENGINE, &rawMediaEngine) == 0 &&
            rawMediaEngine != nullptr) {
            auto* mediaEngine = static_cast<agora::media::IMediaEngine*>(rawMediaEngine);
            mediaEngine->registerVideoFrameObserver(nullptr);
            mediaEngine->release();
        }
        engine_->stopScreenCapture();
        engine_->leaveChannel();
        agora::rtc::IRtcEngine::release(nullptr);
        engine_ = nullptr;
    }
    callback_ = {};
}

bool AgoraScreenClient::UpdateFrameRate(int fps) {
    if (!engine_ || !sharing_.load()) return false;
    captureParameters_.frameRate = std::clamp(fps, 30, 60);
    return engine_->updateScreenCaptureParameters(captureParameters_) == 0;
}

bool AgoraScreenClient::RenewToken(std::wstring_view token) {
    if (!engine_ || token.empty()) return false;
    const std::string utf8 = WideToUtf8(token);
    return engine_->renewToken(utf8.c_str()) == 0;
}

std::vector<ScreenSource> AgoraScreenClient::ListSources() {
    std::vector<ScreenSource> output;
    if (!engine_) return output;
    SIZE thumbnail{320, 180};
    SIZE icon{32, 32};
    auto* sources = engine_->getScreenCaptureSources(thumbnail, icon, true);
    if (!sources) return output;
    const unsigned int count = sources->getCount();
    output.reserve(std::min<unsigned int>(count, 80));
    for (unsigned int i = 0; i < count && output.size() < 80; ++i) {
        const auto info = sources->getSourceInfo(i);
        if (info.sourceId == 0 || info.type == agora::rtc::ScreenCaptureSourceType_Unknown) continue;
        ScreenSource source;
        source.kind = info.type == agora::rtc::ScreenCaptureSourceType_Screen
            ? ScreenSource::Kind::Monitor : ScreenSource::Kind::Window;
        source.id = info.sourceId;
        const char* title = info.sourceTitle && *info.sourceTitle ? info.sourceTitle : info.sourceName;
        source.title = Utf8ToWide(title ? title : "");
        if (source.title.empty()) {
            source.title = source.kind == ScreenSource::Kind::Monitor ? L"Monitor" : L"Janela";
        }
        output.push_back(std::move(source));
    }
    sources->release();
    return output;
}

void AgoraScreenClient::Notify(AgoraEvent event) {
    Callback callback;
    {
        std::scoped_lock lock(mutex_);
        callback = callback_;
    }
    if (callback && !stopping_.load()) callback(std::move(event));
}

void AgoraScreenClient::onJoinChannelSuccess(const char*, agora::rtc::uid_t, int) {
    Notify({AgoraEventType::Connected});
}

void AgoraScreenClient::onError(int err, const char* msg) {
    AgoraEvent event;
    event.type = AgoraEventType::Error;
    event.error = L"Agora SDK " + std::to_wstring(err);
    if (msg && *msg) {
        event.error += L": " + Utf8ToWide(msg);
    }
    event.code = err;
    Notify(std::move(event));
}

void AgoraScreenClient::onConnectionStateChanged(
    agora::rtc::CONNECTION_STATE_TYPE state,
    agora::rtc::CONNECTION_CHANGED_REASON_TYPE reason) {
    AgoraEvent diagnostic;
    diagnostic.type = AgoraEventType::ConnectionState;
    diagnostic.code = static_cast<int>(state);
    diagnostic.detail = static_cast<int>(reason);
    Notify(std::move(diagnostic));

    if (state == agora::rtc::CONNECTION_STATE_FAILED) {
        AgoraEvent error;
        error.type = AgoraEventType::Error;
        error.error = L"A conexão Agora falhou (estado " +
            std::to_wstring(static_cast<int>(state)) + L", motivo " +
            std::to_wstring(static_cast<int>(reason)) + L").";
        error.code = static_cast<int>(state);
        error.detail = static_cast<int>(reason);
        Notify(std::move(error));
    } else if (state == agora::rtc::CONNECTION_STATE_DISCONNECTED && !stopping_.load()) {
        Notify({AgoraEventType::Disconnected});
    }
}

void AgoraScreenClient::onLocalVideoStateChanged(
    agora::rtc::VIDEO_SOURCE_TYPE source,
    agora::rtc::LOCAL_VIDEO_STREAM_STATE state,
    agora::rtc::LOCAL_VIDEO_STREAM_REASON) {
    if (!sharing_.load() || (source != agora::rtc::VIDEO_SOURCE_SCREEN_PRIMARY &&
        source != agora::rtc::VIDEO_SOURCE_SCREEN)) return;
    if (state == agora::rtc::LOCAL_VIDEO_STREAM_STATE_FAILED ||
        state == agora::rtc::LOCAL_VIDEO_STREAM_STATE_STOPPED) {
        Notify({AgoraEventType::CaptureEnded});
    }
}

void AgoraScreenClient::onTokenPrivilegeWillExpire(const char*) {
    Notify({AgoraEventType::TokenExpiring});
}

void AgoraScreenClient::onRequestToken() {
    Notify({AgoraEventType::TokenExpiring});
}

bool AgoraScreenClient::onRenderVideoFrame(const char*, agora::rtc::uid_t,
                                           agora::media::base::VideoFrame& frame) {
    if (stopping_.load() || frame.type != agora::media::base::VIDEO_PIXEL_BGRA ||
        !frame.yBuffer || frame.width <= 0 || frame.height <= 0) return true;
    const size_t bytes = static_cast<size_t>(frame.width) * static_cast<size_t>(frame.height) * 4u;
    AgoraEvent event;
    event.type = AgoraEventType::ScreenFrame;
    event.width = frame.width;
    event.height = frame.height;
    event.bgra.resize(bytes);
    std::memcpy(event.bgra.data(), frame.yBuffer, bytes);
    Notify(std::move(event));
    return true;
}

bool AgoraScreenClient::onCaptureVideoFrame(agora::rtc::VIDEO_SOURCE_TYPE source,
                                            agora::media::base::VideoFrame& frame) {
    if (!sharing_.load() || (source != agora::rtc::VIDEO_SOURCE_SCREEN_PRIMARY &&
        source != agora::rtc::VIDEO_SOURCE_SCREEN)) return true;
    return onRenderVideoFrame(nullptr, 0, frame);
}

} // namespace lunira
