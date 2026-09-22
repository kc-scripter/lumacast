#include <windows.h>
#include <windowsx.h>
#include <d2d1.h>
#include <d2d1helper.h>
#include <dwrite.h>
#include <dwmapi.h>
#include <wrl/client.h>

#include "socket_io_client.h"

#include <algorithm>
#include <cstring>
#include <cwctype>
#include <memory>
#include <array>
#include <string>
#include <string_view>

#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "dwmapi.lib")

using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kWindowClass[] = L"LuniraNativeWindow";
constexpr wchar_t kWindowTitle[] = L"Lunira Screen";
constexpr UINT kSocketEventMessage = WM_APP + 42;

D2D1_COLOR_F Hex(unsigned rgb, float alpha = 1.0f) {
    return D2D1::ColorF(
        ((rgb >> 16) & 0xff) / 255.0f,
        ((rgb >> 8) & 0xff) / 255.0f,
        (rgb & 0xff) / 255.0f,
        alpha);
}

struct Theme {
    D2D1_COLOR_F bg = Hex(0x090A0F);
    D2D1_COLOR_F panel = Hex(0x10121A);
    D2D1_COLOR_F panel2 = Hex(0x151721);
    D2D1_COLOR_F panel3 = Hex(0x0C0E14);
    D2D1_COLOR_F stage = Hex(0x06070B);
    D2D1_COLOR_F border = Hex(0x292C38);
    D2D1_COLOR_F borderSoft = Hex(0x20232D);
    D2D1_COLOR_F text = Hex(0xF4F2F8);
    D2D1_COLOR_F muted = Hex(0x9296A8);
    D2D1_COLOR_F dim = Hex(0x666A7B);
    D2D1_COLOR_F violet = Hex(0x7657FF);
    D2D1_COLOR_F violet2 = Hex(0xA58EFF);
    D2D1_COLOR_F violetPanel = Hex(0x211A31);
    D2D1_COLOR_F green = Hex(0x49E6A1);
    D2D1_COLOR_F red = Hex(0xFF5A7A);
    D2D1_COLOR_F amber = Hex(0xFFC96B);
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
        wc.lpszClassName = kWindowClass;
        wc.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;

        if (!RegisterClassExW(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            return false;
        }

        RECT desired{ 0, 0, 1440, 900 };
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

        ShowWindow(hwnd_, SW_SHOW);
        UpdateWindow(hwnd_);
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
            info->ptMinTrackSize.x = static_cast<LONG>(1180.0f * Scale());
            info->ptMinTrackSize.y = static_cast<LONG>(720.0f * Scale());
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
                InvalidateRect(hwnd_, nullptr, FALSE);
            }
            return 0;
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
        renderTarget_->SetTransform(D2D1::Matrix3x2F::Identity());
        renderTarget_->Clear(theme_.bg);

        DrawShell(width, height);

        const HRESULT hr = renderTarget_->EndDraw();
        if (hr == D2DERR_RECREATE_TARGET) {
            DiscardDeviceResources();
        }

