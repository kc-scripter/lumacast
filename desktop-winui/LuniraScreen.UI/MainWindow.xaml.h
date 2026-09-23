#pragma once
#include "MainWindow.g.h"
#include "core_bridge.h"

namespace winrt::LuniraScreen::UI::implementation {

struct MainWindow : MainWindowT<MainWindow> {
    MainWindow();
    ~MainWindow();

    void Navigation_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void CreateRoom_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void JoinRoom_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Toggle_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void TogglePanel_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void CopyCode_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Stats_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Leave_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Update_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Invite_Click(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
    void Quality_Changed(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);

private:
    struct CameraSlot {
        std::wstring identity;
        int width = 0;
        int height = 0;
        Microsoft::UI::Xaml::Media::Imaging::WriteableBitmap bitmap{nullptr};
    };

    static void __stdcall BridgeCallback(
        int eventType,
        const wchar_t* text,
        const wchar_t* identity,
        const std::uint8_t* data,
        int width,
        int height,
        int value1,
        int value2,
        void* user);

    void OnBridgeEvent(
        int eventType,
        std::wstring_view text,
        std::wstring_view identity,
        const std::uint8_t* data,
        int width,
        int height,
        int value1,
        int value2);

    void ShowPage(winrt::hstring const& page);
    void ApplyFlags(int flags, int fps);
    void ApplyRoomState(std::wstring_view serialized, std::wstring_view activeSharer, bool live);
    void ApplyScreenFrame(const std::uint8_t* data, int width, int height);
    void ApplyCameraFrame(std::wstring_view identity, const std::uint8_t* data, int width, int height);
    void RemoveCamera(std::wstring_view identity);
    void UpdateBitmap(
        Microsoft::UI::Xaml::Controls::Image const& image,
        Microsoft::UI::Xaml::Media::Imaging::WriteableBitmap& bitmap,
        int& bitmapWidth,
        int& bitmapHeight,
        const std::uint8_t* data,
        int width,
        int height);
    HWND WindowHandle() const;

    void* m_bridge = nullptr;
    std::wstring m_roomCode;
    std::wstring m_displayName;
    bool m_roomActive = false;
    bool m_panelOpen = true;
    bool m_statsOpen = false;
    bool m_syncingToggles = false;
    bool m_updateAvailable = false;
    int m_fps = 60;
    int m_qualityWidth = 1920;
    int m_qualityHeight = 1080;

    int m_screenWidth = 0;
    int m_screenHeight = 0;
    Microsoft::UI::Xaml::Media::Imaging::WriteableBitmap m_screenBitmap{nullptr};
    std::array<CameraSlot, 3> m_cameraSlots{};
};

}

namespace winrt::LuniraScreen::UI::factory_implementation {
struct MainWindow : MainWindowT<MainWindow, implementation::MainWindow> {};
}
