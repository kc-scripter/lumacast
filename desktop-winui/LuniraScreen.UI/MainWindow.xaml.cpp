#include "pch.h"
#include "MainWindow.xaml.h"
#if __has_include("MainWindow.g.cpp")
#include "MainWindow.g.cpp"
#endif

using namespace winrt;
using namespace Microsoft::UI::Xaml;
using namespace Microsoft::UI::Xaml::Controls;
using namespace Microsoft::UI::Xaml::Media::Imaging;
using namespace Windows::ApplicationModel::DataTransfer;

namespace winrt::LuniraScreen::UI::implementation {

MainWindow::MainWindow() {
    InitializeComponent();
    ExtendsContentIntoTitleBar(true);
    SetTitleBar(AppTitleBar());

    m_bridge = lunira_bridge_create(&MainWindow::BridgeCallback, this);
    if (!m_bridge) {
        RoomStatusText().Text(L"Falha ao iniciar o core nativo.");
    }
}

MainWindow::~MainWindow() {
    if (m_bridge) {
        lunira_bridge_destroy(m_bridge);
        m_bridge = nullptr;
    }
}

HWND MainWindow::WindowHandle() const {
    HWND hwnd = nullptr;
    auto native = this->try_as<::IWindowNative>();
    if (native) native->get_WindowHandle(&hwnd);
    return hwnd;
}

void MainWindow::ShowPage(hstring const& page) {
    if (page == L"Room" && !m_roomActive) return;
    HomePage().Visibility(page == L"Home" ? Visibility::Visible : Visibility::Collapsed);
    RoomPage().Visibility(page == L"Room" ? Visibility::Visible : Visibility::Collapsed);
    SettingsPage().Visibility(page == L"Settings" ? Visibility::Visible : Visibility::Collapsed);
    PageTitle().Text(page == L"Home" ? L"Início" : page == L"Room" ? L"Sala" : L"Configurações");
}

void MainWindow::Navigation_Click(IInspectable const& sender, RoutedEventArgs const&) {
    const auto tag = unbox_value<hstring>(sender.as<FrameworkElement>().Tag());
    ShowPage(tag);
}

void MainWindow::CreateRoom_Click(IInspectable const&, RoutedEventArgs const&) {
    if (!m_bridge) return;
    m_displayName = NameBox().Text().c_str();
    lunira_bridge_create_room(m_bridge, m_displayName.c_str());
}

void MainWindow::JoinRoom_Click(IInspectable const&, RoutedEventArgs const&) {
    if (!m_bridge) return;
    m_displayName = NameBox().Text().c_str();
    const std::wstring code = CodeBox().Text().c_str();
    lunira_bridge_join_room(m_bridge, m_displayName.c_str(), code.c_str());
}

void MainWindow::Toggle_Click(IInspectable const& sender, RoutedEventArgs const&) {
    if (m_syncingToggles || !m_bridge) return;
    const auto element = sender.as<FrameworkElement>();
    const auto tag = unbox_value_or<hstring>(element.Tag(), L"");

    if (tag == L"Camera") {
        lunira_bridge_toggle_camera(m_bridge);
    } else if (tag == L"Screen") {
        lunira_bridge_toggle_screen(m_bridge, WindowHandle(), m_fps);
    } else if (tag == L"Audio") {
        lunira_bridge_toggle_system_audio(m_bridge);
    }
}

void MainWindow::TogglePanel_Click(IInspectable const&, RoutedEventArgs const&) {
    m_panelOpen = !m_panelOpen;
    ParticipantPanel().Visibility(m_panelOpen ? Visibility::Visible : Visibility::Collapsed);
}

void MainWindow::CopyCode_Click(IInspectable const&, RoutedEventArgs const&) {
    if (m_roomCode.empty()) return;
    DataPackage package;
    package.SetText(m_roomCode);
    Clipboard::SetContent(package);
    CopyLabel().Text(L"Copiado");
}

void MainWindow::Stats_Click(IInspectable const&, RoutedEventArgs const&) {
    m_statsOpen = !m_statsOpen;
    StatsPopup().Visibility(m_statsOpen ? Visibility::Visible : Visibility::Collapsed);
}

void MainWindow::Leave_Click(IInspectable const&, RoutedEventArgs const&) {
    if (m_bridge) lunira_bridge_leave_room(m_bridge);
    m_roomActive = false;
    m_roomCode.clear();
    m_screenBitmap = nullptr;
    ScreenImage().Source(nullptr);
    ScreenEmpty().Visibility(Visibility::Visible);
    for (size_t i = 0; i < m_cameraSlots.size(); ++i) {
        RemoveCamera(m_cameraSlots[i].identity);
    }
    ShowPage(L"Home");
}

void MainWindow::Update_Click(IInspectable const&, RoutedEventArgs const&) {
    if (!m_bridge) return;
    if (m_updateAvailable) lunira_bridge_download_update(m_bridge);
    else lunira_bridge_check_update(m_bridge);
}

void __stdcall MainWindow::BridgeCallback(
    int eventType,
    const wchar_t* text,
    const wchar_t* identity,
    const std::uint8_t* data,
    int width,
    int height,
    int value1,
    int value2,
    void* user) {

    auto* self = static_cast<MainWindow*>(user);
    if (!self) return;
    self->OnBridgeEvent(
        eventType,
        text ? std::wstring_view(text) : std::wstring_view{},
        identity ? std::wstring_view(identity) : std::wstring_view{},
        data,
        width,
        height,
        value1,
        value2);
}

void MainWindow::OnBridgeEvent(
    int eventType,
    std::wstring_view text,
    std::wstring_view identity,
    const std::uint8_t* data,
    int width,
    int height,
    int value1,
    int value2) {

    switch (eventType) {
    case LUNIRA_EVENT_STATUS:
        RoomStatusText().Text(hstring(text));
        break;

    case LUNIRA_EVENT_ERROR:
        RoomStatusText().Text(hstring(text));
        if (!m_roomActive) {
            PageTitle().Text(L"Erro: " + hstring(text));
        }
        break;

    case LUNIRA_EVENT_JOINED:
        m_roomCode.assign(text);
        m_displayName.assign(identity);
        m_roomActive = true;
        RoomCodeText().Text(hstring(m_roomCode));
        RoomName().Text(m_displayName.empty()
            ? L"Sala privada"
            : hstring(m_displayName + L" · Sala privada"));
        CopyLabel().Text(L"Copiar");
        ShowPage(L"Room");
        break;

    case LUNIRA_EVENT_ROOM_STATE:
        ApplyRoomState(text, identity, value2 != 0);
        break;

    case LUNIRA_EVENT_SCREEN_FRAME:
        ApplyScreenFrame(data, width, height);
        break;

    case LUNIRA_EVENT_CAMERA_FRAME:
        ApplyCameraFrame(identity, data, width, height);
        break;

    case LUNIRA_EVENT_CAMERA_REMOVED:
        RemoveCamera(identity);
        break;

    case LUNIRA_EVENT_FLAGS:
        ApplyFlags(value1, value2);
        break;

    case LUNIRA_EVENT_UPDATE:
        UpdateStatusText().Text(hstring(text));
        m_updateAvailable = value1 == 3;
        UpdateButton().Content(box_value(
            value1 == 3 ? L"Baixar atualização" :
            value1 == 4 ? L"Baixando…" :
            value1 == 5 ? L"Instalando…" :
            L"Verificar agora"));
        break;
    }
}

void MainWindow::ApplyFlags(int flags, int fps) {
    m_fps = fps;
    const bool network = (flags & LUNIRA_FLAG_NETWORK) != 0;
    const bool camera = (flags & LUNIRA_FLAG_CAMERA) != 0;
    const bool audio = (flags & LUNIRA_FLAG_SYSTEM_AUDIO) != 0;
    const bool localScreen = (flags & LUNIRA_FLAG_LOCAL_SCREEN) != 0;
    const bool media = (flags & LUNIRA_FLAG_MEDIA) != 0;
    const bool agora = (flags & LUNIRA_FLAG_AGORA) != 0;

    m_syncingToggles = true;
    CameraToggle().IsOn(camera);
    ShareToggle().IsOn(localScreen);
    AudioToggle().IsOn(audio);
    m_syncingToggles = false;

    ConnectionText().Text(network ? L"● Conectado" : L"● Offline");
    MediaStatusText().Text(
        media && agora ? L"LiveKit + Agora conectados" :
        media ? L"LiveKit conectado" :
        agora ? L"Agora conectado" :
        network ? L"Signaling conectado" : L"Desconectado");

    StatsText().Text(
        (network ? L"Signaling ✓" : L"Signaling —") +
        std::wstring(L" · ") +
        (media ? L"LiveKit ✓" : L"LiveKit —") +
        std::wstring(L" · ") +
        (agora ? L"Agora ✓" : L"Agora —"));
}

void MainWindow::ApplyRoomState(
    std::wstring_view serialized,
    std::wstring_view activeSharer,
    bool live) {

    auto children = ParticipantsList().Children();
    children.Clear();

    std::wistringstream stream(std::wstring(serialized));
    std::wstring line;
    int participantCount = 0;

    while (std::getline(stream, line)) {
        if (line.empty()) continue;
        const auto first = line.find(L'\t');
        const auto second = first == std::wstring::npos
            ? std::wstring::npos
            : line.find(L'\t', first + 1);
        if (first == std::wstring::npos) continue;

        const std::wstring name = second == std::wstring::npos
            ? line.substr(first + 1)
            : line.substr(first + 1, second - first - 1);
        const bool owner = second != std::wstring::npos &&
            line.substr(second + 1) == L"1";

        TextBlock item;
        item.Text(hstring(L"●  " + name + (owner ? L"   · Host" : L"")));
        item.Foreground(
            Microsoft::UI::Xaml::Media::SolidColorBrush(
                Windows::UI::ColorHelper::FromArgb(
                    255, 205, 198, 214)));
        item.FontSize(12);
        children.Append(item);
        ++participantCount;
    }

    if (participantCount == 0) {
        TextBlock empty;
        empty.Text(L"Aguardando participantes…");
        empty.Opacity(0.62);
        children.Append(empty);
    }

    RoomLiveText().Text(
        live
            ? (activeSharer.empty()
                ? L"Transmissão ao vivo"
                : hstring(std::wstring(activeSharer) + L" está compartilhando"))
            : L"Nenhuma transmissão ativa");

    ScreenHintText().Text(
        live
            ? L"Conectando aos primeiros frames…"
            : L"Use Compartilhar tela para começar.");

    if (!live) {
        ScreenEmpty().Visibility(Visibility::Visible);
        ScreenImage().Source(nullptr);
        m_screenBitmap = nullptr;
        m_screenWidth = 0;
        m_screenHeight = 0;
    }
}

void MainWindow::ApplyScreenFrame(
    const std::uint8_t* data,
    int width,
    int height) {

    if (!data || width <= 0 || height <= 0) return;
    UpdateBitmap(
        ScreenImage(),
        m_screenBitmap,
        m_screenWidth,
        m_screenHeight,
        data,
        width,
        height);
    ScreenEmpty().Visibility(Visibility::Collapsed);
}

void MainWindow::ApplyCameraFrame(
    std::wstring_view identity,
    const std::uint8_t* data,
    int width,
    int height) {

    if (identity.empty() || !data || width <= 0 || height <= 0) return;

    size_t slotIndex = m_cameraSlots.size();
    for (size_t i = 0; i < m_cameraSlots.size(); ++i) {
        if (m_cameraSlots[i].identity == identity) {
            slotIndex = i;
            break;
        }
    }
    if (slotIndex == m_cameraSlots.size()) {
        for (size_t i = 0; i < m_cameraSlots.size(); ++i) {
            if (m_cameraSlots[i].identity.empty()) {
                slotIndex = i;
                m_cameraSlots[i].identity.assign(identity);
                break;
            }
        }
    }
    if (slotIndex >= m_cameraSlots.size()) return;

    Image image = slotIndex == 0
        ? CameraImage0()
        : slotIndex == 1 ? CameraImage1() : CameraImage2();
    Border card = slotIndex == 0
        ? CameraCard0()
        : slotIndex == 1 ? CameraCard1() : CameraCard2();
    TextBlock label = slotIndex == 0
        ? CameraLabel0()
        : slotIndex == 1 ? CameraLabel1() : CameraLabel2();

    auto& slot = m_cameraSlots[slotIndex];
    UpdateBitmap(
        image,
        slot.bitmap,
        slot.width,
        slot.height,
        data,
        width,
        height);

    card.Visibility(Visibility::Visible);
    label.Text(identity == m_displayName ? L"Você" : hstring(identity));
    CameraEmptyText().Visibility(Visibility::Collapsed);
}

void MainWindow::RemoveCamera(std::wstring_view identity) {
    if (identity.empty()) return;
    for (size_t i = 0; i < m_cameraSlots.size(); ++i) {
        auto& slot = m_cameraSlots[i];
        if (slot.identity != identity) continue;

        Image image = i == 0
            ? CameraImage0()
            : i == 1 ? CameraImage1() : CameraImage2();
        Border card = i == 0
            ? CameraCard0()
            : i == 1 ? CameraCard1() : CameraCard2();

        image.Source(nullptr);
        card.Visibility(Visibility::Collapsed);
        slot.identity.clear();
        slot.bitmap = nullptr;
        slot.width = 0;
        slot.height = 0;
    }

    bool any = false;
    for (const auto& slot : m_cameraSlots) {
        if (!slot.identity.empty()) {
            any = true;
            break;
        }
    }
    CameraEmptyText().Visibility(any ? Visibility::Collapsed : Visibility::Visible);
}

void MainWindow::UpdateBitmap(
    Image const& image,
    WriteableBitmap& bitmap,
    int& bitmapWidth,
    int& bitmapHeight,
    const std::uint8_t* data,
    int width,
    int height) {

    if (!bitmap || bitmapWidth != width || bitmapHeight != height) {
        bitmap = WriteableBitmap(width, height);
        bitmapWidth = width;
        bitmapHeight = height;
        image.Source(bitmap);
    }

    auto buffer = bitmap.PixelBuffer();
    BYTE* destination = nullptr;
    check_hresult(buffer.as<::IBufferByteAccess>()->Buffer(&destination));
    const size_t bytes =
        static_cast<size_t>(width) *
        static_cast<size_t>(height) * 4u;
    std::memcpy(destination, data, bytes);
    bitmap.Invalidate();
}

}
