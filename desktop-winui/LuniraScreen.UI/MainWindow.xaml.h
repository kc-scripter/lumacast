#pragma once
#include "MainWindow.g.h"

namespace winrt::LuniraScreen::UI::implementation {
struct MainWindow : MainWindowT<MainWindow> {
    MainWindow();

    void Navigation_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void CreateRoom_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void JoinRoom_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Toggle_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void TogglePanel_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void CopyCode_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Stats_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Leave_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

private:
    void ShowPage(winrt::hstring const& page);
    bool m_panelOpen{true};
    bool m_statsOpen{false};
};
}
namespace winrt::LuniraScreen::UI::factory_implementation {
struct MainWindow : MainWindowT<MainWindow, implementation::MainWindow> {};
}
