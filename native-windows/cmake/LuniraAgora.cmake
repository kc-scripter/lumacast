include_guard(GLOBAL)

set(LUNIRA_AGORA_VERSION "4.6.2" CACHE STRING "Pinned Agora Windows SDK version")
set(LUNIRA_AGORA_WINDOWS_SHA256 "44d0caabc2b5232b0416df63845d88e45de45681b9d32d99617dbd41ba8e6523")

function(lunira_setup_agora out_root)
  if(NOT WIN32 OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "Lunira Agora integration supports Windows x64 only.")
  endif()

  set(_archive_name "Agora_Native_SDK_for_Windows_v${LUNIRA_AGORA_VERSION}_FULL.zip")
  set(_downloads "${CMAKE_BINARY_DIR}/_downloads")
  set(_sdk_dir "${CMAKE_BINARY_DIR}/_deps/agora-sdk")
  set(_root "${_sdk_dir}/Agora_Native_SDK_for_Windows_FULL/sdk")
  set(_archive "${_downloads}/${_archive_name}")
  set(_url "https://download.agora.io/sdk/release/${_archive_name}")

  if(NOT EXISTS "${_root}/high_level_api/include/IAgoraRtcEngine.h")
    file(MAKE_DIRECTORY "${_downloads}" "${_sdk_dir}")
    if(NOT EXISTS "${_archive}")
      message(STATUS "Downloading pinned Agora Windows SDK ${LUNIRA_AGORA_VERSION}")
      set(_download_ok FALSE)
      foreach(_attempt RANGE 1 3)
        file(REMOVE "${_archive}")
        file(DOWNLOAD "${_url}" "${_archive}"
          SHOW_PROGRESS TLS_VERIFY ON
          EXPECTED_HASH "SHA256=${LUNIRA_AGORA_WINDOWS_SHA256}"
          STATUS _status
          TIMEOUT 120
          INACTIVITY_TIMEOUT 30)
        list(GET _status 0 _code)
        list(GET _status 1 _message)
        if(_code EQUAL 0)
          set(_download_ok TRUE)
          break()
        endif()
        message(WARNING "Agora SDK download attempt ${_attempt}/3 failed: ${_message}")
        execute_process(COMMAND "${CMAKE_COMMAND}" -E sleep 3)
      endforeach()
      if(NOT _download_ok)
        message(FATAL_ERROR "Agora SDK download failed after 3 attempts: ${_message}")
      endif()
    endif()
    file(REMOVE_RECURSE "${_sdk_dir}")
    file(MAKE_DIRECTORY "${_sdk_dir}")
    file(ARCHIVE_EXTRACT INPUT "${_archive}" DESTINATION "${_sdk_dir}")
  endif()

  if(NOT EXISTS "${_root}/x86_64/agora_rtc_sdk.dll.lib")
    message(FATAL_ERROR "Agora SDK archive layout is invalid: ${_root}")
  endif()
  set(${out_root} "${_root}" PARENT_SCOPE)
endfunction()

function(lunira_link_agora target sdk_root)
  target_include_directories(${target} PRIVATE "${sdk_root}/high_level_api/include")
  target_link_libraries(${target} PRIVATE "${sdk_root}/x86_64/agora_rtc_sdk.dll.lib")

  set(_runtime_names
    agora_rtc_sdk.dll
    libaosl.dll
    libagora-ffmpeg.dll
    libagora-soundtouch.dll
    libagora-fdkaac.dll
    libagora_screen_capture_extension.dll
    libagora-wgc.dll
    libagora_video_encoder_extension.dll
    video_enc.dll
    video_dec.dll)
  foreach(_name IN LISTS _runtime_names)
    if(NOT EXISTS "${sdk_root}/x86_64/${_name}")
      message(FATAL_ERROR "Required Agora runtime is missing: ${_name}")
    endif()
    add_custom_command(TARGET ${target} POST_BUILD
      COMMAND "${CMAKE_COMMAND}" -E copy_if_different
              "${sdk_root}/x86_64/${_name}"
              "$<TARGET_FILE_DIR:${target}>"
      VERBATIM)
  endforeach()
endfunction()
