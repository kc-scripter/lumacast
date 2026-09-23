#pragma once

#include <windows.h>
#include <cstdint>

#ifdef LUNIRA_CORE_BRIDGE_EXPORTS
#define LUNIRA_BRIDGE_API __declspec(dllexport)
#else
#define LUNIRA_BRIDGE_API __declspec(dllimport)
#endif

extern "C" {

enum LuniraBridgeEventType : int {
    LUNIRA_EVENT_STATUS = 1,
    LUNIRA_EVENT_JOINED = 2,
    LUNIRA_EVENT_ROOM_STATE = 3,
    LUNIRA_EVENT_SCREEN_FRAME = 4,
    LUNIRA_EVENT_CAMERA_FRAME = 5,
    LUNIRA_EVENT_CAMERA_REMOVED = 6,
    LUNIRA_EVENT_FLAGS = 7,
    LUNIRA_EVENT_ERROR = 8,
    LUNIRA_EVENT_UPDATE = 9
};

enum LuniraBridgeFlags : int {
    LUNIRA_FLAG_NETWORK = 1 << 0,
    LUNIRA_FLAG_CAMERA = 1 << 1,
    LUNIRA_FLAG_SYSTEM_AUDIO = 1 << 2,
    LUNIRA_FLAG_LOCAL_SCREEN = 1 << 3,
    LUNIRA_FLAG_SCREEN_LIVE = 1 << 4,
    LUNIRA_FLAG_MEDIA = 1 << 5,
    LUNIRA_FLAG_AGORA = 1 << 6
};

typedef void(__stdcall* LuniraBridgeCallback)(
    int eventType,
    const wchar_t* text,
    const wchar_t* identity,
    const std::uint8_t* data,
    int width,
    int height,
    int value1,
    int value2,
    void* user);

LUNIRA_BRIDGE_API void* __stdcall lunira_bridge_create(
    LuniraBridgeCallback callback,
    void* user);

LUNIRA_BRIDGE_API void __stdcall lunira_bridge_destroy(void* handle);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_create_room(void* handle, const wchar_t* displayName);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_join_room(void* handle, const wchar_t* displayName, const wchar_t* roomCode);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_leave_room(void* handle);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_toggle_camera(void* handle);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_toggle_system_audio(void* handle);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_toggle_screen(void* handle, HWND ownerWindow, int fps);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_set_fps(void* handle, int fps);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_check_update(void* handle);
LUNIRA_BRIDGE_API void __stdcall lunira_bridge_download_update(void* handle);

}
