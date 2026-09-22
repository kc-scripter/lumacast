#include "pch.h"
#include "App.xaml.h"
using namespace winrt;
using namespace Microsoft::UI::Xaml;
int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int)
{
    init_apartment(apartment_type::single_threaded);
    Application::Start([](auto&&) { make<winrt::LuniraScreen::UI::implementation::App>(); });
}