        EndPaint(hwnd_, &ps);
    }

    void DrawShell(float width, float height) {
        constexpr float top = 68.0f;
        constexpr float rail = 78.0f;

        Fill(Rect(0, 0, width, top), panelBrush_.Get());
        Line(0, top, width, top, borderSoftBrush_.Get(), 1.0f);

        DrawBrand();

        if (page_ == Page::Home) {
            DrawHomeTopRight(width);
            DrawHome(top, width, height);
            return;
        }

        DrawTopRight(width);
        Fill(Rect(0, top, rail, height), panelBrush_.Get());
        Line(rail, top, rail, height, borderSoftBrush_.Get(), 1.0f);
        DrawRail(top, rail, height);

        if (page_ == Page::Settings) {
            DrawSettings(rail, top, width, height);
        } else {
            DrawRoom(rail, top, width, height);
            if (selectedCamera_ >= 0) {
                DrawCameraOverlay(width, height);
            }
        }
    }

    void DrawBrand() {
        AddHit(16, Rect(14, 10, 150, 58));
        const auto mark = D2D1::RoundedRect(Rect(18, 15, 56, 53), 11, 11);
        renderTarget_->FillRoundedRectangle(mark, violetBrush_.Get());

        const auto monitor = D2D1::RoundedRect(Rect(28, 25, 46, 38), 2, 2);
        renderTarget_->DrawRoundedRectangle(monitor, textBrush_.Get(), 2.0f);
        Line(37, 38, 37, 43, textBrush_.Get(), 2.0f);
        Line(32, 43, 42, 43, textBrush_.Get(), 2.0f);
        Line(37, 33, 37, 27.5f, textBrush_.Get(), 1.7f);
        Line(34.5f, 30, 37, 27.5f, textBrush_.Get(), 1.7f);
        Line(39.5f, 30, 37, 27.5f, textBrush_.Get(), 1.7f);

        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(47, 23), 3.2f, 3.2f),
            violet2Brush_.Get());

        Text(L"Lunira", Rect(68, 16, 142, 40), title_.Get(), textBrush_.Get());
        Text(L"SCREEN", Rect(69, 39, 126, 56), tinyBold_.Get(), violet2Brush_.Get());
    }

    void DrawTopRight(float width) {
        const float x = width - 324.0f;

        Pill(Rect(x, 19, x + 120, 49), L"●  PRIVADA", violetPanelBrush_.Get(), violet2Brush_.Get());

        const auto connected = D2D1::RoundedRect(Rect(x + 132, 19, x + 246, 49), 15, 15);
        renderTarget_->FillRoundedRectangle(connected, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(connected, borderBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(x + 148, 34), 4, 4),
            networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        Text(networkConnected_ ? L"Conectado" : L"Offline",
             Rect(x + 160, 24, x + 233, 45),
             bodyStrong_.Get(), mutedBrush_.Get());

        const auto avatar = D2D1::Ellipse(D2D1::Point2F(width - 38, 34), 17, 17);
        renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
        renderTarget_->DrawEllipse(avatar, violetBrush_.Get(), 1.0f);
        std::wstring initial = displayName_.empty() ? L"?" : displayName_.substr(0, 1);
        CenterText(initial, Rect(width - 55, 17, width - 21, 51), strong_.Get(), violet2Brush_.Get());
    }

    void DrawHomeTopRight(float width) {
        const auto badge = D2D1::RoundedRect(Rect(width - 176, 19, width - 24, 49), 15, 15);
        renderTarget_->FillRoundedRectangle(badge, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(badge, borderBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(width - 158, 34), 4, 4),
            greenBrush_.Get());
        CenterText(L"APP WINDOWS · NATIVO", Rect(width - 148, 24, width - 34, 45),
                   tinyBold_.Get(), mutedBrush_.Get());
    }

    void DrawRail(float top, float rail, float height) {
        DrawRailButton(16, Rect(10, top + 18, rail - 10, top + 78), L"Início", false, 2);
        DrawRailButton(0, Rect(10, top + 88, rail - 10, top + 148), L"Sala", page_ == Page::Room, 0);
        DrawRailButton(1, Rect(10, top + 158, rail - 10, top + 218), L"Ajustes", page_ == Page::Settings, 1);

        Text(L"NATIVE", Rect(14, height - 42, rail - 10, height - 22), tinyBold_.Get(), dimBrush_.Get());
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

    void DrawHome(float top, float width, float height) {
        const float contentTop = top + 48.0f;
        const float left = 84.0f;
        const float right = width - 84.0f;
        const float split = std::clamp(width * 0.53f, 650.0f, right - 460.0f);

        Text(L"LUNIRA SCREEN PARA WINDOWS", Rect(left, contentTop, split - 30, contentTop + 24),
             tinyBold_.Get(), violet2Brush_.Get());

        Text(L"Sua sala privada,\nagora no Windows.",
             Rect(left, contentTop + 46, split - 30, contentTop + 145),
             heroTitle_.Get(), textBrush_.Get());

        Text(L"Crie uma sala ou entre com um código. Nada de salas públicas,\ncontas ou microfone. App e navegador entram na mesma sala.",
             Rect(left, contentTop + 164, split - 40, contentTop + 224),
             heroBody_.Get(), mutedBrush_.Get());

        DrawFeaturePill(Rect(left, contentTop + 256, left + 150, contentTop + 290), L"60 FPS");
        DrawFeaturePill(Rect(left + 160, contentTop + 256, left + 344, contentTop + 290), L"Câmeras integradas");
        DrawFeaturePill(Rect(left, contentTop + 300, left + 184, contentTop + 334), L"Compatível com web");

        const D2D1_RECT_F preview = Rect(left, contentTop + 382, split - 44, std::min(height - 52.0f, contentTop + 610));
        const auto previewCard = D2D1::RoundedRect(preview, 16, 16);
        renderTarget_->FillRoundedRectangle(previewCard, panelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(previewCard, borderBrush_.Get(), 1.0f);

        const D2D1_RECT_F miniStage = Rect(preview.left + 14, preview.top + 14, preview.right - 14, preview.bottom - 58);
        const auto mini = D2D1::RoundedRect(miniStage, 10, 10);
        renderTarget_->FillRoundedRectangle(mini, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(mini, borderSoftBrush_.Get(), 1.0f);

        const float mcx = (miniStage.left + miniStage.right) * 0.5f;
        const float mcy = (miniStage.top + miniStage.bottom) * 0.5f;
        DrawMonitor(mcx - 10, mcy - 9, violet2Brush_.Get());
        CenterText(L"Pronto para compartilhar",
                   Rect(miniStage.left + 20, mcy + 20, miniStage.right - 20, mcy + 42),
                   bodyStrong_.Get(), mutedBrush_.Get());

        for (int i = 0; i < 3; ++i) {
            const float x = preview.left + 18.0f + i * 56.0f;
            const auto avatar = D2D1::Ellipse(D2D1::Point2F(x + 15, preview.bottom - 28), 14, 14);
            renderTarget_->FillEllipse(avatar, i == 0 ? violetBrush_.Get() : violetPanelBrush_.Get());
            const wchar_t* label = i == 0 ? L"V" : (i == 1 ? L"P" : L"A");
            CenterText(label, Rect(x + 1, preview.bottom - 42, x + 29, preview.bottom - 14),
                       tinyBold_.Get(), textBrush_.Get());
        }
        Text(L"Câmeras ficam junto da transmissão",
             Rect(preview.left + 194, preview.bottom - 39, preview.right - 16, preview.bottom - 17),
             tiny_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F card = Rect(split + 24, contentTop + 12, right, std::min(height - 48.0f, contentTop + 596));
        const auto cardRr = D2D1::RoundedRect(card, 18, 18);
        renderTarget_->FillRoundedRectangle(cardRr, panelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(cardRr, borderBrush_.Get(), 1.0f);

        Text(L"Entrar no Lunira", Rect(card.left + 28, card.top + 26, card.right - 28, card.top + 56),
             heading_.Get(), textBrush_.Get());
        Text(L"Todas as salas são privadas.", Rect(card.left + 28, card.top + 60, card.right - 28, card.top + 83),
             body_.Get(), mutedBrush_.Get());

        Text(L"SEU NOME", Rect(card.left + 28, card.top + 110, card.right - 28, card.top + 128),
             tinyBold_.Get(), dimBrush_.Get());
        DrawInput(20, Rect(card.left + 28, card.top + 134, card.right - 28, card.top + 180),
                  displayName_, L"Como você quer aparecer", focusedField_ == Field::Name, false);

        const D2D1_RECT_F create = Rect(card.left + 28, card.top + 198, card.right - 28, card.top + 246);
        AddHit(21, create);
        PrimaryButton(create,
                      pendingAction_ == PendingAction::Create ? L"Conectando..." : L"Criar sala privada",
                      false, hover_ == 21);

        Line(card.left + 28, card.top + 278, card.left + 158, card.top + 278, borderSoftBrush_.Get(), 1.0f);
        CenterText(L"OU ENTRE COM UM CÓDIGO",
                   Rect(card.left + 162, card.top + 267, card.right - 162, card.top + 289),
                   tinyBold_.Get(), dimBrush_.Get());
        Line(card.right - 158, card.top + 278, card.right - 28, card.top + 278, borderSoftBrush_.Get(), 1.0f);

        Text(L"CÓDIGO DA SALA", Rect(card.left + 28, card.top + 316, card.right - 28, card.top + 334),
             tinyBold_.Get(), dimBrush_.Get());
        DrawInput(22, Rect(card.left + 28, card.top + 340, card.right - 28, card.top + 386),
                  roomCodeInput_, L"ABCD2345", focusedField_ == Field::Code, true);

        const D2D1_RECT_F join = Rect(card.left + 28, card.top + 404, card.right - 28, card.top + 450);
        AddHit(23, join);
        Button(join,
               pendingAction_ == PendingAction::Join ? L"Conectando..." : L"Entrar na sala",
               false, hover_ == 23);

        if (!homeError_.empty()) {
            Text(homeError_, Rect(card.left + 28, card.top + 468, card.right - 28, card.top + 494),
                 tiny_.Get(), redBrush_.Get());
        } else {
            Text(L"Sem lista pública. Só entra quem tiver o código.",
                 Rect(card.left + 28, card.top + 468, card.right - 28, card.top + 494),
                 tiny_.Get(), dimBrush_.Get());
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

    void DrawInput(int hitId, const D2D1_RECT_F& rect, const std::wstring& value,
                   std::wstring_view placeholder, bool focused, bool code) {
        AddHit(hitId, rect);
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

    void DrawRoom(float rail, float top, float width, float height) {
        const float pad = 18.0f;
        const float side = 294.0f;
        const float gap = 16.0f;
        const float contentLeft = rail + pad;
        const float contentTop = top + pad;
        const float contentRight = width - pad;
        const float contentBottom = height - pad;
        if (focused_) {
            DrawStage(Rect(contentLeft, contentTop, contentRight, contentBottom));
            return;
        }

        const float sideLeft = contentRight - side;
        const float stageRight = sideLeft - gap;

        DrawStage(Rect(contentLeft, contentTop, stageRight, contentBottom));
        DrawSidebar(Rect(sideLeft, contentTop, contentRight, contentBottom));
    }

    void DrawStage(const D2D1_RECT_F& area) {
        const auto outer = D2D1::RoundedRect(area, 14, 14);
        renderTarget_->FillRoundedRectangle(outer, panelBrush_.Get());
        renderTarget_->DrawRoundedRectangle(outer, borderBrush_.Get(), 1.0f);

        const float toolbarH = 66.0f;
        const float metaH = sharing_ ? 48.0f : 0.0f;
        const float cameraH = camerasOpen_ ? 168.0f : 52.0f;

        DrawStageToolbar(Rect(area.left, area.top, area.right, area.top + toolbarH));

        const D2D1_RECT_F screen{
            area.left + 12,
            area.top + toolbarH,
            area.right - 12,
            area.bottom - cameraH - metaH - 12
        };

        DrawScreen(screen);

        if (sharing_) {
            DrawStageMeta(Rect(
                area.left + 12,
                screen.bottom,
                area.right - 12,
                screen.bottom + metaH));
        }

        DrawCameraDock(Rect(
            area.left + 12,
            area.bottom - cameraH,
            area.right - 12,
            area.bottom - 12));
    }

    void DrawStageToolbar(const D2D1_RECT_F& rect) {
        Line(rect.left, rect.bottom, rect.right, rect.bottom, borderSoftBrush_.Get(), 1.0f);

        const auto icon = D2D1::RoundedRect(
            Rect(rect.left + 16, rect.top + 15, rect.left + 52, rect.top + 51),
            10, 10);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(rect.left + 26, rect.top + 25, violet2Brush_.Get());

        Text(sharing_ ? displayName_.empty() ? L"Você" : std::wstring_view(displayName_) : L"Tela da sala",
             Rect(rect.left + 64, rect.top + 13, rect.left + 250, rect.top + 36),
             strong_.Get(),
             textBrush_.Get());

        Text(sharing_ ? L"Compartilhando agora" : L"Aguardando alguém compartilhar a tela",
             Rect(rect.left + 64, rect.top + 36, rect.left + 340, rect.top + 56),
             tiny_.Get(),
             mutedBrush_.Get());

        if (sharing_) {
            const auto live = D2D1::RoundedRect(
                Rect(rect.left + 178, rect.top + 15, rect.left + 292, rect.top + 37),
                11, 11);
            renderTarget_->FillRoundedRectangle(live, redBrush_.Get());
            CenterText(L"●  AO VIVO", Rect(rect.left + 188, rect.top + 17, rect.left + 282, rect.top + 35),
                       tinyBold_.Get(), textBrush_.Get());
        }

        const D2D1_RECT_F focusRect = Rect(rect.right - 116, rect.top + 15, rect.right - 16, rect.top + 49);
        AddHit(2, focusRect);
        Button(focusRect, focused_ ? L"Sair do foco" : L"Focar tela", false, hover_ == 2);
    }

    void DrawScreen(const D2D1_RECT_F& rect) {
        const auto screen = D2D1::RoundedRect(rect, 11, 11);
        renderTarget_->FillRoundedRectangle(screen, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(screen, borderSoftBrush_.Get(), 1.0f);

        if (sharing_) {
            // Lightweight visual placeholder for a real incoming screen.
            for (int i = 0; i < 7; ++i) {
                const float y = rect.top + 28 + i * 24.0f;
                const float length = (i % 3 == 0) ? 0.62f : (i % 3 == 1 ? 0.44f : 0.72f);
                Fill(Rect(rect.left + 30, y, rect.left + 30 + (rect.right - rect.left - 60) * length, y + 9),
                     i == 0 ? violetPanelBrush_.Get() : panel2Brush_.Get());
            }
            Text(L"Prévia da transmissão", Rect(rect.left + 30, rect.bottom - 54, rect.right - 30, rect.bottom - 28),
                 bodyStrong_.Get(), mutedBrush_.Get());
            return;
        }

        const float cx = (rect.left + rect.right) * 0.5f;
        const float cy = (rect.top + rect.bottom) * 0.5f - 18.0f;

        const auto icon = D2D1::RoundedRect(Rect(cx - 28, cy - 28, cx + 28, cy + 28), 16, 16);
        renderTarget_->FillRoundedRectangle(icon, violetPanelBrush_.Get());
        DrawMonitor(cx - 13, cy - 8, violet2Brush_.Get());

        CenterText(L"Nenhuma tela sendo compartilhada",
                   Rect(rect.left + 40, cy + 42, rect.right - 40, cy + 68),
                   heading_.Get(), textBrush_.Get());

        CenterText(L"Qualquer pessoa da sala pode começar a transmitir.",
                   Rect(rect.left + 40, cy + 74, rect.right - 40, cy + 98),
                   body_.Get(), mutedBrush_.Get());
    }

    void DrawStageMeta(const D2D1_RECT_F& rect) {
        Line(rect.left, rect.top, rect.right, rect.top, borderSoftBrush_.Get(), 1.0f);
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(rect.left + 18, rect.top + 24), 4, 4),
            greenBrush_.Get());
        Text(displayName_.empty() ? L"Você" : std::wstring_view(displayName_), Rect(rect.left + 30, rect.top + 8, rect.left + 110, rect.top + 28),
             bodyStrong_.Get(), textBrush_.Get());
        Text(L"Compartilhando via Agora", Rect(rect.left + 30, rect.top + 27, rect.left + 200, rect.top + 44),
             tiny_.Get(), mutedBrush_.Get());

        const auto badge = D2D1::RoundedRect(
            Rect(rect.right - 126, rect.top + 10, rect.right - 10, rect.top + 38),
            14, 14);
        renderTarget_->FillRoundedRectangle(badge, panel2Brush_.Get());
        renderTarget_->DrawRoundedRectangle(badge, borderBrush_.Get(), 1.0f);
        CenterText(L"1080p · 60 FPS",
                   Rect(rect.right - 120, rect.top + 14, rect.right - 16, rect.top + 35),
                   tinyBold_.Get(), mutedBrush_.Get());
    }

    void DrawCameraDock(const D2D1_RECT_F& rect) {
        const auto dock = D2D1::RoundedRect(rect, 11, 11);
        renderTarget_->FillRoundedRectangle(dock, panel3Brush_.Get());
        renderTarget_->DrawRoundedRectangle(dock, borderSoftBrush_.Get(), 1.0f);

        const D2D1_RECT_F head = Rect(rect.left, rect.top, rect.right, rect.top + 48);
        AddHit(10, head);

        Text(L"Câmeras", Rect(rect.left + 16, rect.top + 10, rect.left + 90, rect.top + 31),
             bodyStrong_.Get(), textBrush_.Get());
        Text(L"3 ativas", Rect(rect.left + 84, rect.top + 11, rect.left + 150, rect.top + 31),
             tiny_.Get(), mutedBrush_.Get());
        Text(camerasOpen_ ? L"⌄" : L"⌃", Rect(rect.right - 34, rect.top + 9, rect.right - 14, rect.top + 31),
             strong_.Get(), mutedBrush_.Get());

        if (!camerasOpen_) return;

        const float gap = 10.0f;
        const float tileTop = rect.top + 48;
        const float tileBottom = rect.bottom - 10;
        const float available = rect.right - rect.left - 32 - gap * 2;
        const float tileW = available / 3.0f;

        DrawCameraTile(11, Rect(rect.left + 16, tileTop, rect.left + 16 + tileW, tileBottom),
                       displayName_.empty() ? L"Você" : std::wstring_view(displayName_), L"VOCÊ", 0x2A2040, L"K");
        DrawCameraTile(12, Rect(rect.left + 16 + tileW + gap, tileTop, rect.left + 16 + tileW * 2 + gap, tileBottom),
                       L"Pedro", L"", 0x172A39, L"P");
        DrawCameraTile(13, Rect(rect.left + 16 + tileW * 2 + gap * 2, tileTop, rect.right - 16, tileBottom),
                       L"Ana", L"", 0x2B1B32, L"A");
    }

    void DrawCameraTile(int hitId, const D2D1_RECT_F& rect, std::wstring_view name,
                        std::wstring_view badge, unsigned background, std::wstring_view initial) {
        AddHit(hitId, rect);
        const auto rr = D2D1::RoundedRect(rect, 10, 10);

        ComPtr<ID2D1SolidColorBrush> bg;
        renderTarget_->CreateSolidColorBrush(Hex(background), bg.ReleaseAndGetAddressOf());
        renderTarget_->FillRoundedRectangle(rr, bg.Get());
        renderTarget_->DrawRoundedRectangle(
            rr,
            hover_ == hitId ? violetBrush_.Get() : borderBrush_.Get(),
            hover_ == hitId ? 1.6f : 1.0f);

        const float cx = (rect.left + rect.right) * 0.5f;
        const float cy = rect.top + (rect.bottom - rect.top) * 0.43f;
        const auto avatar = D2D1::Ellipse(D2D1::Point2F(cx, cy), 21, 21);
        renderTarget_->FillEllipse(avatar, violetPanelBrush_.Get());
        CenterText(initial, Rect(cx - 21, cy - 21, cx + 21, cy + 21), heading_.Get(), violet2Brush_.Get());

        Fill(Rect(rect.left, rect.bottom - 30, rect.right, rect.bottom), panelBrush_.Get());
        Text(name, Rect(rect.left + 10, rect.bottom - 25, rect.right - 70, rect.bottom - 7),
             bodyStrong_.Get(), textBrush_.Get());

        if (!badge.empty()) {
            const auto tag = D2D1::RoundedRect(
                Rect(rect.right - 58, rect.bottom - 24, rect.right - 9, rect.bottom - 8),
                8, 8);
            renderTarget_->FillRoundedRectangle(tag, violetPanelBrush_.Get());
            CenterText(badge, Rect(rect.right - 55, rect.bottom - 23, rect.right - 12, rect.bottom - 8),
                       tinyBold_.Get(), violet2Brush_.Get());
        }

        // Expand hint.
        Line(rect.right - 20, rect.top + 10, rect.right - 10, rect.top + 10, mutedBrush_.Get(), 1.5f);
        Line(rect.right - 10, rect.top + 10, rect.right - 10, rect.top + 20, mutedBrush_.Get(), 1.5f);
    }

    void DrawSidebar(const D2D1_RECT_F& area) {
        float y = area.top;

        DrawInviteCard(Rect(area.left, y, area.right, y + 170));
        y += 184;

        DrawQualityCard(Rect(area.left, y, area.right, y + 286));
        y += 300;

        DrawControlsCard(Rect(area.left, y, area.right, area.bottom));
    }

    void DrawInviteCard(const D2D1_RECT_F& rect) {
        Card(rect);

        Text(L"Sala privada", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 36),
             strong_.Get(), textBrush_.Get());
        Text(L"Somente quem possui o código entra.",
             Rect(rect.left + 16, rect.top + 38, rect.right - 16, rect.top + 59),
             tiny_.Get(), mutedBrush_.Get());

        const D2D1_RECT_F code = Rect(rect.left + 16, rect.top + 74, rect.right - 16, rect.top + 118);
        const auto codeRr = D2D1::RoundedRect(code, 9, 9);
        renderTarget_->FillRoundedRectangle(codeRr, stageBrush_.Get());
        renderTarget_->DrawRoundedRectangle(codeRr, borderBrush_.Get(), 1.0f);
        Text(roomCode_.empty() ? L"—" : std::wstring_view(roomCode_), Rect(code.left + 14, code.top + 11, code.right - 54, code.bottom - 8),
             strong_.Get(), textBrush_.Get());

        const D2D1_RECT_F copy = Rect(code.right - 42, code.top + 5, code.right - 5, code.bottom - 5);
        AddHit(3, copy);
        const auto copyRr = D2D1::RoundedRect(copy, 7, 7);
        renderTarget_->FillRoundedRectangle(copyRr, hover_ == 3 ? violet2Brush_.Get() : violetBrush_.Get());
        CenterText(L"⧉", copy, strong_.Get(), textBrush_.Get());

        Text(copied_ ? L"Convite copiado." : L"O código também funciona na versão web.",
             Rect(rect.left + 16, rect.top + 132, rect.right - 16, rect.bottom - 10),
             tiny_.Get(), copied_ ? greenBrush_.Get() : dimBrush_.Get());
    }

    void DrawQualityCard(const D2D1_RECT_F& rect) {
        Card(rect);

        Text(L"Qualidade", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 37),
             strong_.Get(), textBrush_.Get());
        Text(L"Ajuste antes ou durante a transmissão.",
             Rect(rect.left + 16, rect.top + 38, rect.right - 16, rect.top + 59),
             tiny_.Get(), mutedBrush_.Get());

        Text(L"RESOLUÇÃO", Rect(rect.left + 16, rect.top + 72, rect.right - 16, rect.top + 90),
             tinyBold_.Get(), dimBrush_.Get());
        SelectBox(Rect(rect.left + 16, rect.top + 94, rect.right - 16, rect.top + 132), L"1080p Full HD");

        Text(L"QUADROS POR SEGUNDO", Rect(rect.left + 16, rect.top + 146, rect.right - 16, rect.top + 164),
             tinyBold_.Get(), dimBrush_.Get());

        const float middle = (rect.left + rect.right) * 0.5f;
        const D2D1_RECT_F fps30 = Rect(rect.left + 16, rect.top + 170, middle - 4, rect.top + 206);
        const D2D1_RECT_F fps60 = Rect(middle + 4, rect.top + 170, rect.right - 16, rect.top + 206);
        AddHit(4, fps30);
        AddHit(5, fps60);
        ToggleButton(fps30, L"30 FPS", fps_ == 30, hover_ == 4);
        ToggleButton(fps60, L"60 FPS", fps_ == 60, hover_ == 5);

        Text(L"CÂMERA", Rect(rect.left + 16, rect.top + 216, rect.right - 16, rect.top + 234),
             tinyBold_.Get(), dimBrush_.Get());
        SelectBox(Rect(rect.left + 16, rect.top + 238, rect.right - 16, rect.top + 276), L"720p · 40 FPS");
    }

    void DrawCameraOverlay(float width, float height) {
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

        static constexpr std::array<std::wstring_view, 3> initials{ L"K", L"P", L"A" };
        static constexpr std::array<std::wstring_view, 3> names{ L"Kauã · VOCÊ", L"Pedro", L"Ana" };
        const int index = std::clamp(selectedCamera_, 0, 2);

        const float cx = (video.left + video.right) * 0.5f;
        const float cy = (video.top + video.bottom) * 0.5f;
        renderTarget_->FillEllipse(
            D2D1::Ellipse(D2D1::Point2F(cx, cy), large ? 38.0f : 30.0f, large ? 38.0f : 30.0f),
            violetBrush_.Get());
        CenterText(initials[static_cast<size_t>(index)],
                   Rect(cx - 34, cy - 34, cx + 34, cy + 34),
                   title_.Get(), textBrush_.Get());

        Text(names[static_cast<size_t>(index)],
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

        Text(L"Controles", Rect(rect.left + 16, rect.top + 14, rect.right - 16, rect.top + 37),
             strong_.Get(), textBrush_.Get());

        float y = rect.top + 52;
        const D2D1_RECT_F camera = Rect(rect.left + 16, y, rect.right - 16, y + 40);
        AddHit(6, camera);
        Button(camera, cameraOn_ ? L"Câmera ligada" : L"Câmera desligada", cameraOn_, hover_ == 6);

        y += 48;
        const D2D1_RECT_F share = Rect(rect.left + 16, y, rect.right - 16, y + 44);
        AddHit(7, share);
        PrimaryButton(share, sharing_ ? L"Parar transmissão" : L"Compartilhar tela", sharing_, hover_ == 7);

        y += 52;
        const D2D1_RECT_F audio = Rect(rect.left + 16, y, rect.right - 16, y + 40);
        AddHit(8, audio);
        Button(audio, sharing_ ? L"Áudio da tela" : L"Áudio disponível ao transmitir", false, hover_ == 8);

        y += 48;
        const D2D1_RECT_F stats = Rect(rect.left + 16, y, rect.right - 16, y + 40);
        AddHit(9, stats);
        Button(stats, L"Estatísticas", statsOn_, hover_ == 9);

        if (statsOn_ && rect.bottom - y > 94) {
            Text(L"0.0% perda  ·  sinalização online",
                 Rect(rect.left + 18, y + 54, rect.right - 18, y + 74),
                 tiny_.Get(), networkConnected_ ? greenBrush_.Get() : amberBrush_.Get());
        }

        if (!roomNotice_.empty() && rect.bottom - y > 118) {
            Text(roomNotice_,
                 Rect(rect.left + 18, y + 80, rect.right - 18, rect.bottom - 8),
                 tiny_.Get(), amberBrush_.Get());
        }
    }

    void DrawSettings(float rail, float top, float width, float height) {
        (void)height;
        const float left = rail + 34;
        const float right = width - 34;

        Text(L"Ajustes", Rect(left, top + 32, right, top + 66), title_.Get(), textBrush_.Get());
        Text(L"Preferências do aplicativo Windows.",
             Rect(left, top + 70, right, top + 94), body_.Get(), mutedBrush_.Get());

        const float cardW = std::min(620.0f, right - left);
        const D2D1_RECT_F card = Rect(left, top + 120, left + cardW, top + 335);
        Card(card);

        Text(L"Desempenho", Rect(card.left + 18, card.top + 18, card.right - 18, card.top + 43),
             strong_.Get(), textBrush_.Get());
        Text(L"A interface nativa só redesenha quando algo muda.",
             Rect(card.left + 18, card.top + 50, card.right - 18, card.top + 72),
             body_.Get(), mutedBrush_.Get());

        SettingRow(Rect(card.left + 18, card.top + 92, card.right - 18, card.top + 136),
                   L"Animações sutis", L"Sem animações contínuas pesadas", true);
        SettingRow(Rect(card.left + 18, card.top + 144, card.right - 18, card.top + 188),
                   L"Aceleração por GPU", L"Direct2D para a interface", true);
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
        const auto rr = D2D1::RoundedRect(rect, 12, 12);
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
        const auto rr = D2D1::RoundedRect(rect, 8, 8);
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
        const auto rr = D2D1::RoundedRect(rect, 9, 9);
        renderTarget_->FillRoundedRectangle(rr, danger ? redBrush_.Get() : (hover ? violet2Brush_.Get() : violetBrush_.Get()));
        CenterText(label, Rect(rect.left + 8, rect.top + 5, rect.right - 8, rect.bottom - 5),
                   bodyStrong_.Get(), textBrush_.Get());
    }

    void ToggleButton(const D2D1_RECT_F& rect, std::wstring_view label, bool active, bool hover) {
        const auto rr = D2D1::RoundedRect(rect, 8, 8);
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
            InvalidateRect(hwnd_, nullptr, FALSE);
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

    void HandleSocketEvent(const lunira::SocketEvent& event) {
        switch (event.type) {
        case lunira::SocketEventType::Connected:
            networkConnected_ = true;
            roomNotice_.clear();
            SendPendingRoomRequest();
            break;

        case lunira::SocketEventType::Ack:
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
            pendingAction_ = PendingAction::None;
            pendingAckId_ = -1;
            homeError_.clear();
            roomNotice_.clear();
            page_ = Page::Room;
            focusedField_ = Field::None;
            break;

        case lunira::SocketEventType::RoomState:
            roomState_ = event.room;
            sharing_ = roomState_.live;
            roomNotice_.clear();
            break;

        case lunira::SocketEventType::BroadcastStarted:
            sharing_ = true;
            roomState_.live = true;
            break;

        case lunira::SocketEventType::BroadcastEnded:
            sharing_ = false;
            roomState_.live = false;
            break;

        case lunira::SocketEventType::RoomExpired:
            roomNotice_.clear();
            homeError_ = L"A sala expirou.";
            roomCode_.clear();
            roomCodeInput_.clear();
            page_ = Page::Home;
            pendingAction_ = PendingAction::None;
            break;

        case lunira::SocketEventType::Disconnected:
            networkConnected_ = false;
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

    void Click(int px, int py) {
        const int id = HitTest(ToDip(px), ToDip(py));

        switch (id) {
        case 0:
            page_ = Page::Room;
            focusedField_ = Field::None;
            break;
        case 1:
            page_ = Page::Settings;
            focusedField_ = Field::None;
            break;
        case 16:
            page_ = Page::Home;
            focusedField_ = Field::None;
            selectedCamera_ = -1;
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
                const std::wstring invite = L"https://lumacast-live-kc.onrender.com/?room=" + roomCode_;
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
            break;
        case 5:
            fps_ = 60;
            break;
        case 6:
            cameraOn_ = !cameraOn_;
            break;
        case 7:
            roomNotice_ = L"Transmissão nativa entra na próxima etapa.";
            break;
        case 8:
            break;
        case 9:
            statsOn_ = !statsOn_;
            break;
        case 10:
            camerasOpen_ = !camerasOpen_;
            break;
        case 11:
        case 12:
        case 13:
            selectedCamera_ = id - 11;
            cameraOverlayLarge_ = false;
            break;
        case 14:
            selectedCamera_ = -1;
            cameraOverlayLarge_ = false;
            break;
        case 15:
            cameraOverlayLarge_ = !cameraOverlayLarge_;
            break;
        default:
            break;
        }

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

    bool sharing_ = false;
    bool cameraOn_ = true;
    bool statsOn_ = false;
    bool camerasOpen_ = true;
    bool focused_ = false;
    bool copied_ = false;
    int fps_ = 60;
    int selectedCamera_ = -1;
    bool cameraOverlayLarge_ = false;

    bool trackingMouse_ = false;
    int hover_ = -1;

    std::array<Hit, 32> hits_{};
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
            L"Não foi possível iniciar a interface nativa do Lunira Screen.",
            L"Lunira Screen",
            MB_OK | MB_ICONERROR);
        return 1;
    }

    return app.Run();
}
