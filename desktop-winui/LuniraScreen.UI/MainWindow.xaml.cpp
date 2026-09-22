#include "pch.h"
#include "MainWindow.xaml.h"
#if __has_include("MainWindow.g.cpp")
#include "MainWindow.g.cpp"
#endif

using namespace winrt;
using namespace Microsoft::UI::Xaml;
using namespace Microsoft::UI::Xaml::Controls;
using namespace Windows::ApplicationModel::DataTransfer;

namespace winrt::LuniraScreen::UI::implementation {

MainWindow::MainWindow() {
    InitializeComponent();
    ExtendsContentIntoTitleBar(true);
    SetTitleBar(AppTitleBar());
}

void MainWindow::ShowPage(hstring const& page) {
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
    RoomName().Text(NameBox().Text().empty() ? L"Sala privada" : NameBox().Text() + L" · Sala privada");
    ShowPage(L"Room");
}

void MainWindow::JoinRoom_Click(IInspectable const&, RoutedEventArgs const&) {
    if (!CodeBox().Text().empty()) ShowPage(L"Room");
}

void MainWindow::Toggle_Click(IInspectable const&, RoutedEventArgs const&) {}
void MainWindow::TogglePanel_Click(IInspectable const&, RoutedEventArgs const&) {
    m_panelOpen = !m_panelOpen;
    ParticipantPanel().Visibility(m_panelOpen ? Visibility::Visible : Visibility::Collapsed);
}
void MainWindow::CopyCode_Click(IInspectable const&, RoutedEventArgs const&) {
    DataPackage package;
    package.SetText(L"NX7K-4M2Q");
    Clipboard::SetContent(package);
    CopyLabel().Text(L"Copiado");
}
void MainWindow::Stats_Click(IInspectable const&, RoutedEventArgs const&) {
    m_statsOpen = !m_statsOpen;
    StatsPopup().Visibility(m_statsOpen ? Visibility::Visible : Visibility::Collapsed);
}
void MainWindow::Leave_Click(IInspectable const&, RoutedEventArgs const&) {
    ShowPage(L"Home");
}

}
