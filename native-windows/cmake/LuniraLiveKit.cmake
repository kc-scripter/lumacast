include_guard(GLOBAL)

set(LUNIRA_LIVEKIT_VERSION "1.11.0" CACHE STRING "Pinned LiveKit C++ SDK version")
set(LUNIRA_LIVEKIT_WINDOWS_SHA256 "d95d677c3ca7348e0af18ede713f7fe825c14a726296ff65524b933f64f965dc")

function(lunira_setup_livekit out_root)
  if(NOT WIN32 OR NOT CMAKE_SIZEOF_VOID_P EQUAL 8)
    message(FATAL_ERROR "Lunira native media currently supports Windows x64 only.")
  endif()

  set(_archive_name "livekit-sdk-windows-x64-${LUNIRA_LIVEKIT_VERSION}.zip")
  set(_downloads "${CMAKE_BINARY_DIR}/_downloads")
  set(_sdk_dir "${CMAKE_BINARY_DIR}/_deps/livekit-sdk")
  set(_root "${_sdk_dir}/livekit-sdk-windows-x64-${LUNIRA_LIVEKIT_VERSION}")
  set(_archive "${_downloads}/${_archive_name}")
  set(_url "https://github.com/livekit/client-sdk-cpp/releases/download/v${LUNIRA_LIVEKIT_VERSION}/${_archive_name}")

  if(NOT EXISTS "${_root}/lib/cmake")
    file(MAKE_DIRECTORY "${_downloads}")
    file(MAKE_DIRECTORY "${_sdk_dir}")

    if(NOT EXISTS "${_archive}")
      message(STATUS "Downloading pinned LiveKit C++ SDK ${LUNIRA_LIVEKIT_VERSION}")
      file(
        DOWNLOAD
        "${_url}"
        "${_archive}"
        SHOW_PROGRESS
        TLS_VERIFY ON
        EXPECTED_HASH "SHA256=${LUNIRA_LIVEKIT_WINDOWS_SHA256}"
        STATUS _status
      )
      list(GET _status 0 _code)
      list(GET _status 1 _message)
      if(NOT _code EQUAL 0)
        message(FATAL_ERROR "LiveKit SDK download failed: ${_message}")
      endif()
    endif()

    file(REMOVE_RECURSE "${_root}")
    file(ARCHIVE_EXTRACT INPUT "${_archive}" DESTINATION "${_sdk_dir}")
  endif()

  if(NOT EXISTS "${_root}/lib/cmake")
    message(FATAL_ERROR "LiveKit SDK archive layout is invalid: ${_root}")
  endif()

  set(${out_root} "${_root}" PARENT_SCOPE)
endfunction()

function(lunira_copy_livekit_runtime target sdk_root)
  file(GLOB _runtime_dlls "${sdk_root}/bin/*.dll")
  if(NOT _runtime_dlls)
    message(FATAL_ERROR "No LiveKit runtime DLLs found under ${sdk_root}/bin")
  endif()

  foreach(_dll IN LISTS _runtime_dlls)
    add_custom_command(
      TARGET ${target}
      POST_BUILD
      COMMAND "${CMAKE_COMMAND}" -E copy_if_different
              "${_dll}"
              "$<TARGET_FILE_DIR:${target}>"
      VERBATIM
    )
  endforeach()
endfunction()
