#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <string>
#include <thread>
#include <vector>

namespace lunira {

struct CapturedAudioFrame {
    int sampleRate = 48000;
    int channels = 2;
    std::vector<std::int16_t> samples;
};

class SystemAudioCapture {
public:
    using FrameCallback = std::function<void(CapturedAudioFrame)>;
    using ErrorCallback = std::function<void(std::wstring)>;

    SystemAudioCapture();
    ~SystemAudioCapture();
    SystemAudioCapture(const SystemAudioCapture&) = delete;
    SystemAudioCapture& operator=(const SystemAudioCapture&) = delete;

    bool Start(FrameCallback onFrame, ErrorCallback onError);
    void Stop();
    bool IsRunning() const noexcept { return running_.load(); }

private:
    void CaptureLoop();
    void Fail(std::wstring message);

    FrameCallback onFrame_;
    ErrorCallback onError_;
    std::thread thread_;
    std::atomic<bool> stopping_{false};
    std::atomic<bool> running_{false};
    void* stopEvent_ = nullptr;
};

} // namespace lunira
