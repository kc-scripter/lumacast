#include "updater.h"

#include <windows.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <wrl.h>
#include <wrl/event.h>
#include <WebView2.h>

#include <algorithm>
#include <filesystem>
#include <memory>
#include <string>

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {

constexpr wchar_t kWindowClass[] = L"LuniraScreenWebUIWindow";
constexpr wchar_t kWindowTitle[] = L"LuniraScreen";
constexpr wchar_t kStartUrl[] = L"https://lunirascreen.onrender.com/__desktop__/index.html";
constexpr wchar_t kDesktopPrefix[] = L"https://lunirascreen.onrender.com/__desktop__/";
constexpr UINT kUpdateEventMessage = WM_APP + 60;

std::filesystem::path ModuleDirectory() {
    wchar_t buffer[MAX_PATH]{};
    const DWORD length=GetModuleFileNameW(nullptr,buffer,MAX_PATH);
    if(length==0||length>=MAX_PATH)return std::filesystem::current_path();
    return std::filesystem::path(buffer).parent_path();
}

std::wstring ContentType(const std::filesystem::path& path) {
    const auto ext=path.extension().wstring();
    if(ext==L".html")return L"text/html; charset=utf-8";
    if(ext==L".js"||ext==L".mjs")return L"text/javascript; charset=utf-8";
    if(ext==L".css")return L"text/css; charset=utf-8";
    if(ext==L".svg")return L"image/svg+xml";
    if(ext==L".png")return L"image/png";
    if(ext==L".jpg"||ext==L".jpeg")return L"image/jpeg";
    if(ext==L".webp")return L"image/webp";
    if(ext==L".ico")return L"image/x-icon";
    if(ext==L".woff2")return L"font/woff2";
    return L"application/octet-stream";
}

std::wstring JsonEscape(std::wstring_view value) {
    std::wstring out;
    out.reserve(value.size()+16);
    for(const wchar_t ch:value){
        switch(ch){
        case L'\\': out+=L"\\\\"; break;
        case L'"': out+=L"\\\""; break;
        case L'\n': out+=L"\\n"; break;
        case L'\r': out+=L"\\r"; break;
        case L'\t': out+=L"\\t"; break;
        default:
            if(ch<0x20)out+=L' ';
            else out+=ch;
            break;
        }
    }
    return out;
}

class WebUiWindow {
public:
    bool Initialize(HINSTANCE instance) {
        instance_=instance;
        uiRoot_=ModuleDirectory()/L"desktop-ui";

        if(!std::filesystem::exists(uiRoot_/L"index.html")){
            MessageBoxW(nullptr,L"A interface desktop local não foi encontrada.\n\nReinstale o pacote completo do LuniraScreen.",kWindowTitle,MB_OK|MB_ICONERROR);
            return false;
        }

        const HRESULT com=CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
        if(FAILED(com)&&com!=RPC_E_CHANGED_MODE)return false;

        WNDCLASSEXW wc{sizeof(wc)};
        wc.lpfnWndProc=&WebUiWindow::StaticWndProc;
        wc.hInstance=instance_;
        wc.hCursor=LoadCursorW(nullptr,IDC_ARROW);
        wc.hIcon=static_cast<HICON>(LoadImageW(instance_,MAKEINTRESOURCEW(101),IMAGE_ICON,0,0,LR_DEFAULTSIZE));
        wc.hIconSm=static_cast<HICON>(LoadImageW(instance_,MAKEINTRESOURCEW(101),IMAGE_ICON,16,16,LR_DEFAULTCOLOR));
        wc.lpszClassName=kWindowClass;
        wc.style=CS_HREDRAW|CS_VREDRAW;

        if(!RegisterClassExW(&wc)&&GetLastError()!=ERROR_CLASS_ALREADY_EXISTS)return false;

        RECT desired{0,0,1450,900};
        AdjustWindowRectExForDpi(&desired,WS_OVERLAPPEDWINDOW,FALSE,0,GetDpiForSystem());

        hwnd_=CreateWindowExW(
            0,kWindowClass,kWindowTitle,WS_OVERLAPPEDWINDOW,
            CW_USEDEFAULT,CW_USEDEFAULT,
            desired.right-desired.left,desired.bottom-desired.top,
            nullptr,nullptr,instance_,this);
        if(!hwnd_)return false;

        const BOOL dark=TRUE;
        DwmSetWindowAttribute(hwnd_,20,&dark,sizeof(dark));

        ShowWindow(hwnd_,SW_SHOW);
        UpdateWindow(hwnd_);
        InitializeWebView();
        return true;
    }

    int Run() {
        MSG msg{};
        while(GetMessageW(&msg,nullptr,0,0)>0){
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        return static_cast<int>(msg.wParam);
    }

private:
    static LRESULT CALLBACK StaticWndProc(HWND hwnd,UINT message,WPARAM wParam,LPARAM lParam) {
        WebUiWindow* self=nullptr;
        if(message==WM_NCCREATE){
            auto* create=reinterpret_cast<CREATESTRUCTW*>(lParam);
            self=static_cast<WebUiWindow*>(create->lpCreateParams);
            SetWindowLongPtrW(hwnd,GWLP_USERDATA,reinterpret_cast<LONG_PTR>(self));
            self->hwnd_=hwnd;
        }else{
            self=reinterpret_cast<WebUiWindow*>(GetWindowLongPtrW(hwnd,GWLP_USERDATA));
        }
        return self?self->WndProc(message,wParam,lParam):DefWindowProcW(hwnd,message,wParam,lParam);
    }

    LRESULT WndProc(UINT message,WPARAM,LPARAM lParam) {
        switch(message){
        case WM_SIZE:
            ResizeWebView();
            return 0;
        case WM_GETMINMAXINFO: {
            auto* info=reinterpret_cast<MINMAXINFO*>(lParam);
            info->ptMinTrackSize.x=1040;
            info->ptMinTrackSize.y=680;
            return 0;
        }
        case kUpdateEventMessage: {
            std::unique_ptr<lunira::UpdateEvent> event(reinterpret_cast<lunira::UpdateEvent*>(lParam));
            if(event)HandleUpdateEvent(*event);
            return 0;
        }
        case WM_CLOSE:
            DestroyWindow(hwnd_);
            return 0;
        case WM_DESTROY:
            updater_.Stop();
            controller_.Reset();
            webView_.Reset();
            environment_.Reset();
            PostQuitMessage(0);
            return 0;
        default:
            return DefWindowProcW(hwnd_,message,0,lParam);
        }
    }

    void InitializeWebView() {
        const HRESULT started=CreateCoreWebView2EnvironmentWithOptions(
            nullptr,nullptr,nullptr,
            Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
                [this](HRESULT result,ICoreWebView2Environment* environment)->HRESULT{
                    if(FAILED(result)||!environment){
                        ShowStartupError(L"O Microsoft Edge WebView2 Runtime não está disponível.");
                        return result;
                    }
                    environment_=environment;
                    return environment->CreateCoreWebView2Controller(
                        hwnd_,
                        Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                            [this](HRESULT controllerResult,ICoreWebView2Controller* controller)->HRESULT{
                                if(FAILED(controllerResult)||!controller){
                                    ShowStartupError(L"Não foi possível criar a interface WebView2.");
                                    return controllerResult;
                                }

                                controller_=controller;
                                controller_->get_CoreWebView2(&webView_);

                                ComPtr<ICoreWebView2Controller2> controller2;
                                if(SUCCEEDED(controller_.As(&controller2))){
                                    COREWEBVIEW2_COLOR background{};
                                    background.A=255;background.R=16;background.G=15;background.B=20;
                                    controller2->put_DefaultBackgroundColor(background);
                                }

                                ComPtr<ICoreWebView2Settings> settings;
                                if(SUCCEEDED(webView_->get_Settings(&settings))&&settings){
                                    settings->put_IsStatusBarEnabled(FALSE);
                                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                                    settings->put_AreDevToolsEnabled(FALSE);
                                    settings->put_IsZoomControlEnabled(FALSE);
                                }

                                webView_->AddWebResourceRequestedFilter(
                                    L"https://lunirascreen.onrender.com/__desktop__/*",
                                    COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
                                EventRegistrationToken resourceToken{};
                                webView_->add_WebResourceRequested(
                                    Callback<ICoreWebView2WebResourceRequestedEventHandler>(
                                        [this](ICoreWebView2*,ICoreWebView2WebResourceRequestedEventArgs* args)->HRESULT{
                                            return HandleLocalResource(args);
                                        }).Get(),
                                    &resourceToken);

                                EventRegistrationToken messageToken{};
                                webView_->add_WebMessageReceived(
                                    Callback<ICoreWebView2WebMessageReceivedEventHandler>(
                                        [this](ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs* args)->HRESULT{
                                            LPWSTR raw=nullptr;
                                            if(FAILED(args->TryGetWebMessageAsString(&raw))||!raw)return S_OK;
                                            std::wstring message(raw);
                                            CoTaskMemFree(raw);
                                            HandleWebMessage(message);
                                            return S_OK;
                                        }).Get(),
                                    &messageToken);

                                EventRegistrationToken newWindowToken{};
                                webView_->add_NewWindowRequested(
                                    Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                                        [](ICoreWebView2*,ICoreWebView2NewWindowRequestedEventArgs* args)->HRESULT{
                                            LPWSTR rawUri=nullptr;
                                            if(SUCCEEDED(args->get_Uri(&rawUri))&&rawUri){
                                                ShellExecuteW(nullptr,L"open",rawUri,nullptr,nullptr,SW_SHOWNORMAL);
                                                CoTaskMemFree(rawUri);
                                            }
                                            args->put_Handled(TRUE);
                                            return S_OK;
                                        }).Get(),
                                    &newWindowToken);

                                EventRegistrationToken navToken{};
                                webView_->add_NavigationStarting(
                                    Callback<ICoreWebView2NavigationStartingEventHandler>(
                                        [](ICoreWebView2*,ICoreWebView2NavigationStartingEventArgs* args)->HRESULT{
                                            LPWSTR rawUri=nullptr;
                                            if(FAILED(args->get_Uri(&rawUri))||!rawUri)return S_OK;
                                            std::wstring uri(rawUri);
                                            CoTaskMemFree(rawUri);
                                            const bool allowed=
                                                uri.starts_with(L"https://lunirascreen.onrender.com/")||
                                                uri.starts_with(L"about:blank");
                                            if(!allowed){
                                                args->put_Cancel(TRUE);
                                                ShellExecuteW(nullptr,L"open",uri.c_str(),nullptr,nullptr,SW_SHOWNORMAL);
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

        if(FAILED(started))ShowStartupError(L"Não foi possível iniciar o Microsoft Edge WebView2 Runtime.");
    }

    HRESULT HandleLocalResource(ICoreWebView2WebResourceRequestedEventArgs* args) {
        ComPtr<ICoreWebView2WebResourceRequest> request;
        if(FAILED(args->get_Request(&request))||!request)return S_OK;

        LPWSTR rawUri=nullptr;
        if(FAILED(request->get_Uri(&rawUri))||!rawUri)return S_OK;
        std::wstring uri(rawUri);
        CoTaskMemFree(rawUri);

        const std::wstring prefix=kDesktopPrefix;
        if(!uri.starts_with(prefix))return S_OK;

        std::wstring relative=uri.substr(prefix.size());
        if(const auto q=relative.find_first_of(L"?#");q!=std::wstring::npos)relative.resize(q);
        if(relative.empty())relative=L"index.html";
        std::replace(relative.begin(),relative.end(),L'/',std::filesystem::path::preferred_separator);

        if(relative.find(L"..")!=std::wstring::npos||relative.find(L':')!=std::wstring::npos){
            return MakeErrorResponse(args,403,L"Forbidden");
        }

        const std::filesystem::path local=uiRoot_/relative;
        if(!std::filesystem::exists(local)||!std::filesystem::is_regular_file(local)){
            return MakeErrorResponse(args,404,L"Not Found");
        }

        ComPtr<IStream> stream;
        const HRESULT opened=SHCreateStreamOnFileEx(
            local.c_str(),
            STGM_READ|STGM_SHARE_DENY_WRITE,
            FILE_ATTRIBUTE_NORMAL,
            FALSE,
            nullptr,
            stream.ReleaseAndGetAddressOf());
        if(FAILED(opened))return MakeErrorResponse(args,500,L"Read Error");

        std::wstring headers=L"Content-Type: "+ContentType(local)+L"\r\nCache-Control: no-store\r\n";
        ComPtr<ICoreWebView2WebResourceResponse> response;
        const HRESULT created=environment_->CreateWebResourceResponse(
            stream.Get(),200,L"OK",headers.c_str(),&response);
        if(SUCCEEDED(created))args->put_Response(response.Get());
        return created;
    }

    HRESULT MakeErrorResponse(ICoreWebView2WebResourceRequestedEventArgs* args,int status,const wchar_t* text) {
        ComPtr<ICoreWebView2WebResourceResponse> response;
        const HRESULT created=environment_->CreateWebResourceResponse(
            nullptr,status,text,L"Content-Type: text/plain\r\nCache-Control: no-store\r\n",&response);
        if(SUCCEEDED(created))args->put_Response(response.Get());
        return created;
    }

    void HandleWebMessage(const std::wstring& message) {
        if(message==L"getUpdateState"){
            SendUpdateState(L"idle",L"Verificação automática ativada.",-1);
            return;
        }
        if(message==L"checkUpdate"){
            if(updater_.IsBusy())return;
            updater_.Check([this](lunira::UpdateEvent event){QueueUpdateEvent(std::move(event));});
            return;
        }
        if(message==L"downloadUpdate"){
            if(updater_.IsBusy())return;
            updater_.DownloadAndInstall([this](lunira::UpdateEvent event){QueueUpdateEvent(std::move(event));});
        }
    }

    void QueueUpdateEvent(lunira::UpdateEvent event) {
        auto* heap=new(std::nothrow) lunira::UpdateEvent(std::move(event));
        if(!heap)return;
        if(!PostMessageW(hwnd_,kUpdateEventMessage,0,reinterpret_cast<LPARAM>(heap)))delete heap;
    }

    void HandleUpdateEvent(const lunira::UpdateEvent& event) {
        const wchar_t* status=L"error";
        switch(event.type){
        case lunira::UpdateEventType::Checking: status=L"checking"; break;
        case lunira::UpdateEventType::UpToDate: status=L"upToDate"; break;
        case lunira::UpdateEventType::Available: status=L"available"; break;
        case lunira::UpdateEventType::Downloading: status=L"downloading"; break;
        case lunira::UpdateEventType::Installing: status=L"installing"; break;
        case lunira::UpdateEventType::Error: status=L"error"; break;
        }

        SendUpdateState(status,event.message,event.progress,event.version);
        if(event.type==lunira::UpdateEventType::Installing)PostMessageW(hwnd_,WM_CLOSE,0,0);
    }

    void SendUpdateState(
        std::wstring_view status,
        std::wstring_view message,
        int progress,
        std::wstring_view latest=L"") {

        if(!webView_)return;
        const std::wstring version=lunira::UpdaterClient::CurrentVersion();
        std::wstring json=L"{\"type\":\"updateState\",\"status\":\""+JsonEscape(status)+
            L"\",\"message\":\""+JsonEscape(message)+
            L"\",\"version\":\""+JsonEscape(version)+
            L"\",\"latest\":\""+JsonEscape(latest)+
            L"\",\"progress\":"+std::to_wstring(progress)+L"}";
        webView_->PostWebMessageAsJson(json.c_str());
    }

    void ResizeWebView() {
        if(!controller_||!hwnd_)return;
        RECT bounds{};
        GetClientRect(hwnd_,&bounds);
        controller_->put_Bounds(bounds);
    }

    void ShowStartupError(const wchar_t* detail) {
        std::wstring message=L"A nova interface do LuniraScreen usa Microsoft Edge WebView2.\n\n";
        message+=detail;
        message+=L"\n\nNo Windows 11 o runtime normalmente já vem instalado.";
        MessageBoxW(hwnd_,message.c_str(),kWindowTitle,MB_OK|MB_ICONERROR);
    }

    HINSTANCE instance_=nullptr;
    HWND hwnd_=nullptr;
    std::filesystem::path uiRoot_;
    ComPtr<ICoreWebView2Environment> environment_;
    ComPtr<ICoreWebView2Controller> controller_;
    ComPtr<ICoreWebView2> webView_;
    lunira::UpdaterClient updater_;
};

} // namespace

int WINAPI wWinMain(HINSTANCE instance,HINSTANCE,PWSTR,int) {
    WebUiWindow app;
    if(!app.Initialize(instance)){
        MessageBoxW(nullptr,L"Não foi possível iniciar o LuniraScreen.",kWindowTitle,MB_OK|MB_ICONERROR);
        return 1;
    }
    return app.Run();
}
