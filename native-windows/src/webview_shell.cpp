#include <windows.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <wrl.h>
#include <wrl/event.h>
#include <WebView2.h>

#include <algorithm>
#include <string>

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "shell32.lib")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kWindowClass[] = L"LuniraScreenWebUIWindow";
constexpr wchar_t kWindowTitle[] = L"LuniraScreen";
constexpr wchar_t kStartUrl[] = L"https://lunirascreen.onrender.com/";

class WebUiWindow {
public:
    bool Initialize(HINSTANCE instance) {
        instance_ = instance;

        const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        if (FAILED(com) && com != RPC_E_CHANGED_MODE) {
            return false;
        }

        WNDCLASSEXW wc{ sizeof(wc) };
        wc.lpfnWndProc = &WebUiWindow::StaticWndProc;
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
        wc.style = CS_HREDRAW | CS_VREDRAW;

        if (!RegisterClassExW(&wc) &&
            GetLastError() != ERROR_CLASS_ALREADY_EXISTS) {
            return false;
        }

        RECT desired{ 0, 0, 1380, 840 };
        AdjustWindowRectExForDpi(
            &desired,
            WS_OVERLAPPEDWINDOW,
            FALSE,
            0,
            GetDpiForSystem());

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

        InitializeWebView();
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
    static LRESULT CALLBACK StaticWndProc(
        HWND hwnd,
        UINT message,
        WPARAM wParam,
        LPARAM lParam) {

        WebUiWindow* self = nullptr;
        if (message == WM_NCCREATE) {
            auto* create = reinterpret_cast<CREATESTRUCTW*>(lParam);
            self = static_cast<WebUiWindow*>(create->lpCreateParams);
            SetWindowLongPtrW(
                hwnd,
                GWLP_USERDATA,
                reinterpret_cast<LONG_PTR>(self));
            self->hwnd_ = hwnd;
        } else {
            self = reinterpret_cast<WebUiWindow*>(
                GetWindowLongPtrW(hwnd, GWLP_USERDATA));
        }

        return self
            ? self->WndProc(message, wParam, lParam)
            : DefWindowProcW(hwnd, message, wParam, lParam);
    }

    LRESULT WndProc(
        UINT message,
        WPARAM wParam,
        LPARAM lParam) {

        switch (message) {
        case WM_SIZE:
            ResizeWebView();
            return 0;

        case WM_GETMINMAXINFO: {
            auto* info = reinterpret_cast<MINMAXINFO*>(lParam);
            info->ptMinTrackSize.x = 980;
            info->ptMinTrackSize.y = 640;
            return 0;
        }

        case WM_CLOSE:
            DestroyWindow(hwnd_);
            return 0;

        case WM_DESTROY:
            controller_.Reset();
            webView_.Reset();
            PostQuitMessage(0);
            return 0;

        default:
            return DefWindowProcW(hwnd_, message, wParam, lParam);
        }
    }

    void InitializeWebView() {
        const HRESULT started =
            CreateCoreWebView2EnvironmentWithOptions(
                nullptr,
                nullptr,
                nullptr,
                Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                    [this](
                        HRESULT result,
                        ICoreWebView2Environment* environment) -> HRESULT {

                        if (FAILED(result) || !environment) {
                            ShowStartupError(
                                L"O Microsoft Edge WebView2 Runtime não está disponível.");
                            return result;
                        }

                        return environment->CreateCoreWebView2Controller(
                            hwnd_,
                            Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                                [this](
                                    HRESULT controllerResult,
                                    ICoreWebView2Controller* controller) -> HRESULT {

                                    if (FAILED(controllerResult) || !controller) {
                                        ShowStartupError(
                                            L"Não foi possível criar a interface WebView2.");
                                        return controllerResult;
                                    }

                                    controller_ = controller;
                                    controller_->get_CoreWebView2(&webView_);

                                    ComPtr<ICoreWebView2Controller2> controller2;
                                    if (SUCCEEDED(controller_.As(&controller2))) {
                                        COREWEBVIEW2_COLOR background{};
                                        background.A = 255;
                                        background.R = 7;
                                        background.G = 8;
                                        background.B = 12;
                                        controller2->put_DefaultBackgroundColor(background);
                                    }

                                    ComPtr<ICoreWebView2Settings> settings;
                                    if (SUCCEEDED(webView_->get_Settings(&settings)) && settings) {
                                        settings->put_IsStatusBarEnabled(FALSE);
                                        settings->put_AreDefaultContextMenusEnabled(FALSE);
                                        settings->put_AreDevToolsEnabled(FALSE);
                                        settings->put_IsZoomControlEnabled(FALSE);
                                    }

                                    EventRegistrationToken newWindowToken{};
                                    webView_->add_NewWindowRequested(
                                        Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                                            [](
                                                ICoreWebView2*,
                                                ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {

                                                LPWSTR rawUri = nullptr;
                                                if (SUCCEEDED(args->get_Uri(&rawUri)) && rawUri) {
                                                    ShellExecuteW(
                                                        nullptr,
                                                        L"open",
                                                        rawUri,
                                                        nullptr,
                                                        nullptr,
                                                        SW_SHOWNORMAL);
                                                    CoTaskMemFree(rawUri);
                                                }

                                                args->put_Handled(TRUE);
                                                return S_OK;
                                            }).Get(),
                                        &newWindowToken);

                                    EventRegistrationToken navToken{};
                                    webView_->add_NavigationStarting(
                                        Callback<ICoreWebView2NavigationStartingEventHandler>(
                                            [](
                                                ICoreWebView2*,
                                                ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {

                                                LPWSTR rawUri = nullptr;
                                                if (FAILED(args->get_Uri(&rawUri)) || !rawUri) {
                                                    return S_OK;
                                                }

                                                std::wstring uri(rawUri);
                                                CoTaskMemFree(rawUri);

                                                const bool allowed =
                                                    uri.starts_with(L"https://lunirascreen.onrender.com/") ||
                                                    uri.starts_with(L"about:blank");

                                                if (!allowed) {
                                                    args->put_Cancel(TRUE);
                                                    ShellExecuteW(
                                                        nullptr,
                                                        L"open",
                                                        uri.c_str(),
                                                        nullptr,
                                                        nullptr,
                                                        SW_SHOWNORMAL);
                                                }

                                                return S_OK;
                                            }).Get(),
                                        &navToken);

                                    ResizeWebView();
                                    controller_->put_IsVisible(TRUE);
                                    webView_->Navigate(kStartUrl);
                                    return S_OK;
                                }).Get());
                    }).Get());

        if (FAILED(started)) {
            ShowStartupError(
                L"Não foi possível iniciar o Microsoft Edge WebView2 Runtime.");
        }
    }

    void ResizeWebView() {
        if (!controller_ || !hwnd_) return;

        RECT bounds{};
        GetClientRect(hwnd_, &bounds);
        controller_->put_Bounds(bounds);
    }

    void ShowStartupError(const wchar_t* detail) {
        std::wstring message =
            L"A nova interface do LuniraScreen usa Microsoft Edge WebView2.\n\n";
        message += detail;
        message +=
            L"\n\nNo Windows 11 o runtime normalmente já vem instalado.";

        MessageBoxW(
            hwnd_,
            message.c_str(),
            L"LuniraScreen",
            MB_OK | MB_ICONERROR);
    }

    HINSTANCE instance_ = nullptr;
    HWND hwnd_ = nullptr;
    ComPtr<ICoreWebView2Controller> controller_;
    ComPtr<ICoreWebView2> webView_;
};

} // namespace

int WINAPI wWinMain(
    HINSTANCE instance,
    HINSTANCE,
    PWSTR,
    int) {

    WebUiWindow app;
    if (!app.Initialize(instance)) {
        MessageBoxW(
            nullptr,
            L"Não foi possível iniciar o LuniraScreen.",
            L"LuniraScreen",
            MB_OK | MB_ICONERROR);
        return 1;
    }

    return app.Run();
}
