#pragma once

#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <thread>

namespace lunira {

enum class UpdateEventType {
    Checking,
    UpToDate,
    Available,
    Downloading,
    Installing,
    Error
};

struct UpdateEvent {
    UpdateEventType type = UpdateEventType::Error;
    std::wstring version;
    std::wstring message;
    int progress = -1;
};

class UpdaterClient final {
public:
    using Callback = std::function<void(UpdateEvent)>;

    UpdaterClient() = default;
    ~UpdaterClient();

    UpdaterClient(const UpdaterClient&) = delete;
    UpdaterClient& operator=(const UpdaterClient&) = delete;

    static std::wstring CurrentVersion();

    bool Check(Callback callback);
    bool DownloadAndInstall(Callback callback);
    bool IsBusy() const noexcept { return running_.load(); }
    void Stop();

private:
    bool StartWorker(std::function<void()> work);
    void Notify(UpdateEvent event);
    void CheckWorker();
    void DownloadWorker();

    std::mutex mutex_;
    std::thread worker_;
    std::atomic<bool> stop_{false};
    std::atomic<bool> running_{false};
    Callback callback_;

    std::wstring latestVersion_;
    std::wstring releaseTag_;
    std::wstring packageUrl_;
    std::wstring checksumUrl_;
};

} // namespace lunira
