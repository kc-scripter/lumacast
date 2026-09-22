cmake_minimum_required(VERSION 3.24)
project(LuniraScreenNative LANGUAGES CXX RC)

set(LUNIRA_VERSION "0.8.0" CACHE STRING "LuniraScreen application version")

execute_process(
  COMMAND git rev-parse --short=7 HEAD
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  RESULT_VARIABLE LUNIRA_GIT_SHA_RESULT
  OUTPUT_VARIABLE LUNIRA_GIT_SHA
  OUTPUT_STRIP_TRAILING_WHITESPACE
)
if(NOT LUNIRA_GIT_SHA_RESULT EQUAL 0 OR LUNIRA_GIT_SHA STREQUAL "")
  set(LUNIRA_GIT_SHA "unknown")
endif()

find_program(LUNIRA_POWERSHELL NAMES pwsh powershell REQUIRED)
set(LUNIRA_GENERATED_DIR "${CMAKE_BINARY_DIR}/generated")
file(MAKE_DIRECTORY "${LUNIRA_GENERATED_DIR}")
set(LUNIRA_ICON_PATH "${LUNIRA_GENERATED_DIR}/LuniraScreen.ico")

execute_process(
  COMMAND "${LUNIRA_POWERSHELL}"
          -NoProfile
          -ExecutionPolicy Bypass
          -File "${CMAKE_CURRENT_SOURCE_DIR}/scripts/generate_icon.ps1"
          -InputPng "${CMAKE_CURRENT_SOURCE_DIR}/assets/lunira.png"
          -OutputIco "${LUNIRA_ICON_PATH}"
  RESULT_VARIABLE LUNIRA_ICON_RESULT
  OUTPUT_VARIABLE LUNIRA_ICON_STDOUT
  ERROR_VARIABLE LUNIRA_ICON_STDERR
)

if(NOT LUNIRA_ICON_RESULT EQUAL 0 OR NOT EXISTS "${LUNIRA_ICON_PATH}")
  message(FATAL_ERROR "Failed to generate LuniraScreen icon: ${LUNIRA_ICON_STDOUT} ${LUNIRA_ICON_STDERR}")
endif()

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/src/resources.rc.in"
  "${LUNIRA_GENERATED_DIR}/resources.rc"
  @ONLY
)


# Experimental WebView2 shell. This keeps the proven native media build intact
# while moving the visual shell to a declarative HTML/CSS UI.
set(LUNIRA_WEBVIEW2_VERSION "1.0.4191.47" CACHE STRING "WebView2 SDK version")
set(LUNIRA_WEBVIEW2_DIR "${CMAKE_BINARY_DIR}/_deps/webview2-${LUNIRA_WEBVIEW2_VERSION}")
set(LUNIRA_WEBVIEW2_NUPKG "${CMAKE_BINARY_DIR}/_deps/Microsoft.Web.WebView2.${LUNIRA_WEBVIEW2_VERSION}.nupkg")

if(NOT EXISTS "${LUNIRA_WEBVIEW2_DIR}/build/native/include/WebView2.h")
  file(MAKE_DIRECTORY "${CMAKE_BINARY_DIR}/_deps")
  if(NOT EXISTS "${LUNIRA_WEBVIEW2_NUPKG}")
    file(
      DOWNLOAD
      "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${LUNIRA_WEBVIEW2_VERSION}"
      "${LUNIRA_WEBVIEW2_NUPKG}"
      SHOW_PROGRESS
      STATUS LUNIRA_WEBVIEW2_DOWNLOAD_STATUS
      TLS_VERIFY ON
    )
    list(GET LUNIRA_WEBVIEW2_DOWNLOAD_STATUS 0 LUNIRA_WEBVIEW2_DOWNLOAD_CODE)
    if(NOT LUNIRA_WEBVIEW2_DOWNLOAD_CODE EQUAL 0)
      list(GET LUNIRA_WEBVIEW2_DOWNLOAD_STATUS 1 LUNIRA_WEBVIEW2_DOWNLOAD_MESSAGE)
      message(FATAL_ERROR "Failed to download WebView2 SDK: ${LUNIRA_WEBVIEW2_DOWNLOAD_MESSAGE}")
    endif()
  endif()

  file(
    ARCHIVE_EXTRACT
    INPUT "${LUNIRA_WEBVIEW2_NUPKG}"
    DESTINATION "${LUNIRA_WEBVIEW2_DIR}"
  )
