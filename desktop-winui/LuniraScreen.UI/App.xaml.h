#pragma once
#include "App.xaml.g.h"
namespace winrt::LuniraScreen::UI::implementation { struct App : AppT<App> { App(); void OnLaunched(Microsoft::UI::Xaml::LaunchActivatedEventArgs const&); private: Microsoft::UI::Xaml::Window m_window{ nullptr }; }; }
namespace winrt::LuniraScreen::UI::factory_implementation { struct App : AppT<App, implementation::App> {}; }

