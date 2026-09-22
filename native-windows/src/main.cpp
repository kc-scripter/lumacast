#include <windows.h>
#include <windowsx.h>
#include <d2d1.h>
#include <d2d1helper.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <dxgiformat.h>
#include <wrl/client.h>

#include "socket_io_client.h"
#include "livekit_media_client.h"
#include "camera_capture.h"
#include "agora_screen_client.h"
#include "system_audio_capture.h"
#include "updater.h"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <cwctype>
#include <cmath>
#include <memory>
#include <mutex>
#include <array>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "dwmapi.lib")

using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kWindowClass[] = L"LuniraNativeWindow";
constexpr wchar_t kWindowTitle[] = L"LuniraScreen";
constexpr UINT kSocketEventMessage = WM_APP + 42;
constexpr UINT kMediaEventMessage = WM_APP + 43;
constexpr UINT kAgoraEventMessage = WM_APP + 44;
constexpr UINT kUpdateEventMessage = WM_APP + 45;
constexpr UINT_PTR kAnimationTimerId = 1;

D2D1_COLOR_F Hex(unsigned rgb, float alpha = 1.0f) {
    return D2D1::ColorF(
        ((rgb >> 16) & 0xff) / 255.0f,
        ((rgb >> 8) & 0xff) / 255.0f,
        (rgb & 0xff) / 255.0f,
        alpha);
}

struct Theme {
    D2D1_COLOR_F bg = Hex(0x07080C);
    D2D1_COLOR_F panel = Hex(0x0D0F15);
    D2D1_COLOR_F panel2 = Hex(0x141720);
    D2D1_COLOR_F panel3 = Hex(0x090B10);
    D2D1_COLOR_F stage = Hex(0x050609);
    D2D1_COLOR_F border = Hex(0x252936);
    D2D1_COLOR_F borderSoft = Hex(0x1A1D26);
    D2D1_COLOR_F text = Hex(0xF7F7FB);
    D2D1_COLOR_F muted = Hex(0x969CAD);
    D2D1_COLOR_F dim = Hex(0x626878);
    D2D1_COLOR_F violet = Hex(0x7857FF);
    D2D1_COLOR_F violet2 = Hex(0xB69EFF);
    D2D1_COLOR_F violetPanel = Hex(0x1B1630);
    D2D1_COLOR_F green = Hex(0x45D69D);
    D2D1_COLOR_F red = Hex(0xFF5F78);
    D2D1_COLOR_F amber = Hex(0xF5C96A);
};

class AppWindow {
public:
    bool Initialize(HINSTANCE instance) {
        instance_ = instance;
        dpi_ = GetDpiForSystem();

        if (FAILED(D2D1CreateFactory(
            D2D1_FACTORY_TYPE_SINGLE_THREADED,
            d2dFactory_.ReleaseAndGetAddressOf()))) {
            return false;
        }

        if (FAILED(DWriteCreateFactory(
            DWRITE_FACTORY_TYPE_SHARED,
            __uuidof(IDWriteFactory),
            reinterpret_cast<IUnknown**>(writeFactory_.ReleaseAndGetAddressOf())))) {
            return false;
        }

        WNDCLASSEXW wc{ sizeof(wc) };
        wc.lpfnWndProc = &AppWindow::StaticWndProc;
        wc.hInstance = instance_;
        wc.hCursor = LoadCursorW(nullptr, IDC_ARROW);
        wc.hIcon = static_cast<HICON>(LoadImageW(
            instance_,
            MAKEINTRESOURCEW(101),
            IMAGE_ICON,
            0,
            0,
            LR_DEFAULTSIZE));
        wc.hIconSm = static_cast<HICON>(LoadImageW(
            instance_,
            MAKEINTRESOURCEW(101),
            IMAGE_ICON,
            16,
            16,
            LR_DEFAULTCOLOR));
        wc.lpszClassName = kWindowClass;
        wc.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;

        if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            return false;
        }

        RECT desired{ 0, 0, 1380, 840 };
        AdjustWindowRectExForDpi(
            &desired,
            WS_OVERLAPPEDWINDOW,
            FALSE,
            0,
            dpi_);

        hwnd_ = CreateWindowExW(
            0,
            kWindowClass,
            kWindowTitle,
            WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            desired.right - desired.left,
            desired.bottom - desired.top,
            nullptr,
            nullptr,
            instance_,
            this);

        if (!hwnd_) return false;

        const BOOL dark = TRUE;
        DwmSetWindowAttribute(hwnd_, 20, &dark, sizeof(dark));

        pageReveal_ = 0.0f;
        dockReveal_ = camerasOpen_ ? 1.0f : 0.0f;
        shareReveal_ = sharing_ ? 1.0f : 0.0f;
        ShowWindow(hwnd_, SW_SHOW);
        UpdateWindow(hwnd_);
        StartAnimationTimer();
        StartUpdateCheck(false);
        return true;
    }

    int Run() {
        MSG msg{};
        while (GetMessageW(&msg, nullptr, 0, 0) > 0) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        return static_cast<int>(msg.wParam);
    }