endif()

set(LUNIRA_WEBVIEW2_INCLUDE "${LUNIRA_WEBVIEW2_DIR}/build/native/include")
set(LUNIRA_WEBVIEW2_STATIC_LIB "${LUNIRA_WEBVIEW2_DIR}/build/native/x64/WebView2LoaderStatic.lib")
if(NOT EXISTS "${LUNIRA_WEBVIEW2_STATIC_LIB}")
  message(FATAL_ERROR "WebView2 static loader library not found: ${LUNIRA_WEBVIEW2_STATIC_LIB}")
endif()

add_executable(LuniraScreenWebUI WIN32
  src/webview_shell.cpp
  src/updater.cpp
  "${LUNIRA_GENERATED_DIR}/resources.rc"
)

target_compile_features(LuniraScreenWebUI PRIVATE cxx_std_20)
target_compile_definitions(LuniraScreenWebUI PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  LUNIRA_APP_VERSION="${LUNIRA_VERSION}"
)
target_include_directories(LuniraScreenWebUI PRIVATE "${LUNIRA_WEBVIEW2_INCLUDE}")
target_link_libraries(LuniraScreenWebUI PRIVATE
  "${LUNIRA_WEBVIEW2_STATIC_LIB}"
  dwmapi
  ole32
  shell32
  shlwapi
  winhttp
  bcrypt
)

add_custom_command(
  TARGET LuniraScreenWebUI
  POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E rm -rf "$<TARGET_FILE_DIR:LuniraScreenWebUI>/desktop-ui"
  COMMAND "${CMAKE_COMMAND}" -E copy_directory
          "${CMAKE_CURRENT_SOURCE_DIR}/../desktop-ui/dist"
          "$<TARGET_FILE_DIR:LuniraScreenWebUI>/desktop-ui"
  VERBATIM
)

