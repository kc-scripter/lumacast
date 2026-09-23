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
#include "ui_layout.h"

#include <algorithm>
#include <atomic>
#include <cstring>
#include <cwctype>\n#include <cmath>
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
constexpr UINT_PTR kUiAnimationTimerId = 1;\nconstexpr UINT_PTR kAmbientAnimationTimerId = 2;

#ifndef LUNIRA_GIT_SHA
#define LUNIRA_GIT_SHA "unknown"
#endif

#ifndef LUNIRA_UI_REV
#define LUNIRA_UI_REV "R2"
#endif

#define LUNIRA_WIDEN_IMPL(x) L##x
#define LUNIRA_WIDEN(x) LUNIRA_WIDEN_IMPL(x)

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

        pageMotion_.Snap(1.0f);
        cameraDockMotion_.Snap(0.0f);
        statsMotion_.Snap(0.0f);
        shareMotion_.Snap(0.0f);
        startupStartedAt_ = GetTickCount64();
        SetTimer(hwnd_, kAmbientAnimationTimerId, 50, nullptr);

        ShowWindow(hwnd_, SW_SHOW);
        UpdateWindow(hwnd_);
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
                SyncUiAnimationTargets();
                StartUiAnimation();
            }
            return 0;
        case WM_TIMER:
            if (wParam == kUiAnimationTimerId) {
                TickUiAnimations();
                return 0;
            }
            if (wParam == kAmbientAnimationTimerId) {
                ambientPhase_ += 0.014f;
                if (ambientPhase_ > 6.2831853f) ambientPhase_ -= 6.2831853f;
                if (startupSplash_ && GetTickCount64() - startupStartedAt_ >= 1850) {
                    startupSplash_ = false;
                    BeginPageTransition();
                }
                InvalidateRect(hwnd_, nullptr, FALSE);
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
            KillTimer(hwnd_, kUiAnimationTimerId);
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
        MakeBrush(theme_.text, dynamicBrush_);

        MakeText(10.0f, DWRITE_FONT_WEIGHT_BOLD, tinyBold_);
        MakeText(11.0f, DWRITE_FONT_WEIGHT_REGULAR, tiny_);
        MakeText(12.0f, DWRITE_FONT_WEIGHT_REGULAR, body_);
        MakeText(12.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD, bodyStrong_);
        MakeText(14.0f, DWRITE_FONT_WEIGHT_SEMI_BOLD, strong_);
        MakeText(16.0f, DWRITE_FONT_WEIGHT_BOLD, heading_);
        MakeText(20.0f, DWRITE_FONT_WEIGHT_BOLD, title_);
        MakeText(36.0f, DWRITE_FONT_WEIGHT_BOLD, heroTitle_);
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
        dynamicBrush_.Reset();
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


    static D2D1_COLOR_F MixColor(
        const D2D1_COLOR_F& from,
        const D2D1_COLOR_F& to,
        float amount) noexcept {

        const float t = std::clamp(amount, 0.0f, 1.0f);
        return D2D1::ColorF(
            from.r + (to.r - from.r) * t,
            from.g + (to.g - from.g) * t,
            from.b + (to.b - from.b) * t,
            from.a + (to.a - from.a) * t);
    }

    ID2D1SolidColorBrush* DynamicBrush(const D2D1_COLOR_F& color) {
        dynamicBrush_->SetColor(color);
        return dynamicBrush_.Get();
    }

    float HoverValue(int id) const noexcept {
        if (id < 0 || static_cast<size_t>(id) >= hoverMotion_.size()) return 0.0f;
        return hoverMotion_[static_cast<size_t>(id)].Get();
    }

    void SyncUiAnimationTargets() {
        for (size_t i = 0; i < hoverMotion_.size(); ++i) {
            hoverMotion_[i].SetTarget(
                hover_ == static_cast<int>(i) ? 1.0f : 0.0f);
        }

        cameraDockMotion_.SetTarget(
            camerasOpen_ && !cameraFrames_.empty() ? 1.0f : 0.0f);
        statsMotion_.SetTarget(statsOn_ ? 1.0f : 0.0f);
        shareMotion_.SetTarget(sharing_ ? 1.0f : 0.0f);
        pageMotion_.SetTarget(1.0f);
    }

    bool UiAnimationPending() const noexcept {
        if (!pageMotion_.Settled() ||
            !cameraDockMotion_.Settled() ||
            !statsMotion_.Settled() ||
            !shareMotion_.Settled()) {
            return true;
        }

        for (const auto& motion : hoverMotion_) {
            if (!motion.Settled()) return true;
        }
        return false;
    }

    void StartUiAnimation() {
        if (uiAnimationTimerRunning_ || !hwnd_) return;
        if (SetTimer(hwnd_, kUiAnimationTimerId, 16, nullptr) != 0) {
            uiAnimationTimerRunning_ = true;
        }
    }

    void TickUiAnimations() {
        bool moving = false;
        moving = pageMotion_.Step(0.24f) || moving;
        moving = cameraDockMotion_.Step(0.20f) || moving;
        moving = statsMotion_.Step(0.22f) || moving;
        moving = shareMotion_.Step(0.18f) || moving;

        for (auto& motion : hoverMotion_) {
            moving = motion.Step(0.30f) || moving;
        }

        if (moving) {
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }

        KillTimer(hwnd_, kUiAnimationTimerId);
        uiAnimationTimerRunning_ = false;
    }

    void BeginPageTransition() {
        pageMotion_.Snap(0.0f);
        pageMotion_.SetTarget(1.0f);
        StartUiAnimation();
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

        SyncUiAnimationTargets();
        if (UiAnimationPending()) StartUiAnimation();

        renderTarget_->BeginDraw();
        renderTarget_->SetTransform(D2D1::Matrix3x2F::Identity());
        renderTarget_->Clear(theme_.bg);

        DrawShell(width, height);

        const float veil = (1.0f - pageMotion_.Get()) * 0.16f;
        if (veil > 0.002f) {
            Fill(
                Rect(lunira::ui::Tokens::Sidebar, 0, width, height),
                DynamicBrush(Hex(0x07080C, veil)));
        }

        const HRESULT hr = renderTarget_->EndDraw();
        if (hr == D2DERR_RECREATE_TARGET) {
            DiscardDeviceResources();
        }

        EndPaint(hwnd_, &ps);
    }

    void DrawAmbientBackground(float width, float height) {
        const float s = std::sin(ambientPhase_);
        const float c = std::cos(ambientPhase_ * 0.83f);

        Fill(Rect(0, 0, width, height), DynamicBrush(Hex(0x07080D)));

        ID2D1Brush* grid = DynamicBrush(Hex(0xFFFFFF, 0.012f));
        for (float x = 0.0f; x < width; x += 72.0f) {
            Line(x, 0, x, height, grid, 1.0f);
        }
        for (float y = 0.0f; y < height; y += 72.0f) {
            Line(0, y, width, y, grid, 1.0f);
        }

        const float ax = width * (0.13f + s * 0.025f);
        const float ay = height * (0.05f + c * 0.02f);
        for (int i = 0; i < 4; ++i) {
            const float radiusX = width * (0.25f + i * 0.055f);
            const float radiusY = height * (0.23f + i * 0.045f);
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(ax, ay), radiusX, radiusY),
                DynamicBrush(Hex(0x7857FF, 0.020f - i * 0.0035f)));
        }

        const float bx = width * (0.93f + c * 0.018f);
        const float by = height * (0.94f + s * 0.018f);
        for (int i = 0; i < 3; ++i) {
            renderTarget_->FillEllipse(
                D2D1::Ellipse(
                    D2D1::Point2F(bx, by),
                    width * (0.22f + i * 0.05f),
                    height * (0.20f + i * 0.05f)),
                DynamicBrush(Hex(0x4F46E5, 0.018f - i * 0.0035f)));
        }

        const float sweepY = height * (0.74f + s * 0.014f);
        Line(width * 0.30f, sweepY, width * 0.88f, sweepY - 92.0f,
             DynamicBrush(Hex(0x9B7CFF, 0.045f)), 1.0f);
        Line(width * 0.34f, sweepY + 16.0f, width * 0.92f, sweepY - 72.0f,
             DynamicBrush(Hex(0x6D5CE8, 0.025f)), 1.0f);
    }

    void DrawSplash(float width, float height) {
        const float cx = width * 0.5f;
        const float cy = height * 0.46f;
        const float elapsed = static_cast<float>(GetTickCount64() - startupStartedAt_);
        const float t = std::clamp(elapsed / 1850.0f, 0.0f, 1.0f);
        const float breathe = 1.0f + std::sin(ambientPhase_ * 2.0f) * 0.035f;

        for (int i = 0; i < 3; ++i) {
            renderTarget_->FillEllipse(
                D2D1::Ellipse(
                    D2D1::Point2F(cx, cy - 52.0f),
                    (78.0f + i * 22.0f) * breathe,
                    (78.0f + i * 22.0f) * breathe),
                DynamicBrush(Hex(0x7857FF, 0.038f - i * 0.009f)));
        }

        const D2D1_RECT_F mark = Rect(cx - 34, cy - 86, cx + 34, cy - 18);
        const auto markRr = D2D1::RoundedRect(mark, 18, 18);
        renderTarget_->FillRoundedRectangle(markRr, violetBrush_.Get());
        renderTarget_->DrawRoundedRectangle(markRr, DynamicBrush(Hex(0xB69EFF, 0.48f)), 1.0f);
        DrawMonitor(cx - 11, cy - 63, textBrush_.Get());

        CenterText(L"Lunira Screen", Rect(cx - 220, cy + 10, cx + 220, cy + 48),
                   title_.Get(), textBrush_.Get());
        CenterText(L"Compartilhe o que importa.", Rect(cx - 220, cy + 50, cx + 220, cy + 75),
                   body_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F track = Rect(cx - 86, cy + 112, cx + 86, cy + 117);
        const auto trackRr = D2D1::RoundedRect(track, 3, 3);
        renderTarget_->FillRoundedRectangle(trackRr, DynamicBrush(Hex(0xFFFFFF, 0.08f)));
        const D2D1_RECT_F fill = Rect(track.left, track.top,
            track.left + lunira::ui::Width(track) * std::max(0.08f, t), track.bottom);
        const auto fillRr = D2D1::RoundedRect(fill, 3, 3);
        renderTarget_->FillRoundedRectangle(fillRr, violetBrush_.Get());
        CenterText(L"Iniciando…", Rect(cx - 100, cy + 128, cx + 100, cy + 151),
                   tiny_.Get(), dimBrush_.Get());
    }

        void DrawShell(float width, float height) {
        DrawAmbientBackground(width, height);

        if (startupSplash_) {
            DrawSplash(width, height);
            return;
        }

        constexpr float sidebar = lunira::ui::Tokens::Sidebar;

        Fill(Rect(0, 0, sidebar, height), DynamicBrush(Hex(0x090A10, 0.93f)));
        Fill(Rect(sidebar, 0, width, height), DynamicBrush(Hex(0x08090E, 0.72f)));
        Line(sidebar, 0, sidebar, height, DynamicBrush(Hex(0xFFFFFF, 0.055f)), 1.0f);
        DrawAppSidebar(sidebar, height);

        if (page_ == Page::Home) {
            DrawHome(0.0f, width, height);
            return;
        }

        if (page_ == Page::Settings) {
            DrawSettings(sidebar, 0.0f, width, height);
            return;
        }

        DrawRoom(sidebar, 0.0f, width, height);
        if (!selectedCameraIdentity_.empty()) {
            DrawCameraOverlay(width, height);
        }
    }

    void DrawBrand() {
        AddHit(31, Rect(15, 13, 216, 61));

        const auto glow = D2D1::RoundedRect(Rect(17, 15, 57, 55), 12, 12);
        renderTarget_->FillRoundedRectangle(glow, DynamicBrush(Hex(0x7857FF, 0.20f)));

        const auto mark = D2D1::RoundedRect(Rect(19, 17, 55, 53), 11, 11);
        renderTarget_->FillRoundedRectangle(mark, violetBrush_.Get());
        DrawMonitor(27, 26, textBrush_.Get());

        Text(L"Lunira Screen", Rect(68, 19, 210, 42), strong_.Get(), textBrush_.Get());
        Text(L"Desktop", Rect(69, 40, 155, 57), tiny_.Get(), dimBrush_.Get());
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

    void DrawAppSidebar(float sidebar, float height) {
        DrawBrand();

        Text(L"NAVEGAÇÃO", Rect(18, 82, sidebar - 18, 99), tinyBold_.Get(), dimBrush_.Get());

        DrawRailButton(31, Rect(10, 108, sidebar - 10, 151), L"Início", page_ == Page::Home, 2);
        if (!roomCode_.empty()) {
            DrawRailButton(0, Rect(10, 157, sidebar - 10, 200), L"Sala atual", page_ == Page::Room, 0);
        }
        DrawRailButton(1, Rect(10, roomCode_.empty() ? 157 : 206, sidebar - 10, roomCode_.empty() ? 200 : 249),
                       L"Configurações", page_ == Page::Settings, 1);

        if (!roomCode_.empty()) {
            Text(L"SALA", Rect(18, 278, sidebar - 18, 295), tinyBold_.Get(), dimBrush_.Get());

            const D2D1_RECT_F codeCard = Rect(10, 304, sidebar - 10, 366);
            const auto rr = D2D1::RoundedRect(codeCard, 14, 14);
            renderTarget_->FillRoundedRectangle(rr, DynamicBrush(Hex(0x0F1118, 0.86f)));
            renderTarget_->DrawRoundedRectangle(rr, borderSoftBrush_.Get(), 1.0f);

            Text(roomCode_, Rect(codeCard.left + 14, codeCard.top + 12, codeCard.right - 44, codeCard.top + 35),
                 bodyStrong_.Get(), textBrush_.Get());
            Text(L"código da sala", Rect(codeCard.left + 14, codeCard.top + 36, codeCard.right - 14, codeCard.bottom - 8),
                 tiny_.Get(), dimBrush_.Get());

            const D2D1_RECT_F copy = Rect(codeCard.right - 36, codeCard.top + 13, codeCard.right - 8, codeCard.top + 41);
            AddHit(3, copy);
            const auto copyRr = D2D1::RoundedRect(copy, 9, 9);
            renderTarget_->FillRoundedRectangle(copyRr, DynamicBrush(Hex(0x7857FF, 0.14f + HoverValue(3) * 0.15f)));
            CenterText(copied_ ? L"✓" : L"⧉", copy, bodyStrong_.Get(), violet2Brush_.Get());

            Text(L"PARTICIPANTES", Rect(18, 390, sidebar - 18, 407), tinyBold_.Get(), dimBrush_.Get());
            const size_t visible = std::min<size_t>(6, roomState_.participants.size());
            for (size_t i = 0; i < visible; ++i) {
                const auto& participant = roomState_.participants[i];
                const float y = 420.0f + static_cast<float>(i) * 42.0f;
                renderTarget_->FillEllipse(
                    D2D1::Ellipse(D2D1::Point2F(28, y + 14), 12, 12),
                    participant.id == roomState_.activeScreenSharerId ? violetPanelBrush_.Get() : panel2Brush_.Get());
                renderTarget_->FillEllipse(
                    D2D1::Ellipse(D2D1::Point2F(37, y + 22), 3, 3),
                    greenBrush_.Get());
                const std::wstring initial = participant.displayName.empty() ? L"?" : participant.displayName.substr(0,1);
                CenterText(initial, Rect(16, y + 2, 40, y + 26), tinyBold_.Get(), textBrush_.Get());
                Text(participant.displayName.empty() ? L"Participante" : std::wstring_view(participant.displayName),
                     Rect(50, y + 2, sidebar - 14, y + 21), body_.Get(), textBrush_.Get());
                Text(participant.id == roomState_.activeScreenSharerId ? L"Transmitindo" : L"Online",
                     Rect(50, y + 21, sidebar - 14, y + 37), tiny_.Get(),
                     participant.id == roomState_.activeScreenSharerId ? violet2Brush_.Get() : dimBrush_.Get());
            }
        } else if (page_ == Page::Home) {
            const D2D1_RECT_F info = Rect(10, 286, sidebar - 10, 354);
            const auto rr = D2D1::RoundedRect(info, 14, 14);
            renderTarget_->FillRoundedRectangle(rr, DynamicBrush(Hex(0x0F1118, 0.78f)));
            renderTarget_->DrawRoundedRectangle(rr, borderSoftBrush_.Get(), 1.0f);
            renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(26, 307), 4, 4), greenBrush_.Get());
            Text(L"Conexão segura", Rect(38, 296, sidebar - 14, 319), bodyStrong_.Get(), textBrush_.Get());
            Text(L"Salas temporárias por código.", Rect(18, 322, sidebar - 14, 344), tiny_.Get(), mutedBrush_.Get());
        }

        const float profileTop = height - 72.0f;
        Line(10, profileTop - 8, sidebar - 10, profileTop - 8, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(29, profileTop + 22), 15, 15), violetPanelBrush_.Get());
        const std::wstring initial = displayName_.empty() ? L"?" : displayName_.substr(0, 1);
        CenterText(initial, Rect(14, profileTop + 7, 44, profileTop + 37), tinyBold_.Get(), violet2Brush_.Get());
        Text(displayName_.empty() ? L"Seu perfil" : std::wstring_view(displayName_),
             Rect(54, profileTop + 7, sidebar - 14, profileTop + 27), bodyStrong_.Get(), textBrush_.Get());
        Text(networkConnected_ ? L"Online" : L"Lunira Screen",
             Rect(54, profileTop + 28, sidebar - 14, profileTop + 46), tiny_.Get(),
             networkConnected_ ? greenBrush_.Get() : dimBrush_.Get());
    }

    void DrawRailButton(
        int hitId,
        const D2D1_RECT_F& rect,
        std::wstring_view label,
        bool active,
        int icon) {

        AddHit(hitId, rect);
        const float hover = HoverValue(hitId);
        const auto rr = D2D1::RoundedRect(rect, 12, 12);

        if (active || hover > 0.01f) {
            const D2D1_COLOR_F base = active ? theme_.violetPanel : theme_.panel;
            const D2D1_COLOR_F hot = active ? Hex(0x261E43) : theme_.panel2;
            renderTarget_->FillRoundedRectangle(
                rr,
                DynamicBrush(MixColor(base, hot, hover)));
        }

        if (active) {
            renderTarget_->DrawRoundedRectangle(rr, violetBrush_.Get(), 1.0f);
            const auto indicator = D2D1::RoundedRect(
                Rect(rect.left + 4, rect.top + 12, rect.left + 7, rect.bottom - 12),
                2, 2);
            renderTarget_->FillRoundedRectangle(indicator, violet2Brush_.Get());
        }

        const float cx = rect.left + 30.0f;
        const float cy = (rect.top + rect.bottom) * 0.5f;
        ID2D1Brush* brush = active ? violet2Brush_.Get() : mutedBrush_.Get();

        if (icon == 0) {
            DrawMonitor(cx - 10, cy - 9, brush);
        } else if (icon == 1) {
            renderTarget_->DrawEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 8, 8),
                brush,
                1.7f);
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 2.5f, 2.5f),
                brush);
        } else {
            Line(cx - 9, cy, cx, cy - 8, brush, 1.7f);
            Line(cx, cy - 8, cx + 9, cy, brush, 1.7f);
            Line(cx - 7, cy - 1, cx - 7, cy + 8, brush, 1.7f);
            Line(cx + 7, cy - 1, cx + 7, cy + 8, brush, 1.7f);
            Line(cx - 7, cy + 8, cx + 7, cy + 8, brush, 1.7f);
        }

        Text(
            label,
            Rect(rect.left + 54, rect.top + 13, rect.right - 12, rect.bottom - 9),
            bodyStrong_.Get(),
            active ? textBrush_.Get() : mutedBrush_.Get());
    }

    void DrawHome(float, float width, float height) {
        const auto layout = lunira::ui::MakeHomeLayout(width, height);
        const auto& hero = layout.hero;
        const auto& form = layout.form;
        const auto& preview = layout.preview;

        Text(L"•  MAIS CONEXÃO, MENOS BARREIRAS",
             Rect(hero.left, hero.top + 2, hero.right, hero.top + 24),
             tinyBold_.Get(), violet2Brush_.Get());

        Text(L"Compartilhe sua tela\ncom quem importa.",
             Rect(hero.left, hero.top + 42, hero.right, hero.top + 142),
             heroTitle_.Get(), textBrush_.Get());

        Text(L"Transmissão em alta qualidade, direto do desktop.\nSem complicação, sem interrupções.",
             Rect(hero.left, hero.top + 158, hero.right - 12, hero.top + 214),
             heroBody_.Get(), mutedBrush_.Get());

        DrawFeaturePill(Rect(hero.left, hero.bottom - 34, hero.left + 118, hero.bottom), L"1080p · 60 FPS");
        DrawFeaturePill(Rect(hero.left + 128, hero.bottom - 34, hero.left + 250, hero.bottom), L"Baixa latência");
        DrawFeaturePill(Rect(hero.left + 260, hero.bottom - 34, hero.left + 405, hero.bottom), L"Conexão segura");

        const auto formShadow = D2D1::RoundedRect(
            Rect(form.left + 5, form.top + 7, form.right + 5, form.bottom + 7), 20, 20);
        renderTarget_->FillRoundedRectangle(formShadow, shadowBrush_.Get());
        const auto formRr = D2D1::RoundedRect(form, 19, 19);
        renderTarget_->FillRoundedRectangle(formRr, DynamicBrush(Hex(0x101219, 0.88f)));
        renderTarget_->DrawRoundedRectangle(formRr, borderSoftBrush_.Get(), 1.0f);

        Text(L"Começar agora", Rect(form.left + 20, form.top + 16, form.right - 20, form.top + 40),
             strong_.Get(), textBrush_.Get());
        Text(L"Crie sua sala ou entre com um código.", Rect(form.left + 20, form.top + 42, form.right - 20, form.top + 62),
             tiny_.Get(), mutedBrush_.Get());

        Text(L"SEU NOME", Rect(form.left + 20, form.top + 76, form.right - 20, form.top + 93),
             tinyBold_.Get(), dimBrush_.Get());
        DrawInput(20, Rect(form.left + 20, form.top + 99, form.right - 20, form.top + 141),
                  displayName_, L"Ex.: Kc", focusedField_ == Field::Name, false);

        const D2D1_RECT_F create = Rect(form.left + 20, form.top + 153, form.right - 20, form.top + 198);
        AddHit(21, create);
        PrimaryButton(create, pendingAction_ == PendingAction::Create ? L"Criando sala…" : L"Criar sala", false, hover_ == 21);

        CenterText(L"OU ENTRE EM UMA SALA",
                   Rect(form.left + 20, form.top + 208, form.right - 20, form.top + 226),
                   tinyBold_.Get(), dimBrush_.Get());

        DrawInput(22, Rect(form.left + 20, form.top + 236, form.right - 122, form.top + 278),
                  roomCodeInput_, L"Código da sala", focusedField_ == Field::Code, true);
        const D2D1_RECT_F join = Rect(form.right - 112, form.top + 236, form.right - 20, form.top + 278);
        AddHit(23, join);
        Button(join, pendingAction_ == PendingAction::Join ? L"Entrando…" : L"Entrar", false, hover_ == 23);

        if (!homeError_.empty()) {
            Text(homeError_, Rect(form.left + 20, form.top + 290, form.right - 20, form.bottom - 12),
                 tiny_.Get(), pendingAction_ == PendingAction::None ? redBrush_.Get() : violet2Brush_.Get());
        }

        const auto previewShadow = D2D1::RoundedRect(
            Rect(preview.left + 7, preview.top + 10, preview.right + 7, preview.bottom + 10), 22, 22);
        renderTarget_->FillRoundedRectangle(previewShadow, shadowBrush_.Get());
        const auto previewRr = D2D1::RoundedRect(preview, 21, 21);
        renderTarget_->FillRoundedRectangle(previewRr, DynamicBrush(Hex(0x0C0E14, 0.90f)));
        renderTarget_->DrawRoundedRectangle(previewRr, DynamicBrush(Hex(0x7857FF, 0.24f)), 1.0f);

        const float chromeBottom = preview.top + 43.0f;
        Line(preview.left, chromeBottom, preview.right, chromeBottom, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(preview.left + 18, preview.top + 21), 4, 4), redBrush_.Get());
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(preview.left + 31, preview.top + 21), 4, 4), amberBrush_.Get());
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(preview.left + 44, preview.top + 21), 4, 4), greenBrush_.Get());
        Text(L"Lunira Screen", Rect(preview.left + 60, preview.top + 10, preview.right - 20, preview.top + 33),
             tinyBold_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F miniRail = Rect(preview.left + 12, chromeBottom + 12, preview.left + 64, preview.bottom - 84);
        const auto railRr = D2D1::RoundedRect(miniRail, 13, 13);
        renderTarget_->FillRoundedRectangle(railRr, DynamicBrush(Hex(0x11131A, 0.92f)));
        renderTarget_->DrawRoundedRectangle(railRr, borderSoftBrush_.Get(), 1.0f);
        const auto selected = D2D1::RoundedRect(Rect(miniRail.left + 8, miniRail.top + 8, miniRail.right - 8, miniRail.top + 42), 9, 9);
        renderTarget_->FillRoundedRectangle(selected, violetPanelBrush_.Get());
        DrawMonitor(miniRail.left + 16, miniRail.top + 16, violet2Brush_.Get());

        const D2D1_RECT_F stage = Rect(preview.left + 76, chromeBottom + 12, preview.right - 14, preview.bottom - 84);
        const auto stageRr = D2D1::RoundedRect(stage, 14, 14);
        renderTarget_->FillRoundedRectangle(stageRr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(stageRr, borderSoftBrush_.Get(), 1.0f);

        const float cx = (stage.left + stage.right) * 0.5f;
        const float cy = (stage.top + stage.bottom) * 0.5f;
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(cx, cy - 18), 48, 48),
                                   DynamicBrush(Hex(0x7857FF, 0.06f)));
        const auto icon = D2D1::RoundedRect(Rect(cx - 26, cy - 44, cx + 26, cy + 8), 14, 14);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(cx - 10, cy - 28, violet2Brush_.Get());
        CenterText(L"Sua sala está pronta", Rect(stage.left + 20, cy + 23, stage.right - 20, cy + 48),
                   bodyStrong_.Get(), textBrush_.Get());
        CenterText(L"Quando você transmitir, sua tela aparece aqui.",
                   Rect(stage.left + 20, cy + 49, stage.right - 20, cy + 72),
                   tiny_.Get(), mutedBrush_.Get());

        const float cardTop = preview.bottom - 70.0f;
        const float gap = 8.0f;
        const float cardW = (lunira::ui::Width(preview) - 28.0f - gap * 2.0f) / 3.0f;
        const wchar_t* labels[] = {L"Sala privada", L"Qualidade", L"Fluidez"};
        const wchar_t* values[] = {L"Código temporário", L"1080p", L"60 FPS"};
        for (int i = 0; i < 3; ++i) {
            const float x = preview.left + 14.0f + i * (cardW + gap);
            const D2D1_RECT_F card = Rect(x, cardTop, x + cardW, preview.bottom - 14.0f);
            const auto rr = D2D1::RoundedRect(card, 11, 11);
            renderTarget_->FillRoundedRectangle(rr, DynamicBrush(Hex(0x11131A, 0.74f)));
            renderTarget_->DrawRoundedRectangle(rr, borderSoftBrush_.Get(), 1.0f);
            Text(labels[i], Rect(card.left + 10, card.top + 8, card.right - 8, card.top + 24),
                 tiny_.Get(), dimBrush_.Get());
            Text(values[i], Rect(card.left + 10, card.top + 26, card.right - 8, card.bottom - 6),
                 tinyBold_.Get(), mutedBrush_.Get());
        }
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

    void DrawInput(
        int hitId,
        const D2D1_RECT_F& rect,
        const std::wstring& value,
        std::wstring_view placeholder,
        bool focused,
        bool code) {

        AddHit(hitId, rect);
        const float hover = HoverValue(hitId);
        const float emphasis = focused ? 1.0f : hover;

        if (emphasis > 0.01f) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                13, 13);
            renderTarget_->FillRoundedRectangle(
                glow,
                DynamicBrush(Hex(0x7857FF, 0.05f + emphasis * 0.09f)));
        }

        const auto rr = D2D1::RoundedRect(rect, 12, 12);
        renderTarget_->FillRoundedRectangle(
            rr,
            DynamicBrush(MixColor(theme_.stage, theme_.panel3, hover * 0.7f)));
        renderTarget_->DrawRoundedRectangle(
            rr,
            DynamicBrush(MixColor(theme_.border, theme_.violet, emphasis)),
            1.0f + emphasis * 0.45f);

        Text(
            value.empty() ? placeholder : std::wstring_view(value),
            Rect(rect.left + 14, rect.top + 11, rect.right - 14, rect.bottom - 8),
            code && !value.empty() ? bodyStrong_.Get() : body_.Get(),
            value.empty() ? dimBrush_.Get() : textBrush_.Get());

        if (focused) {
            const float caretX = std::min(
                rect.right - 14.0f,
                rect.left + 15.0f + static_cast<float>(value.size()) * (code ? 8.5f : 7.2f));
            Line(caretX, rect.top + 12, caretX, rect.bottom - 12, violet2Brush_.Get(), 1.3f);
        }
    }

    void DrawRoom(float, float, float width, float height) {
        const bool hasCameras = !cameraFrames_.empty();
        const auto layout = lunira::ui::MakeRoomLayout(
            width,
            height,
            cameraDockMotion_.Get(),
            hasCameras,
            focused_);

        if (focused_) {
            DrawScreen(layout.screen);
            DrawStageToolbar(
                Rect(
                    layout.screen.left + 12,
                    layout.screen.top + 12,
                    layout.screen.right - 12,
                    layout.screen.top + 58));
            return;
        }

        DrawRoomHeader(layout.header);

        const D2D1_RECT_F workspace = Rect(
            lunira::ui::Tokens::Sidebar + 10.0f,
            layout.header.bottom + 4.0f,
            width - 10.0f,
            layout.controls.top - 4.0f);
        const auto workspaceRr = D2D1::RoundedRect(workspace, 24, 24);
        renderTarget_->FillRoundedRectangle(
            workspaceRr,
            DynamicBrush(Hex(0x090B10, 0.72f)));

        renderTarget_->FillEllipse(
            D2D1::Ellipse(
                D2D1::Point2F(
                    (layout.screen.left + layout.screen.right) * 0.5f,
                    (layout.screen.top + layout.screen.bottom) * 0.5f),
                std::min(240.0f, lunira::ui::Width(layout.screen) * 0.24f),
                std::min(150.0f, lunira::ui::Height(layout.screen) * 0.30f)),
            DynamicBrush(Hex(0x7857FF, sharing_ ? 0.055f : 0.025f)));

        DrawScreen(layout.screen);
        DrawStageToolbar(
            Rect(
                layout.screen.left + 12,
                layout.screen.top + 12,
                layout.screen.right - 12,
                layout.screen.top + 58));

        if (hasCameras && lunira::ui::HasArea(layout.cameras)) {
            DrawCameraDock(layout.cameras);
        }

        DrawControlsDock(layout.controls);
    }

    void DrawRoomHeader(const D2D1_RECT_F& rect) {
        const std::wstring title = L"Sala de " + (displayName_.empty() ? std::wstring(L"você") : displayName_);
        Text(title, Rect(rect.left, rect.top + 1, rect.left + 360, rect.top + 27),
             heading_.Get(), textBrush_.Get());

        const std::wstring subtitle =
            std::to_wstring(roomState_.participants.size()) +
            (roomState_.participants.size() == 1 ? L" participante" : L" participantes") +
            (sharing_ ? L" · transmissão ativa" : L" · pronta para transmitir");
        Text(subtitle, Rect(rect.left, rect.top + 29, rect.left + 430, rect.bottom),
             tiny_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F codePill = Rect(rect.right - 292, rect.top + 8, rect.right - 136, rect.top + 43);
        const auto codeRr = D2D1::RoundedRect(codePill, 12, 12);
        renderTarget_->FillRoundedRectangle(codeRr, DynamicBrush(Hex(0x11131A, 0.84f)));
        renderTarget_->DrawRoundedRectangle(codeRr, borderSoftBrush_.Get(), 1.0f);
        Text(roomCode_.empty() ? L"--------" : std::wstring_view(roomCode_),
             Rect(codePill.left + 13, codePill.top + 8, codePill.right - 38, codePill.bottom - 6),
             tinyBold_.Get(), textBrush_.Get());

        const D2D1_RECT_F copy = Rect(codePill.right - 34, codePill.top + 4, codePill.right - 4, codePill.bottom - 4);
        AddHit(3, copy);
        const auto copyRr = D2D1::RoundedRect(copy, 9, 9);
        renderTarget_->FillRoundedRectangle(copyRr, DynamicBrush(Hex(0x7857FF, 0.12f + HoverValue(3) * 0.16f)));
        CenterText(copied_ ? L"✓" : L"⧉", copy, bodyStrong_.Get(), violet2Brush_.Get());

        const D2D1_RECT_F connection = Rect(rect.right - 124, rect.top + 8, rect.right, rect.top + 43);
        const auto connRr = D2D1::RoundedRect(connection, 12, 12);
        renderTarget_->FillRoundedRectangle(connRr, DynamicBrush(Hex(0x11131A, 0.84f)));
        renderTarget_->DrawRoundedRectangle(connRr, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(D2D1::Ellipse(D2D1::Point2F(connection.left + 17, connection.top + 17), 4, 4),
                                   networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        Text(networkConnected_ ? L"Conectado" : L"Offline",
             Rect(connection.left + 29, connection.top + 7, connection.right - 8, connection.bottom - 5),
             tinyBold_.Get(), mutedBrush_.Get());
    }

    void DrawStage(const D2D1_RECT_F& area) {
        DrawScreen(area);
        DrawStageToolbar(Rect(
            area.left + 12,
            area.top + 12,
            area.right - 12,
            area.top + 58));
    }


    void DrawCallButton(
        int hitId,
        float cx,
        float cy,
        int icon,
        std::wstring_view label,
        bool active,
        bool accent,
        bool danger) {

        const D2D1_RECT_F hit = Rect(cx - 36, cy - 27, cx + 36, cy + 48);
        AddHit(hitId, hit);

        const float hover = HoverValue(hitId);
        const float radius = 22.0f + hover * 2.5f;

        D2D1_COLOR_F base = theme_.panel2;
        D2D1_COLOR_F hot = Hex(0x202431);
        if (active) {
            base = theme_.violetPanel;
            hot = Hex(0x2B2248);
        }
        if (accent) {
            base = theme_.violet;
            hot = theme_.violet2;
        }
        if (danger) {
            base = Hex(0x2A1118);
            hot = Hex(0x4A1722);
        }

        const auto circle = D2D1::Ellipse(D2D1::Point2F(cx, cy), radius, radius);
        renderTarget_->FillEllipse(circle, DynamicBrush(MixColor(base, hot, hover)));
        renderTarget_->DrawEllipse(
            circle,
            DynamicBrush(MixColor(
                danger ? theme_.red : theme_.border,
                danger ? Hex(0xFF8296) : theme_.violet,
                active ? 0.75f : hover * 0.7f)),
            1.0f + hover * 0.4f);

        ID2D1Brush* iconBrush = danger ? redBrush_.Get() : textBrush_.Get();
        if (icon == 0) {
            const auto body = D2D1::RoundedRect(Rect(cx - 10, cy - 7, cx + 7, cy + 7), 3, 3);
            renderTarget_->DrawRoundedRectangle(body, iconBrush, 1.7f);
            Line(cx + 7, cy - 4, cx + 13, cy - 8, iconBrush, 1.6f);
            Line(cx + 13, cy - 8, cx + 13, cy + 8, iconBrush, 1.6f);
            Line(cx + 13, cy + 8, cx + 7, cy + 4, iconBrush, 1.6f);
        } else if (icon == 1) {
            DrawMonitor(cx - 10, cy - 8, iconBrush);
        } else if (icon == 2) {
            Line(cx - 10, cy - 5, cx - 4, cy - 5, iconBrush, 1.8f);
            Line(cx - 4, cy - 5, cx + 2, cy - 11, iconBrush, 1.8f);
            Line(cx + 2, cy - 11, cx + 2, cy + 11, iconBrush, 1.8f);
            Line(cx + 2, cy + 11, cx - 4, cy + 5, iconBrush, 1.8f);
            Line(cx - 4, cy + 5, cx - 10, cy + 5, iconBrush, 1.8f);
            renderTarget_->DrawEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx + 5, cy), 7, 9),
                iconBrush,
                1.4f);
        } else if (icon == 3) {
            Line(cx - 9, cy + 8, cx - 9, cy - 1, iconBrush, 2.0f);
            Line(cx, cy + 8, cx, cy - 8, iconBrush, 2.0f);
            Line(cx + 9, cy + 8, cx + 9, cy - 13, iconBrush, 2.0f);
        } else {
            Line(cx - 9, cy - 9, cx + 9, cy + 9, iconBrush, 2.0f);
            Line(cx + 9, cy - 9, cx - 9, cy + 9, iconBrush, 2.0f);
        }

        CenterText(
            label,
            Rect(cx - 48, cy + 28, cx + 48, cy + 48),
            tiny_.Get(),
            danger ? redBrush_.Get() : mutedBrush_.Get());
    }

    void DrawControlsDock(const D2D1_RECT_F& rect) {
        const float center = (rect.left + rect.right) * 0.5f;
        constexpr float step = 80.0f;
        const float cy = rect.top + 28.0f;

        const D2D1_RECT_F bar = Rect(center - 222.0f, rect.top + 1, center + 222.0f, rect.bottom - 1);
        const auto shadow = D2D1::RoundedRect(Rect(bar.left + 4, bar.top + 6, bar.right + 4, bar.bottom + 6), 23, 23);
        renderTarget_->FillRoundedRectangle(shadow, shadowBrush_.Get());

        const auto barRr = D2D1::RoundedRect(bar, 22, 22);
        renderTarget_->FillRoundedRectangle(barRr, DynamicBrush(Hex(0x101219, 0.96f)));
        renderTarget_->DrawRoundedRectangle(barRr, DynamicBrush(Hex(0xFFFFFF, 0.065f)), 1.0f);

        DrawCallButton(6, center - step * 2, cy, 0, cameraOn_ ? L"Câmera on" : L"Câmera", cameraOn_, false, false);
        DrawCallButton(7, center - step, cy, 1, localScreenSharing_ ? L"Parar tela" : L"Compartilhar", localScreenSharing_, true, false);
        DrawCallButton(8, center, cy, 2, systemAudioOn_ ? L"Áudio on" : L"Áudio da tela", systemAudioOn_, false, false);
        DrawCallButton(9, center + step, cy, 3, L"Estatísticas", statsOn_, false, false);
        DrawCallButton(30, center + step * 2, cy, 4, L"Sair", false, false, true);

        const float reveal = statsMotion_.Get();
        if (reveal > 0.03f) {
            const D2D1_RECT_F panel = Rect(center - 300, rect.top - 82, center + 300, rect.top - 12);
            const auto rr = D2D1::RoundedRect(panel, 16, 16);
            renderTarget_->FillRoundedRectangle(rr, DynamicBrush(Hex(0x101219, 0.97f * reveal)));
            renderTarget_->DrawRoundedRectangle(rr, DynamicBrush(Hex(0x7857FF, 0.18f * reveal)), 1.0f);

            const float colW = lunira::ui::Width(panel) / 4.0f;
            const wchar_t* labels[] = {L"Signaling", L"LiveKit", L"Agora", L"FPS"};
            const std::wstring values[] = {
                networkConnected_ ? L"Online" : L"Offline",
                mediaConnected_ ? L"Ativo" : L"—",
                agoraConnected_ ? L"Ativo" : L"—",
                std::to_wstring(fps_)
            };
            for (int i = 0; i < 4; ++i) {
                const float left = panel.left + i * colW;
                if (i > 0) Line(left, panel.top + 12, left, panel.bottom - 12,
                                DynamicBrush(Hex(0xFFFFFF, 0.055f * reveal)), 1.0f);
                Text(labels[i], Rect(left + 14, panel.top + 12, left + colW - 10, panel.top + 31),
                     tiny_.Get(), DynamicBrush(Hex(0x747A8A, reveal)));
                Text(values[i], Rect(left + 14, panel.top + 34, left + colW - 10, panel.bottom - 10),
                     bodyStrong_.Get(), DynamicBrush(Hex(0xF3F3F8, reveal)));
            }
        }

        if (!roomNotice_.empty()) {
            Text(roomNotice_, Rect(rect.left, rect.top - 24, center - 316, rect.top - 5),
                 tiny_.Get(), amberBrush_.Get());
        }
    }

    void DrawControlButton(const D2D1_RECT_F& rect, std::wstring_view label, int icon, bool active, bool hover, bool accent) {
        const auto rr = D2D1::RoundedRect(rect, 13, 13);
        ID2D1Brush* background = accent ? violetBrush_.Get() : (hover ? panel2Brush_.Get() : panel3Brush_.Get());
        ID2D1Brush* stroke = icon == 4 ? redBrush_.Get() : (accent || active ? violetBrush_.Get() : borderBrush_.Get());
        renderTarget_->FillRoundedRectangle(rr, background);
        renderTarget_->DrawRoundedRectangle(rr, stroke, 1.0f);
        ID2D1Brush* foreground = accent ? textBrush_.Get() : (icon == 4 ? redBrush_.Get() : (active ? violet2Brush_.Get() : mutedBrush_.Get()));
        DrawControlIcon(icon, rect.left + 16, (rect.top + rect.bottom) * .5f, foreground);
        Text(label, Rect(rect.left + 38, rect.top + 16, rect.right - 8, rect.bottom - 12), tinyBold_.Get(),
             accent ? textBrush_.Get() : textBrush_.Get());
    }

    void DrawControlIcon(int icon, float x, float y, ID2D1Brush* brush) {
        if (icon == 0) { // camera
            renderTarget_->DrawRoundedRectangle(D2D1::RoundedRect(Rect(x - 9, y - 6, x + 5, y + 6), 2, 2), brush, 1.5f);
            Line(x + 5, y - 4, x + 10, y - 7, brush, 1.5f); Line(x + 10, y - 7, x + 10, y + 7, brush, 1.5f); Line(x + 10, y + 7, x + 5, y + 4, brush, 1.5f);
        } else if (icon == 1) { DrawMonitor(x - 10, y - 8, brush); }
        else if (icon == 2) { Line(x - 9, y, x + 9, y, brush, 1.5f); Line(x - 6, y - 5, x - 6, y + 5, brush, 1.5f); Line(x - 2, y - 8, x - 2, y + 8, brush, 1.5f); Line(x + 2, y - 5, x + 2, y + 5, brush, 1.5f); Line(x + 6, y - 3, x + 6, y + 3, brush, 1.5f); }
        else if (icon == 3) { Line(x - 9, y + 7, x - 4, y + 1, brush, 1.5f); Line(x - 4, y + 1, x, y + 4, brush, 1.5f); Line(x, y + 4, x + 8, y - 7, brush, 1.5f); }
        else { Line(x - 7, y - 7, x + 7, y + 7, brush, 1.7f); Line(x + 7, y - 7, x - 7, y + 7, brush, 1.7f); }
    }

    void DrawStageToolbar(const D2D1_RECT_F& rect) {
        const auto shadow = D2D1::RoundedRect(
            Rect(rect.left + 3, rect.top + 4, rect.right + 3, rect.bottom + 4),
            16, 16);
        renderTarget_->FillRoundedRectangle(
            shadow,
            DynamicBrush(Hex(0x000000, 0.26f)));

        const auto bar = D2D1::RoundedRect(rect, 16, 16);
        renderTarget_->FillRoundedRectangle(
            bar,
            DynamicBrush(Hex(0x0D0F15, 0.91f)));
        renderTarget_->DrawRoundedRectangle(bar, borderSoftBrush_.Get(), 1.0f);

        const auto icon = D2D1::RoundedRect(
            Rect(rect.left + 9, rect.top + 7, rect.left + 41, rect.top + 39),
            9, 9);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(rect.left + 15, rect.top + 13, violet2Brush_.Get());

        const std::wstring sharer = roomState_.activeScreenSharerName.empty()
            ? (displayName_.empty() ? L"Participante" : displayName_)
            : roomState_.activeScreenSharerName;

        Text(
            sharing_ ? sharer + L" está compartilhando" : L"Área de transmissão",
            Rect(rect.left + 52, rect.top + 5, rect.left + 410, rect.top + 26),
            bodyStrong_.Get(),
            textBrush_.Get());
        Text(
            sharing_ ? L"AO VIVO" : L"Monitor ou janela",
            Rect(rect.left + 52, rect.top + 25, rect.left + 250, rect.top + 43),
            tinyBold_.Get(),
            sharing_ ? greenBrush_.Get() : mutedBrush_.Get());

        const auto quality = D2D1::RoundedRect(
            Rect(rect.right - 222, rect.top + 8, rect.right - 108, rect.top + 38),
            15, 15);
        renderTarget_->FillRoundedRectangle(quality, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(quality, borderSoftBrush_.Get(), 1.0f);
        CenterText(
            L"1080p · " + std::to_wstring(fps_) + L" FPS",
            Rect(rect.right - 216, rect.top + 13, rect.right - 114, rect.top + 35),
            tinyBold_.Get(),
            mutedBrush_.Get());

        const D2D1_RECT_F focus =
            Rect(rect.right - 96, rect.top + 7, rect.right - 8, rect.top + 39);
        AddHit(2, focus);
        Button(
            focus,
            focused_ ? L"Voltar" : L"Focar",
            focused_,
            hover_ == 2);
    }

    void DrawScreen(const D2D1_RECT_F& rect) {
        const float live = shareMotion_.Get();

        const auto shadow = D2D1::RoundedRect(
            Rect(rect.left + 8, rect.top + 10, rect.right + 8, rect.bottom + 10),
            22, 22);
        renderTarget_->FillRoundedRectangle(shadow, shadowBrush_.Get());

        if (live > 0.01f) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                22, 22);
            renderTarget_->FillRoundedRectangle(
                glow,
                DynamicBrush(Hex(0x7857FF, 0.035f + live * 0.10f)));
        }

        const auto screenRr = D2D1::RoundedRect(rect, 20, 20);
        renderTarget_->FillRoundedRectangle(screenRr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(
            screenRr,
            DynamicBrush(MixColor(theme_.borderSoft, theme_.violet, live * 0.78f)),
            1.0f + live * 0.35f);

        if (sharing_) {
            if (DrawFrame(screenFrame_, rect, true)) return;

            const float cx = (rect.left + rect.right) * 0.5f;
            const float cy = (rect.top + rect.bottom) * 0.5f - 4.0f;
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 58, 58),
                DynamicBrush(Hex(0x7857FF, 0.08f)));
            const auto icon =
                D2D1::RoundedRect(Rect(cx - 30, cy - 30, cx + 30, cy + 30), 17, 17);
            renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
            DrawMonitor(cx - 10, cy - 8, violet2Brush_.Get());

            CenterText(
                L"Conectando à transmissão…",
                Rect(rect.left + 40, cy + 45, rect.right - 40, cy + 71),
                heading_.Get(),
                textBrush_.Get());
            CenterText(
                L"O vídeo entra aqui assim que os primeiros frames chegarem.",
                Rect(rect.left + 40, cy + 77, rect.right - 40, cy + 101),
                body_.Get(),
                mutedBrush_.Get());
            return;
        }

        const float cx = (rect.left + rect.right) * 0.5f;
        const float cy = (rect.top + rect.bottom) * 0.5f - 4.0f;

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(cx, cy), 64, 64),
            DynamicBrush(Hex(0x7857FF, 0.055f)));

        const auto icon =
            D2D1::RoundedRect(Rect(cx - 30, cy - 30, cx + 30, cy + 30), 17, 17);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(cx - 11, cy - 9, violet2Brush_.Get());

        CenterText(
            L"Nenhuma tela sendo compartilhada",
            Rect(rect.left + 40, cy + 46, rect.right - 40, cy + 72),
            heading_.Get(),
            textBrush_.Get());
        CenterText(
            L"Use Compartilhar para escolher um monitor ou uma janela.",
            Rect(rect.left + 40, cy + 78, rect.right - 40, cy + 102),
            body_.Get(),
            mutedBrush_.Get());

        const auto hint = D2D1::RoundedRect(
            Rect(cx - 128, cy + 118, cx + 128, cy + 150),
            16, 16);
        renderTarget_->FillRoundedRectangle(hint, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(hint, borderSoftBrush_.Get(), 1.0f);
        CenterText(
            L"1080p · até 60 FPS · proporção preservada",
            Rect(cx - 120, cy + 123, cx + 120, cy + 146),
            tiny_.Get(),
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
        bool contain = true) {

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

        D2D1_RECT_F source = Rect(0, 0, bitmapSize.width, bitmapSize.height);
        D2D1_RECT_F target = destination;
        const float sourceAspect = bitmapSize.width / bitmapSize.height;
        const float destinationAspect = destinationWidth / destinationHeight;

        if (contain) {
            const float scale = std::min(
                destinationWidth / bitmapSize.width,
                destinationHeight / bitmapSize.height);
            const float drawW = bitmapSize.width * scale;
            const float drawH = bitmapSize.height * scale;
            target = Rect(
                destination.left + (destinationWidth - drawW) * 0.5f,
                destination.top + (destinationHeight - drawH) * 0.5f,
                destination.left + (destinationWidth + drawW) * 0.5f,
                destination.top + (destinationHeight + drawH) * 0.5f);
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
            target,
            1.0f,
            D2D1_BITMAP_INTERPOLATION_MODE_LINEAR,
            source);
        renderTarget_->PopAxisAlignedClip();
        return true;
    }

    bool DrawCameraFrame(std::wstring_view identity, const D2D1_RECT_F& destination) {
        auto it = cameraFrames_.find(std::wstring(identity));
        return it != cameraFrames_.end() && DrawFrame(it->second, destination, false);
    }

    void DrawCameraDock(const D2D1_RECT_F& rect) {
        std::vector<const lunira::Participant*> active;
        active.reserve(roomState_.participants.size());
        for (const auto& participant : roomState_.participants) {
            if (cameraFrames_.contains(participant.id)) active.push_back(&participant);
        }
        if (active.empty()) return;

        const auto dock = D2D1::RoundedRect(rect, 15, 15);
        renderTarget_->FillRoundedRectangle(
            dock,
            DynamicBrush(Hex(0x0D0F15, 0.92f)));
        renderTarget_->DrawRoundedRectangle(dock, borderSoftBrush_.Get(), 1.0f);

        const float headerBottom = std::min(rect.bottom, rect.top + 40.0f);
        AddHit(10, Rect(rect.left, rect.top, rect.right, headerBottom));

        Text(
            L"Câmeras",
            Rect(rect.left + 14, rect.top + 8, rect.left + 80, headerBottom - 7),
            bodyStrong_.Get(),
            textBrush_.Get());

        Text(
            std::to_wstring(active.size()) + (active.size() == 1 ? L" ligada" : L" ligadas"),
            Rect(rect.left + 82, rect.top + 9, rect.left + 188, headerBottom - 7),
            tiny_.Get(),
            mutedBrush_.Get());

        const float arrowY = rect.top + 19.0f;
        if (camerasOpen_) {
            Line(rect.right - 28, arrowY - 3, rect.right - 21, arrowY + 4, mutedBrush_.Get(), 1.5f);
            Line(rect.right - 21, arrowY + 4, rect.right - 14, arrowY - 3, mutedBrush_.Get(), 1.5f);
        } else {
            Line(rect.right - 28, arrowY + 3, rect.right - 21, arrowY - 4, mutedBrush_.Get(), 1.5f);
            Line(rect.right - 21, arrowY - 4, rect.right - 14, arrowY + 3, mutedBrush_.Get(), 1.5f);
        }

        cameraHitIdentities_.fill({});
        if (cameraDockMotion_.Get() < 0.12f || lunira::ui::Height(rect) < 58.0f) return;

        const size_t count = std::min<size_t>(cameraHitIdentities_.size(), active.size());
        const float gap = 10.0f;
        const float tileTop = rect.top + 40.0f;
        const float tileBottom = rect.bottom - 8.0f;
        const float available = lunira::ui::Width(rect) - 20.0f;
        const float tileW = std::min(
            196.0f,
            (available - gap * static_cast<float>(count - 1)) /
                static_cast<float>(count));
        const float rowW =
            tileW * static_cast<float>(count) +
            gap * static_cast<float>(count - 1);
        const float startX = rect.left + 10.0f + (available - rowW) * 0.5f;

        static constexpr std::array<unsigned, 6> backgrounds{
            0x211A35, 0x162632, 0x2B1C31, 0x20283A, 0x2D2437, 0x17302C
        };

        for (size_t i = 0; i < count; ++i) {
            const auto& participant = *active[i];
            cameraHitIdentities_[i] = participant.id;
            const float x = startX + static_cast<float>(i) * (tileW + gap);
            const D2D1_RECT_F tile = Rect(x, tileTop, x + tileW, tileBottom);
            const bool self = participant.displayName == displayName_;

            DrawCameraTile(
                24 + static_cast<int>(i),
                tile,
                participant.id,
                participant.displayName,
                self ? std::wstring_view(L"VOCÊ") : std::wstring_view{},
                backgrounds[i],
                participant.displayName.empty() ? L"?" : participant.displayName.substr(0, 1));
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
        const float hover = HoverValue(hitId);
        const float lift = hover * 2.0f;
        const D2D1_RECT_F tile = Rect(
            rect.left,
            rect.top - lift,
            rect.right,
            rect.bottom - lift);

        const auto rr = D2D1::RoundedRect(tile, 12, 12);
        renderTarget_->FillRoundedRectangle(rr, DynamicBrush(Hex(background)));
        renderTarget_->DrawRoundedRectangle(
            rr,
            DynamicBrush(MixColor(theme_.border, theme_.violet, hover)),
            1.0f + hover * 0.6f);

        const D2D1_RECT_F video = Rect(tile.left, tile.top, tile.right, tile.bottom - 29.0f);
        if (!DrawCameraFrame(identity, video)) {
            const float cx = (video.left + video.right) * 0.5f;
            const float cy = (video.top + video.bottom) * 0.5f;
            renderTarget_->FillEllipse(
                D2D1::Ellipse(D2D1::Point2F(cx, cy), 22, 22),
                violetPanelBrush_.Get());
            CenterText(initial, Rect(cx - 22, cy - 22, cx + 22, cy + 22), heading_.Get(), violet2Brush_.Get());
        }

        Fill(
            Rect(tile.left, tile.bottom - 29, tile.right, tile.bottom),
            DynamicBrush(Hex(0x090B10, 0.94f)));
        Text(
            name,
            Rect(tile.left + 10, tile.bottom - 24, tile.right - 62, tile.bottom - 6),
            bodyStrong_.Get(),
            textBrush_.Get());

        if (!badge.empty()) {
            const auto tag = D2D1::RoundedRect(
                Rect(tile.right - 54, tile.bottom - 23, tile.right - 8, tile.bottom - 7),
                8, 8);
            renderTarget_->FillRoundedRectangle(tag, violetPanelBrush_.Get());
            CenterText(
                badge,
                Rect(tile.right - 52, tile.bottom - 22, tile.right - 10, tile.bottom - 7),
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
        renderTarget_->DrawRoundedRectangle(D2D1::RoundedRect(Rect(copy.left + 11, copy.top + 9, copy.right - 9, copy.bottom - 11), 2, 2), textBrush_.Get(), 1.3f);
        renderTarget_->DrawRoundedRectangle(D2D1::RoundedRect(Rect(copy.left + 8, copy.top + 12, copy.right - 12, copy.bottom - 8), 2, 2), textBrush_.Get(), 1.3f);

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

    void DrawSettings(float, float, float width, float height) {
        const auto layout = lunira::ui::MakeSettingsLayout(width, height);

        Text(
            L"Configurações",
            Rect(layout.header.left, layout.header.top + 3, layout.header.right, layout.header.top + 35),
            title_.Get(),
            textBrush_.Get());
        Text(
            L"Interface, transmissão e atualização do aplicativo.",
            Rect(layout.header.left, layout.header.top + 39, layout.header.right, layout.header.bottom),
            body_.Get(),
            mutedBrush_.Get());

        const std::wstring build =
            std::wstring(L"UI ") + LUNIRA_WIDEN(LUNIRA_UI_REV) +
            L" · " + LUNIRA_WIDEN(LUNIRA_GIT_SHA);
        const D2D1_RECT_F buildBadge =
            Rect(layout.header.right - 176, layout.header.top + 7, layout.header.right, layout.header.top + 39);
        const auto buildRr = D2D1::RoundedRect(buildBadge, 16, 16);
        renderTarget_->FillRoundedRectangle(buildRr, violetPanelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(buildRr, violetBrush_.Get(), 1.0f);
        CenterText(
            build,
            Rect(buildBadge.left + 8, buildBadge.top + 5, buildBadge.right - 8, buildBadge.bottom - 4),
            tinyBold_.Get(),
            violet2Brush_.Get());

        Card(layout.leftCard);
        Card(layout.rightCard);

        Text(
            L"Interface",
            Rect(layout.leftCard.left + 20, layout.leftCard.top + 18, layout.leftCard.right - 20, layout.leftCard.top + 44),
            strong_.Get(),
            textBrush_.Get());
        Text(
            L"Nova base de layout e movimento.",
            Rect(layout.leftCard.left + 20, layout.leftCard.top + 47, layout.leftCard.right - 20, layout.leftCard.top + 68),
            tiny_.Get(),
            mutedBrush_.Get());

        SettingRow(
            Rect(layout.leftCard.left + 16, layout.leftCard.top + 86, layout.leftCard.right - 16, layout.leftCard.top + 134),
            L"Layout responsivo",
            L"Regiões calculadas fora do main.cpp",
            true);
        SettingRow(
            Rect(layout.leftCard.left + 16, layout.leftCard.top + 144, layout.leftCard.right - 16, layout.leftCard.top + 192),
            L"Animações sutis",
            L"Timer ativo somente durante transições",
            true);

        Text(
            L"Transmissão",
            Rect(layout.rightCard.left + 20, layout.rightCard.top + 18, layout.rightCard.right - 20, layout.rightCard.top + 44),
            strong_.Get(),
            textBrush_.Get());
        Text(
            L"Vídeo nativo sem sacrificar o enquadramento.",
            Rect(layout.rightCard.left + 20, layout.rightCard.top + 47, layout.rightCard.right - 20, layout.rightCard.top + 68),
            tiny_.Get(),
            mutedBrush_.Get());

        SettingRow(
            Rect(layout.rightCard.left + 16, layout.rightCard.top + 86, layout.rightCard.right - 16, layout.rightCard.top + 134),
            L"Proporção preservada",
            L"A tela usa contain; câmera usa cover",
            true);
        SettingRow(
            Rect(layout.rightCard.left + 16, layout.rightCard.top + 144, layout.rightCard.right - 16, layout.rightCard.top + 192),
            L"Aceleração nativa",
            L"Direct2D + Agora + LiveKit",
            true);

        if (lunira::ui::Height(layout.updateCard) < 100.0f) return;

        Card(layout.updateCard);
        Text(
            L"Atualizações",
            Rect(layout.updateCard.left + 20, layout.updateCard.top + 18, layout.updateCard.right - 220, layout.updateCard.top + 44),
            strong_.Get(),
            textBrush_.Get());

        const std::wstring versionLine =
            L"Versão instalada: " + lunira::UpdaterClient::CurrentVersion();
        Text(
            versionLine,
            Rect(layout.updateCard.left + 20, layout.updateCard.top + 48, layout.updateCard.right - 220, layout.updateCard.top + 70),
            body_.Get(),
            mutedBrush_.Get());

        Text(
            updateStatus_.empty() ? L"Verificação automática ativada." : std::wstring_view(updateStatus_),
            Rect(layout.updateCard.left + 20, layout.updateCard.top + 78, layout.updateCard.right - 220, layout.updateCard.bottom - 18),
            body_.Get(),
            updateAvailable_ ? violet2Brush_.Get() : textBrush_.Get());

        const D2D1_RECT_F action = Rect(
            layout.updateCard.right - 196,
            layout.updateCard.top + 28,
            layout.updateCard.right - 20,
            layout.updateCard.top + 76);
        AddHit(18, action);

        const std::wstring actionLabel = updater_.IsBusy()
            ? (updateDownloading_ ? L"Baixando…" : L"Verificando…")
            : (updateAvailable_ ? L"Baixar atualização" : L"Verificar agora");

        if (updateAvailable_) {
            PrimaryButton(action, actionLabel, false, hover_ == 18);
        } else {
            Button(action, actionLabel, false, hover_ == 18);
        }

        if (updateDownloading_ && updateProgress_ >= 0) {
            const D2D1_RECT_F track = Rect(
                layout.updateCard.left + 20,
                layout.updateCard.bottom - 18,
                layout.updateCard.right - 20,
                layout.updateCard.bottom - 12);
            const auto trackRr = D2D1::RoundedRect(track, 3, 3);
            renderTarget_->FillRoundedRectangle(trackRr, panel3Brush_.Get());
            const float fraction =
                std::clamp(updateProgress_ / 100.0f, 0.0f, 1.0f);
            const auto progress = D2D1::RoundedRect(
                Rect(
                    track.left,
                    track.top,
                    track.left + lunira::ui::Width(track) * fraction,
                    track.bottom),
                3, 3);
            renderTarget_->FillRoundedRectangle(progress, violetBrush_.Get());
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

    void Button(
        const D2D1_RECT_F& rect,
        std::wstring_view label,
        bool active,
        bool hover) {

        const float hoverAmount = hover ? 1.0f : 0.0f;
        const auto rr = D2D1::RoundedRect(rect, 12, 12);

        if (active || hover) {
            const auto glow = D2D1::RoundedRect(
                Rect(rect.left - 2, rect.top - 2, rect.right + 2, rect.bottom + 2),
                14, 14);
            renderTarget_->FillRoundedRectangle(
                glow,
                DynamicBrush(Hex(0x7857FF, active ? 0.10f : 0.05f)));
        }

        renderTarget_->FillRoundedRectangle(
            rr,
            DynamicBrush(MixColor(
                active ? theme_.violetPanel : theme_.panel3,
                active ? Hex(0x2A2148) : theme_.panel2,
                hoverAmount)));
        renderTarget_->DrawRoundedRectangle(
            rr,
            active ? violetBrush_.Get() : DynamicBrush(MixColor(theme_.border, theme_.muted, hoverAmount * 0.35f)),
            1.0f);

        CenterText(
            label,
            Rect(rect.left + 8, rect.top + 4, rect.right - 8, rect.bottom - 4),
            bodyStrong_.Get(),
            active ? violet2Brush_.Get() : textBrush_.Get());
    }

    void PrimaryButton(
        const D2D1_RECT_F& rect,
        std::wstring_view label,
        bool danger,
        bool hover) {

        const auto glow = D2D1::RoundedRect(
            Rect(rect.left - 3, rect.top - 3, rect.right + 3, rect.bottom + 3),
            15, 15);
        renderTarget_->FillRoundedRectangle(
            glow,
            DynamicBrush(Hex(
                danger ? 0xFF5F78 : 0x7857FF,
                hover ? 0.16f : 0.10f)));

        const auto rr = D2D1::RoundedRect(rect, 13, 13);
        const D2D1_COLOR_F base = danger ? theme_.red : theme_.violet;
        const D2D1_COLOR_F hot = danger ? Hex(0xFF7890) : Hex(0x8D72FF);
        renderTarget_->FillRoundedRectangle(
            rr,
            DynamicBrush(MixColor(base, hot, hover ? 1.0f : 0.0f)));

        CenterText(
            label,
            Rect(rect.left + 8, rect.top + 5, rect.right - 8, rect.bottom - 5),
            bodyStrong_.Get(),
            textBrush_.Get());
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
            SyncUiAnimationTargets();
            StartUiAnimation();
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
                if (!agora_.StartSharing(publisher, pendingScreenSource_, 1920, 1080, fps_, AgoraCallback())) {
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
            pageMotion_.Snap(0.0f);
            pageMotion_.SetTarget(1.0f);
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
        if (startupSplash_) {
            startupSplash_ = false;
            BeginPageTransition();
            InvalidateRect(hwnd_, nullptr, FALSE);
            return;
        }
        const int id = HitTest(ToDip(px), ToDip(py));
        const Page pageBefore = page_;

        switch (id) {
        case 0:
            if (!roomCode_.empty()) {
                page_ = Page::Room;
                focusedField_ = Field::None;
            }
            break;
        case 31:
            page_ = Page::Home;
            focusedField_ = Field::None;
            break;
        case 1:
            page_ = Page::Settings;
            focusedField_ = Field::None;
            break;
        case 16:
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
            break;
        case 24:
        case 25:
        case 26:
        case 27:
        case 28:
        case 29: {
            const size_t slot = static_cast<size_t>(id - 24);
            if (slot < cameraHitIdentities_.size()) {
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
        case 30:
            if (localScreenSharing_ || screenShareStarting_) StopNativeScreenShare(true);
            if (socket_.IsConnected() && !roomCode_.empty()) {
                std::string payload = "{\"roomId\":" + lunira::SocketIoClient::JsonQuote(roomCode_) + "}";
                socket_.Emit("leave-room", payload);
            }
            StopSystemAudioCapture(true);
            StopLocalCameraCapture(true);
            media_.Stop(); agora_.Stop(); mediaConnected_ = false; mediaStarting_ = false;
            cameraFrames_.clear(); screenFrame_ = {}; page_ = Page::Home;
            selectedCameraIdentity_.clear(); focused_ = false;
            break;
        default:
            break;
        }

        if (page_ != pageBefore) BeginPageTransition();
        SyncUiAnimationTargets();
        StartUiAnimation();
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

    bool startupSplash_ = true;
    ULONGLONG startupStartedAt_ = 0;
    float ambientPhase_ = 0.0f;

    bool trackingMouse_ = false;
    int hover_ = -1;
    bool uiAnimationTimerRunning_ = false;

    lunira::ui::MotionValue pageMotion_{1.0f};
    lunira::ui::MotionValue cameraDockMotion_{0.0f};
    lunira::ui::MotionValue statsMotion_{0.0f};
    lunira::ui::MotionValue shareMotion_{0.0f};
    std::array<lunira::ui::MotionValue, 64> hoverMotion_{};

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
    ComPtr<ID2D1SolidColorBrush> dynamicBrush_;

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
