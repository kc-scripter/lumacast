#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <thread>
#include <vector>

namespace lunira {

struct CapturedCameraFrame {
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> bgra;
};

class CameraCapture {
public:
    using FrameCallback = std::function<void(CapturedCameraFrame)>;
    using ErrorCallback = std::function<void(std::wstring)>;

    CameraCapture();
    ~CameraCapture();

    CameraCapture(const CameraCapture&) = delete;
    CameraCapture& operator=(const CameraCapture&) = delete;

    bool Start(FrameCallback frameCallback, ErrorCallback errorCallback);
    void Stop();
    bool IsRunning() const noexcept;

private:
    void Run();
    void Fail(std::wstring message);

    FrameCallback frameCallback_;
    ErrorCallback errorCallback_;
    std::thread thread_;
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
};

} // namespace lunira