private:
    enum class Page { Home, Room, Settings };
    enum class Field { None, Name, Code };
    enum class PendingAction { None, Create, Join };

    struct Hit {
        int id = -1;
        D2D1_RECT_F rect{};
    };

    struct CameraFrameCache {
        int width = 0;
        int height = 0;
        std::vector<std::uint8_t> bgra;
        ComPtr<ID2D1Bitmap> bitmap;
        bool dirty = true;
    };

    static LRESULT CALLBACK StaticWndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
        AppWindow* self = nullptr;
        if (msg == WM_NCCREATE) {
            auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
            self = static_cast<AppWindow*>(create->lpCreateParams);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, reinterpret_cast<LONG_PTR>(self));
            self->hwnd_ = hwnd;
        } else {
            self = reinterpret_cast<AppWindow*>(GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        }
        return self ? self->WndProc(msg, wParam, lParam)
                    : DefWindowProcW(hwnd, msg, wParam, lParam);
    }

    LRESULT WndProc(UINT msg, WPARAM wParam, LPARAM lParam) {
        switch (msg) {
        case WM_PAINT:
            Paint();
            return 0;
        case WM_ERASEBKGND:
            return 1;
        case WM_SIZE:
            if (renderTarget_) {
                renderTarget_->Resize(D2D1::SizeU(
                    std::max<UINT>(1, LOWORD(lParam)),
                    std::max<UINT>(1, HIWORD(lParam))));
            }
            InvalidateRect(hwnd_, nullptr, FALSE);
            return 0;
        case WM_GETMINMAXINFO: {
            auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
            info->ptMinTrackSize.x = static_cast<LONG>(1080.0f * Scale());
            info->ptMinTrackSize.y = static_cast<LONG>(680.0f * Scale());
            return 0;
        }
        case WM_DPICHANGED: {
            dpi_ = HIWORD(wParam);
            const auto* suggested = reinterpret_cast<RECT*>(lParam);
            SetWindowPos(
                hwnd_,
                nullptr,
                suggested->left,
                suggested->top,
                suggested->right - suggested->left,
                suggested->bottom - suggested->top,
                SWP_NOZORDER | SWP_NOACTIVATE);
            DiscardDeviceResources();
            InvalidateRect(hwnd_, nullptr, FALSE);
            return 0;
        }
        case WM_MOUSEMOVE:
            MouseMove(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
            return 0;
        case WM_MOUSELEAVE:
            trackingMouse_ = false;
            if (hover_ != -1) {
                hover_ = -1;
                StartAnimationTimer();
            }
            return 0;
        case WM_TIMER:
            if (wParam == kAnimationTimerId) {
                TickAnimations();
                return 0;
            }
            break;
        case WM_LBUTTONUP:
            Click(GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam));
            return 0;
        case WM_CHAR:
            HandleChar(static_cast<wchar_t>(wParam));
            return 0;
        case WM_KEYDOWN:
            if ((GetKeyState(VK_CONTROL) & 0x8000) != 0 && (wParam == 'V' || wParam == 'v')) {
                PasteFromClipboard();
                return 0;
            }
            if (wParam == VK_ESCAPE && page_ == Page::Home) {
                focusedField_ = Field::None;
                InvalidateRect(hwnd_, nullptr, FALSE);
                return 0;
            }
            break;
        case kSocketEventMessage: {
            std::unique_ptr<lunira::SocketEvent> event(
                reinterpret_cast<lunira::SocketEvent*>(lParam));
            if (event) HandleSocketEvent(*event);
            return 0;
        }
        case kMediaEventMessage:
            HandleQueuedMediaEvents();
            return 0;
        case kAgoraEventMessage:
            HandleQueuedAgoraEvents();
            return 0;
        case kUpdateEventMessage: {
            std::unique_ptr<lunira::UpdateEvent> event(
                reinterpret_cast<lunira::UpdateEvent*>(lParam));
            if (event) HandleUpdateEvent(std::move(*event));
            return 0;
        }
        case WM_SETCURSOR:
            if (LOWORD(lParam) == HTCLIENT && (hover_ == 20 || hover_ == 22)) {
                SetCursor(LoadCursorW(nullptr, IDC_IBEAM));
                return TRUE;
            }
            if (LOWORD(lParam) == HTCLIENT && hover_ >= 0) {
                SetCursor(LoadCursorW(nullptr, IDC_HAND));
                return TRUE;
            }
            break;
        case WM_DESTROY:
            KillTimer(hwnd_, kAnimationTimerId);
            updater_.Stop();
            StopSystemAudioCapture(false);
            StopLocalCameraCapture(false);
            media_.Stop();
            agora_.Stop();
            socket_.Stop();
            PostQuitMessage(0);
            return 0;
        default:
            break;
        }
        return DefWindowProcW(hwnd_, msg, wParam, lParam);
    }

    float Scale() const {
        return static_cast<float>(dpi_) / 96.0f;
    }

    float ToDip(int px) const {
        return static_cast<float>(px) / Scale();
    }

    D2D1_RECT_F Rect(float left, float top, float right, float bottom) const {
        return D2D1::RectF(left, top, right, bottom);
    }

    bool EnsureDeviceResources() {
        if (renderTarget_) return true;

        RECT client{};
        GetClientRect(hwnd_, &client);

        if (FAILED(d2dFactory_->CreateHwndRenderTarget(
            D2D1::RenderTargetProperties(),
            D2D1::HwndRenderTargetProperties(
                hwnd_,
                D2D1::SizeU(
                    std::max<LONG>(1, client.right - client.left),
                    std::max<LONG>(1, client.bottom - client.top))),
            renderTarget_.ReleaseAndGetAddressOf()))) {
            return false;
        }

        renderTarget_->SetDpi(static_cast<float>(dpi_), static_cast<float>(dpi_));

        MakeBrush(theme_.text, textBrush_);
        MakeBrush(theme_.muted, mutedBrush_);
        MakeBrush(theme_.dim, dimBrush_);
        MakeBrush(theme_.panel, panelBrush_);
        MakeBrush(theme_.panel2, panel2Brush_);
        MakeBrush(theme_.panel3, panel3Brush_);
        MakeBrush(theme_.stage, stageBrush_);
        MakeBrush(theme_.border, borderBrush_);
        MakeBrush(theme_.borderSoft, borderSoftBrush_);
        MakeBrush(theme_.violet, violetBrush_);
        MakeBrush(theme_.violet2, violet2Brush_);
        MakeBrush(theme_.violetPanel, violetPanelBrush_);
        MakeBrush(theme_.green, greenBrush_);
        MakeBrush(theme_.red, redBrush_);
        MakeBrush(theme_.amber, amberBrush_);
        MakeBrush(Hex(0x7857FF, 0.14f), violetGlowBrush_);
        MakeBrush(Hex(0x45D69D, 0.10f), greenGlowBrush_);
        MakeBrush(Hex(0x000000, 0.28f), shadowBrush_);

        MakeText(10.0f, DWRITE_FONT_WEIGHT_BOLD, tinyBold_);
        MakeText(11.0f, DWRITE_FONT_WEIGHT_REGULAR, tiny_);
        MakeText(12.0f, DWRITE_FONT_WEIGHT_REGULAR, body_);
        MakeText(12.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD, bodyStrong_);
        MakeText(14.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD, strong_);
        MakeText(16.0f, DWRITE_FONT_WEIGHT_BOLD, heading_);
        MakeText(20.0f, DWRITE_FONT_WEIGHT_BOLD, title_);
        MakeText(34.0f, DWRITE_FONT_WEIGHT_BOLD, heroTitle_);
        MakeText(15.0f, DWRITE_FONT_WEIGHT_REGULAR, heroBody_);

        return true;
    }

    void DiscardDeviceResources() {
        renderTarget_.Reset();
        textBrush_.Reset();
        mutedBrush_.Reset();
        dimBrush_.Reset();
        panelBrush_.Reset();
        panel2Brush_.Reset();
        panel3Brush_.Reset();
        stageBrush_.Reset();
        borderBrush_.Reset();
        borderSoftBrush_.Reset();
        violetBrush_.Reset();
        violet2Brush_.Reset();
        violetPanelBrush_.Reset();
        greenBrush_.Reset();
        redBrush_.Reset();
        amberBrush_.Reset();
        violetGlowBrush_.Reset();
        greenGlowBrush_.Reset();
        shadowBrush_.Reset();
        for (auto& [identity, frame] : cameraFrames_) {
            (void)identity;
            frame.bitmap.Reset();
            frame.dirty = true;
        }
        screenFrame_.bitmap.Reset();
        screenFrame_.dirty = true;
    }

    void MakeBrush(const D2D1_COLOR_F& color, ComPtr<ID2D1SolidColorBrush>& brush) {
        renderTarget_->CreateSolidColorBrush(color, brush.ReleaseAndGetAddressOf());
    }

    void MakeText(float size, DWRITE_FONT_WEIGHT weight, ComPtr<IDWriteTextFormat>& format) {
        writeFactory_->CreateTextFormat(
            L"Segoe UI Variable",
            nullptr,
            weight,
            DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            size,
            L"pt-BR",
            format.ReleaseAndGetAddressOf());

        format->SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
        format->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
    }

    void Paint() {
        PAINTSTRUCT ps{};
        BeginPaint(hwnd_, &ps);

        if (!EnsureDeviceResources()) {
            EndPaint(hwnd_, &ps);
            return;
        }

        hits_.fill({});
        hitCount_ = 0;

        RECT rc{};
        GetClientRect(hwnd_, &rc);
        const float width = ToDip(rc.right - rc.left);
        const float height = ToDip(rc.bottom - rc.top);

        renderTarget_->BeginDraw();
        renderTarget_->Clear(theme_.bg);

        const float enterX = (1.0f - pageReveal_) * 8.0f;
        renderTarget_->SetTransform(D2D1::Matrix3x2F::Translation(enterX, 0.0f));
        DrawShell(width, height);
        renderTarget_->SetTransform(D2D1::Matrix3x2F::Identity());

        const HRESULT hr = renderTarget_->EndDraw();
        if (hr == D2DERR_RECREATE_TARGET) {
            DiscardDeviceResources();
        }

        EndPaint(hwnd_, &ps);
    }


    static D2D1_COLOR_F BlendColor(
        const D2D1_COLOR_F& a,
        const D2D1_COLOR_F& b,
        float t) {
        t = std::clamp(t, 0.0f, 1.0f);
        return D2D1::ColorF(
            a.r + (b.r - a.r) * t,
            a.g + (b.g - a.g) * t,
            a.b + (b.b - a.b) * t,
            a.a + (b.a - a.a) * t);
    }

    float HoverMix(int id) const {
        if (id < 0 || static_cast<size_t>(id) >= hoverMix_.size()) return 0.0f;
        return hoverMix_[static_cast<size_t>(id)];
    }

    void StartAnimationTimer() {
        if (animationTimerRunning_ || !hwnd_) return;
        if (SetTimer(hwnd_, kAnimationTimerId, 16, nullptr) != 0) {
            animationTimerRunning_ = true;
        }
    }

    void BeginPageTransition() {
        pageReveal_ = 0.0f;
        StartAnimationTimer();
    }

    void TickAnimations() {
        bool moving = false;

        auto approach = [&moving](float& value, float target, float speed) {
            const float delta = target - value;
            if (std::fabs(delta) < 0.004f) {
                value = target;
                return;
            }
            value += delta * speed;
            moving = true;
        };

        for (size_t i = 0; i < hoverMix_.size(); ++i) {
            approach(
                hoverMix_[i],
                hover_ == static_cast<int>(i) ? 1.0f : 0.0f,
                0.28f);
        }

        approach(pageReveal_, 1.0f, 0.22f);
        approach(dockReveal_, camerasOpen_ ? 1.0f : 0.0f, 0.22f);
        approach(shareReveal_, sharing_ ? 1.0f : 0.0f, 0.18f);

        if (moving) {
            InvalidateRect(hwnd_, nullptr, FALSE);
        } else {
            KillTimer(hwnd_, kAnimationTimerId);
            animationTimerRunning_ = false;
        }
    }

    void DrawAnimatedButton(
        int id,
        const D2D1_RECT_F& rect,
        std::wstring_view label,
        bool primary,
        bool active = false,
        bool danger = false) {

        AddHit(id, rect);
        const float t = HoverMix(id);
        const float lift = t * 1.5f;
        const D2D1_RECT_F shifted =
            Rect(rect.left, rect.top - lift, rect.right, rect.bottom - lift);

        D2D1_COLOR_F base = theme_.panel3;
        D2D1_COLOR_F hot = theme_.panel2;
        if (primary) {
            base = theme_.violet;
            hot = theme_.violet2;
        }
        if (danger) {
            base = theme_.red;
            hot = Hex(0xFF7890);
        }
        if (active && !primary && !danger) {
            base = theme_.violetPanel;
            hot = Hex(0x2B2249);
        }

        ComPtr<ID2D1SolidColorBrush> bg;
        ComPtr<ID2D1SolidColorBrush> border;
        ComPtr<ID2D1SolidColorBrush> glow;
        renderTarget_->CreateSolidColorBrush(
            BlendColor(base, hot, t),
            bg.ReleaseAndGetAddressOf());
        renderTarget_->CreateSolidColorBrush(
            BlendColor(
                active ? theme_.violet : theme_.border,
                primary ? theme_.violet2 : theme_.muted,
                t * 0.72f),
            border.ReleaseAndGetAddressOf());
        renderTarget_->CreateSolidColorBrush(
            Hex(
                danger ? 0xFF5F78 : 0x7857FF,
                (primary || active ? 0.11f : 0.03f) + t * 0.10f),
            glow.ReleaseAndGetAddressOf());

        const auto glowRr = D2D1::RoundedRect(
            Rect(
                shifted.left - 2.0f - t,
                shifted.top - 2.0f - t,
                shifted.right + 2.0f + t,
                shifted.bottom + 2.0f + t),
            14, 14);
        renderTarget_->FillRoundedRectangle(glowRr, glow.Get());

        const auto rr = D2D1::RoundedRect(shifted, 12, 12);
        renderTarget_->FillRoundedRectangle(rr, bg.Get());
        if (!primary || !danger) {
            renderTarget_->DrawRoundedRectangle(rr, border.Get(), 1.0f + t * 0.35f);
        }

        CenterText(
            label,
            Rect(
                shifted.left + 10,
                shifted.top + 5,
                shifted.right - 10,
                shifted.bottom - 5),
            bodyStrong_.Get(),
            primary || danger ? textBrush_.Get() : (active ? violet2Brush_.Get() : textBrush_.Get()));
    }

    void DrawShell(float width, float height) {
        constexpr float sidebar = 294.0f;

        if (page_ == Page::Home) {
            DrawHome(0.0f, width, height);
            return;
        }

        if (page_ == Page::Room) {
            DrawRoom(0.0f, 0.0f, width, height);
            if (!selectedCameraIdentity_.empty()) {
                DrawCameraOverlay(width, height);
            }
            return;
        }

        Fill(Rect(0, 0, sidebar, height), panelBrush_.Get());
        Line(sidebar, 0, sidebar, height, borderSoftBrush_.Get(), 1.0f);
        DrawBrand();

        if (roomCode_.empty()) {
            DrawHomeSidebar(Rect(0, 64, sidebar, height), true);
        } else {
            DrawRoomSidebar(Rect(0, 64, sidebar, height));
        }

        DrawSettings(sidebar, 0.0f, width, height);
    }

    void DrawBrand() {
        const auto glow = D2D1::RoundedRect(Rect(18, 15, 66, 63), 14, 14);
        ComPtr<ID2D1SolidColorBrush> brandGlow;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x7857FF, 0.16f),
            brandGlow.ReleaseAndGetAddressOf());
        renderTarget_->FillRoundedRectangle(glow, brandGlow.Get());

        const auto mark = D2D1::RoundedRect(Rect(20, 17, 64, 61), 13, 13);
        renderTarget_->FillRoundedRectangle(mark, violetBrush_.Get());

        const auto screen = D2D1::RoundedRect(Rect(30, 29, 52, 43), 3, 3);
        renderTarget_->DrawRoundedRectangle(screen, textBrush_.Get(), 1.8f);
        Line(41, 43, 41, 48, textBrush_.Get(), 1.5f);
        Line(36, 48, 46, 48, textBrush_.Get(), 1.5f);

        Line(41, 38, 41, 31, textBrush_.Get(), 1.6f);
        Line(37.5f, 34.5f, 41, 31, textBrush_.Get(), 1.6f);
        Line(44.5f, 34.5f, 41, 31, textBrush_.Get(), 1.6f);

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(55, 25), 2.5f, 2.5f),
            textBrush_.Get());

        Text(L"LuniraScreen", Rect(78, 19, 248, 43), title_.Get(), textBrush_.Get());
        Text(L"Compartilhe. Simples. Privado.", Rect(79, 44, 260, 61), tiny_.Get(), mutedBrush_.Get());
    }

    void DrawTopRight(float width) {
        const float x = width - 444.0f;

        Pill(Rect(x, 19, x + 110, 49), L"●  PRIVADA", violetPanelBrush_.Get(), violet2Brush_.Get());

        const auto people = D2D1::RoundedRect(Rect(x + 120, 19, x + 212, 49), 15, 15);
        renderTarget_->FillRoundedRectangle(people, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(people, borderBrush_.Get(), 1.0f);
        const std::wstring peopleText =
            std::to_wstring(roomState_.participants.size()) + L" na sala";
        CenterText(peopleText, Rect(x + 128, 24, x + 204, 45),
                   tinyBold_.Get(), mutedBrush_.Get());

        const auto connected = D2D1::RoundedRect(Rect(x + 222, 19, x + 336, 49), 15, 15);
        renderTarget_->FillRoundedRectangle(connected, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(connected, borderBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(x + 238, 34), 4, 4),
            networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        Text(networkConnected_ ? L"Conectado" : L"Offline",
             Rect(x + 250, 24, x + 323, 45),
             bodyStrong_.Get(), mutedBrush_.Get());

        const auto avatar = D2D1::Ellipse(D2D1::Point2F(width - 38, 34), 17, 17);
        renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
        renderTarget_->DrawEllipse(avatar, violetBrush_.Get(), 1.0f);
        std::wstring initial = displayName_.empty() ? L"?" : displayName_.substr(0, 1);
        CenterText(initial, Rect(width - 55, 17, width - 21, 51), strong_.Get(), violet2Brush_.Get());
    }

    void DrawHomeTopRight(float width) {
        const auto badge = D2D1::RoundedRect(Rect(width - 202, 15, width - 20, 45), 15, 15);
        renderTarget_->FillRoundedRectangle(badge, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(badge, borderBrush_.Get(), 1.0f);

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(width - 184, 30), 8, 8),
            greenGlowBrush_.Get());
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(width - 184, 30), 4, 4),
            greenBrush_.Get());

        Text(L"NATIVO · LEVE · PRIVADO",
             Rect(width - 172, 20, width - 30, 41),
             tinyBold_.Get(), mutedBrush_.Get());
    }

    void DrawRail(float top, float rail, float height) {
        DrawRailButton(16, Rect(8, top + 14, rail - 8, top + 68), L"Início", false, 2);
        DrawRailButton(0, Rect(8, top + 76, rail - 8, top + 130), L"Sala", page_ == Page::Room, 0);
        DrawRailButton(1, Rect(8, top + 138, rail - 8, top + 192), L"Ajustes", page_ == Page::Settings, 1);

        CenterText(L"LS", Rect(12, height - 38, rail - 12, height - 18),
                   tinyBold_.Get(), dimBrush_.Get());
    }

    void DrawRailButton(int hitId, const D2D1_RECT_F& rect, std::wstring_view label, bool active, int icon) {
        AddHit(hitId, rect);

        const auto rr = D2D1::RoundedRect(rect, 12, 12);
        if (active) {
            renderTarget_->FillRoundedRectangle(rr, violetPanelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(rr, violetBrush_.Get(), 1.0f);
        } else if (hover_ == hitId) {
            renderTarget_->FillRoundedRectangle(rr, panel2Brush_.Get());
        }

        const float cx = (rect.left + rect.right) * 0.5f;
        const float cy = rect.top + 20.0f;

        if (icon == 0) {
            const auto screen = D2D1::RoundedRect(Rect(cx - 10, cy - 7, cx + 10, cy + 7), 2, 2);
            renderTarget_->DrawRoundedRectangle(screen, active ? violet2Brush_.Get() : mutedBrush_.Get(), 1.7f);
            Line(cx - 4, cy + 11, cx + 4, cy + 11, active ? violet2Brush_.Get() : mutedBrush_.Get(), 1.5f);
        } else if (icon == 1) {
            renderTarget_->DrawEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 7, 7),
                active ? violet2Brush_.Get() : mutedBrush_.Get(),
                1.7f);
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 2.3f, 2.3f),
                active ? violet2Brush_.Get() : mutedBrush_.Get());
        } else {
            ID2D1Brush* brush = active ? violet2Brush_.Get() : mutedBrush_.Get();
            Line(cx - 9, cy, cx, cy - 8, brush, 1.7f);
            Line(cx, cy - 8, cx + 9, cy, brush, 1.7f);
            Line(cx - 7, cy - 1, cx - 7, cy + 8, brush, 1.7f);
            Line(cx + 7, cy - 1, cx + 7, cy + 8, brush, 1.7f);
            Line(cx - 7, cy + 8, cx + 7, cy + 8, brush, 1.7f);
        }

        CenterText(label, Rect(rect.left, rect.top + 37, rect.right, rect.bottom - 5), tinyBold_.Get(),
                   active ? violet2Brush_.Get() : mutedBrush_.Get());
    }

    void DrawHome(float, float width, float height) {
        constexpr float sidebar = 286.0f;
        const float contentLeft = sidebar + 34.0f;
        const float contentRight = width - 34.0f;
        const float contentTop = 34.0f;
        const float contentBottom = height - 32.0f;

        Fill(Rect(0, 0, sidebar, height), panelBrush_.Get());
        Line(sidebar, 0, sidebar, height, borderSoftBrush_.Get(), 1.0f);

        DrawBrand();
        DrawHomeSidebar(Rect(0, 76, sidebar, height), false);

        const float totalW = contentRight - contentLeft;
        const float formW = std::clamp(totalW * 0.34f, 360.0f, 430.0f);
        const float gap = 24.0f;
        const float heroRight = contentRight - formW - gap;

        const auto ambient = D2D1::Ellipse(
            D2D1::Point2F(contentLeft + 260, contentTop + 174),
            260, 150);
        ComPtr<ID2D1SolidColorBrush> ambientBrush;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x7857FF, 0.085f),
            ambientBrush.ReleaseAndGetAddressOf());
        renderTarget_->FillEllipse(ambient, ambientBrush.Get());

        Pill(
            Rect(contentLeft, contentTop + 10, contentLeft + 190, contentTop + 40),
            L"PRIVADO · TEMPORÁRIO",
            violetPanelBrush_.Get(),
            violet2Brush_.Get());

        Text(
            L"Compartilhe sua tela.\nSó com quem você chamar.",
            Rect(contentLeft, contentTop + 64, heroRight - 18, contentTop + 166),
            heroTitle_.Get(),
            textBrush_.Get());

        Text(
            L"Crie uma sala em segundos, envie o código e transmita em até 1080p 60 FPS.\nSem servidores públicos, canais ou salas permanentes.",
            Rect(contentLeft, contentTop + 180, heroRight - 20, contentTop + 238),
            heroBody_.Get(),
            mutedBrush_.Get());

        DrawFeaturePill(Rect(contentLeft, contentTop + 262, contentLeft + 116, contentTop + 296), L"1080p");
        DrawFeaturePill(Rect(contentLeft + 126, contentTop + 262, contentLeft + 242, contentTop + 296), L"60 FPS");
        DrawFeaturePill(Rect(contentLeft + 252, contentTop + 262, contentLeft + 430, contentTop + 296), L"Câmeras embaixo");

        const D2D1_RECT_F form = Rect(
            contentRight - formW,
            contentTop + 8,
            contentRight,
            std::min(contentTop + 460.0f, contentBottom));

        const auto formShadow = D2D1::RoundedRect(
            Rect(form.left + 8, form.top + 10, form.right + 8, form.bottom + 10),
            20, 20);
        renderTarget_->FillRoundedRectangle(formShadow, shadowBrush_.Get());

        const auto formRr = D2D1::RoundedRect(form, 20, 20);
        renderTarget_->FillRoundedRectangle(formRr, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(formRr, borderBrush_.Get(), 1.0f);

        Text(L"Começar",
             Rect(form.left + 24, form.top + 22, form.right - 24, form.top + 50),
             heading_.Get(), textBrush_.Get());
        Text(L"Use um nome e crie ou entre em uma sala privada.",
             Rect(form.left + 24, form.top + 52, form.right - 24, form.top + 74),
             body_.Get(), mutedBrush_.Get());

        Text(L"SEU NOME",
             Rect(form.left + 24, form.top + 96, form.right - 24, form.top + 114),
             tinyBold_.Get(), dimBrush_.Get());
        DrawInput(
            20,
            Rect(form.left + 24, form.top + 122, form.right - 24, form.top + 168),
            displayName_,
            L"Como você quer aparecer",
            focusedField_ == Field::Name,
            false);

        DrawAnimatedButton(
            21,
            Rect(form.left + 24, form.top + 184, form.right - 24, form.top + 232),
            pendingAction_ == PendingAction::Create ? L"Criando sala…" : L"+  Criar sala privada",
            true);

        CenterText(
            L"OU",
            Rect(form.left + 24, form.top + 250, form.right - 24, form.top + 270),
            tinyBold_.Get(),
            dimBrush_.Get());

        Text(L"CÓDIGO DA SALA",
             Rect(form.left + 24, form.top + 282, form.right - 24, form.top + 300),
             tinyBold_.Get(), dimBrush_.Get());
        DrawInput(
            22,
            Rect(form.left + 24, form.top + 308, form.right - 24, form.top + 354),
            roomCodeInput_,
            L"ABCD2345",
            focusedField_ == Field::Code,
            true);

        DrawAnimatedButton(
            23,
            Rect(form.left + 24, form.top + 370, form.right - 24, form.top + 418),
            pendingAction_ == PendingAction::Join ? L"Entrando…" : L"Entrar com código",
            false);

        const float previewTop = std::max(contentTop + 330.0f, form.bottom + 24.0f);
        if (previewTop < contentBottom - 150.0f) {
            const D2D1_RECT_F preview = Rect(
                contentLeft,
                previewTop,
                contentRight,
                contentBottom);

            const auto previewShadow = D2D1::RoundedRect(
                Rect(preview.left + 8, preview.top + 10, preview.right + 8, preview.bottom + 10),
                20, 20);
            renderTarget_->FillRoundedRectangle(previewShadow, shadowBrush_.Get());

            const auto previewRr = D2D1::RoundedRect(preview, 20, 20);
            renderTarget_->FillRoundedRectangle(previewRr, panelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(previewRr, borderBrush_.Get(), 1.0f);

            Text(L"Assim fica sua sala",
                 Rect(preview.left + 22, preview.top + 16, preview.right - 170, preview.top + 40),
                 strong_.Get(), textBrush_.Get());

            const auto q = D2D1::RoundedRect(
                Rect(preview.right - 148, preview.top + 13, preview.right - 20, preview.top + 43),
                15, 15);
            renderTarget_->FillRoundedRectangle(q, panel2Brush_.Get());
            renderTarget_->DrawRoundedRectangle(q, borderSoftBrush_.Get(), 1.0f);
            CenterText(
                L"1080p · 60 FPS",
                Rect(preview.right - 140, preview.top + 18, preview.right - 28, preview.top + 39),
                tinyBold_.Get(),
                mutedBrush_.Get());

            const D2D1_RECT_F demo = Rect(
                preview.left + 18,
                preview.top + 54,
                preview.right - 18,
                preview.bottom - 78);

            const auto demoRr = D2D1::RoundedRect(demo, 14, 14);
            renderTarget_->FillRoundedRectangle(demoRr, stageBrush_.Get());
            renderTarget_->DrawRoundedRectangle(demoRr, violetBrush_.Get(), 1.0f);

            const float cx = (demo.left + demo.right) * 0.5f;
            const float cy = (demo.top + demo.bottom) * 0.5f;
            const auto icon = D2D1::RoundedRect(Rect(cx - 28, cy - 28, cx + 28, cy + 28), 16, 16);
            renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
            DrawMonitor(cx - 10, cy - 8, violet2Brush_.Get());
            CenterText(
                L"Sua transmissão aparece aqui",
                Rect(demo.left + 30, cy + 38, demo.right - 30, cy + 64),
                bodyStrong_.Get(),
                textBrush_.Get());

            const float cameraY = preview.bottom - 64.0f;
            const float cameraGap = 10.0f;
            const float cameraW = (preview.right - preview.left - 56.0f - cameraGap * 3.0f) / 4.0f;
            const wchar_t* names[] = {L"Você", L"Lia", L"Caio", L"Rafa"};
            for (int i = 0; i < 4; ++i) {
                const float x = preview.left + 18.0f + i * (cameraW + cameraGap);
                const D2D1_RECT_F tile = Rect(x, cameraY, x + cameraW, preview.bottom - 16.0f);
                const auto tileRr = D2D1::RoundedRect(tile, 10, 10);
                renderTarget_->FillRoundedRectangle(
                    tileRr,
                    i == 0 ? violetPanelBrush_.Get() : panel3Brush_.Get());
                renderTarget_->DrawRoundedRectangle(
                    tileRr,
                    i == 0 ? violetBrush_.Get() : borderSoftBrush_.Get(),
                    1.0f);
                Text(
                    names[i],
                    Rect(tile.left + 12, tile.top + 10, tile.right - 10, tile.bottom - 6),
                    tinyBold_.Get(),
                    i == 0 ? violet2Brush_.Get() : mutedBrush_.Get());
            }
        }

        if (!homeError_.empty()) {
            const D2D1_RECT_F notice = Rect(
                form.left + 24,
                form.bottom + 12,
                form.right - 24,
                std::min(form.bottom + 56, contentBottom));
            if (notice.bottom > notice.top + 20) {
                const auto noticeRr = D2D1::RoundedRect(notice, 10, 10);
                renderTarget_->FillRoundedRectangle(noticeRr, panel3Brush_.Get());
                renderTarget_->DrawRoundedRectangle(
                    noticeRr,
                    pendingAction_ == PendingAction::None ? redBrush_.Get() : violetBrush_.Get(),
                    1.0f);
                Text(
                    homeError_,
                    Rect(notice.left + 12, notice.top + 10, notice.right - 12, notice.bottom - 7),
                    tiny_.Get(),
                    mutedBrush_.Get());
            }
        }
    }

    void DrawHomeSidebar(const D2D1_RECT_F& area, bool settingsActive) {
        const float left = area.left + 16.0f;
        const float right = area.right - 16.0f;

        const D2D1_RECT_F create = Rect(left, area.top + 18, right, area.top + 68);
        DrawAnimatedButton(
            21,
            create,
            pendingAction_ == PendingAction::Create ? L"Criando…" : L"+  Criar sala",
            true);

        const D2D1_RECT_F joinCard = Rect(left, area.top + 84, right, area.top + 184);
        const auto joinRr = D2D1::RoundedRect(joinCard, 14, 14);
        renderTarget_->FillRoundedRectangle(joinRr, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(joinRr, borderBrush_.Get(), 1.0f);

        Text(L"Entrar em sala",
             Rect(joinCard.left + 14, joinCard.top + 12, joinCard.right - 14, joinCard.top + 34),
             bodyStrong_.Get(), textBrush_.Get());

        DrawInput(
            22,
            Rect(joinCard.left + 12, joinCard.top + 44, joinCard.right - 56, joinCard.bottom - 12),
            roomCodeInput_,
            L"Código da sala",
            focusedField_ == Field::Code,
            true);

        const D2D1_RECT_F join = Rect(
            joinCard.right - 48,
            joinCard.top + 44,
            joinCard.right - 12,
            joinCard.bottom - 12);
        DrawAnimatedButton(23, join, L"→", false);

        Line(left, area.top + 210, right, area.top + 210, borderSoftBrush_.Get(), 1.0f);

        const D2D1_RECT_F home = Rect(left, area.top + 226, right, area.top + 272);
        AddHit(24, home);
        const float homeT = HoverMix(24);
        const auto homeRr = D2D1::RoundedRect(home, 12, 12);
        if (!settingsActive) {
            renderTarget_->FillRoundedRectangle(homeRr, violetPanelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(homeRr, violetBrush_.Get(), 1.0f);
        } else if (homeT > 0.01f) {
            ComPtr<ID2D1SolidColorBrush> hoverBrush;
            renderTarget_->CreateSolidColorBrush(
                Hex(0x141720, 0.72f + 0.28f * homeT),
                hoverBrush.ReleaseAndGetAddressOf());
            renderTarget_->FillRoundedRectangle(homeRr, hoverBrush.Get());
        }
        DrawMonitor(
            home.left + 17,
            home.top + 14,
            settingsActive ? mutedBrush_.Get() : violet2Brush_.Get());
        Text(
            L"Início",
            Rect(home.left + 50, home.top + 11, home.right - 12, home.bottom - 8),
            bodyStrong_.Get(),
            settingsActive ? mutedBrush_.Get() : textBrush_.Get());

        const D2D1_RECT_F settings = Rect(left, area.top + 282, right, area.top + 328);
        AddHit(1, settings);
        const float settingsT = HoverMix(1);
        const auto settingsRr = D2D1::RoundedRect(settings, 12, 12);
        if (settingsActive) {
            renderTarget_->FillRoundedRectangle(settingsRr, violetPanelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(settingsRr, violetBrush_.Get(), 1.0f);
        } else if (settingsT > 0.01f) {
            ComPtr<ID2D1SolidColorBrush> hoverBrush;
            renderTarget_->CreateSolidColorBrush(
                Hex(0x141720, 0.72f + 0.28f * settingsT),
                hoverBrush.ReleaseAndGetAddressOf());
            renderTarget_->FillRoundedRectangle(settingsRr, hoverBrush.Get());
        }
        renderTarget_->DrawEllipse(
            D2D1::Ellipse(
                D2D1::Point2F(settings.left + 27, (settings.top + settings.bottom) * 0.5f),
                8, 8),
            settingsActive ? violet2Brush_.Get() : mutedBrush_.Get(),
            1.6f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(
                D2D1::Point2F(settings.left + 27, (settings.top + settings.bottom) * 0.5f),
                2.5f, 2.5f),
            settingsActive ? violet2Brush_.Get() : mutedBrush_.Get());
        Text(
            L"Configurações",
            Rect(settings.left + 50, settings.top + 11, settings.right - 12, settings.bottom - 8),
            bodyStrong_.Get(),
            settingsActive ? textBrush_.Get() : mutedBrush_.Get());

        const float profileTop = area.bottom - 88.0f;
        Line(left, profileTop - 10, right, profileTop - 10, borderSoftBrush_.Get(), 1.0f);

        const auto avatar = D2D1::Ellipse(
            D2D1::Point2F(left + 20, profileTop + 24),
            18, 18);
        renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
        renderTarget_->DrawEllipse(avatar, violetBrush_.Get(), 1.0f);
        const std::wstring initial = displayName_.empty() ? L"?" : displayName_.substr(0, 1);
        CenterText(
            initial,
            Rect(left + 2, profileTop + 6, left + 38, profileTop + 42),
            strong_.Get(),
            violet2Brush_.Get());

        Text(
            displayName_.empty() ? L"Seu perfil" : std::wstring_view(displayName_),
            Rect(left + 48, profileTop + 9, right - 10, profileTop + 31),
            bodyStrong_.Get(),
            textBrush_.Get());
        Text(
            L"Offline até entrar em uma sala",
            Rect(left + 48, profileTop + 31, right - 10, profileTop + 51),
            tiny_.Get(),
            mutedBrush_.Get());
    }

    void DrawFeaturePill(const D2D1_RECT_F& rect, std::wstring_view label) {
        const auto rr = D2D1::RoundedRect(rect, 17, 17);
        renderTarget_->FillRoundedRectangle(rr, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(rr, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(rect.left + 16, (rect.top + rect.bottom) * 0.5f), 3.5f, 3.5f),
            greenBrush_.Get());
        CenterText(label, Rect(rect.left + 26, rect.top + 6, rect.right - 10, rect.bottom - 5),
                   tinyBold_.Get(), mutedBrush_.Get());
    }

    void DrawInput(int hitId, const D2D1_RECT_F& rect, const std::wstring& value,
                   std::wstring_view placeholder, bool focused, bool code) {
        AddHit(hitId, rect);
        if (focused || hover_ == hitId) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                12, 12);
            renderTarget_->FillRoundedRectangle(glow, violetGlowBrush_.Get());
        }
        const auto rr = D2D1::RoundedRect(rect, 10, 10);
        renderTarget_->FillRoundedRectangle(rr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(
            rr,
            focused ? violetBrush_.Get() : (hover_ == hitId ? mutedBrush_.Get() : borderBrush_.Get()),
            focused ? 1.6f : 1.0f);

        if (value.empty()) {
            Text(placeholder, Rect(rect.left + 14, rect.top + 11, rect.right - 14, rect.bottom - 8),
                 body_.Get(), dimBrush_.Get());
        } else {
            Text(value, Rect(rect.left + 14, rect.top + 11, rect.right - 14, rect.bottom - 8),
                 code ? bodyStrong_.Get() : body_.Get(), textBrush_.Get());
        }

        if (focused) {
            const float caretX = std::min(rect.right - 14.0f,
                rect.left + 15.0f + static_cast<float>(value.size()) * (code ? 8.5f : 7.2f));
            Line(caretX, rect.top + 12, caretX, rect.bottom - 12, violet2Brush_.Get(), 1.3f);
        }
    }

    void DrawRoom(float, float, float width, float height) {
        constexpr float sidebar = 286.0f;
        constexpr float headerH = 72.0f;
        constexpr float pad = 18.0f;
        constexpr float controlsH = 88.0f;

        Fill(Rect(0, 0, sidebar, height), panelBrush_.Get());
        Line(sidebar, 0, sidebar, height, borderSoftBrush_.Get(), 1.0f);

        DrawBrand();
        DrawRoomSidebar(Rect(0, 76, sidebar, height));
        DrawRoomHeader(Rect(sidebar, 0, width, headerH));

        if (focused_) {
            DrawScreen(Rect(
                sidebar + pad,
                headerH + pad,
                width - pad,
                height - pad));
            return;
        }

        DrawStage(Rect(
            sidebar + pad,
            headerH + 12.0f,
            width - pad,
            height - controlsH - 6.0f));

        DrawRoomActionBar(Rect(
            sidebar + pad,
            height - controlsH,
            width - pad,
            height - 4.0f));
    }

    void DrawRoomSidebar(const D2D1_RECT_F& area) {
        const float left = area.left + 16.0f;
        const float right = area.right - 16.0f;
        const bool settingsActive = page_ == Page::Settings;

        DrawAnimatedButton(
            16,
            Rect(left, area.top + 18, right, area.top + 68),
            L"+  Nova sala",
            true);

        const D2D1_RECT_F current = Rect(left, area.top + 86, right, area.top + 134);
        AddHit(0, current);
        const float currentT = HoverMix(0);
        const auto currentRr = D2D1::RoundedRect(current, 12, 12);
        if (!settingsActive) {
            renderTarget_->FillRoundedRectangle(currentRr, violetPanelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(currentRr, violetBrush_.Get(), 1.0f);
        } else if (currentT > 0.01f) {
            renderTarget_->FillRoundedRectangle(currentRr, panel2Brush_.Get());
        }
        DrawMonitor(current.left + 17, current.top + 15,
                    settingsActive ? mutedBrush_.Get() : violet2Brush_.Get());
        Text(
            L"Sala atual",
            Rect(current.left + 50, current.top + 12, current.right - 12, current.bottom - 8),
            bodyStrong_.Get(),
            settingsActive ? mutedBrush_.Get() : textBrush_.Get());

        const D2D1_RECT_F settings = Rect(left, area.top + 146, right, area.top + 194);
        AddHit(1, settings);
        const float settingsT = HoverMix(1);
        const auto settingsRr = D2D1::RoundedRect(settings, 12, 12);
        if (settingsActive) {
            renderTarget_->FillRoundedRectangle(settingsRr, violetPanelBrush_.Get());
            renderTarget_->DrawRoundedRectangle(settingsRr, violetBrush_.Get(), 1.0f);
        } else if (settingsT > 0.01f) {
            renderTarget_->FillRoundedRectangle(settingsRr, panel2Brush_.Get());
        }

        const float scx = settings.left + 27;
        const float scy = (settings.top + settings.bottom) * 0.5f;
        renderTarget_->DrawEllipse(
            D2D1::Ellipse(D2D1::Point2F(scx, scy), 8, 8),
            settingsActive ? violet2Brush_.Get() : mutedBrush_.Get(),
            1.6f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(scx, scy), 2.5f, 2.5f),
            settingsActive ? violet2Brush_.Get() : mutedBrush_.Get());
        Text(
            L"Configurações",
            Rect(settings.left + 50, settings.top + 12, settings.right - 12, settings.bottom - 8),
            bodyStrong_.Get(),
            settingsActive ? textBrush_.Get() : mutedBrush_.Get());

        const D2D1_RECT_F roomCard = Rect(left, area.top + 222, right, area.top + 392);
        const auto roomShadow = D2D1::RoundedRect(
            Rect(roomCard.left + 4, roomCard.top + 6, roomCard.right + 4, roomCard.bottom + 6),
            16, 16);
        renderTarget_->FillRoundedRectangle(roomShadow, shadowBrush_.Get());

        const auto roomRr = D2D1::RoundedRect(roomCard, 16, 16);
        renderTarget_->FillRoundedRectangle(roomRr, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(roomRr, borderBrush_.Get(), 1.0f);

        Text(
            L"Sala privada",
            Rect(roomCard.left + 16, roomCard.top + 14, roomCard.right - 16, roomCard.top + 36),
            strong_.Get(),
            textBrush_.Get());

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(roomCard.left + 20, roomCard.top + 52), 4, 4),
            networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        Text(
            networkConnected_ ? L"Conectado" : L"Reconectando",
            Rect(roomCard.left + 32, roomCard.top + 41, roomCard.right - 16, roomCard.top + 63),
            tiny_.Get(),
            networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());

        const D2D1_RECT_F code = Rect(
            roomCard.left + 16,
            roomCard.top + 74,
            roomCard.right - 16,
            roomCard.top + 118);
        const auto codeRr = D2D1::RoundedRect(code, 11, 11);
        renderTarget_->FillRoundedRectangle(codeRr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(codeRr, borderBrush_.Get(), 1.0f);

        Text(
            roomCode_.empty() ? L"—" : std::wstring_view(roomCode_),
            Rect(code.left + 14, code.top + 11, code.right - 54, code.bottom - 7),
            strong_.Get(),
            textBrush_.Get());

        const D2D1_RECT_F copy = Rect(code.right - 38, code.top + 5, code.right - 5, code.bottom - 5);
        DrawAnimatedButton(3, copy, L"⧉", false);

        const std::wstring participantText =
            std::to_wstring(roomState_.participants.size()) +
            (roomState_.participants.size() == 1 ? L" participante" : L" participantes");
        Text(
            participantText,
            Rect(roomCard.left + 16, roomCard.top + 130, roomCard.right - 16, roomCard.top + 151),
            body_.Get(),
            mutedBrush_.Get());

        const D2D1_RECT_F invite = Rect(left, area.top + 406, right, area.top + 450);
        DrawAnimatedButton(
            3,
            invite,
            copied_ ? L"Convite copiado" : L"Copiar convite",
            false,
            copied_);

        const float profileTop = area.bottom - 88.0f;
        Line(left, profileTop - 10, right, profileTop - 10, borderSoftBrush_.Get(), 1.0f);

        const auto avatar = D2D1::Ellipse(D2D1::Point2F(left + 20, profileTop + 24), 18, 18);
        renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
        renderTarget_->DrawEllipse(avatar, violetBrush_.Get(), 1.0f);
        const std::wstring initial = displayName_.empty() ? L"?" : displayName_.substr(0, 1);
        CenterText(
            initial,
            Rect(left + 2, profileTop + 6, left + 38, profileTop + 42),
            strong_.Get(),
            violet2Brush_.Get());

        Text(
            displayName_.empty() ? L"Participante" : std::wstring_view(displayName_),
            Rect(left + 48, profileTop + 9, right - 10, profileTop + 31),
            bodyStrong_.Get(),
            textBrush_.Get());
        Text(
            networkConnected_ ? L"Online" : L"Offline",
            Rect(left + 48, profileTop + 31, right - 10, profileTop + 51),
            tiny_.Get(),
            networkConnected_ ? greenBrush_.Get() : mutedBrush_.Get());
    }

    void DrawRoomHeader(const D2D1_RECT_F& rect) {
        Fill(rect, panelBrush_.Get());
        Line(rect.left, rect.bottom, rect.right, rect.bottom, borderSoftBrush_.Get(), 1.0f);

        const auto icon = D2D1::RoundedRect(
            Rect(rect.left + 18, rect.top + 17, rect.left + 56, rect.top + 55),
            11, 11);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(rect.left + 27, rect.top + 26, violet2Brush_.Get());

        Text(
            sharing_ ? L"Compartilhando tela" : L"Sala privada",
            Rect(rect.left + 70, rect.top + 14, rect.left + 390, rect.top + 40),
            heading_.Get(),
            textBrush_.Get());

        const std::wstring subtitle = sharing_
            ? (roomState_.activeScreenSharerName.empty()
                ? L"Transmissão ativa"
                : roomState_.activeScreenSharerName + L" está transmitindo")
            : L"Pronto para compartilhar tela ou câmera";
        Text(
            subtitle,
            Rect(rect.left + 70, rect.top + 41, rect.left + 520, rect.top + 62),
            tiny_.Get(),
            mutedBrush_.Get());

        const float right = rect.right - 18.0f;
        const auto quality = D2D1::RoundedRect(
            Rect(right - 246, rect.top + 19, right - 118, rect.top + 51),
            16, 16);
        renderTarget_->FillRoundedRectangle(quality, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(quality, borderBrush_.Get(), 1.0f);
        CenterText(
            L"1080p · " + std::to_wstring(fps_) + L" FPS",
            Rect(right - 238, rect.top + 24, right - 126, rect.top + 47),
            tinyBold_.Get(),
            mutedBrush_.Get());

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(right - 96, rect.top + 35), 4, 4),
            networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        Text(
            networkConnected_ ? L"Excelente" : L"Reconectando",
            Rect(right - 84, rect.top + 24, right, rect.top + 48),
            tiny_.Get(),
            mutedBrush_.Get());
    }

    void DrawRoomActionBar(const D2D1_RECT_F& rect) {
        const float center = (rect.left + rect.right) * 0.5f;
        const float cy = rect.top + 30.0f;
        constexpr float step = 92.0f;

        struct Action {
            int id;
            float x;
            const wchar_t* label;
            bool active;
            bool accent;
            bool danger;
        };

        const std::array<Action, 5> actions{{
            {6, center - step * 2.0f, cameraOn_ ? L"Câmera on" : L"Câmera", cameraOn_, false, false},
            {7, center - step, localScreenSharing_ ? L"Parar tela" : L"Compartilhar", localScreenSharing_, true, false},
            {8, center, systemAudioOn_ ? L"Áudio on" : L"Áudio da tela", systemAudioOn_, false, false},
            {9, center + step, L"Estatísticas", statsOn_, false, false},
            {17, center + step * 2.0f, L"Sair", false, false, true}
        }};

        for (const auto& action : actions) {
            const D2D1_RECT_F hit = Rect(
                action.x - 38,
                cy - 27,
                action.x + 38,
                cy + 48);
            AddHit(action.id, hit);

            const float t = HoverMix(action.id);
            const float radius = 23.0f + t * 2.5f;

            D2D1_COLOR_F base = theme_.panel;
            D2D1_COLOR_F hot = theme_.panel2;
            if (action.accent) {
                base = theme_.violet;
                hot = theme_.violet2;
            }
            if (action.danger) {
                base = theme_.red;
                hot = Hex(0xFF7890);
            }
            if (action.active && !action.accent && !action.danger) {
                base = theme_.violetPanel;
                hot = Hex(0x2A2044);
            }

            ComPtr<ID2D1SolidColorBrush> bg;
            ComPtr<ID2D1SolidColorBrush> border;
            renderTarget_->CreateSolidColorBrush(
                BlendColor(base, hot, t),
                bg.ReleaseAndGetAddressOf());
            renderTarget_->CreateSolidColorBrush(
                BlendColor(theme_.border, theme_.violet, action.active ? 0.8f : t * 0.6f),
                border.ReleaseAndGetAddressOf());

            const auto circle = D2D1::Ellipse(D2D1::Point2F(action.x, cy), radius, radius);
            renderTarget_->FillEllipse(circle, bg.Get());
            if (!action.accent && !action.danger) {
                renderTarget_->DrawEllipse(circle, border.Get(), 1.0f + t * 0.4f);
            }

            ID2D1Brush* icon = textBrush_.Get();
            if (action.id == 6) {
                const auto body = D2D1::RoundedRect(
                    Rect(action.x - 10, cy - 7, action.x + 7, cy + 7),
                    3, 3);
                renderTarget_->DrawRoundedRectangle(body, icon, 1.7f);
                Line(action.x + 7, cy - 4, action.x + 13, cy - 8, icon, 1.6f);
                Line(action.x + 13, cy - 8, action.x + 13, cy + 8, icon, 1.6f);
                Line(action.x + 13, cy + 8, action.x + 7, cy + 4, icon, 1.6f);
            } else if (action.id == 7) {
                DrawMonitor(action.x - 10, cy - 8, icon);
            } else if (action.id == 8) {
                Line(action.x - 10, cy - 5, action.x - 4, cy - 5, icon, 1.8f);
                Line(action.x - 4, cy - 5, action.x + 2, cy - 11, icon, 1.8f);
                Line(action.x + 2, cy - 11, action.x + 2, cy + 11, icon, 1.8f);
                Line(action.x + 2, cy + 11, action.x - 4, cy + 5, icon, 1.8f);
                Line(action.x - 4, cy + 5, action.x - 10, cy + 5, icon, 1.8f);
                renderTarget_->DrawEllipse(
                    D2D1::Ellipse(D2D1::Point2F(action.x + 5, cy), 7, 9),
                    icon,
                    1.4f);
            } else if (action.id == 9) {
                Line(action.x - 9, cy + 8, action.x - 9, cy - 1, icon, 2.0f);
                Line(action.x, cy + 8, action.x, cy - 8, icon, 2.0f);
                Line(action.x + 9, cy + 8, action.x + 9, cy - 13, icon, 2.0f);
            } else {
                Line(action.x - 10, cy, action.x + 10, cy, icon, 2.2f);
            }

            CenterText(
                action.label,
                Rect(action.x - 56, cy + 31, action.x + 56, cy + 50),
                tiny_.Get(),
                action.danger ? redBrush_.Get() : mutedBrush_.Get());
        }

        if (statsOn_) {
            const D2D1_RECT_F pill = Rect(rect.right - 314, rect.top - 34, rect.right, rect.top - 6);
            const auto rr = D2D1::RoundedRect(pill, 14, 14);
            renderTarget_->FillRoundedRectangle(rr, panel2Brush_.Get());
            renderTarget_->DrawRoundedRectangle(rr, borderBrush_.Get(), 1.0f);

            const std::wstring statsText =
                std::wstring(networkConnected_ ? L"Signaling online" : L"Signaling offline") +
                L" · " +
                (mediaConnected_ ? L"LiveKit online" : L"LiveKit standby") +
                L" · " +
                (agoraConnected_ ? L"Agora online" : L"Agora standby");
            CenterText(
                statsText,
                Rect(pill.left + 10, pill.top + 5, pill.right - 10, pill.bottom - 4),
                tiny_.Get(),
                mutedBrush_.Get());
        }

        if (!roomNotice_.empty()) {
            Text(
                roomNotice_,
                Rect(rect.left + 8, rect.bottom - 20, rect.right - 8, rect.bottom - 2),
                tiny_.Get(),
                amberBrush_.Get());
        }
    }

    void DrawStage(const D2D1_RECT_F& area) {
        const bool hasCameras = !cameraFrames_.empty();
        const float expandedDock = hasCameras ? 142.0f : 86.0f;
        const float cameraH = 42.0f + (expandedDock - 42.0f) * dockReveal_;
        const float gap = 12.0f;

        const D2D1_RECT_F screen = Rect(
            area.left,
            area.top,
            area.right,
            std::max(area.top + 220.0f, area.bottom - cameraH - gap));

        DrawScreen(screen);
        DrawStageToolbar(Rect(
            screen.left + 12,
            screen.top + 12,
            screen.right - 12,
            screen.top + 58));

        DrawCameraDock(Rect(
            area.left,
            screen.bottom + gap,
            area.right,
            area.bottom));
    }

    void DrawStageToolbar(const D2D1_RECT_F& rect) {
        const auto barShadow = D2D1::RoundedRect(
            Rect(rect.left + 3, rect.top + 4, rect.right + 3, rect.bottom + 4),
            16, 16);
        ComPtr<ID2D1SolidColorBrush> subtleShadow;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x000000, 0.32f),
            subtleShadow.ReleaseAndGetAddressOf());
        renderTarget_->FillRoundedRectangle(barShadow, subtleShadow.Get());

        const auto bar = D2D1::RoundedRect(rect, 16, 16);
        ComPtr<ID2D1SolidColorBrush> overlay;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x0D0F15, 0.93f),
            overlay.ReleaseAndGetAddressOf());
        renderTarget_->FillRoundedRectangle(bar, overlay.Get());
        renderTarget_->DrawRoundedRectangle(bar, borderSoftBrush_.Get(), 1.0f);

        const auto icon = D2D1::RoundedRect(
            Rect(rect.left + 10, rect.top + 7, rect.left + 42, rect.top + 39),
            10, 10);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(rect.left + 16, rect.top + 13, violet2Brush_.Get());

        const std::wstring sharerName = roomState_.activeScreenSharerName.empty()
            ? (displayName_.empty() ? L"Participante" : displayName_)
            : roomState_.activeScreenSharerName;

        Text(
            sharing_
                ? sharerName + L" está compartilhando a tela"
                : L"Nenhuma transmissão ativa",
            Rect(rect.left + 52, rect.top + 5, rect.left + 410, rect.top + 26),
            bodyStrong_.Get(),
            textBrush_.Get());
        Text(
            sharing_ ? L"AO VIVO" : L"Compartilhe um monitor ou uma janela",
            Rect(rect.left + 52, rect.top + 25, rect.left + 360, rect.top + 43),
            tinyBold_.Get(),
            sharing_ ? greenBrush_.Get() : mutedBrush_.Get());

        const auto quality = D2D1::RoundedRect(
            Rect(rect.right - 204, rect.top + 8, rect.right - 102, rect.top + 38),
            15, 15);
        renderTarget_->FillRoundedRectangle(quality, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(quality, borderSoftBrush_.Get(), 1.0f);
        CenterText(
            L"1080p " + std::to_wstring(fps_) + L" FPS",
            Rect(rect.right - 198, rect.top + 13, rect.right - 108, rect.top + 35),
            tinyBold_.Get(),
            mutedBrush_.Get());

        DrawAnimatedButton(
            2,
            Rect(rect.right - 90, rect.top + 7, rect.right - 8, rect.top + 39),
            focused_ ? L"Sair" : L"Focar",
            false,
            focused_);
    }

    void DrawScreen(const D2D1_RECT_F& rect) {
        const float glowAlpha = 0.04f + shareReveal_ * 0.13f;
        ComPtr<ID2D1SolidColorBrush> glowBrush;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x7857FF, glowAlpha),
            glowBrush.ReleaseAndGetAddressOf());

        const auto glow = D2D1::RoundedRect(
            Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
            19, 19);
        renderTarget_->FillRoundedRectangle(glow, glowBrush.Get());

        const auto shadow = D2D1::RoundedRect(
            Rect(rect.left + 7, rect.top + 9, rect.right + 7, rect.bottom + 9),
            18, 18);
        renderTarget_->FillRoundedRectangle(shadow, shadowBrush_.Get());

        const auto screen = D2D1::RoundedRect(rect, 18, 18);
        renderTarget_->FillRoundedRectangle(screen, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(
            screen,
            sharing_ ? violetBrush_.Get() : borderBrush_.Get(),
            1.0f + shareReveal_ * 0.35f);

        if (sharing_) {
            if (DrawFrame(screenFrame_, rect, true)) return;

            const float cx = (rect.left + rect.right) * 0.5f;
            const float cy = (rect.top + rect.bottom) * 0.5f - 18.0f;
            const auto icon = D2D1::RoundedRect(Rect(cx - 30, cy - 30, cx + 30, cy + 30), 17, 17);
            renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
            DrawMonitor(cx - 10, cy - 8, violet2Brush_.Get());

            CenterText(
                L"Conectando à transmissão…",
                Rect(rect.left + 40, cy + 44, rect.right - 40, cy + 70),
                heading_.Get(),
                textBrush_.Get());
            CenterText(
                L"O vídeo aparece aqui assim que os primeiros frames chegarem.",
                Rect(rect.left + 40, cy + 75, rect.right - 40, cy + 99),
                body_.Get(),
                mutedBrush_.Get());
            return;
        }

        const float cx = (rect.left + rect.right) * 0.5f;
        const float cy = (rect.top + rect.bottom) * 0.5f - 12.0f;

        const auto halo = D2D1::Ellipse(D2D1::Point2F(cx, cy), 56, 56);
        ComPtr<ID2D1SolidColorBrush> haloBrush;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x7857FF, 0.08f),
            haloBrush.ReleaseAndGetAddressOf());
        renderTarget_->FillEllipse(halo, haloBrush.Get());

        const auto icon = D2D1::RoundedRect(Rect(cx - 30, cy - 30, cx + 30, cy + 30), 17, 17);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(cx - 11, cy - 9, violet2Brush_.Get());

        CenterText(
            L"Nenhuma tela sendo compartilhada",
            Rect(rect.left + 40, cy + 46, rect.right - 40, cy + 72),
            heading_.Get(),
            textBrush_.Get());
        CenterText(
            L"Compartilhe um monitor ou uma janela para começar.",
            Rect(rect.left + 40, cy + 78, rect.right - 40, cy + 102),
            body_.Get(),
            mutedBrush_.Get());
    }

    void DrawStageMeta(const D2D1_RECT_F& rect) {
        Line(rect.left, rect.top, rect.right, rect.top, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(rect.left + 18, rect.top + 24), 4, 4),
            greenBrush_.Get());

        const std::wstring sharer = roomState_.activeScreenSharerName.empty()
            ? (displayName_.empty() ? L"Participante" : displayName_)
            : roomState_.activeScreenSharerName;
        Text(sharer, Rect(rect.left + 30, rect.top + 8, rect.left + 160, rect.top + 28),
             bodyStrong_.Get(), textBrush_.Get());

        const std::wstring provider = roomState_.screenProvider == L"livekit" ? L"LiveKit" : L"Agora";
        const std::wstring providerLine = L"Compartilhando via " + provider;
        Text(providerLine, Rect(rect.left + 30, rect.top + 27, rect.left + 220, rect.top + 44),
             tiny_.Get(), mutedBrush_.Get());

        const auto badge = D2D1::RoundedRect(
            Rect(rect.right - 126, rect.top + 10, rect.right - 10, rect.top + 38),
            14, 14);
        renderTarget_->FillRoundedRectangle(badge, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(badge, borderBrush_.Get(), 1.0f);
        const std::wstring quality = L"1080p · " + std::to_wstring(fps_) + L" FPS";
        CenterText(quality,
                   Rect(rect.right - 120, rect.top + 14, rect.right - 16, rect.top + 35),
                   tinyBold_.Get(), mutedBrush_.Get());
    }

    bool DrawFrame(
        CameraFrameCache& frame,
        const D2D1_RECT_F& destination,
        bool contain = false) {

        if (frame.width <= 0 || frame.height <= 0 || frame.bgra.empty()) return false;
        const size_t required =
            static_cast<size_t>(frame.width) * static_cast<size_t>(frame.height) * 4u;
        if (frame.bgra.size() < required) return false;

        if (!frame.bitmap ||
            static_cast<int>(frame.bitmap->GetPixelSize().width) != frame.width ||
            static_cast<int>(frame.bitmap->GetPixelSize().height) != frame.height) {
            frame.bitmap.Reset();
            const D2D1_BITMAP_PROPERTIES properties = D2D1::BitmapProperties(
                D2D1::PixelFormat(
                    DXGI_FORMAT_B8G8R8A8_UNORM,
                    D2D1_ALPHA_MODE_IGNORE),
                static_cast<float>(dpi_),
                static_cast<float>(dpi_));

            const HRESULT created = renderTarget_->CreateBitmap(
                D2D1::SizeU(
                    static_cast<UINT32>(frame.width),
                    static_cast<UINT32>(frame.height)),
                frame.bgra.data(),
                static_cast<UINT32>(frame.width * 4),
                properties,
                frame.bitmap.ReleaseAndGetAddressOf());

            if (FAILED(created)) return false;
            frame.dirty = false;
        } else if (frame.dirty) {
            if (FAILED(frame.bitmap->CopyFromMemory(
                    nullptr,
                    frame.bgra.data(),
                    static_cast<UINT32>(frame.width * 4)))) {
                frame.bitmap.Reset();
                return false;
            }
            frame.dirty = false;
        }

        const D2D1_SIZE_F bitmapSize = frame.bitmap->GetSize();
        const float destinationWidth = destination.right - destination.left;
        const float destinationHeight = destination.bottom - destination.top;
        if (destinationWidth <= 0 || destinationHeight <= 0 ||
            bitmapSize.width <= 0 || bitmapSize.height <= 0) {
            return false;
        }

        const float sourceAspect = bitmapSize.width / bitmapSize.height;
        const float destinationAspect = destinationWidth / destinationHeight;
        D2D1_RECT_F source = Rect(0, 0, bitmapSize.width, bitmapSize.height);
        D2D1_RECT_F drawDestination = destination;

        if (contain) {
            if (sourceAspect > destinationAspect) {
                const float fittedHeight = destinationWidth / sourceAspect;
                const float inset = (destinationHeight - fittedHeight) * 0.5f;
                drawDestination.top += inset;
                drawDestination.bottom -= inset;
            } else {
                const float fittedWidth = destinationHeight * sourceAspect;
                const float inset = (destinationWidth - fittedWidth) * 0.5f;
                drawDestination.left += inset;
                drawDestination.right -= inset;
            }
        } else if (sourceAspect > destinationAspect) {
            const float wantedWidth = bitmapSize.height * destinationAspect;
            const float crop = (bitmapSize.width - wantedWidth) * 0.5f;
            source.left += crop;
            source.right -= crop;
        } else if (sourceAspect < destinationAspect) {
            const float wantedHeight = bitmapSize.width / destinationAspect;
            const float crop = (bitmapSize.height - wantedHeight) * 0.5f;
            source.top += crop;
            source.bottom -= crop;
        }

        renderTarget_->PushAxisAlignedClip(destination, D2D1_ANTIALIAS_MODE_PER_PRIMITIVE);
        renderTarget_->DrawBitmap(
            frame.bitmap.Get(),
            drawDestination,
            1.0f,
            D2D1_BITMAP_INTERPOLATION_MODE_LINEAR,
            source);
        renderTarget_->PopAxisAlignedClip();
        return true;
    }

    bool DrawCameraFrame(std::wstring_view identity, const D2D1_RECT_F& destination) {
        auto it = cameraFrames_.find(std::wstring(identity));
        return it != cameraFrames_.end() && DrawFrame(it->second, destination);
    }

    void DrawCameraDock(const D2D1_RECT_F& rect) {
        const auto dock = D2D1::RoundedRect(rect, 14, 14);
        renderTarget_->FillRoundedRectangle(dock, panel3Brush_.Get());
        renderTarget_->DrawRoundedRectangle(dock, borderSoftBrush_.Get(), 1.0f);

        const D2D1_RECT_F toggle = Rect(rect.left, rect.top, rect.right, std::min(rect.bottom, rect.top + 38));
        AddHit(10, toggle);

        std::vector<const lunira::Participant*> active;
        active.reserve(roomState_.participants.size());
        for (const auto& participant : roomState_.participants) {
            if (cameraFrames_.contains(participant.id)) {
                active.push_back(&participant);
            }
        }

        Text(
            L"Câmeras",
            Rect(rect.left + 14, rect.top + 8, rect.left + 80, rect.top + 29),
            bodyStrong_.Get(),
            textBrush_.Get());

        const std::wstring dockStatus = active.empty()
            ? L"Nenhuma ligada"
            : std::to_wstring(active.size()) + (active.size() == 1 ? L" ligada" : L" ligadas");
        Text(
            dockStatus,
            Rect(rect.left + 82, rect.top + 9, rect.left + 190, rect.top + 29),
            tiny_.Get(),
            mutedBrush_.Get());

        CenterText(
            camerasOpen_ ? L"⌄" : L"⌃",
            Rect(rect.right - 36, rect.top + 7, rect.right - 12, rect.top + 30),
            strong_.Get(),
            mutedBrush_.Get());

        cameraHitIdentities_.fill({});
        if (dockReveal_ < 0.08f || rect.bottom - rect.top < 55.0f) return;

        if (active.empty()) {
            CenterText(
                mediaConnected_
                    ? L"Ninguém está com a câmera ligada."
                    : L"Câmeras aparecem aqui quando alguém ligar.",
                Rect(rect.left + 20, rect.top + 42, rect.right - 20, rect.bottom - 12),
                body_.Get(),
                mutedBrush_.Get());
            return;
        }

        const size_t count = std::min<size_t>(cameraHitIdentities_.size(), active.size());
        const float gap = 10.0f;
        const float tileTop = rect.top + 40.0f;
        const float tileBottom = rect.bottom - 8.0f;
        const float available = rect.right - rect.left - 20.0f;
        const float tileW = std::min(
            220.0f,
            (available - gap * static_cast<float>(count - 1)) /
                static_cast<float>(count));
        const float rowW =
            tileW * static_cast<float>(count) +
            gap * static_cast<float>(count - 1);
        const float startX = rect.left + 10.0f + (available - rowW) * 0.5f;

        static constexpr std::array<unsigned, 6> backgrounds{
            0x201A34, 0x172331, 0x2B1B32, 0x20263A, 0x2D2338, 0x183034
        };

        for (size_t i = 0; i < count; ++i) {
            const auto& participant = *active[i];
            cameraHitIdentities_[i] = participant.id;
            const float x = startX + static_cast<float>(i) * (tileW + gap);
            const D2D1_RECT_F tile = Rect(x, tileTop, x + tileW, tileBottom);

            const std::wstring initial = participant.displayName.empty()
                ? L"?"
                : participant.displayName.substr(0, 1);
            const bool self = participant.displayName == displayName_;

            DrawCameraTile(
                30 + static_cast<int>(i),
                tile,
                participant.id,
                participant.displayName,
                self ? std::wstring_view(L"VOCÊ") : std::wstring_view{},
                backgrounds[i],
                initial);
        }

        if (active.size() > count) {
            Text(
                L"+" + std::to_wstring(active.size() - count),
                Rect(rect.right - 74, rect.top + 9, rect.right - 42, rect.top + 29),
                tinyBold_.Get(),
                violet2Brush_.Get());
        }
    }

    void DrawCameraTile(
        int hitId,
        const D2D1_RECT_F& rect,
        std::wstring_view identity,
        std::wstring_view name,
        std::wstring_view badge,
        unsigned background,
        std::wstring_view initial) {

        AddHit(hitId, rect);
        const float t = HoverMix(hitId);
        const float lift = t * 2.0f;
        const D2D1_RECT_F tile = Rect(
            rect.left,
            rect.top - lift,
            rect.right,
            rect.bottom - lift);

        ComPtr<ID2D1SolidColorBrush> bg;
        ComPtr<ID2D1SolidColorBrush> border;
        renderTarget_->CreateSolidColorBrush(
            Hex(background),
            bg.ReleaseAndGetAddressOf());
        renderTarget_->CreateSolidColorBrush(
            BlendColor(theme_.border, theme_.violet, t),
            border.ReleaseAndGetAddressOf());

        const auto rr = D2D1::RoundedRect(tile, 12, 12);
        renderTarget_->FillRoundedRectangle(rr, bg.Get());
        renderTarget_->DrawRoundedRectangle(rr, border.Get(), 1.0f + t * 0.7f);

        const D2D1_RECT_F videoRect = Rect(
            tile.left,
            tile.top,
            tile.right,
            tile.bottom - 30);
        if (!DrawCameraFrame(identity, videoRect)) {
            const float cx = (videoRect.left + videoRect.right) * 0.5f;
            const float cy = (videoRect.top + videoRect.bottom) * 0.5f;
            const auto avatar = D2D1::Ellipse(D2D1::Point2F(cx, cy), 22, 22);
            renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
            CenterText(
                initial,
                Rect(cx - 22, cy - 22, cx + 22, cy + 22),
                heading_.Get(),
                violet2Brush_.Get());
        }

        ComPtr<ID2D1SolidColorBrush> footer;
        renderTarget_->CreateSolidColorBrush(
            Hex(0x090B10, 0.94f),
            footer.ReleaseAndGetAddressOf());
        Fill(Rect(tile.left, tile.bottom - 30, tile.right, tile.bottom), footer.Get());

        Text(
            name,
            Rect(tile.left + 10, tile.bottom - 25, tile.right - 66, tile.bottom - 7),
            bodyStrong_.Get(),
            textBrush_.Get());

        if (!badge.empty()) {
            const auto tag = D2D1::RoundedRect(
                Rect(tile.right - 56, tile.bottom - 24, tile.right - 8, tile.bottom - 8),
                8, 8);
            renderTarget_->FillRoundedRectangle(tag, violetPanelBrush_.Get());
            CenterText(
                badge,
                Rect(tile.right - 53, tile.bottom - 23, tile.right - 11, tile.bottom - 8),
                tinyBold_.Get(),
                violet2Brush_.Get());
        }
    }

    void DrawSidebar(const D2D1_RECT_F& area) {
        float y = area.top;

        DrawInviteCard(Rect(area.left, y, area.right, y + 142));
        y += 154;

        DrawQualityCard(Rect(area.left, y, area.right, y + 226));
        y += 238;

        DrawControlsCard(Rect(area.left, y, area.right, area.bottom));
    }

    void DrawInviteCard(const D2D1_RECT_F& rect) {
        Card(rect);

        Text(L"Sala privada", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 35),
             strong_.Get(), textBrush_.Get());
        Text(L"Compartilhe só com quem você quiser.",
             Rect(rect.left + 16, rect.top + 37, rect.right - 16, rect.top + 56),
             tiny_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F code = Rect(rect.left + 16, rect.top + 70, rect.right - 16, rect.top + 114);
        const auto codeRr = D2D1::RoundedRect(code, 11, 11);
        renderTarget_->FillRoundedRectangle(codeRr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(codeRr, borderBrush_.Get(), 1.0f);

        Text(roomCode_.empty() ? L"—" : std::wstring_view(roomCode_),
             Rect(code.left + 14, code.top + 11, code.right - 54, code.bottom - 8),
             strong_.Get(), textBrush_.Get());

        const D2D1_RECT_F copy = Rect(code.right - 40, code.top + 5, code.right - 5, code.bottom - 5);
        AddHit(3, copy);

        if (hover_ == 3) {
            const auto copyGlow = D2D1::RoundedRect(
                Rect(copy.left - 2, copy.top - 2, copy.right + 2, copy.bottom + 2),
                10, 10);
            renderTarget_->FillRoundedRectangle(copyGlow, violetGlowBrush_.Get());
        }

        const auto copyRr = D2D1::RoundedRect(copy, 8, 8);
        renderTarget_->FillRoundedRectangle(
            copyRr,
            hover_ == 3 ? violet2Brush_.Get() : violetBrush_.Get());
        CenterText(L"⧉", copy, strong_.Get(), textBrush_.Get());

        if (copied_) {
            Text(L"Convite copiado",
                 Rect(rect.left + 16, rect.top + 118, rect.right - 16, rect.bottom - 7),
                 tiny_.Get(), greenBrush_.Get());
        }
    }

    void DrawQualityCard(const D2D1_RECT_F& rect) {
        Card(rect);

        Text(L"Qualidade", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 35),
             strong_.Get(), textBrush_.Get());
        Text(L"Vídeo da tela usa Agora.",
             Rect(rect.left + 16, rect.top + 37, rect.right - 16, rect.top + 56),
             tiny_.Get(), mutedBrush_.Get());

        Text(L"RESOLUÇÃO", Rect(rect.left + 16, rect.top + 72, rect.right - 16, rect.top + 88),
             tinyBold_.Get(), dimBrush_.Get());
        SelectBox(Rect(rect.left + 16, rect.top + 92, rect.right - 16, rect.top + 130), L"1080p");

        Text(L"FPS", Rect(rect.left + 16, rect.top + 145, rect.right - 16, rect.top + 161),
             tinyBold_.Get(), dimBrush_.Get());

        const float middle = (rect.left + rect.right) * 0.5f;
        const D2D1_RECT_F fps30 = Rect(rect.left + 16, rect.top + 166, middle - 4, rect.top + 202);
        const D2D1_RECT_F fps60 = Rect(middle + 4, rect.top + 166, rect.right - 16, rect.top + 202);
        AddHit(4, fps30);
        AddHit(5, fps60);
        ToggleButton(fps30, L"30 FPS", fps_ == 30, hover_ == 4);
        ToggleButton(fps60, L"60 FPS", fps_ == 60, hover_ == 5);
    }

    void DrawCameraOverlay(float width, float height) {
        const auto participantIt = std::find_if(
            roomState_.participants.begin(),
            roomState_.participants.end(),
            [this](const lunira::Participant& participant) {
                return participant.id == selectedCameraIdentity_;
            });

        if (participantIt == roomState_.participants.end() ||
            !cameraFrames_.contains(selectedCameraIdentity_)) {
            selectedCameraIdentity_.clear();
            cameraOverlayLarge_ = false;
            return;
        }

        const auto& participant = *participantIt;
        const bool large = cameraOverlayLarge_;
        const float overlayW = large ? 560.0f : 390.0f;
        const float overlayH = large ? 330.0f : 236.0f;
        const float right = width - 34.0f;
        const float bottom = height - 34.0f;
        const D2D1_RECT_F rect = Rect(right - overlayW, bottom - overlayH, right, bottom);

        const auto shadow = D2D1::RoundedRect(
            Rect(rect.left + 8, rect.top + 10, rect.right + 8, rect.bottom + 10),
            15, 15);
        ComPtr<ID2D1SolidColorBrush> shadowBrush;
        renderTarget_->CreateSolidColorBrush(Hex(0x000000, 0.42f), shadowBrush.ReleaseAndGetAddressOf());
        renderTarget_->FillRoundedRectangle(shadow, shadowBrush.Get());

        const auto card = D2D1::RoundedRect(rect, 14, 14);
        renderTarget_->FillRoundedRectangle(card, panelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(card, violetBrush_.Get(), 1.2f);

        const D2D1_RECT_F video = Rect(rect.left + 10, rect.top + 10, rect.right - 10, rect.bottom - 42);
        const auto videoRr = D2D1::RoundedRect(video, 10, 10);
        renderTarget_->FillRoundedRectangle(videoRr, violetPanelBrush_.Get());

        if (!DrawCameraFrame(participant.id, video)) {
            const std::wstring initial = participant.displayName.empty()
                ? L"?"
                : participant.displayName.substr(0, 1);
            const float cx = (video.left + video.right) * 0.5f;
            const float cy = (video.top + video.bottom) * 0.5f;
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), large ? 38.0f : 30.0f, large ? 38.0f : 30.0f),
                violetBrush_.Get());
            CenterText(initial,
                       Rect(cx - 34, cy - 34, cx + 34, cy + 34),
                       title_.Get(), textBrush_.Get());
        }

        const std::wstring label = participant.displayName +
            (participant.displayName == displayName_ ? L" · VOCÊ" : L"");
        Text(label,
             Rect(rect.left + 14, rect.bottom - 34, rect.right - 100, rect.bottom - 10),
             bodyStrong_.Get(), textBrush_.Get());

        const D2D1_RECT_F resize = Rect(rect.right - 78, rect.bottom - 36, rect.right - 46, rect.bottom - 8);
        const D2D1_RECT_F close = Rect(rect.right - 40, rect.bottom - 36, rect.right - 8, rect.bottom - 8);
        AddHit(15, resize);
        AddHit(14, close);
        Button(resize, large ? L"−" : L"+", false, hover_ == 15);
        Button(close, L"×", false, hover_ == 14);
    }

    void DrawControlsCard(const D2D1_RECT_F& rect) {
        Card(rect);

        Text(L"Controles", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 35),
             strong_.Get(), textBrush_.Get());

        const D2D1_RECT_F share = Rect(rect.left + 16, rect.top + 50, rect.right - 16, rect.top + 96);
        AddHit(7, share);
        const std::wstring shareLabel = screenShareStarting_
            ? L"Iniciando transmissão…"
            : localScreenSharing_ ? L"Parar transmissão"
            : sharing_ ? L"Tela em uso"
            : L"Compartilhar tela";
        PrimaryButton(
            share,
            shareLabel,
            localScreenSharing_,
            hover_ == 7);

        const float middle = (rect.left + rect.right) * 0.5f;
        const D2D1_RECT_F camera = Rect(rect.left + 16, rect.top + 108, middle - 4, rect.top + 150);
        const D2D1_RECT_F stats = Rect(middle + 4, rect.top + 108, rect.right - 16, rect.top + 150);
        AddHit(6, camera);
        AddHit(9, stats);
        Button(camera, cameraOn_ ? L"Câmera on" : L"Câmera", cameraOn_, hover_ == 6);
        Button(stats, L"Stats", statsOn_, hover_ == 9);

        const D2D1_RECT_F audio = Rect(rect.left + 16, rect.top + 160, rect.right - 16, rect.top + 202);
        AddHit(8, audio);
        Button(audio,
               systemAudioOn_ ? L"Áudio da tela ligado" : L"Áudio da tela",
               systemAudioOn_,
               hover_ == 8);

        if (statsOn_) {
            Text(networkConnected_ ? L"Sinalização online" : L"Sinalização offline",
                 Rect(rect.left + 18, rect.top + 214, rect.right - 18, rect.top + 233),
                 tiny_.Get(),
                 networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        }

        if (!roomNotice_.empty()) {
            const D2D1_RECT_F notice = Rect(
                rect.left + 16,
                std::max(rect.top + 242, rect.bottom - 72),
                rect.right - 16,
                rect.bottom - 14);
            const auto noticeRr = D2D1::RoundedRect(notice, 10, 10);
            renderTarget_->FillRoundedRectangle(noticeRr, panel3Brush_.Get());
            renderTarget_->DrawRoundedRectangle(noticeRr, amberBrush_.Get(), 1.0f);
            Text(roomNotice_,
                 Rect(notice.left + 12, notice.top + 10, notice.right - 12, notice.bottom - 8),
                 tiny_.Get(), mutedBrush_.Get());
        }
    }

    void DrawSettings(float rail, float top, float width, float height) {
        const float left = rail + 34;
        const float right = width - 34;

        Text(L"Ajustes", Rect(left, top + 32, right, top + 66), title_.Get(), textBrush_.Get());
        Text(L"Preferências do aplicativo Windows.",
             Rect(left, top + 70, right, top + 94), body_.Get(), mutedBrush_.Get());

        const float cardW = std::min(660.0f, right - left);
        const D2D1_RECT_F performance = Rect(left, top + 120, left + cardW, top + 326);
        Card(performance);

        Text(L"Desempenho",
             Rect(performance.left + 18, performance.top + 18, performance.right - 18, performance.top + 43),
             strong_.Get(), textBrush_.Get());
        Text(L"A interface nativa só redesenha quando algo muda.",
             Rect(performance.left + 18, performance.top + 50, performance.right - 18, performance.top + 72),
             body_.Get(), mutedBrush_.Get());

        SettingRow(Rect(performance.left + 18, performance.top + 92, performance.right - 18, performance.top + 136),
                   L"Animações sutis", L"Sem animações contínuas pesadas", true);
        SettingRow(Rect(performance.left + 18, performance.top + 144, performance.right - 18, performance.top + 188),
                   L"Aceleração por GPU", L"Direct2D para a interface", true);

        const float updateTop = performance.bottom + 24.0f;
        const float updateBottom = std::min(height - 28.0f, updateTop + 208.0f);
        const D2D1_RECT_F updateCard = Rect(left, updateTop, left + cardW, updateBottom);
        Card(updateCard);

        Text(L"Atualizações",
             Rect(updateCard.left + 18, updateCard.top + 18, updateCard.right - 18, updateCard.top + 43),
             strong_.Get(), textBrush_.Get());

        const std::wstring versionLine =
            L"Versão instalada: " + lunira::UpdaterClient::CurrentVersion();
        Text(versionLine,
             Rect(updateCard.left + 18, updateCard.top + 48, updateCard.right - 18, updateCard.top + 70),
             body_.Get(), mutedBrush_.Get());

        ID2D1Brush* stateBrush = updateAvailable_
            ? violet2Brush_.Get()
            : (updateDownloading_ ? amberBrush_.Get() : greenBrush_.Get());
        renderTarget_->FillEllipse(
            D2D1::Ellipse(
                D2D1::Point2F(updateCard.left + 22, updateCard.top + 92),
                4.0f, 4.0f),
            stateBrush);

        Text(updateStatus_.empty() ? L"Verificação automática ativada." : std::wstring_view(updateStatus_),
             Rect(updateCard.left + 34, updateCard.top + 80, updateCard.right - 18, updateCard.top + 105),
             body_.Get(), textBrush_.Get());

        if (updateDownloading_ && updateProgress_ >= 0) {
            const D2D1_RECT_F track = Rect(
                updateCard.left + 18,
                updateCard.top + 116,
                updateCard.right - 18,
                updateCard.top + 122);
            const auto trackRr = D2D1::RoundedRect(track, 3, 3);
            renderTarget_->FillRoundedRectangle(trackRr, panel3Brush_.Get());
            const float fraction = std::clamp(updateProgress_ / 100.0f, 0.0f, 1.0f);
            const auto progressRr = D2D1::RoundedRect(
                Rect(track.left, track.top, track.left + (track.right - track.left) * fraction, track.bottom),
                3, 3);
            renderTarget_->FillRoundedRectangle(progressRr, violetBrush_.Get());
        }

        const D2D1_RECT_F action = Rect(
            updateCard.left + 18,
            updateCard.bottom - 58,
            updateCard.right - 18,
            updateCard.bottom - 14);
        AddHit(18, action);

        std::wstring actionLabel;
        if (updater_.IsBusy()) {
            actionLabel = updateDownloading_
                ? L"Baixando atualização…"
                : L"Verificando…";
        } else if (updateAvailable_) {
            actionLabel = L"Baixar e atualizar para " + updateLatestVersion_;
        } else {
            actionLabel = L"Verificar atualizações";
        }

        if (updateAvailable_) {
            PrimaryButton(action, actionLabel, false, hover_ == 18);
        } else {
            Button(action, actionLabel, false, hover_ == 18);
        }
    }

    void SettingRow(const D2D1_RECT_F& rect, std::wstring_view title, std::wstring_view subtitle, bool on) {
        const auto rr = D2D1::RoundedRect(rect, 9, 9);
        renderTarget_->FillRoundedRectangle(rr, panel3Brush_.Get());
        renderTarget_->DrawRoundedRectangle(rr, borderSoftBrush_.Get(), 1.0f);

        Text(title, Rect(rect.left + 12, rect.top + 6, rect.right - 90, rect.top + 25),
             bodyStrong_.Get(), textBrush_.Get());
        Text(subtitle, Rect(rect.left + 12, rect.top + 24, rect.right - 90, rect.bottom - 5),
             tiny_.Get(), mutedBrush_.Get());

        const auto toggle = D2D1::RoundedRect(Rect(rect.right - 58, rect.top + 11, rect.right - 12, rect.top + 33), 11, 11);
        renderTarget_->FillRoundedRectangle(toggle, on ? violetBrush_.Get() : panel2Brush_.Get());
        const float knobX = on ? rect.right - 24 : rect.right - 46;
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(knobX, rect.top + 22), 8, 8), textBrush_.Get());
    }

    void Card(const D2D1_RECT_F& rect) {
        const auto shadow = D2D1::RoundedRect(
            Rect(rect.left + 5, rect.top + 7, rect.right + 5, rect.bottom + 7),
            14, 14);
        renderTarget_->FillRoundedRectangle(shadow, shadowBrush_.Get());

        const auto rr = D2D1::RoundedRect(rect, 14, 14);
        renderTarget_->FillRoundedRectangle(rr, panelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(rr, borderBrush_.Get(), 1.0f);
    }

    void SelectBox(const D2D1_RECT_F& rect, std::wstring_view text) {
        const auto rr = D2D1::RoundedRect(rect, 8, 8);
        renderTarget_->FillRoundedRectangle(rr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(rr, borderBrush_.Get(), 1.0f);
        Text(text, Rect(rect.left + 12, rect.top + 8, rect.right - 32, rect.bottom - 6),
             body_.Get(), textBrush_.Get());
        Text(L"⌄", Rect(rect.right - 27, rect.top + 8, rect.right - 10, rect.bottom - 6),
             bodyStrong_.Get(), mutedBrush_.Get());
    }

    void Button(const D2D1_RECT_F& rect, std::wstring_view label, bool active, bool hover) {
        if (hover || active) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                12, 12);
            renderTarget_->FillRoundedRectangle(glow, violetGlowBrush_.Get());
        }

        const auto rr = D2D1::RoundedRect(rect, 10, 10);
        renderTarget_->FillRoundedRectangle(
            rr,
            active ? violetPanelBrush_.Get() : (hover ? panel2Brush_.Get() : panel3Brush_.Get()));
        renderTarget_->DrawRoundedRectangle(
            rr,
            active ? violetBrush_.Get() : borderBrush_.Get(),
            1.0f);
        CenterText(label, Rect(rect.left + 8, rect.top + 4, rect.right - 8, rect.bottom - 4),
                   bodyStrong_.Get(), active ? violet2Brush_.Get() : textBrush_.Get());
    }

    void PrimaryButton(const D2D1_RECT_F& rect, std::wstring_view label, bool danger, bool hover) {
        if (!danger) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 3, rect.top - 3, rect.right + 3, rect.bottom + 3),
                14, 14);
            renderTarget_->FillRoundedRectangle(glow, violetGlowBrush_.Get());
        }

        const auto rr = D2D1::RoundedRect(rect, 11, 11);
        renderTarget_->FillRoundedRectangle(
            rr,
            danger ? redBrush_.Get() : (hover ? violet2Brush_.Get() : violetBrush_.Get()));
        CenterText(label, Rect(rect.left + 8, rect.top + 5, rect.right - 8, rect.bottom - 5),
                   bodyStrong_.Get(), textBrush_.Get());
    }

    void ToggleButton(const D2D1_RECT_F& rect, std::wstring_view label, bool active, bool hover) {
        if (active || hover) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                11, 11);
            renderTarget_->FillRoundedRectangle(glow, violetGlowBrush_.Get());
        }
        const auto rr = D2D1::RoundedRect(rect, 10, 10);
        renderTarget_->FillRoundedRectangle(
            rr,
            active ? violetPanelBrush_.Get() : (hover ? panel2Brush_.Get() : stageBrush_.Get()));
        renderTarget_->DrawRoundedRectangle(
            rr,
            active ? violetBrush_.Get() : borderBrush_.Get(),
            1.0f);
        CenterText(label, Rect(rect.left + 4, rect.top + 4, rect.right - 4, rect.bottom - 4),
                   tinyBold_.Get(), active ? violet2Brush_.Get() : mutedBrush_.Get());
    }

    void Pill(const D2D1_RECT_F& rect, std::wstring_view label,
              ID2D1Brush* background, ID2D1Brush* foreground) {
        const auto rr = D2D1::RoundedRect(rect, 15, 15);
        renderTarget_->FillRoundedRectangle(rr, background);
        renderTarget_->DrawRoundedRectangle(rr, borderBrush_.Get(), 1.0f);
        CenterText(label, Rect(rect.left + 8, rect.top + 4, rect.right - 8, rect.bottom - 4),
                   tinyBold_.Get(), foreground);
    }

    void DrawMonitor(float x, float y, ID2D1Brush* brush) {
        const auto monitor = D2D1::RoundedRect(Rect(x, y, x + 20, y + 14), 2, 2);
        renderTarget_->DrawRoundedRectangle(monitor, brush, 1.7f);
        Line(x + 10, y + 14, x + 10, y + 19, brush, 1.5f);
        Line(x + 5, y + 19, x + 15, y + 19, brush, 1.5f);
    }

    void Fill(const D2D1_RECT_F& rect, ID2D1Brush* brush) {
        renderTarget_->FillRectangle(rect, brush);
    }

    void Line(float x1, float y1, float x2, float y2, ID2D1Brush* brush, float width) {
        renderTarget_->DrawLine(D2D1::Point2F(x1, y1), D2D1::Point2F(x2, y2), brush, width);
    }

    void Text(std::wstring_view text, const D2D1_RECT_F& rect,
              IDWriteTextFormat* format, ID2D1Brush* brush) {
        format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
        renderTarget_->DrawTextW(
            text.data(),
            static_cast<UINT32>(text.size()),
            format,
            rect,
            brush,
            D2D1_DRAW_TEXT_OPTIONS_CLIP);
    }

    void CenterText(std::wstring_view text, const D2D1_RECT_F& rect,
                    IDWriteTextFormat* format, ID2D1Brush* brush) {
        format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
        renderTarget_->DrawTextW(
            text.data(),
            static_cast<UINT32>(text.size()),
            format,
            rect,
            brush,
            D2D1_DRAW_TEXT_OPTIONS_CLIP);
        format->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
    }

    void AddHit(int id, const D2D1_RECT_F& rect) {
        if (hitCount_ >= hits_.size()) return;
        hits_[hitCount_++] = Hit{ id, rect };
    }

    int HitTest(float x, float y) const {
        for (size_t i = 0; i < hitCount_; ++i) {
            const auto& h = hits_[i];
            if (x >= h.rect.left && x <= h.rect.right &&
                y >= h.rect.top && y <= h.rect.bottom) {
                return h.id;
            }
        }
        return -1;
    }

    void MouseMove(int px, int py) {
        if (!trackingMouse_) {
            TRACKMOUSEEVENT event{ sizeof(event), TME_LEAVE, hwnd_, 0 };
            TrackMouseEvent(&event);
            trackingMouse_ = true;
        }

        const int next = HitTest(ToDip(px), ToDip(py));
        if (next != hover_) {
            hover_ = next;
            StartAnimationTimer();
        }
    }

    void HandleChar(wchar_t ch) {
        if (page_ != Page::Home || focusedField_ == Field::None) return;

        if (ch == L'\t') {
            focusedField_ = focusedField_ == Field::Name ? Field::Code : Field::Name;
            homeError_.clear();
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        if (ch == L'\r') {
            if (focusedField_ == Field::Code) BeginJoinRoom();
            else BeginCreateRoom();
            return;
        }

        std::wstring* target = focusedField_ == Field::Name ? &displayName_ : &roomCodeInput_;
        if (ch == L'\b') {
            if (!target->empty()) target->pop_back();
            homeError_.clear();
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        if (focusedField_ == Field::Name) {
            if (ch >= 32 && ch != 127 && displayName_.size() < 20) {
                displayName_.push_back(ch);
                homeError_.clear();
                InvalidateRect(hwnd_, nullptr, FALSE);
            }
            return;
        }

        wchar_t upper = static_cast<wchar_t>(std::towupper(ch));
        const bool validLetter = upper >= L'A' && upper <= L'Z';
        const bool validDigit = upper >= L'2' && upper <= L'9';
        if ((validLetter || validDigit) && roomCodeInput_.size() < 8) {
            roomCodeInput_.push_back(upper);
            homeError_.clear();
            InvalidateRect(hwnd_, nullptr, FALSE);
        }
    }

    void PasteFromClipboard() {
        if (page_ != Page::Home || focusedField_ == Field::None) return;
        if (!OpenClipboard(hwnd_)) return;

        HANDLE data = GetClipboardData(CF_UNICODETEXT);
        if (data) {
            const auto* text = static_cast<const wchar_t*>(GlobalLock(data));
            if (text) {
                if (focusedField_ == Field::Name) {
                    for (const wchar_t* p = text; *p && displayName_.size() < 20; ++p) {
                        if (*p >= 32 && *p != 127 && *p != L'\r' && *p != L'\n') displayName_.push_back(*p);
                    }
                } else {
                    for (const wchar_t* p = text; *p && roomCodeInput_.size() < 8; ++p) {
                        wchar_t upper = static_cast<wchar_t>(std::towupper(*p));
                        if ((upper >= L'A' && upper <= L'Z') || (upper >= L'2' && upper <= L'9')) {
                            roomCodeInput_.push_back(upper);
                        }
                    }
                }
                GlobalUnlock(data);
            }
        }
        CloseClipboard();
        homeError_.clear();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    bool HasValidName() const {
        const auto first = std::find_if_not(displayName_.begin(), displayName_.end(), [](wchar_t ch) {
            return std::iswspace(ch) != 0;
        });
        if (first == displayName_.end()) return false;

        const auto last = std::find_if_not(displayName_.rbegin(), displayName_.rend(), [](wchar_t ch) {
            return std::iswspace(ch) != 0;
        }).base();

        const auto length = static_cast<size_t>(std::distance(first, last));
        return length >= 2 && length <= 20;
    }

    void BeginCreateRoom() {
        if (!HasValidName()) {
            homeError_ = L"Digite um nome entre 2 e 20 caracteres.";
            focusedField_ = Field::Name;
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        pendingAction_ = PendingAction::Create;
        pendingAckId_ = -1;
        homeError_ = L"Conectando ao servidor...";
        focusedField_ = Field::None;
        EnsureSocketForPendingAction();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    void BeginJoinRoom() {
        if (!HasValidName()) {
            homeError_ = L"Digite um nome entre 2 e 20 caracteres.";
            focusedField_ = Field::Name;
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        if (roomCodeInput_.size() != 8) {
            homeError_ = L"O código da sala precisa ter 8 caracteres.";
            focusedField_ = Field::Code;
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        pendingAction_ = PendingAction::Join;
        pendingAckId_ = -1;
        homeError_ = L"Conectando ao servidor...";
        focusedField_ = Field::None;
        EnsureSocketForPendingAction();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    void EnsureSocketForPendingAction() {
        if (socket_.IsConnected()) {
            networkConnected_ = true;
            SendPendingRoomRequest();
            return;
        }

        if (socket_.IsRunning()) return;

        const bool started = socket_.Start([this](lunira::SocketEvent event) {
            auto* heapEvent = new (std::nothrow) lunira::SocketEvent(std::move(event));
            if (!heapEvent) return;
            if (!PostMessageW(hwnd_, kSocketEventMessage, 0, reinterpret_cast<LPARAM>(heapEvent))) {
                delete heapEvent;
            }
        });

        if (!started) {
            pendingAction_ = PendingAction::None;
            homeError_ = L"Não foi possível iniciar a conexão.";
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
            homeError_ = L"A conexão caiu antes de enviar a solicitação.";
        } else {
            homeError_ = pendingAction_ == PendingAction::Create
                ? L"Criando sala privada..."
                : L"Entrando na sala...";
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
                if (existing != pendingMediaEvents_.end()) {
                    *existing = std::move(event);
                } else {
                    pendingMediaEvents_.push_back(std::move(event));
                }
            } else {
                pendingMediaEvents_.push_back(std::move(event));
            }

            if (mediaMessagePosted_.exchange(true)) return;
        }

        if (!PostMessageW(hwnd_, kMediaEventMessage, 0, 0)) {
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

        for (auto& event : events) {
            HandleMediaEvent(std::move(event));
        }

        shareReveal_ = sharing_ ? std::max(shareReveal_, 0.0f) : shareReveal_;
        StartAnimationTimer();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    void QueueAgoraEvent(lunira::AgoraEvent event) {
        {
            std::scoped_lock lock(agoraQueueMutex_);
            if (event.type == lunira::AgoraEventType::ScreenFrame) {
                auto existing = std::find_if(pendingAgoraEvents_.begin(), pendingAgoraEvents_.end(),
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
        if (!PostMessageW(hwnd_, kAgoraEventMessage, 0, 0)) agoraMessagePosted_.store(false);
    }

    lunira::AgoraScreenClient::Callback AgoraCallback() {
        return [this](lunira::AgoraEvent event) { QueueAgoraEvent(std::move(event)); };
    }

    void StartAgoraViewer() {
        if (!viewerAgoraCredentials_.Valid() || screenShareStarting_ || localScreenSharing_) return;
        agora_.StartViewer(viewerAgoraCredentials_, AgoraCallback());
    }

    void HandleQueuedAgoraEvents() {
        std::vector<lunira::AgoraEvent> events;
        {
            std::scoped_lock lock(agoraQueueMutex_);
            events.swap(pendingAgoraEvents_);
            agoraMessagePosted_.store(false);
        }
        for (auto& event : events) HandleAgoraEvent(std::move(event));
        StartAnimationTimer();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    void HandleAgoraEvent(lunira::AgoraEvent event) {
        switch (event.type) {
        case lunira::AgoraEventType::Connected:
            agoraConnected_ = true;
            if (screenShareStarting_ && agora_.IsSharing()) {
                screenShareStarting_ = false;
                localScreenSharing_ = true;
                sharing_ = true;
                roomNotice_ = L"Sua tela está ao vivo.";
                std::string payload = "{\"roomId\":";
                payload += lunira::SocketIoClient::JsonQuote(roomCode_);
                payload += "}";
                socket_.Emit("broadcast-started", payload);
            }
            break;
        case lunira::AgoraEventType::Disconnected:
            agoraConnected_ = false;
            if (!localScreenSharing_) roomNotice_ = L"Reconectando ao vídeo da tela…";
            break;
        case lunira::AgoraEventType::ScreenFrame:
            screenFrame_.width = event.width;
            screenFrame_.height = event.height;
            screenFrame_.bgra = std::move(event.bgra);
            screenFrame_.dirty = true;
            if (screenFrame_.bitmap &&
                (static_cast<int>(screenFrame_.bitmap->GetPixelSize().width) != event.width ||
                 static_cast<int>(screenFrame_.bitmap->GetPixelSize().height) != event.height)) {
                screenFrame_.bitmap.Reset();
            }
            break;
        case lunira::AgoraEventType::CaptureEnded:
            if (localScreenSharing_ || screenShareStarting_) {
                StopNativeScreenShare(true, L"A janela ou monitor compartilhado foi encerrado.");
            }
            break;
        case lunira::AgoraEventType::TokenExpiring: {
            if (agoraRenewAckId_ >= 0 || roomCode_.empty()) break;
            std::string payload = "{\"roomId\":";
            payload += lunira::SocketIoClient::JsonQuote(roomCode_);
            payload += ",\"screen\":";
            payload += (localScreenSharing_ || screenShareStarting_) ? "true" : "false";
            payload += "}";
            agoraRenewAckId_ = socket_.EmitWithAck("renew-agora-token", payload);
            break;
        }
        case lunira::AgoraEventType::Error:
            agoraConnected_ = false;
            if (localScreenSharing_ || screenShareStarting_) {
                StopNativeScreenShare(true, event.error.empty() ? L"A transmissão Agora falhou." : event.error);
            } else {
                roomNotice_ = event.error.empty() ? L"O vídeo Agora falhou." : std::move(event.error);
            }
            break;
        }
    }

    bool ChooseScreenSource(lunira::ScreenSource& selected) {
        const auto sources = agora_.ListSources();
        if (sources.empty()) {
            roomNotice_ = L"Nenhum monitor ou janela disponível para compartilhar.";
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
            AppendMenuW(sources[i].kind == lunira::ScreenSource::Kind::Monitor ? monitors : windows,
                MF_STRING, static_cast<UINT_PTR>(1000 + i), title.c_str());
        }
        AppendMenuW(root, MF_POPUP, reinterpret_cast<UINT_PTR>(monitors), L"Monitores");
        AppendMenuW(root, MF_POPUP, reinterpret_cast<UINT_PTR>(windows), L"Janelas e aplicativos");
        POINT point{};
        GetCursorPos(&point);
        const UINT command = TrackPopupMenuEx(root, TPM_RETURNCMD | TPM_RIGHTBUTTON,
            point.x, point.y, hwnd_, nullptr);
        DestroyMenu(root);
        if (command < 1000 || static_cast<size_t>(command - 1000) >= sources.size()) return false;
        selected = sources[command - 1000];
        return true;
    }

    void BeginNativeScreenShare() {
        if (!viewerAgoraCredentials_.Valid() || screenShareAckId_ >= 0 ||
            screenShareStarting_ || localScreenSharing_) return;
        lunira::ScreenSource source;
        if (!ChooseScreenSource(source)) return;
        pendingScreenSource_ = std::move(source);
        std::string payload = "{\"roomId\":";
        payload += lunira::SocketIoClient::JsonQuote(roomCode_);
        payload += "}";
        screenShareAckId_ = socket_.EmitWithAck("request-screen-share", payload);
        if (screenShareAckId_ < 0) {
            roomNotice_ = L"Não foi possível reservar a transmissão.";
        } else {
            roomNotice_ = L"Preparando captura nativa…";
        }
    }

    void StopNativeScreenShare(bool notifyServer, std::wstring notice = {}) {
        const bool wasLocal = localScreenSharing_ || screenShareStarting_;
        localScreenSharing_ = false;
        screenShareStarting_ = false;
        screenShareAckId_ = -1;
        agora_.Stop();
        agoraConnected_ = false;
        screenFrame_ = {};
        sharing_ = roomState_.live && !wasLocal;
        if (notifyServer && wasLocal && socket_.IsConnected() && !roomCode_.empty()) {
            std::string payload = "{\"roomId\":";
            payload += lunira::SocketIoClient::JsonQuote(roomCode_);
            payload += "}";
            socket_.EmitWithAck("release-screen-share", payload);
        }
        if (!notice.empty()) roomNotice_ = std::move(notice);
        StartAgoraViewer();
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

    bool StartCachedLiveKitMedia() {
        if (mediaConnected_ || mediaStarting_) return true;
        if (cachedLivekitUrl_.empty() || cachedLivekitToken_.empty()) return false;

        mediaStarting_ = true;
        const bool started = media_.Start(
            cachedLivekitUrl_,
            cachedLivekitToken_,
            [this](lunira::MediaEvent mediaEvent) {
                QueueMediaEvent(std::move(mediaEvent));
            });

        if (!started) {
            mediaStarting_ = false;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            roomNotice_ = L"Não foi possível iniciar a conexão de mídia.";
            return false;
        }

        roomNotice_ = L"Conectando câmeras…";
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
            roomNotice_ = L"Não foi possível pedir acesso à mídia.";
            return;
        }

        roomNotice_ = L"Preparando mídia da sala…";
    }

    void StartLocalCameraCapture() {
        if (!mediaConnected_ || cameraCapture_.IsRunning() || cameraOn_) return;

        const std::wstring identity = selfSocketId_;
        if (identity.empty()) {
            cameraEnablePending_ = false;
            roomNotice_ = L"Não foi possível identificar sua sessão para publicar a câmera.";
            return;
        }

        cameraPublishFailed_.store(false);
        cameraEnablePending_ = true;
        roomNotice_ = L"Abrindo câmera do Windows…";

        const bool started = cameraCapture_.Start(
            [this, identity](lunira::CapturedCameraFrame frame) {
                if (frame.width <= 0 || frame.height <= 0 || frame.bgra.empty()) return;

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
            roomNotice_ = L"Não foi possível abrir a câmera.";
        }
    }

    void StopLocalCameraCapture(bool notifyServer = true) {
        cameraEnablePending_ = false;
        cameraPublishFailed_.store(false);

        cameraCapture_.Stop();
        media_.StopLocalCamera();

        cameraOn_ = false;
        if (!selfSocketId_.empty()) {
            cameraFrames_.erase(selfSocketId_);
            if (selectedCameraIdentity_ == selfSocketId_) {
                selectedCameraIdentity_.clear();
                cameraOverlayLarge_ = false;
            }
        }

        if (notifyServer) {
            SetLocalLiveKitMediaActive(systemAudioOn_);
        }
    }

    void StartSystemAudioCapture() {
        if (!mediaConnected_ || systemAudioCapture_.IsRunning() || systemAudioOn_) return;
        audioEnablePending_ = true;
        roomNotice_ = L"Conectando áudio da tela…";
        if (!media_.StartSystemAudio()) {
            audioEnablePending_ = false;
            roomNotice_ = L"Não foi possível publicar o áudio no LiveKit.";
            return;
        }
        const bool started = systemAudioCapture_.Start(
            [this](lunira::CapturedAudioFrame frame) {
                if (!media_.PushSystemAudioFrame(frame.samples.data(), frame.samples.size(),
                        frame.sampleRate, frame.channels)) {
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
            roomNotice_ = L"Não foi possível capturar o áudio do Windows.";
            return;
        }
        systemAudioOn_ = true;
        audioEnablePending_ = false;
        roomNotice_ = L"Áudio da tela ligado.";
        SetLocalLiveKitMediaActive(true);
    }

    void StopSystemAudioCapture(bool notifyServer = true) {
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
            if (roomNotice_ == L"Conectando câmeras…" ||
                roomNotice_ == L"Preparando mídia da sala…") {
                roomNotice_.clear();
            }
            if (cameraEnablePending_ && !cameraOn_) {
                StartLocalCameraCapture();
            }
            if (audioEnablePending_ && !systemAudioOn_) {
                StartSystemAudioCapture();
            }
            break;

        case lunira::MediaEventType::Disconnected:
            mediaConnected_ = false;
            mediaStarting_ = false;
            cameraFrames_.clear();
            selectedCameraIdentity_.clear();
            if (cameraOn_ || cameraEnablePending_) {
                StopLocalCameraCapture(false);
                roomNotice_ = L"Conexão de mídia encerrada.";
            }
            if (systemAudioOn_ || audioEnablePending_) StopSystemAudioCapture(false);
            break;

        case lunira::MediaEventType::CameraFrame: {
            CameraFrameCache& cache = cameraFrames_[event.identity];
            const bool sizeChanged =
                cache.width != event.width ||
                cache.height != event.height;
            cache.width = event.width;
            cache.height = event.height;
            cache.bgra = std::move(event.bgra);
            cache.dirty = true;
            if (sizeChanged) cache.bitmap.Reset();

            if (!selfSocketId_.empty() &&
                event.identity == selfSocketId_ &&
                !cameraOn_) {
                cameraOn_ = true;
                cameraEnablePending_ = false;
                roomNotice_.clear();
                SetLocalLiveKitMediaActive(true);
            }
            break;
        }

        case lunira::MediaEventType::CameraRemoved:
            cameraFrames_.erase(event.identity);
            if (selectedCameraIdentity_ == event.identity) {
                selectedCameraIdentity_.clear();
                cameraOverlayLarge_ = false;
            }
            break;

        case lunira::MediaEventType::CameraError:
            StopLocalCameraCapture(true);
            roomNotice_ = event.error.empty()
                ? L"Não foi possível usar a câmera."
                : std::move(event.error);
            break;

        case lunira::MediaEventType::Error:
            mediaConnected_ = false;
            mediaStarting_ = false;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            if (cameraOn_ || cameraEnablePending_) {
                StopLocalCameraCapture(false);
            }
            if (systemAudioOn_ || audioEnablePending_) StopSystemAudioCapture(false);
            roomNotice_ = event.error.empty()
                ? L"Não foi possível conectar à mídia da sala."
                : std::move(event.error);
            break;
        }
    }

    void HandleSocketEvent(const lunira::SocketEvent& event) {
        switch (event.type) {
        case lunira::SocketEventType::Connected:
            networkConnected_ = true;
            if (!event.socketId.empty()) selfSocketId_ = event.socketId;
            roomNotice_.clear();
            SendPendingRoomRequest();
            break;

        case lunira::SocketEventType::Ack:
            if (event.ackId == agoraRenewAckId_) {
                agoraRenewAckId_ = -1;
                if (event.ok && !event.agoraToken.empty()) {
                    agora_.RenewToken(event.agoraToken);
                } else {
                    roomNotice_ = event.error.empty() ? L"Não foi possível renovar o Agora." : event.error;
                }
                break;
            }

            if (event.ackId == screenShareAckId_) {
                screenShareAckId_ = -1;
                if (!event.ok) {
                    roomNotice_ = event.error.empty() ? L"A transmissão não pôde começar." : event.error;
                    break;
                }
                lunira::AgoraCredentials publisher;
                publisher.appId = event.agoraAppId;
                publisher.channel = event.agoraChannel;
                publisher.token = event.agoraToken;
                publisher.uid = static_cast<unsigned int>(event.agoraUid);
                screenShareStarting_ = true;
                agoraConnected_ = false;
                if (!agora_.StartSharing(publisher, pendingScreenSource_, fps_, AgoraCallback())) {
                    StopNativeScreenShare(true, L"Não foi possível iniciar a captura Agora.");
                }
                break;
            }

            if (event.ackId == livekitAckId_) {
                livekitAckId_ = -1;
                if (!event.ok || event.livekitUrl.empty() || event.livekitToken.empty()) {
                    roomNotice_ = event.error.empty()
                        ? L"Não foi possível acessar a mídia."
                        : event.error;
                    break;
                }

                cachedLivekitUrl_ = event.livekitUrl;
                cachedLivekitToken_ = event.livekitToken;
                StartCachedLiveKitMedia();
                break;
            }

            if (event.ackId != pendingAckId_) break;

            if (!event.ok) {
                homeError_ = event.error.empty() ? L"O servidor recusou a solicitação." : event.error;
                pendingAction_ = PendingAction::None;
                pendingAckId_ = -1;
                networkConnected_ = socket_.IsConnected();
                break;
            }

            if (!event.displayName.empty()) displayName_ = event.displayName;
            if (pendingAction_ == PendingAction::Create) {
                roomCode_ = event.roomId;
                roomCodeInput_ = event.roomId;
                ownerToken_ = event.ownerToken;
                participantToken_.clear();
                ownsRoom_ = true;
            } else {
                roomCode_ = roomCodeInput_;
                participantToken_ = event.participantToken;
                ownerToken_.clear();
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
            homeError_.clear();
            roomNotice_.clear();
            page_ = Page::Room;
            focusedField_ = Field::None;

            if (selfSocketId_.empty()) {
                if (ownsRoom_ && !roomState_.participants.empty()) {
                    selfSocketId_ = roomState_.participants.front().id;
                } else {
                    for (auto it = roomState_.participants.rbegin();
                         it != roomState_.participants.rend();
                         ++it) {
                        if (it->displayName == displayName_) {
                            selfSocketId_ = it->id;
                            break;
                        }
                    }
                }
            }

            if (roomState_.livekitActive) {
                EnsureLiveKitMedia();
            }
            StartAgoraViewer();
            break;

        case lunira::SocketEventType::RoomState:
            roomState_ = event.room;
            sharing_ = roomState_.live;
            if (!sharing_ && !localScreenSharing_) screenFrame_ = {};
            if (roomState_.livekitActive) {
                EnsureLiveKitMedia();
            } else if (!cameraOn_ &&
                       !cameraEnablePending_ &&
                       !systemAudioOn_ &&
                       mediaConnected_) {
                media_.Stop();
                mediaConnected_ = false;
                mediaStarting_ = false;
                cameraFrames_.clear();
                selectedCameraIdentity_.clear();
            }
            if (roomNotice_ != L"Abrindo câmera do Windows…") {
                roomNotice_.clear();
            }
            break;

        case lunira::SocketEventType::BroadcastStarted:
            sharing_ = true;
            roomState_.live = true;
            break;

        case lunira::SocketEventType::BroadcastEnded:
            sharing_ = false;
            roomState_.live = false;
            screenFrame_ = {};
            break;

        case lunira::SocketEventType::RoomExpired:
            StopSystemAudioCapture(false);
            StopLocalCameraCapture(false);
            media_.Stop();
            agora_.Stop();
            mediaConnected_ = false;
            mediaStarting_ = false;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            cameraFrames_.clear();
            screenFrame_ = {};
            roomNotice_.clear();
            homeError_ = L"A sala expirou.";
            roomCode_.clear();
            roomCodeInput_.clear();
            page_ = Page::Home;
            pendingAction_ = PendingAction::None;
            break;

        case lunira::SocketEventType::Disconnected:
            networkConnected_ = false;
            StopSystemAudioCapture(false);
            StopLocalCameraCapture(false);
            media_.Stop();
            agora_.Stop();
            mediaConnected_ = false;
            mediaStarting_ = false;
            livekitAckId_ = -1;
            cachedLivekitUrl_.clear();
            cachedLivekitToken_.clear();
            livekitMediaAnnounced_ = false;
            localScreenSharing_ = false;
            screenShareStarting_ = false;
            screenShareAckId_ = -1;
            agoraRenewAckId_ = -1;
            screenFrame_ = {};
            selfSocketId_.clear();
            if (page_ == Page::Home) {
                homeError_ = L"Conexão com o servidor encerrada. Tente novamente.";
            } else {
                roomNotice_ = L"Conexão perdida. Volte ao início para reconectar.";
            }
            break;

        case lunira::SocketEventType::Error:
            networkConnected_ = false;
            if (page_ == Page::Home) {
                homeError_ = event.error.empty() ? L"Falha de conexão." : event.error;
                pendingAction_ = PendingAction::None;
                pendingAckId_ = -1;
            } else {
                roomNotice_ = event.error.empty() ? L"Falha de conexão." : event.error;
            }
            break;
        }

        StartAnimationTimer();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }


    void QueueUpdateEvent(lunira::UpdateEvent event) {
        auto* heapEvent = new (std::nothrow) lunira::UpdateEvent(std::move(event));
        if (!heapEvent) return;
        if (!PostMessageW(
                hwnd_,
                kUpdateEventMessage,
                0,
                reinterpret_cast<LPARAM>(heapEvent))) {
            delete heapEvent;
        }
    }

    lunira::UpdaterClient::Callback UpdateCallback() {
        return [this](lunira::UpdateEvent event) {
            QueueUpdateEvent(std::move(event));
        };
    }

    void StartUpdateCheck(bool manual) {
        if (updater_.IsBusy()) {
            if (manual) updateStatus_ = L"Uma verificação já está em andamento.";
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        if (manual) {
            updateStatus_ = L"Verificando atualizações…";
            updateAvailable_ = false;
            updateDownloading_ = false;
            updateProgress_ = -1;
            InvalidateRect(hwnd_, nullptr, FALSE);
        }

        if (!updater_.Check(UpdateCallback()) && manual) {
            updateStatus_ = L"Não foi possível iniciar a verificação.";
            InvalidateRect(hwnd_, nullptr, FALSE);
        }
    }

    void StartUpdateDownload() {
        if (!updateAvailable_ || updater_.IsBusy()) return;

        updateDownloading_ = true;
        updateProgress_ = 0;
        updateStatus_ = L"Preparando download…";
        InvalidateRect(hwnd_, nullptr, FALSE);

        if (!updater_.DownloadAndInstall(UpdateCallback())) {
            updateDownloading_ = false;
            updateProgress_ = -1;
            updateStatus_ = L"Não foi possível iniciar o download.";
            InvalidateRect(hwnd_, nullptr, FALSE);
        }
    }

    void HandleUpdateEvent(lunira::UpdateEvent event) {
        switch (event.type) {
        case lunira::UpdateEventType::Checking:
            updateStatus_ = event.message.empty()
                ? L"Verificando atualizações…"
                : std::move(event.message);
            updateDownloading_ = false;
            updateProgress_ = -1;
            break;

        case lunira::UpdateEventType::UpToDate:
            updateAvailable_ = false;
            updateDownloading_ = false;
            updateProgress_ = -1;
            updateLatestVersion_.clear();
            updateStatus_ = event.message.empty()
                ? L"Você está usando a versão mais recente."
                : std::move(event.message);
            break;

        case lunira::UpdateEventType::Available:
            updateAvailable_ = true;
            updateDownloading_ = false;
            updateProgress_ = -1;
            updateLatestVersion_ = std::move(event.version);
            updateStatus_ = event.message.empty()
                ? L"Nova versão disponível."
                : std::move(event.message);
            break;

        case lunira::UpdateEventType::Downloading:
            updateDownloading_ = true;
            if (!event.version.empty()) updateLatestVersion_ = std::move(event.version);
            updateProgress_ = event.progress;
            updateStatus_ = event.message.empty()
                ? L"Baixando atualização…"
                : std::move(event.message);
            break;

        case lunira::UpdateEventType::Installing:
            updateDownloading_ = false;
            updateProgress_ = 100;
            updateStatus_ = event.message.empty()
                ? L"Reiniciando para concluir a atualização…"
                : std::move(event.message);
            InvalidateRect(hwnd_, nullptr, FALSE);
            PostMessageW(hwnd_, WM_CLOSE, 0, 0);
            return;

        case lunira::UpdateEventType::Error:
            updateDownloading_ = false;
            updateProgress_ = -1;
            updateStatus_ = event.message.empty()
                ? L"Falha ao verificar atualizações."
                : std::move(event.message);
            break;
        }

        InvalidateRect(hwnd_, nullptr, FALSE);
    }

    void Click(int px, int py) {
        const int id = HitTest(ToDip(px), ToDip(py));
        const Page pageBefore = page_;

        switch (id) {
        case 0:
            page_ = Page::Room;
            focusedField_ = Field::None;
            break;
        case 1:
            page_ = Page::Settings;
            focusedField_ = Field::None;
            break;
        case 24:
            page_ = Page::Home;
            focusedField_ = Field::Name;
            break;
        case 16:
        case 17:
            if (localScreenSharing_ || screenShareStarting_) StopNativeScreenShare(true);
            if (socket_.IsConnected() && !roomCode_.empty()) {
                std::string payload = "{\"roomId\":";
                payload += lunira::SocketIoClient::JsonQuote(roomCode_);
                payload += "}";
                socket_.Emit("leave-room", payload);
            }
            StopSystemAudioCapture(true);
            StopLocalCameraCapture(true);
            media_.Stop();
            agora_.Stop();
            mediaConnected_ = false;
            mediaStarting_ = false;
            cameraFrames_.clear();
            page_ = Page::Home;
            focusedField_ = Field::None;
            selectedCameraIdentity_.clear();
            screenFrame_ = {};
            focused_ = false;
            break;
        case 20:
            focusedField_ = Field::Name;
            homeError_.clear();
            break;
        case 21:
            BeginCreateRoom();
            break;
        case 22:
            focusedField_ = Field::Code;
            homeError_.clear();
            break;
        case 23:
            BeginJoinRoom();
            break;
        case 2:
            focused_ = !focused_;
            break;
        case 3:
            if (roomCode_.empty()) break;
            copied_ = true;
            if (OpenClipboard(hwnd_)) {
                EmptyClipboard();
                const std::wstring invite = L"https://lunirascreen.onrender.com/?room=" + roomCode_;
                const size_t bytes = (invite.size() + 1) * sizeof(wchar_t);
                HGLOBAL memory = GlobalAlloc(GMEM_MOVEABLE, bytes);
                if (memory) {
                    void* target = GlobalLock(memory);
                    if (target) {
                        memcpy(target, invite.c_str(), bytes);
                        GlobalUnlock(memory);
                        SetClipboardData(CF_UNICODETEXT, memory);
                        memory = nullptr;
                    }
                    if (memory) GlobalFree(memory);
                }
                CloseClipboard();
            }
            break;
        case 4:
            fps_ = 30;
            if (localScreenSharing_) agora_.UpdateFrameRate(fps_);
            break;
        case 5:
            fps_ = 60;
            if (localScreenSharing_) agora_.UpdateFrameRate(fps_);
            break;
        case 6:
            if (cameraOn_ || cameraCapture_.IsRunning()) {
                StopLocalCameraCapture(true);
                roomNotice_.clear();
            } else {
                cameraEnablePending_ = true;
                EnsureLiveKitMedia();
                if (mediaConnected_) {
                    StartLocalCameraCapture();
                }
            }
            break;
        case 7:
            if (localScreenSharing_ || screenShareStarting_) {
                StopNativeScreenShare(true, L"Transmissão encerrada.");
            } else if (sharing_) {
                roomNotice_ = L"Outra pessoa já está compartilhando a tela.";
            } else {
                BeginNativeScreenShare();
            }
            break;
        case 8:
            if (systemAudioOn_ || systemAudioCapture_.IsRunning()) {
                StopSystemAudioCapture(true);
                roomNotice_ = L"Áudio da tela desligado.";
            } else {
                audioEnablePending_ = true;
                EnsureLiveKitMedia();
                if (mediaConnected_) StartSystemAudioCapture();
            }
            break;
        case 9:
            statsOn_ = !statsOn_;
            break;
        case 18:
            if (updateAvailable_) StartUpdateDownload();
            else StartUpdateCheck(true);
            break;
        case 10:
            camerasOpen_ = !camerasOpen_;
            StartAnimationTimer();
            break;
        case 30:
        case 31:
        case 32:
        case 33:
        case 34:
        case 35: {
            const size_t slot = static_cast<size_t>(id - 30);
            if (slot < cameraHitIdentities_.size() &&
                !cameraHitIdentities_[slot].empty()) {
                selectedCameraIdentity_ = cameraHitIdentities_[slot];
            }
            cameraOverlayLarge_ = false;
            break;
        }
        case 14:
            selectedCameraIdentity_.clear();
            cameraOverlayLarge_ = false;
            break;
        case 15:
            cameraOverlayLarge_ = !cameraOverlayLarge_;
            break;
        default:
            break;
        }

        if (page_ != pageBefore) BeginPageTransition();
        StartAnimationTimer();
        InvalidateRect(hwnd_, nullptr, FALSE);
    }

private:
    HINSTANCE instance_ = nullptr;
    HWND hwnd_ = nullptr;
    UINT dpi_ = 96;

    Theme theme_{};
    Page page_ = Page::Home;
    Field focusedField_ = Field::Name;
    PendingAction pendingAction_ = PendingAction::None;
    int pendingAckId_ = -1;
    bool networkConnected_ = false;
    bool ownsRoom_ = false;
    std::wstring displayName_;
    std::wstring roomCodeInput_;
    std::wstring roomCode_;
    std::wstring ownerToken_;
    std::wstring participantToken_;
    std::wstring homeError_;
    std::wstring roomNotice_;
    lunira::RoomSnapshot roomState_;
    lunira::SocketIoClient socket_;
    lunira::LiveKitMediaClient media_;
    lunira::CameraCapture cameraCapture_;
    lunira::SystemAudioCapture systemAudioCapture_;
    lunira::AgoraScreenClient agora_;
    lunira::UpdaterClient updater_;
    bool updateAvailable_ = false;
    bool updateDownloading_ = false;
    int updateProgress_ = -1;
    std::wstring updateLatestVersion_;
    std::wstring updateStatus_ = L"Verificação automática ativada.";
    int livekitAckId_ = -1;
    bool mediaConnected_ = false;
    bool mediaStarting_ = false;
    bool cameraEnablePending_ = false;
    bool systemAudioOn_ = false;
    bool audioEnablePending_ = false;
    bool livekitMediaAnnounced_ = false;
    std::atomic<bool> cameraPublishFailed_{false};
    std::wstring selfSocketId_;
    std::wstring cachedLivekitUrl_;
    std::wstring cachedLivekitToken_;

    std::mutex mediaQueueMutex_;
    std::vector<lunira::MediaEvent> pendingMediaEvents_;
    std::atomic<bool> mediaMessagePosted_{false};
    std::unordered_map<std::wstring, CameraFrameCache> cameraFrames_;
    CameraFrameCache screenFrame_;
    std::array<std::wstring, 6> cameraHitIdentities_{};

    bool sharing_ = false;
    bool localScreenSharing_ = false;
    bool screenShareStarting_ = false;
    bool agoraConnected_ = false;
    int screenShareAckId_ = -1;
    int agoraRenewAckId_ = -1;
    lunira::AgoraCredentials viewerAgoraCredentials_;
    lunira::ScreenSource pendingScreenSource_;
    std::mutex agoraQueueMutex_;
    std::vector<lunira::AgoraEvent> pendingAgoraEvents_;
    std::atomic<bool> agoraMessagePosted_{false};
    bool cameraOn_ = false;
    bool statsOn_ = false;
    bool camerasOpen_ = true;
    bool focused_ = false;
    bool copied_ = false;
    int fps_ = 60;
    std::wstring selectedCameraIdentity_;
    bool cameraOverlayLarge_ = false;

    bool trackingMouse_ = false;
    int hover_ = -1;

    bool animationTimerRunning_ = false;
    float pageReveal_ = 1.0f;
    float dockReveal_ = 1.0f;
    float shareReveal_ = 0.0f;
    std::array<float, 64> hoverMix_{};

    std::array<Hit, 64> hits_{};
    size_t hitCount_ = 0;

    ComPtr<ID2D1Factory> d2dFactory_;
    ComPtr<IDWriteFactory> writeFactory_;
    ComPtr<ID2D1HwndRenderTarget> renderTarget_;

    ComPtr<ID2D1SolidColorBrush> textBrush_;
    ComPtr<ID2D1SolidColorBrush> mutedBrush_;
    ComPtr<ID2D1SolidColorBrush> dimBrush_;
    ComPtr<ID2D1SolidColorBrush> panelBrush_;
    ComPtr<ID2D1SolidColorBrush> panel2Brush_;
    ComPtr<ID2D1SolidColorBrush> panel3Brush_;
    ComPtr<ID2D1SolidColorBrush> stageBrush_;
    ComPtr<ID2D1SolidColorBrush> borderBrush_;
    ComPtr<ID2D1SolidColorBrush> borderSoftBrush_;
    ComPtr<ID2D1SolidColorBrush> violetBrush_;
    ComPtr<ID2D1SolidColorBrush> violet2Brush_;
    ComPtr<ID2D1SolidColorBrush> violetPanelBrush_;
    ComPtr<ID2D1SolidColorBrush> greenBrush_;
    ComPtr<ID2D1SolidColorBrush> redBrush_;
    ComPtr<ID2D1SolidColorBrush> amberBrush_;
    ComPtr<ID2D1SolidColorBrush> violetGlowBrush_;
    ComPtr<ID2D1SolidColorBrush> greenGlowBrush_;
    ComPtr<ID2D1SolidColorBrush> shadowBrush_;

    ComPtr<IDWriteTextFormat> tinyBold_;
    ComPtr<IDWriteTextFormat> tiny_;
    ComPtr<IDWriteTextFormat> body_;
    ComPtr<IDWriteTextFormat> bodyStrong_;
    ComPtr<IDWriteTextFormat> strong_;
    ComPtr<IDWriteTextFormat> heading_;
    ComPtr<IDWriteTextFormat> title_;
    ComPtr<IDWriteTextFormat> heroTitle_;
    ComPtr<IDWriteTextFormat> heroBody_;
};

} // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int) {
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    AppWindow app;
    if (!app.Initialize(instance)) {
        MessageBoxW(
            nullptr,
            L"Não foi possível iniciar a interface nativa do LuniraScreen.",
            L"LuniraScreen",
            MB_OK | MB_ICONERROR);
        return 1;
    }

    return app.Run();
}
