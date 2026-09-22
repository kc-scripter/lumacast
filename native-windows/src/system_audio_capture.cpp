#include "system_audio_capture.h"

#include <windows.h>
#include <audioclient.h>
#include <mmdeviceapi.h>
#include <wrl/client.h>

#include <cstring>
#include <utility>

using Microsoft::WRL::ComPtr;

namespace lunira {

SystemAudioCapture::SystemAudioCapture() = default;
SystemAudioCapture::~SystemAudioCapture() { Stop(); }

bool SystemAudioCapture::Start(FrameCallback onFrame, ErrorCallback onError) {
    Stop();
    onFrame_ = std::move(onFrame);
    onError_ = std::move(onError);
    stopping_.store(false);
    stopEvent_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!stopEvent_) return false;
    try {
        thread_ = std::thread([this] { CaptureLoop(); });
        return true;
    } catch (...) {
        CloseHandle(static_cast<HANDLE>(stopEvent_));
        stopEvent_ = nullptr;
        return false;
    }
}

void SystemAudioCapture::Stop() {
    stopping_.store(true);
    if (stopEvent_) SetEvent(static_cast<HANDLE>(stopEvent_));
    if (thread_.joinable()) thread_.join();
    if (stopEvent_) {
        CloseHandle(static_cast<HANDLE>(stopEvent_));
        stopEvent_ = nullptr;
    }
    running_.store(false);
    onFrame_ = {};
    onError_ = {};
}

void SystemAudioCapture::Fail(std::wstring message) {
    if (!stopping_.load() && onError_) onError_(std::move(message));
}

void SystemAudioCapture::CaptureLoop() {
    const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool uninitialize = SUCCEEDED(comResult);
    auto finish = [&] {
        running_.store(false);
        if (uninitialize) CoUninitialize();
    };

    ComPtr<IMMDeviceEnumerator> enumerator;
    ComPtr<IMMDevice> device;
    ComPtr<IAudioClient> audioClient;
    ComPtr<IAudioCaptureClient> captureClient;

    if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
            IID_PPV_ARGS(enumerator.ReleaseAndGetAddressOf()))) ||
        FAILED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole,
            device.ReleaseAndGetAddressOf())) ||
        FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr,
            reinterpret_cast<void**>(audioClient.ReleaseAndGetAddressOf())))) {
        Fail(L"Não foi possível abrir o áudio de saída do Windows.");
        finish();
        return;
    }

    WAVEFORMATEX format{};
    format.wFormatTag = WAVE_FORMAT_PCM;
    format.nChannels = 2;
    format.nSamplesPerSec = 48000;
    format.wBitsPerSample = 16;
    format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
    format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

    const DWORD flags = AUDCLNT_STREAMFLAGS_LOOPBACK |
        AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
        AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
        AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
    if (FAILED(audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, flags, 0, 0, &format, nullptr))) {
        Fail(L"O dispositivo de áudio não aceita captura loopback estéreo.");
        finish();
        return;
    }

    HANDLE samplesReady = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!samplesReady || FAILED(audioClient->SetEventHandle(samplesReady)) ||
        FAILED(audioClient->GetService(IID_PPV_ARGS(captureClient.ReleaseAndGetAddressOf()))) ||
        FAILED(audioClient->Start())) {
        if (samplesReady) CloseHandle(samplesReady);
        Fail(L"Não foi possível iniciar o áudio da tela.");
        finish();
        return;
    }

    running_.store(true);
    HANDLE waits[] = {static_cast<HANDLE>(stopEvent_), samplesReady};
    while (!stopping_.load()) {
        const DWORD wait = WaitForMultipleObjects(2, waits, FALSE, 2000);
        if (wait == WAIT_OBJECT_0) break;
        if (wait != WAIT_OBJECT_0 + 1) continue;

        UINT32 packetFrames = 0;
        while (SUCCEEDED(captureClient->GetNextPacketSize(&packetFrames)) && packetFrames > 0) {
            BYTE* data = nullptr;
            UINT32 frames = 0;
            DWORD packetFlags = 0;
            if (FAILED(captureClient->GetBuffer(&data, &frames, &packetFlags, nullptr, nullptr))) break;
            CapturedAudioFrame frame;
            frame.samples.resize(static_cast<size_t>(frames) * 2u);
            if ((packetFlags & AUDCLNT_BUFFERFLAGS_SILENT) == 0 && data) {
                std::memcpy(frame.samples.data(), data, frame.samples.size() * sizeof(std::int16_t));
            }
            captureClient->ReleaseBuffer(frames);
            if (!frame.samples.empty() && onFrame_ && !stopping_.load()) onFrame_(std::move(frame));
        }
    }

    audioClient->Stop();
    CloseHandle(samplesReady);
    finish();
}

} // namespace lunira
