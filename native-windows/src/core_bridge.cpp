#define LUNIRA_CORE_BRIDGE_EXPORTS
#include "core_bridge.h"

#include "agora_screen_client.h"
#include "camera_capture.h"
#include "livekit_media_client.h"
#include "socket_io_client.h"
#include "system_audio_capture.h"
#include "updater.h"

#include <algorithm>
#include <atomic>
#include <cwctype>
#include <memory>
#include <mutex>
#include <new>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace {

constexpr wchar_t kBridgeWindowClass[] = L"LuniraCoreBridgeMessageWindow";
constexpr UINT kSocketMessage = WM_APP + 150;
constexpr UINT kMediaMessage = WM_APP + 151;
constexpr UINT kAgoraMessage = WM_APP + 152;
constexpr UINT kUpdateMessage = WM_APP + 153;

enum class PendingAction { None, Create, Join };

class CoreBridge final {
public:
    CoreBridge(LuniraBridgeCallback callback, void* user)
        : callback_(callback), user_(user) {}

    ~CoreBridge() {
        updater_.Stop();
        StopSystemAudio(false);
        StopCamera(false);
        media_.Stop();
        agora_.Stop();
        socket_.Stop();
        if (messageWindow_) {
            DestroyWindow(messageWindow_);
            messageWindow_ = nullptr;
        }
    }

    bool Initialize() {
        WNDCLASSEXW wc{sizeof(wc)};
        wc.lpfnWndProc = &CoreBridge::StaticWndProc;
        wc.hInstance = GetModuleHandleW(nullptr);
        wc.lpszClassName = kBridgeWindowClass;
        if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            return false;
        }

        messageWindow_ = CreateWindowExW(
            0,
            kBridgeWindowClass,
            L"",
            0,
            0, 0, 0, 0,
            HWND_MESSAGE,
            nullptr,
            GetModuleHandleW(nullptr),
            this);
        return messageWindow_ != nullptr;
    }

    void CreateRoom(std::wstring name) {
        name = Trim(std::move(name));
        if (name.size() < 2 || name.size() > 20) {
            Error(L"Digite um nome entre 2 e 20 caracteres.");
            return;
        }
        displayName_ = std::move(name);
        roomCodeInput_.clear();
        pendingAction_ = PendingAction::Create;
        pendingAckId_ = -1;
        Status(L"Conectando ao servidor…");
        EnsureSocket();
    }

    void JoinRoom(std::wstring name, std::wstring roomCode) {
        name = Trim(std::move(name));
        roomCode = NormalizeRoomCode(std::move(roomCode));
        if (name.size() < 2 || name.size() > 20) {
            Error(L"Digite um nome entre 2 e 20 caracteres.");
            return;
        }
        if (roomCode.size() != 8) {
            Error(L"O código da sala precisa ter 8 caracteres.");
            return;
        }
        displayName_ = std::move(name);
        roomCodeInput_ = std::move(roomCode);
        pendingAction_ = PendingAction::Join;
        pendingAckId_ = -1;
        Status(L"Conectando ao servidor…");
        EnsureSocket();
    }

    void LeaveRoom() {
        if (localScreenSharing_ || screenShareStarting_) StopNativeScreenShare(true);
        if (socket_.IsConnected() && !roomCode_.empty()) {
            std::string payload = "{\"roomId\":" +
                lunira::SocketIoClient::JsonQuote(roomCode_) + "}";
            socket_.Emit("leave-room", payload);
        }
        StopSystemAudio(true);
        StopCamera(true);
        media_.Stop();
        agora_.Stop();

        mediaConnected_ = false;
        mediaStarting_ = false;
        cameraOn_ = false;
        systemAudioOn_ = false;
        localScreenSharing_ = false;
        screenShareStarting_ = false;
        agoraConnected_ = false;
        sharing_ = false;
        livekitAckId_ = -1;
        screenShareAckId_ = -1;
        agoraRenewAckId_ = -1;
        cachedLivekitUrl_.clear();
        cachedLivekitToken_.clear();
        livekitMediaAnnounced_ = false;
        selfSocketId_.clear();
        roomCode_.clear();
        roomCodeInput_.clear();
        roomState_ = {};
        NotifyFlags();
        Status(L"Saiu da sala.");
    }

    void ToggleCamera() {
        if (roomCode_.empty()) return;
        if (cameraOn_ || cameraCapture_.IsRunning()) {
            StopCamera(true);
            Status(L"Câmera desligada.");
            NotifyFlags();
            return;
        }

        cameraEnablePending_ = true;
        EnsureLiveKitMedia();
        if (mediaConnected_) StartCamera();
        Status(L"Abrindo câmera do Windows…");
        NotifyFlags();
    }

    void ToggleSystemAudio() {
        if (roomCode_.empty()) return;
        if (systemAudioOn_ || systemAudioCapture_.IsRunning()) {
            StopSystemAudio(true);
            Status(L"Áudio do sistema desligado.");
            NotifyFlags();
            return;
        }

        audioEnablePending_ = true;
        EnsureLiveKitMedia();
        if (mediaConnected_) StartSystemAudio();
        Status(L"Conectando áudio do sistema…");
        NotifyFlags();
    }

    void ToggleScreen(HWND ownerWindow, int fps) {
        if (roomCode_.empty()) return;
        fps_ = fps <= 30 ? 30 : 60;

        if (localScreenSharing_ || screenShareStarting_) {
            StopNativeScreenShare(true, L"Transmissão encerrada.");
            return;
        }
        if (sharing_) {
            Error(L"Outra pessoa já está compartilhando a tela.");
            return;
        }
        BeginNativeScreenShare(ownerWindow);
    }

    void SetFps(int fps) {
        SetQuality(screenWidth_, screenHeight_, fps);
    }

    void SetQuality(int width, int height, int fps) {
        screenWidth_ = width <= 1280 ? 1280 : 1920;
        screenHeight_ = height <= 720 ? 720 : 1080;
        fps_ = fps <= 30 ? 30 : 60;
        if (localScreenSharing_) {
            agora_.UpdateCaptureQuality(screenWidth_, screenHeight_, fps_);
        }
        NotifyFlags();
    }

    void CheckUpdate() {
        if (updater_.IsBusy()) return;
        updater_.Check([this](lunira::UpdateEvent event) {
            auto* heap = new(std::nothrow) lunira::UpdateEvent(std::move(event));
            if (!heap) return;
            if (!PostMessageW(messageWindow_, kUpdateMessage, 0, reinterpret_cast<LPARAM>(heap))) {
                delete heap;
            }
        });
    }

    void DownloadUpdate() {
        if (updater_.IsBusy()) return;
        updater_.DownloadAndInstall([this](lunira::UpdateEvent event) {
            auto* heap = new(std::nothrow) lunira::UpdateEvent(std::move(event));
            if (!heap) return;
            if (!PostMessageW(messageWindow_, kUpdateMessage, 0, reinterpret_cast<LPARAM>(heap))) {
                delete heap;
            }
        });
    }

