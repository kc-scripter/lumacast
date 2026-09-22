cmake_minimum_required(VERSION 3.24)
project(LuniraScreenNative LANGUAGES CXX)

add_executable(LuniraScreen WIN32
  src/main.cpp
  src/socket_io_client.cpp
  src/livekit_media_client.cpp
)

target_compile_features(LuniraScreen PRIVATE cxx_std_20)
target_compile_definitions(LuniraScreen PRIVATE
  UNICODE
  _UNICODE
  WIN32_LEAN_AND_MEAN
  NOMINMAX
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
)


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