if(MSVC)
  target_compile_options(LuniraScreenWebUI PRIVATE /W4 /permissive- /EHsc /utf-8)
  target_link_options(LuniraScreenWebUI PRIVATE
    $<$<CONFIG:Release>:/OPT:REF>
    $<$<CONFIG:Release>:/OPT:ICF>
  )
  set_property(TARGET LuniraScreenWebUI PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

add_executable(LuniraScreen WIN32
  src/main.cpp
  src/ui_layout.cpp
  src/socket_io_client.cpp
  src/livekit_media_client.cpp
  src/camera_capture.cpp
  src/agora_screen_client.cpp
  src/system_audio_capture.cpp
  src/updater.cpp
  "${LUNIRA_GENERATED_DIR}/resources.rc"
)

target_compile_features(LuniraScreen PRIVATE cxx_std_20)
target_compile_definitions(LuniraScreen PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
  LUNIRA_APP_VERSION="${LUNIRA_VERSION}"
  LUNIRA_GIT_SHA="${LUNIRA_GIT_SHA}"
  LUNIRA_UI_REV="R2"
)

if(MSVC)
  target_compile_options(LuniraScreen PRIVATE
    /W4
    /permissive-
    /EHsc
    /utf-8
    $<$<CONFIG:Release>:/O2>
    $<$<CONFIG:Release>:/GL>
    $<$<CONFIG:Release>:/Gy>
  )
  target_link_options(LuniraScreen PRIVATE
    $<$<CONFIG:Release>:/LTCG>
    $<$<CONFIG:Release>:/OPT:REF>
    $<$<CONFIG:Release>:/OPT:ICF>
  )
  set_property(TARGET LuniraScreen PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

target_link_libraries(LuniraScreen PRIVATE
  d2d1
  dwrite
  dwmapi
  winhttp
  mf
  mfplat
  mfreadwrite
  mfuuid
  ole32
  uuid
  bcrypt
)

add_executable(LuniraUpdater
  src/updater_main.cpp
)

target_compile_features(LuniraUpdater PRIVATE cxx_std_20)
target_compile_definitions(LuniraUpdater PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

if(MSVC)
  target_compile_options(LuniraUpdater PRIVATE /W4 /permissive- /EHsc /utf-8)
  target_link_options(LuniraUpdater PRIVATE
    $<$<CONFIG:Release>:/OPT:REF>
    $<$<CONFIG:Release>:/OPT:ICF>
  )
  set_property(TARGET LuniraUpdater PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()



add_executable(LuniraSignalingSmoke
  tests/signaling_smoke.cpp
  src/socket_io_client.cpp
)

target_compile_features(LuniraSignalingSmoke PRIVATE cxx_std_20)
target_compile_definitions(LuniraSignalingSmoke PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

if(MSVC)
  target_compile_options(LuniraSignalingSmoke PRIVATE /W4 /permissive- /EHsc /utf-8)
  set_property(TARGET LuniraSignalingSmoke PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

target_link_libraries(LuniraSignalingSmoke PRIVATE winhttp)


list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")
include(LuniraLiveKit)
lunira_setup_livekit(LUNIRA_LIVEKIT_ROOT)
list(PREPEND CMAKE_PREFIX_PATH "${LUNIRA_LIVEKIT_ROOT}")
find_package(LiveKit CONFIG REQUIRED)

target_link_libraries(LuniraScreen PRIVATE LiveKit::livekit)
lunira_copy_livekit_runtime(LuniraScreen "${LUNIRA_LIVEKIT_ROOT}")

include(LuniraAgora)
lunira_setup_agora(LUNIRA_AGORA_ROOT)
lunira_link_agora(LuniraScreen "${LUNIRA_AGORA_ROOT}")

add_executable(LuniraLiveKitSmoke
  tests/livekit_smoke.cpp
  src/socket_io_client.cpp
)

target_compile_features(LuniraLiveKitSmoke PRIVATE cxx_std_20)
target_compile_definitions(LuniraLiveKitSmoke PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

if(MSVC)
  target_compile_options(LuniraLiveKitSmoke PRIVATE /W4 /permissive- /EHsc /utf-8)
  set_property(TARGET LuniraLiveKitSmoke PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

target_link_libraries(LuniraLiveKitSmoke PRIVATE
  LiveKit::livekit
  winhttp
)

lunira_copy_livekit_runtime(LuniraLiveKitSmoke "${LUNIRA_LIVEKIT_ROOT}")


add_executable(LuniraCameraRoundtrip
  tests/camera_roundtrip.cpp
  src/socket_io_client.cpp
  src/livekit_media_client.cpp
)

target_compile_features(LuniraCameraRoundtrip PRIVATE cxx_std_20)
target_compile_definitions(LuniraCameraRoundtrip PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
)

if(MSVC)
  target_compile_options(LuniraCameraRoundtrip PRIVATE /W4 /permissive- /EHsc /utf-8)
  set_property(TARGET LuniraCameraRoundtrip PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()

target_link_libraries(LuniraCameraRoundtrip PRIVATE
  LiveKit::livekit
  winhttp
)

lunira_copy_livekit_runtime(LuniraCameraRoundtrip "${LUNIRA_LIVEKIT_ROOT}")

add_executable(LuniraAgoraRoundtrip
  tests/agora_roundtrip.cpp
  src/socket_io_client.cpp
  src/agora_screen_client.cpp
)
target_compile_features(LuniraAgoraRoundtrip PRIVATE cxx_std_20)
target_compile_definitions(LuniraAgoraRoundtrip PRIVATE
  UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
if(MSVC)
  target_compile_options(LuniraAgoraRoundtrip PRIVATE /W4 /permissive- /EHsc /utf-8)
  set_property(TARGET LuniraAgoraRoundtrip PROPERTY
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
endif()
target_link_libraries(LuniraAgoraRoundtrip PRIVATE winhttp)
lunira_link_agora(LuniraAgoraRoundtrip "${LUNIRA_AGORA_ROOT}")

add_custom_command(
  TARGET LuniraAgoraRoundtrip
  POST_BUILD
  COMMAND "${CMAKE_COMMAND}" -E copy_if_different
          "$<TARGET_FILE:LuniraAgoraRoundtrip>"
          "$<TARGET_FILE_DIR:LuniraAgoraRoundtrip>/LuniraAgoraPublisher.exe"
  VERBATIM
)