private:
    static std::wstring Trim(std::wstring value) {
        const auto first = std::find_if_not(value.begin(), value.end(), [](wchar_t ch) {
            return std::iswspace(ch) != 0;
        });
        if (first == value.end()) return {};
        const auto last = std::find_if_not(value.rbegin(), value.rend(), [](wchar_t ch) {
            return std::iswspace(ch) != 0;
        }).base();
        return std::wstring(first, last);
    }

    static std::wstring NormalizeRoomCode(std::wstring value) {
        std::wstring output;
        output.reserve(8);
        for (wchar_t ch : value) {
            const wchar_t upper = static_cast<wchar_t>(std::towupper(ch));
            const bool letter = upper >= L'A' && upper <= L'Z';
            const bool digit = upper >= L'2' && upper <= L'9';
            if ((letter || digit) && output.size() < 8) output.push_back(upper);
        }
        return output;
    }

    static LRESULT CALLBACK StaticWndProc(
        HWND hwnd,
        UINT message,
        WPARAM wParam,
        LPARAM lParam) {

        CoreBridge* self = nullptr;
        if (message == WM_NCCREATE) {
            auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
            self = static_cast<CoreBridge*>(create->lpCreateParams);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
            self->messageWindow_ = hwnd;
        } else {
            self = reinterpret_cast<CoreBridge*>(
                GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        }

        return self
            ? self->WndProc(message, wParam, lParam)
            : DefWindowProcW(hwnd, message, wParam, lParam);
    }

    LRESULT WndProc(UINT message, WPARAM wParam, LPARAM lParam) {
        switch (message) {
        case kSocketMessage: {
            std::unique_ptr<lunira::SocketEvent> event(
                reinterpret_cast<lunira::SocketEvent*>(lParam));
            if (event) HandleSocketEvent(*event);
            return 0;
        }
        case kMediaMessage:
            HandleQueuedMediaEvents();
            return 0;
        case kAgoraMessage:
            HandleQueuedAgoraEvents();
            return 0;
        case kUpdateMessage: {
            std::unique_ptr<lunira::UpdateEvent> event(
                reinterpret_cast<lunira::UpdateEvent*>(lParam));
            if (event) HandleUpdateEvent(*event);
            return 0;
        }
        default:
            return DefWindowProcW(messageWindow_, message, wParam, lParam);
        }
    }

    void Notify(
        int type,
        std::wstring_view text = {},
        std::wstring_view identity = {},
        const std::uint8_t* data = nullptr,
        int width = 0,
        int height = 0,
        int value1 = 0,
        int value2 = 0) {

        if (!callback_) return;
        const std::wstring textCopy(text);
        const std::wstring identityCopy(identity);
        callback_(
            type,
            textCopy.c_str(),
            identityCopy.c_str(),
            data,
            width,
            height,
            value1,
            value2,
            user_);
    }

    void Status(std::wstring_view message) {
        Notify(LUNIRA_EVENT_STATUS, message);
    }

    void Error(std::wstring_view message) {
        Notify(LUNIRA_EVENT_ERROR, message);
    }

    void NotifyFlags() {
        int flags = 0;
        if (networkConnected_) flags |= LUNIRA_FLAG_NETWORK;
        if (cameraOn_) flags |= LUNIRA_FLAG_CAMERA;
        if (systemAudioOn_) flags |= LUNIRA_FLAG_SYSTEM_AUDIO;
        if (localScreenSharing_) flags |= LUNIRA_FLAG_LOCAL_SCREEN;
        if (sharing_) flags |= LUNIRA_FLAG_SCREEN_LIVE;
        if (mediaConnected_) flags |= LUNIRA_FLAG_MEDIA;
        if (agoraConnected_) flags |= LUNIRA_FLAG_AGORA;
        Notify(LUNIRA_EVENT_FLAGS, {}, {}, nullptr, 0, 0, flags, fps_);
    }

    void NotifyRoomState() {
        std::wstring serialized;
        for (const auto& participant : roomState_.participants) {
            serialized += participant.id;
            serialized += L'\t';
            serialized += participant.displayName;
            serialized += L'\t';
            serialized += participant.displayName == roomState_.ownerName ? L"1" : L"0";
            serialized += L'\n';
        }
        Notify(
            LUNIRA_EVENT_ROOM_STATE,
            serialized,
            roomState_.activeScreenSharerName,
            nullptr,
            0,
            0,
            static_cast<int>(roomState_.participants.size()),
            roomState_.live ? 1 : 0);
    }

    void EnsureSocket() {
        if (socket_.IsConnected()) {
            networkConnected_ = true;
            SendPendingRoomRequest();
            NotifyFlags();
            return;
        }
        if (socket_.IsRunning()) return;

        const bool started = socket_.Start([this](lunira::SocketEvent event) {
            auto* heap = new(std::nothrow) lunira::SocketEvent(std::move(event));
            if (!heap) return;
            if (!PostMessageW(messageWindow_, kSocketMessage, 0, reinterpret_cast<LPARAM>(heap))) {
                delete heap;
            }
        });

        if (!started) {
            pendingAction_ = PendingAction::None;
            Error(L"Não foi possível iniciar a conexão.");
        }
    }

    void SendPendingRoomRequest() {
        if (!socket_.IsConnected() || pendingAction_ == PendingAction::None) return;

        std::string payload = "{\"displayName\":";
        payload += lunira::SocketIoClient::JsonQuote(displayName_);
        if (pendingAction_ == PendingAction::Join) {
            payload += ",\"roomId\":";
            payload += lunira::SocketIoClient::JsonQuote(roomCodeInput_);
        }
        payload += "}";

        const std::string_view eventName =
            pendingAction_ == PendingAction::Create ? "create-room" : "join-room";

        pendingAckId_ = socket_.EmitWithAck(eventName, payload);
        if (pendingAckId_ < 0) {
            pendingAction_ = PendingAction::None;
            Error(L"A conexão caiu antes de enviar a solicitação.");
        } else {
            Status(pendingAction_ == PendingAction::Create
                ? L"Criando sala privada…"
                : L"Entrando na sala…");
        }
    }

    void QueueMediaEvent(lunira::MediaEvent event) {
        {
            std::scoped_lock lock(mediaQueueMutex_);
            if (event.type == lunira::MediaEventType::CameraFrame) {
                auto existing = std::find_if(
                    pendingMediaEvents_.begin(),
                    pendingMediaEvents_.end(),
                    [&event](const lunira::MediaEvent& pending) {
                        return pending.type == lunira::MediaEventType::CameraFrame &&
                               pending.identity == event.identity;
                    });
                if (existing != pendingMediaEvents_.end()) *existing = std::move(event);
                else pendingMediaEvents_.push_back(std::move(event));
            } else {
                pendingMediaEvents_.push_back(std::move(event));
            }
            if (mediaMessagePosted_.exchange(true)) return;
        }
        if (!PostMessageW(messageWindow_, kMediaMessage, 0, 0)) {
            mediaMessagePosted_.store(false);
        }
    }

    void HandleQueuedMediaEvents() {
        std::vector<lunira::MediaEvent> events;
        {
            std::scoped_lock lock(mediaQueueMutex_);
            events.swap(pendingMediaEvents_);
            mediaMessagePosted_.store(false);
        }
        for (auto& event : events) HandleMediaEvent(std::move(event));
    }

    void QueueAgoraEvent(lunira::AgoraEvent event) {
        {
            std::scoped_lock lock(agoraQueueMutex_);
            if (event.type == lunira::AgoraEventType::ScreenFrame) {
                auto existing = std::find_if(
                    pendingAgoraEvents_.begin(),
                    pendingAgoraEvents_.end(),
                    [](const lunira::AgoraEvent& pending) {
                        return pending.type == lunira::AgoraEventType::ScreenFrame;
                    });
                if (existing != pendingAgoraEvents_.end()) *existing = std::move(event);
                else pendingAgoraEvents_.push_back(std::move(event));
            } else {
                pendingAgoraEvents_.push_back(std::move(event));
            }
            if (agoraMessagePosted_.exchange(true)) return;
        }
        if (!PostMessageW(messageWindow_, kAgoraMessage, 0, 0)) {
            agoraMessagePosted_.store(false);
        }
    }

    lunira::AgoraScreenClient::Callback AgoraCallback() {
        return [this](lunira::AgoraEvent event) {
            QueueAgoraEvent(std::move(event));
        };
    }

    void HandleQueuedAgoraEvents() {
        std::vector<lunira::AgoraEvent> events;
        {
            std::scoped_lock lock(agoraQueueMutex_);
            events.swap(pendingAgoraEvents_);
            agoraMessagePosted_.store(false);
        }
        for (auto& event : events) HandleAgoraEvent(std::move(event));
    }

    void HandleSocketEvent(const lunira::SocketEvent& event) {
        switch (event.type) {
        case lunira::SocketEventType::Connected:
            networkConnected_ = true;
            if (!event.socketId.empty()) selfSocketId_ = event.socketId;
            Status(L"Conectado.");
            SendPendingRoomRequest();
            NotifyFlags();
            break;

        case lunira::SocketEventType::Ack:
            if (event.ackId == agoraRenewAckId_) {
                agoraRenewAckId_ = -1;
                if (event.ok && !event.agoraToken.empty()) {
                    agora_.RenewToken(event.agoraToken);
                } else {
                    Error(event.error.empty()
                        ? L"Não foi possível renovar a sessão Agora."
                        : event.error);
                }
                break;
            }

            if (event.ackId == screenShareAckId_) {
                screenShareAckId_ = -1;
                if (!event.ok) {
                    screenShareStarting_ = false;
                    Error(event.error.empty()
                        ? L"A transmissão não pôde começar."
                        : event.error);
                    NotifyFlags();
                    break;
                }

                lunira::AgoraCredentials publisher;
                publisher.appId = event.agoraAppId;
                publisher.channel = event.agoraChannel;
                publisher.token = event.agoraToken;
                publisher.uid = static_cast<unsigned int>(event.agoraUid);

                screenShareStarting_ = true;
                agoraConnected_ = false;
                if (!agora_.StartSharing(
                        publisher,
                        pendingScreenSource_,
                        screenWidth_,
                        screenHeight_,
                        fps_,
                        AgoraCallback())) {
                    StopNativeScreenShare(
                        true,
                        L"Não foi possível iniciar a captura Agora.");
                }
                NotifyFlags();
                break;
            }

            if (event.ackId == livekitAckId_) {
                livekitAckId_ = -1;
                if (!event.ok ||
                    event.livekitUrl.empty() ||
                    event.livekitToken.empty()) {
                    Error(event.error.empty()
                        ? L"Não foi possível acessar a mídia da sala."
                        : event.error);
                    cameraEnablePending_ = false;
                    audioEnablePending_ = false;
                    NotifyFlags();
                    break;
                }

                cachedLivekitUrl_ = event.livekitUrl;
                cachedLivekitToken_ = event.livekitToken;
                StartCachedLiveKitMedia();
                break;
            }

            if (event.ackId != pendingAckId_) break;

            if (!event.ok) {
                pendingAction_ = PendingAction::None;
                pendingAckId_ = -1;
                Error(event.error.empty()
                    ? L"O servidor recusou a solicitação."
                    : event.error);
                break;
            }

            if (!event.displayName.empty()) displayName_ = event.displayName;
            if (pendingAction_ == PendingAction::Create) {
                roomCode_ = event.roomId;
                roomCodeInput_ = event.roomId;
                ownsRoom_ = true;
            } else {
                roomCode_ = roomCodeInput_;
                ownsRoom_ = false;
            }

            roomState_ = event.room;
            sharing_ = roomState_.live;
            viewerAgoraCredentials_.appId = event.agoraAppId;
            viewerAgoraCredentials_.channel = event.agoraChannel;
            viewerAgoraCredentials_.token = event.agoraToken;
            viewerAgoraCredentials_.uid = static_cast<unsigned int>(event.agoraUid);
            pendingAction_ = PendingAction::None;
            pendingAckId_ = -1;
            livekitAckId_ = -1;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            livekitMediaAnnounced_ = false;

            if (selfSocketId_.empty()) {
                for (auto it = roomState_.participants.rbegin();
                     it != roomState_.participants.rend();
                     ++it) {
                    if (it->displayName == displayName_) {
                        selfSocketId_ = it->id;
                        break;
                    }
                }
            }

            Notify(
                LUNIRA_EVENT_JOINED,
                roomCode_,
                displayName_,
                nullptr,
                0, 0,
                ownsRoom_ ? 1 : 0,
                0);
            NotifyRoomState();
            NotifyFlags();
            if (roomState_.livekitActive) EnsureLiveKitMedia();
            StartAgoraViewer();
            Status(L"Sala conectada.");
            break;

        case lunira::SocketEventType::RoomState:
            roomState_ = event.room;
            sharing_ = roomState_.live;
            if (roomState_.livekitActive) {
                EnsureLiveKitMedia();
            } else if (!cameraOn_ &&
                       !cameraEnablePending_ &&
                       !systemAudioOn_ &&
                       mediaConnected_) {
                media_.Stop();
                mediaConnected_ = false;
                mediaStarting_ = false;
            }
            NotifyRoomState();
            NotifyFlags();
            break;

        case lunira::SocketEventType::BroadcastStarted:
            sharing_ = true;
            roomState_.live = true;
            NotifyRoomState();
            NotifyFlags();
            break;

        case lunira::SocketEventType::BroadcastEnded:
            sharing_ = false;
            roomState_.live = false;
            NotifyRoomState();
            NotifyFlags();
            break;

        case lunira::SocketEventType::RoomExpired:
            Error(L"A sala expirou.");
            LeaveRoom();
            break;

        case lunira::SocketEventType::Disconnected:
            networkConnected_ = false;
            StopSystemAudio(false);
            StopCamera(false);
            media_.Stop();
            agora_.Stop();
            mediaConnected_ = false;
            mediaStarting_ = false;
            localScreenSharing_ = false;
            screenShareStarting_ = false;
            agoraConnected_ = false;
            selfSocketId_.clear();
            NotifyFlags();
            Error(L"Conexão com o servidor encerrada.");
            break;

        case lunira::SocketEventType::Error:
            networkConnected_ = false;
            pendingAction_ = PendingAction::None;
            pendingAckId_ = -1;
            NotifyFlags();
            Error(event.error.empty() ? L"Falha de conexão." : event.error);
            break;
        }
    }

    bool StartCachedLiveKitMedia() {
        if (mediaConnected_ || mediaStarting_) return true;
        if (cachedLivekitUrl_.empty() || cachedLivekitToken_.empty()) return false;

        mediaStarting_ = true;
        const bool started = media_.Start(
            cachedLivekitUrl_,
            cachedLivekitToken_,
            [this](lunira::MediaEvent event) {
                QueueMediaEvent(std::move(event));
            });

        if (!started) {
            mediaStarting_ = false;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            Error(L"Não foi possível iniciar a conexão de mídia.");
            return false;
        }
        Status(L"Conectando câmeras…");
        return true;
    }

    void EnsureLiveKitMedia() {
        if (mediaConnected_ || mediaStarting_) return;
        if (!socket_.IsConnected() || roomCode_.empty()) return;

        if (StartCachedLiveKitMedia()) return;
        if (livekitAckId_ >= 0) return;

        std::string payload = "{\"roomId\":";
        payload += lunira::SocketIoClient::JsonQuote(roomCode_);
        payload += "}";

        livekitAckId_ = socket_.EmitWithAck("get-livekit-token", payload);
        if (livekitAckId_ < 0) {
            Error(L"Não foi possível pedir acesso à mídia.");
        } else {
            Status(L"Preparando mídia da sala…");
        }
    }

    void SetLocalLiveKitMediaActive(bool active) {
        if (!socket_.IsConnected() || roomCode_.empty()) return;
        if (livekitMediaAnnounced_ == active) return;

        std::string payload = "{\"roomId\":";
        payload += lunira::SocketIoClient::JsonQuote(roomCode_);
        payload += ",\"active\":";
        payload += active ? "true" : "false";
        payload += "}";

        if (socket_.Emit("livekit-media-active", payload)) {
            livekitMediaAnnounced_ = active;
        }
    }

    void StartCamera() {
        if (!mediaConnected_ ||
            cameraCapture_.IsRunning() ||
            cameraOn_) return;

        const std::wstring identity = selfSocketId_;
        if (identity.empty()) {
            cameraEnablePending_ = false;
            Error(L"Não foi possível identificar sua sessão para publicar a câmera.");
            return;
        }

        cameraPublishFailed_.store(false);
        cameraEnablePending_ = true;

        const bool started = cameraCapture_.Start(
            [this, identity](lunira::CapturedCameraFrame frame) {
                if (frame.width <= 0 ||
                    frame.height <= 0 ||
                    frame.bgra.empty()) return;

                if (!media_.PushLocalCameraFrame(
                        frame.bgra.data(),
                        frame.bgra.size(),
                        frame.width,
                        frame.height)) {
                    if (!cameraPublishFailed_.exchange(true)) {
                        lunira::MediaEvent error;
                        error.type = lunira::MediaEventType::CameraError;
                        error.error = L"Não foi possível publicar a câmera no LiveKit.";
                        QueueMediaEvent(std::move(error));
                    }
                    return;
                }

                lunira::MediaEvent preview;
                preview.type = lunira::MediaEventType::CameraFrame;
                preview.identity = identity;
                preview.width = frame.width;
                preview.height = frame.height;
                preview.bgra = std::move(frame.bgra);
                QueueMediaEvent(std::move(preview));
            },
            [this](std::wstring errorText) {
                if (!cameraPublishFailed_.exchange(true)) {
                    lunira::MediaEvent error;
                    error.type = lunira::MediaEventType::CameraError;
                    error.error = std::move(errorText);
                    QueueMediaEvent(std::move(error));
                }
            });

        if (!started) {
            cameraEnablePending_ = false;
            Error(L"Não foi possível abrir a câmera.");
        }
    }

    void StopCamera(bool notifyServer) {
        cameraEnablePending_ = false;
        cameraPublishFailed_.store(false);
        cameraCapture_.Stop();
        media_.StopLocalCamera();
        cameraOn_ = false;

        if (!selfSocketId_.empty()) {
            Notify(LUNIRA_EVENT_CAMERA_REMOVED, {}, selfSocketId_);
        }
        if (notifyServer) SetLocalLiveKitMediaActive(systemAudioOn_);
    }

    void StartSystemAudio() {
        if (!mediaConnected_ ||
            systemAudioCapture_.IsRunning() ||
            systemAudioOn_) return;

        audioEnablePending_ = true;
        if (!media_.StartSystemAudio()) {
            audioEnablePending_ = false;
            Error(L"Não foi possível publicar o áudio no LiveKit.");
            return;
        }

        const bool started = systemAudioCapture_.Start(
            [this](lunira::CapturedAudioFrame frame) {
                if (!media_.PushSystemAudioFrame(
                        frame.samples.data(),
                        frame.samples.size(),
                        frame.sampleRate,
                        frame.channels)) {
                    lunira::MediaEvent error;
                    error.type = lunira::MediaEventType::Error;
                    error.error = L"O envio do áudio da tela foi interrompido.";
                    QueueMediaEvent(std::move(error));
                }
            },
            [this](std::wstring message) {
                lunira::MediaEvent error;
                error.type = lunira::MediaEventType::Error;
                error.error = std::move(message);
                QueueMediaEvent(std::move(error));
            });

        if (!started) {
            media_.StopSystemAudio();
            audioEnablePending_ = false;
            Error(L"Não foi possível capturar o áudio do Windows.");
            return;
        }

        systemAudioOn_ = true;
        audioEnablePending_ = false;
        SetLocalLiveKitMediaActive(true);
        Status(L"Áudio do sistema ligado.");
        NotifyFlags();
    }

    void StopSystemAudio(bool notifyServer) {
        audioEnablePending_ = false;
        systemAudioCapture_.Stop();
        media_.StopSystemAudio();
        systemAudioOn_ = false;
        if (notifyServer) SetLocalLiveKitMediaActive(cameraOn_);
    }

    void HandleMediaEvent(lunira::MediaEvent event) {
        switch (event.type) {
        case lunira::MediaEventType::Connected:
            mediaConnected_ = true;
            mediaStarting_ = false;
            if (cameraEnablePending_ && !cameraOn_) StartCamera();
            if (audioEnablePending_ && !systemAudioOn_) StartSystemAudio();
            Status(L"Mídia conectada.");
            NotifyFlags();
            break;

        case lunira::MediaEventType::Disconnected:
            mediaConnected_ = false;
            mediaStarting_ = false;
            StopCamera(false);
            StopSystemAudio(false);
            NotifyFlags();
            break;

        case lunira::MediaEventType::CameraFrame:
            if (!selfSocketId_.empty() &&
                event.identity == selfSocketId_ &&
                !cameraOn_) {
                cameraOn_ = true;
                cameraEnablePending_ = false;
                SetLocalLiveKitMediaActive(true);
                NotifyFlags();
            }
            Notify(
                LUNIRA_EVENT_CAMERA_FRAME,
                {},
                event.identity,
                event.bgra.data(),
                event.width,
                event.height);
            break;

        case lunira::MediaEventType::CameraRemoved:
            Notify(LUNIRA_EVENT_CAMERA_REMOVED, {}, event.identity);
            break;

        case lunira::MediaEventType::CameraError:
            StopCamera(true);
            Error(event.error.empty()
                ? L"Não foi possível usar a câmera."
                : event.error);
            NotifyFlags();
            break;

        case lunira::MediaEventType::Error:
            mediaConnected_ = false;
            mediaStarting_ = false;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            StopCamera(false);
            StopSystemAudio(false);
            Error(event.error.empty()
                ? L"Não foi possível conectar à mídia da sala."
                : event.error);
            NotifyFlags();
            break;
        }
    }

    void StartAgoraViewer() {
        if (!viewerAgoraCredentials_.Valid() ||
            screenShareStarting_ ||
            localScreenSharing_) return;
        agora_.StartViewer(viewerAgoraCredentials_, AgoraCallback());
    }

    void HandleAgoraEvent(lunira::AgoraEvent event) {
        switch (event.type) {
        case lunira::AgoraEventType::Connected:
            agoraConnected_ = true;
            if (screenShareStarting_ && agora_.IsSharing()) {
                screenShareStarting_ = false;
                localScreenSharing_ = true;
                sharing_ = true;
                std::string payload = "{\"roomId\":";
                payload += lunira::SocketIoClient::JsonQuote(roomCode_);
                payload += "}";
                socket_.Emit("broadcast-started", payload);
                Status(L"Sua tela está ao vivo.");
            }
            NotifyFlags();
            break;

        case lunira::AgoraEventType::Disconnected:
            agoraConnected_ = false;
            NotifyFlags();
            break;

        case lunira::AgoraEventType::ScreenFrame:
            Notify(
                LUNIRA_EVENT_SCREEN_FRAME,
                {},
                roomState_.activeScreenSharerName,
                event.bgra.data(),
                event.width,
                event.height);
            break;

        case lunira::AgoraEventType::CaptureEnded:
            if (localScreenSharing_ || screenShareStarting_) {
                StopNativeScreenShare(
                    true,
                    L"A janela ou monitor compartilhado foi encerrado.");
            }
            break;

        case lunira::AgoraEventType::TokenExpiring: {
            if (agoraRenewAckId_ >= 0 || roomCode_.empty()) break;
            std::string payload = "{\"roomId\":";
            payload += lunira::SocketIoClient::JsonQuote(roomCode_);
            payload += ",\"screen\":";
            payload += (localScreenSharing_ || screenShareStarting_)
                ? "true"
                : "false";
            payload += "}";
            agoraRenewAckId_ =
                socket_.EmitWithAck("renew-agora-token", payload);
            break;
        }

        case lunira::AgoraEventType::Error:
            agoraConnected_ = false;
            if (localScreenSharing_ || screenShareStarting_) {
                StopNativeScreenShare(
                    true,
                    event.error.empty()
                        ? L"A transmissão Agora falhou."
                        : event.error);
            } else {
                Error(event.error.empty()
                    ? L"O vídeo Agora falhou."
                    : event.error);
            }
            NotifyFlags();
            break;
        }
    }

    bool ChooseScreenSource(HWND ownerWindow, lunira::ScreenSource& selected) {
        const auto sources = agora_.ListSources();
        if (sources.empty()) {
            Error(L"Nenhum monitor ou janela disponível para compartilhar.");
            return false;
        }

        HMENU root = CreatePopupMenu();
        HMENU monitors = CreatePopupMenu();
        HMENU windows = CreatePopupMenu();
        if (!root || !monitors || !windows) {
            if (root) DestroyMenu(root);
            if (monitors) DestroyMenu(monitors);
            if (windows) DestroyMenu(windows);
            return false;
        }

        for (size_t i = 0; i < sources.size(); ++i) {
            std::wstring title = sources[i].title.substr(0, 70);
            AppendMenuW(
                sources[i].kind == lunira::ScreenSource::Kind::Monitor
                    ? monitors
                    : windows,
                MF_STRING,
                static_cast<UINT_PTR>(1000 + i),
                title.c_str());
        }

        AppendMenuW(
            root,
            MF_POPUP,
            reinterpret_cast<UINT_PTR>(monitors),
            L"Monitores");
        AppendMenuW(
            root,
            MF_POPUP,
            reinterpret_cast<UINT_PTR>(windows),
            L"Janelas e aplicativos");

        POINT point{};
        GetCursorPos(&point);
        const UINT command = TrackPopupMenuEx(
            root,
            TPM_RETURNCMD | TPM_RIGHTBUTTON,
            point.x,
            point.y,
            ownerWindow ? ownerWindow : messageWindow_,
            nullptr);

        DestroyMenu(root);
        if (command < 1000 ||
            static_cast<size_t>(command - 1000) >= sources.size()) {
            return false;
        }

        selected = sources[command - 1000];
        return true;
    }

    void BeginNativeScreenShare(HWND ownerWindow) {
        if (!viewerAgoraCredentials_.Valid() ||
            screenShareAckId_ >= 0 ||
            screenShareStarting_ ||
            localScreenSharing_) return;

        lunira::ScreenSource source;
        if (!ChooseScreenSource(ownerWindow, source)) return;
        pendingScreenSource_ = std::move(source);

        std::string payload = "{\"roomId\":";
        payload += lunira::SocketIoClient::JsonQuote(roomCode_);
        payload += "}";

        screenShareAckId_ =
            socket_.EmitWithAck("request-screen-share", payload);
        if (screenShareAckId_ < 0) {
            Error(L"Não foi possível reservar a transmissão.");
        } else {
            screenShareStarting_ = true;
            Status(L"Preparando captura nativa…");
            NotifyFlags();
        }
    }

    void StopNativeScreenShare(
        bool notifyServer,
        std::wstring_view notice = {}) {

        const bool wasLocal = localScreenSharing_ || screenShareStarting_;
        localScreenSharing_ = false;
        screenShareStarting_ = false;
        screenShareAckId_ = -1;
        agora_.Stop();
        agoraConnected_ = false;
        sharing_ = roomState_.live && !wasLocal;

        if (notifyServer &&
            wasLocal &&
            socket_.IsConnected() &&
            !roomCode_.empty()) {
            std::string payload = "{\"roomId\":";
            payload += lunira::SocketIoClient::JsonQuote(roomCode_);
            payload += "}";
            socket_.EmitWithAck("release-screen-share", payload);
        }

        if (!notice.empty()) Status(notice);
        StartAgoraViewer();
        NotifyFlags();
    }

    void HandleUpdateEvent(const lunira::UpdateEvent& event) {
        int type = 0;
        switch (event.type) {
        case lunira::UpdateEventType::Checking: type = 1; break;
        case lunira::UpdateEventType::UpToDate: type = 2; break;
        case lunira::UpdateEventType::Available: type = 3; break;
        case lunira::UpdateEventType::Downloading: type = 4; break;
        case lunira::UpdateEventType::Installing: type = 5; break;
        case lunira::UpdateEventType::Error: type = 6; break;
        }
        Notify(
            LUNIRA_EVENT_UPDATE,
            event.message,
            event.version,
            nullptr,
            0, 0,
            type,
            event.progress);
    }

    LuniraBridgeCallback callback_ = nullptr;
    void* user_ = nullptr;
    HWND messageWindow_ = nullptr;

    PendingAction pendingAction_ = PendingAction::None;
    int pendingAckId_ = -1;
    bool networkConnected_ = false;
    bool ownsRoom_ = false;

    std::wstring displayName_;
    std::wstring roomCodeInput_;
    std::wstring roomCode_;
    lunira::RoomSnapshot roomState_;

    lunira::SocketIoClient socket_;
    lunira::LiveKitMediaClient media_;
    lunira::CameraCapture cameraCapture_;
    lunira::SystemAudioCapture systemAudioCapture_;
    lunira::AgoraScreenClient agora_;
    lunira::UpdaterClient updater_;

    int livekitAckId_ = -1;
    bool mediaConnected_ = false;
    bool mediaStarting_ = false;
    bool cameraEnablePending_ = false;
    bool cameraOn_ = false;
    bool systemAudioOn_ = false;
    bool audioEnablePending_ = false;
    bool livekitMediaAnnounced_ = false;
    std::atomic<bool> cameraPublishFailed_{false};
    std::wstring selfSocketId_;
    std::wstring cachedLivekitUrl_;
    std::wstring cachedLivekitToken_;

    bool sharing_ = false;
    bool localScreenSharing_ = false;
    bool screenShareStarting_ = false;
    bool agoraConnected_ = false;
    int screenShareAckId_ = -1;
    int agoraRenewAckId_ = -1;
    int fps_ = 60;
    int screenWidth_ = 1920;
    int screenHeight_ = 1080;
    lunira::AgoraCredentials viewerAgoraCredentials_;
    lunira::ScreenSource pendingScreenSource_;

    std::mutex mediaQueueMutex_;
    std::vector<lunira::MediaEvent> pendingMediaEvents_;
    std::atomic<bool> mediaMessagePosted_{false};

    std::mutex agoraQueueMutex_;
    std::vector<lunira::AgoraEvent> pendingAgoraEvents_;
    std::atomic<bool> agoraMessagePosted_{false};
};

