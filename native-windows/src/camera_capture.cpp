#include "camera_capture.h"

#include <windows.h>
#include <mfapi.h>
#include <mferror.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <wrl/client.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <string>

#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfreadwrite.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "ole32.lib")

using Microsoft::WRL::ComPtr;

namespace lunira {
namespace {

constexpr DWORD kVideoStream = static_cast<DWORD>(MF_SOURCE_READER_FIRST_VIDEO_STREAM);

struct NativeMode {
    ComPtr<IMFMediaType> type;
    UINT32 width = 0;
    UINT32 height = 0;
    UINT32 fpsNum = 0;
    UINT32 fpsDen = 1;
    double score = -std::numeric_limits<double>::infinity();
};

double ScoreMode(UINT32 width, UINT32 height, UINT32 fpsNum, UINT32 fpsDen) {
    if (width == 0 || height == 0 || fpsDen == 0) return -1e12;

    const double fps = static_cast<double>(fpsNum) / static_cast<double>(fpsDen);
    const double targetPixels = 1280.0 * 720.0;
    const double pixels = static_cast<double>(width) * static_cast<double>(height);
    const double sizePenalty = std::abs(std::log(std::max(1.0, pixels) / targetPixels)) * 800.0;
    const double oversizePenalty = pixels > 1920.0 * 1080.0 ? 1200.0 : 0.0;
    const double fpsScore = fps >= 40.0
        ? 1200.0 - std::abs(fps - 40.0) * 8.0
        : fps * 24.0;
    return fpsScore - sizePenalty - oversizePenalty;
}

std::wstring HResultMessage(std::wstring_view prefix, HRESULT hr) {
    wchar_t code[32]{};
    swprintf_s(code, L"0x%08X", static_cast<unsigned>(hr));
    return std::wstring(prefix) + L" (" + code + L")";
}

} // namespace

CameraCapture::CameraCapture() = default;

CameraCapture::~CameraCapture() {
    Stop();
}

bool CameraCapture::Start(FrameCallback frameCallback, ErrorCallback errorCallback) {
    Stop();

    frameCallback_ = std::move(frameCallback);
    errorCallback_ = std::move(errorCallback);
    stop_.store(false);

    try {
        thread_ = std::thread([this] { Run(); });
        return true;
    } catch (...) {
        Fail(L"Não foi possível iniciar a câmera.");
        return false;
    }
}

void CameraCapture::Stop() {
    stop_.store(true);
    if (thread_.joinable()) thread_.join();
    running_.store(false);
    frameCallback_ = {};
    errorCallback_ = {};
}

bool CameraCapture::IsRunning() const noexcept {
    return running_.load();
}

void CameraCapture::Fail(std::wstring message) {
    if (errorCallback_ && !stop_.load()) {
        errorCallback_(std::move(message));
    }
}

void CameraCapture::Run() {
    const HRESULT coResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool uninitializeCom = SUCCEEDED(coResult);

    HRESULT hr = MFStartup(MF_VERSION, MFSTARTUP_LITE);
    if (FAILED(hr)) {
        Fail(HResultMessage(L"Media Foundation não iniciou", hr));
        if (uninitializeCom) CoUninitialize();
        return;
    }

    ComPtr<IMFAttributes> deviceAttributes;
    hr = MFCreateAttributes(deviceAttributes.GetAddressOf(), 1);
    if (SUCCEEDED(hr)) {
        hr = deviceAttributes->SetGUID(
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE,
            MF_DEVSOURCE_ATTRIBUTE_SOURCE_TYPE_VIDCAP_GUID);
    }

    IMFActivate** rawDevices = nullptr;
    UINT32 deviceCount = 0;
    if (SUCCEEDED(hr)) {
        hr = MFEnumDeviceSources(deviceAttributes.Get(), &rawDevices, &deviceCount);
    }

    if (FAILED(hr) || deviceCount == 0) {
        Fail(L"Nenhuma câmera disponível no Windows.");
        if (rawDevices) CoTaskMemFree(rawDevices);
        MFShutdown();
        if (uninitializeCom) CoUninitialize();
        return;
    }

    ComPtr<IMFMediaSource> source;
    hr = rawDevices[0]->ActivateObject(IID_PPV_ARGS(source.GetAddressOf()));

    for (UINT32 i = 0; i < deviceCount; ++i) {
        rawDevices[i]->Release();
    }
    CoTaskMemFree(rawDevices);

    if (FAILED(hr)) {
        Fail(HResultMessage(L"Não foi possível abrir a câmera", hr));
        MFShutdown();
        if (uninitializeCom) CoUninitialize();
        return;
    }

    ComPtr<IMFAttributes> readerAttributes;
    hr = MFCreateAttributes(readerAttributes.GetAddressOf(), 2);
    if (SUCCEEDED(hr)) {
        hr = readerAttributes->SetUINT32(MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, TRUE);
    }
    if (SUCCEEDED(hr)) {
        hr = readerAttributes->SetUINT32(MF_READWRITE_DISABLE_CONVERTERS, FALSE);
    }

    ComPtr<IMFSourceReader> reader;
    if (SUCCEEDED(hr)) {
        hr = MFCreateSourceReaderFromMediaSource(
            source.Get(),
            readerAttributes.Get(),
            reader.GetAddressOf());
    }

    if (FAILED(hr)) {
        Fail(HResultMessage(L"Não foi possível preparar a câmera", hr));
        source->Shutdown();
        MFShutdown();
        if (uninitializeCom) CoUninitialize();
        return;
    }

    NativeMode best;
    for (DWORD index = 0;; ++index) {
        ComPtr<IMFMediaType> candidate;
        hr = reader->GetNativeMediaType(
            kVideoStream,
            index,
            candidate.GetAddressOf());
        if (hr == MF_E_NO_MORE_TYPES) break;
        if (FAILED(hr)) continue;

        GUID major{};
        if (FAILED(candidate->GetGUID(MF_MT_MAJOR_TYPE, &major)) ||
            major != MFMediaType_Video) {
            continue;
        }

        UINT32 width = 0;
        UINT32 height = 0;
        UINT32 fpsNum = 30;
        UINT32 fpsDen = 1;
        if (FAILED(MFGetAttributeSize(candidate.Get(), MF_MT_FRAME_SIZE, &width, &height))) {
            continue;
        }
        (void)MFGetAttributeRatio(candidate.Get(), MF_MT_FRAME_RATE, &fpsNum, &fpsDen);

        const double score = ScoreMode(width, height, fpsNum, fpsDen);
        if (!best.type || score > best.score) {
            best.type = candidate;
            best.width = width;
            best.height = height;
            best.fpsNum = fpsNum;
            best.fpsDen = fpsDen == 0 ? 1 : fpsDen;
            best.score = score;
        }
    }

    if (!best.type) {
        Fail(L"A câmera não expôs um modo de vídeo compatível.");
        source->Shutdown();
        MFShutdown();
        if (uninitializeCom) CoUninitialize();
        return;
    }

    hr = reader->SetCurrentMediaType(
        kVideoStream,
        nullptr,
        best.type.Get());

    ComPtr<IMFMediaType> outputType;
    if (SUCCEEDED(hr)) hr = MFCreateMediaType(outputType.GetAddressOf());
    if (SUCCEEDED(hr)) hr = outputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    if (SUCCEEDED(hr)) hr = outputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);
    if (SUCCEEDED(hr)) hr = MFSetAttributeSize(
        outputType.Get(), MF_MT_FRAME_SIZE, best.width, best.height);
    if (SUCCEEDED(hr)) hr = MFSetAttributeRatio(
        outputType.Get(), MF_MT_FRAME_RATE, best.fpsNum, best.fpsDen);
    if (SUCCEEDED(hr)) hr = MFSetAttributeRatio(
        outputType.Get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    if (SUCCEEDED(hr)) hr = outputType->SetUINT32(
        MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    if (SUCCEEDED(hr)) {
        hr = reader->SetCurrentMediaType(
            kVideoStream,
            nullptr,
            outputType.Get());
    }

    if (FAILED(hr)) {
        Fail(HResultMessage(L"A câmera não conseguiu fornecer BGRA", hr));
        source->Shutdown();
        MFShutdown();
        if (uninitializeCom) CoUninitialize();
        return;
    }

    running_.store(true);

    const size_t rowBytes = static_cast<size_t>(best.width) * 4u;
    const size_t frameBytes = rowBytes * static_cast<size_t>(best.height);

    ULONGLONG lastDeliveredMs = 0;

    while (!stop_.load()) {
        DWORD streamIndex = 0;
        DWORD flags = 0;
        LONGLONG timestamp = 0;
        ComPtr<IMFSample> sample;

        hr = reader->ReadSample(
            kVideoStream,
            0,
            &streamIndex,
            &flags,
            &timestamp,
            sample.GetAddressOf());

        if (FAILED(hr)) {
            Fail(HResultMessage(L"Falha lendo a câmera", hr));
            break;
        }

        if ((flags & MF_SOURCE_READERF_ENDOFSTREAM) != 0) break;
        if (!sample) continue;

        ComPtr<IMFMediaBuffer> buffer;
        hr = sample->ConvertToContiguousBuffer(buffer.GetAddressOf());
        if (FAILED(hr) || !buffer) continue;

        const ULONGLONG nowMs = GetTickCount64();
        if (lastDeliveredMs != 0 && nowMs - lastDeliveredMs < 24) {
            continue;
        }

        CapturedCameraFrame frame;
        frame.width = static_cast<int>(best.width);
        frame.height = static_cast<int>(best.height);
        frame.bgra.resize(frameBytes);
        bool copied = false;

        ComPtr<IMF2DBuffer> buffer2d;
        if (SUCCEEDED(buffer.As(&buffer2d)) && buffer2d) {
            BYTE* scanline0 = nullptr;
            LONG pitch = 0;
            if (SUCCEEDED(buffer2d->Lock2D(&scanline0, &pitch)) && scanline0) {
                const LONG absolutePitch = pitch < 0 ? -pitch : pitch;
                if (static_cast<size_t>(absolutePitch) >= rowBytes) {
                    for (UINT32 y = 0; y < best.height; ++y) {
                        const BYTE* sourceRow = scanline0 + static_cast<LONG_PTR>(y) * pitch;
                        std::memcpy(
                            frame.bgra.data() + static_cast<size_t>(y) * rowBytes,
                            sourceRow,
                            rowBytes);
                    }
                    copied = true;
                }
                buffer2d->Unlock2D();
            }
        } else {
            BYTE* bytes = nullptr;
            DWORD maxLength = 0;
            DWORD currentLength = 0;
            if (SUCCEEDED(buffer->Lock(&bytes, &maxLength, &currentLength)) &&
                bytes &&
                currentLength >= frameBytes) {
                std::memcpy(frame.bgra.data(), bytes, frameBytes);
                copied = true;
                buffer->Unlock();
            }
        }

        if (!copied) continue;
        lastDeliveredMs = nowMs;

        for (size_t offset = 3; offset < frame.bgra.size(); offset += 4) {
            frame.bgra[offset] = 255;
        }

        if (frameCallback_ && !stop_.load()) {
            frameCallback_(std::move(frame));
        }
    }

    running_.store(false);
    source->Shutdown();
    MFShutdown();
    if (uninitializeCom) CoUninitialize();
}

} // namespace lunira