CoreBridge* AsBridge(void* handle) {
    return static_cast<CoreBridge*>(handle);
}

} // namespace

extern "C" {

void* __stdcall lunira_bridge_create(
    LuniraBridgeCallback callback,
    void* user) {

    auto bridge = std::make_unique<CoreBridge>(callback, user);
    if (!bridge->Initialize()) return nullptr;
    return bridge.release();
}

void __stdcall lunira_bridge_destroy(void* handle) {
    delete AsBridge(handle);
}

void __stdcall lunira_bridge_create_room(void* handle, const wchar_t* displayName) {
    if (auto* bridge = AsBridge(handle)) {
        bridge->CreateRoom(displayName ? displayName : L"");
    }
}

void __stdcall lunira_bridge_join_room(
    void* handle,
    const wchar_t* displayName,
    const wchar_t* roomCode) {

    if (auto* bridge = AsBridge(handle)) {
        bridge->JoinRoom(
            displayName ? displayName : L"",
            roomCode ? roomCode : L"");
    }
}

void __stdcall lunira_bridge_leave_room(void* handle) {
    if (auto* bridge = AsBridge(handle)) bridge->LeaveRoom();
}

void __stdcall lunira_bridge_toggle_camera(void* handle) {
    if (auto* bridge = AsBridge(handle)) bridge->ToggleCamera();
}

void __stdcall lunira_bridge_toggle_system_audio(void* handle) {
    if (auto* bridge = AsBridge(handle)) bridge->ToggleSystemAudio();
}

void __stdcall lunira_bridge_toggle_screen(
    void* handle,
    HWND ownerWindow,
    int fps) {

    if (auto* bridge = AsBridge(handle)) {
        bridge->ToggleScreen(ownerWindow, fps);
    }
}

void __stdcall lunira_bridge_set_fps(void* handle, int fps) {
    if (auto* bridge = AsBridge(handle)) bridge->SetFps(fps);
}

void __stdcall lunira_bridge_set_quality(void* handle, int width, int height, int fps) {
    if (auto* bridge = AsBridge(handle)) bridge->SetQuality(width, height, fps);
}

void __stdcall lunira_bridge_check_update(void* handle) {
    if (auto* bridge = AsBridge(handle)) bridge->CheckUpdate();
}

void __stdcall lunira_bridge_download_update(void* handle) {
    if (auto* bridge = AsBridge(handle)) bridge->DownloadUpdate();
}

}
