#include "updater.h"

#include <windows.h>
#include <winhttp.h>
#include <bcrypt.h>

#include <algorithm>
#include <array>
#include <cctype>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <sstream>
#include <string>
#include <string_view>
#include <vector>

#ifndef LUNIRA_APP_VERSION
#define LUNIRA_APP_VERSION "0.8.0"
#endif

namespace lunira {
namespace {

constexpr wchar_t kApiHost[] = L"api.github.com";
constexpr wchar_t kLatestReleasePath[] =
    L"/repos/kc-scripter/lumacast/releases/latest";
constexpr wchar_t kUserAgent[] = L"LuniraScreen-Updater/1.0";

std::wstring Utf8ToWide(std::string_view value) {
    if (value.empty()) return {};
    const int count = MultiByteToWideChar(
        CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0);
    if (count <= 0) return {};
    std::wstring output(static_cast<size_t>(count), L'\0');
    MultiByteToWideChar(
        CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), output.data(), count);
    return output;
}

std::string WideToUtf8(std::wstring_view value) {
    if (value.empty()) return {};
    const int count = WideCharToMultiByte(
        CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (count <= 0) return {};
    std::string output(static_cast<size_t>(count), '\0');
    WideCharToMultiByte(
        CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
        static_cast<int>(value.size()), output.data(), count, nullptr, nullptr);
    return output;
}

std::wstring ErrorText(std::wstring_view prefix, DWORD code) {
    wchar_t* raw = nullptr;
    const DWORD length = FormatMessageW(
        FORMAT_MESSAGE_ALLOCATE_BUFFER |
            FORMAT_MESSAGE_FROM_SYSTEM |
            FORMAT_MESSAGE_IGNORE_INSERTS,
        nullptr,
        code,
        0,
        reinterpret_cast<wchar_t*>(&raw),
        0,
        nullptr);
    std::wstring text(prefix);
    if (length && raw) {
        text += L": ";
        text.append(raw, length);
        while (!text.empty() &&
               (text.back() == L'\r' || text.back() == L'\n' || text.back() == L' ')) {
            text.pop_back();
        }
    }
    if (raw) LocalFree(raw);
    return text;
}

std::string JsonString(std::string_view json, std::string_view key) {
    const std::string needle = "\"" + std::string(key) + "\"";
    size_t pos = json.find(needle);
    if (pos == std::string_view::npos) return {};
    pos = json.find(':', pos + needle.size());
    if (pos == std::string_view::npos) return {};
    pos = json.find('"', pos + 1);
    if (pos == std::string_view::npos) return {};

    std::string value;
    bool escape = false;
    for (size_t i = pos + 1; i < json.size(); ++i) {
        const char ch = json[i];
        if (escape) {
            switch (ch) {
            case '"': value.push_back('"'); break;
            case '\\': value.push_back('\\'); break;
            case '/': value.push_back('/'); break;
            case 'b': value.push_back('\b'); break;
            case 'f': value.push_back('\f'); break;
            case 'n': value.push_back('\n'); break;
            case 'r': value.push_back('\r'); break;
            case 't': value.push_back('\t'); break;
            default: value.push_back(ch); break;
            }
            escape = false;
            continue;
        }
        if (ch == '\\') {
            escape = true;
            continue;
        }
        if (ch == '"') return value;
        value.push_back(ch);
    }
    return {};
}

std::array<int, 3> ParseVersion(std::wstring_view raw, bool& ok) {
    ok = false;
    std::array<int, 3> result{};
    size_t pos = 0;
    if (!raw.empty() && (raw.front() == L'v' || raw.front() == L'V')) ++pos;

    for (size_t part = 0; part < result.size(); ++part) {
        if (pos >= raw.size() || raw[pos] < L'0' || raw[pos] > L'9') return result;
        int value = 0;
        while (pos < raw.size() && raw[pos] >= L'0' && raw[pos] <= L'9') {
            value = value * 10 + static_cast<int>(raw[pos] - L'0');
            if (value > 100000) return result;
            ++pos;
        }
        result[part] = value;
        if (part + 1 < result.size()) {
            if (pos >= raw.size() || raw[pos] != L'.') return result;
            ++pos;
        }
    }

    if (pos < raw.size() && raw[pos] != L'-' && raw[pos] != L'+') return result;
    ok = true;
    return result;
}

int CompareVersions(std::wstring_view left, std::wstring_view right, bool& ok) {
    bool leftOk = false;
    bool rightOk = false;
    const auto a = ParseVersion(left, leftOk);
    const auto b = ParseVersion(right, rightOk);
    ok = leftOk && rightOk;
    if (!ok) return 0;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

struct HttpResponse {
    DWORD status = 0;
    std::string body;
    std::wstring error;
};

HttpResponse HttpGetText(std::wstring_view host, std::wstring_view path) {
    HttpResponse response;

    HINTERNET session = WinHttpOpen(
        kUserAgent,
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (!session) {
        response.error = ErrorText(L"WinHTTP não iniciou", GetLastError());
        return response;
    }

    WinHttpSetTimeouts(session, 8000, 8000, 10000, 15000);

    const std::wstring hostText(host);
    HINTERNET connection = WinHttpConnect(
        session, hostText.c_str(), INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!connection) {
        response.error = ErrorText(L"Não foi possível conectar", GetLastError());
        WinHttpCloseHandle(session);
        return response;
    }

    const std::wstring pathText(path);
    HINTERNET request = WinHttpOpenRequest(
        connection,
        L"GET",
        pathText.c_str(),
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        WINHTTP_FLAG_SECURE);
    if (!request) {
        response.error = ErrorText(L"Não foi possível criar a requisição", GetLastError());
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return response;
    }

    static constexpr wchar_t headers[] =
        L"Accept: application/vnd.github+json\r\n"
        L"X-GitHub-Api-Version: 2022-11-28\r\n";

    const BOOL sent =
        WinHttpAddRequestHeaders(
            request, headers, static_cast<DWORD>(-1), WINHTTP_ADDREQ_FLAG_ADD) &&
        WinHttpSendRequest(
            request,
            WINHTTP_NO_ADDITIONAL_HEADERS,
            0,
            WINHTTP_NO_REQUEST_DATA,
            0,
            0,
            0) &&
        WinHttpReceiveResponse(request, nullptr);

    if (!sent) {
        response.error = ErrorText(L"Falha consultando atualizações", GetLastError());
    } else {
        DWORD size = sizeof(response.status);
        WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX,
            &response.status,
            &size,
            WINHTTP_NO_HEADER_INDEX);

        for (;;) {
            DWORD available = 0;
            if (!WinHttpQueryDataAvailable(request, &available)) {
                response.error = ErrorText(L"Falha lendo a resposta", GetLastError());
                break;
            }
            if (available == 0) break;

            const size_t oldSize = response.body.size();
            response.body.resize(oldSize + available);
            DWORD read = 0;
            if (!WinHttpReadData(
                    request,
                    response.body.data() + oldSize,
                    available,
                    &read)) {
                response.body.resize(oldSize);
                response.error = ErrorText(L"Falha lendo a resposta", GetLastError());
                break;
            }
            response.body.resize(oldSize + read);
            if (response.body.size() > 2 * 1024 * 1024) {
                response.error = L"Resposta de atualização inesperadamente grande.";
                break;
            }
        }
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    return response;
}

struct UrlParts {
    std::wstring host;
    std::wstring path;
    INTERNET_PORT port = INTERNET_DEFAULT_HTTPS_PORT;
    bool secure = true;
};

bool CrackUrl(std::wstring_view value, UrlParts& parts) {
    std::wstring url(value);
    URL_COMPONENTSW components{};
    components.dwStructSize = sizeof(components);
    components.dwHostNameLength = static_cast<DWORD>(-1);
    components.dwUrlPathLength = static_cast<DWORD>(-1);
    components.dwExtraInfoLength = static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(url.c_str(), 0, 0, &components)) return false;

    parts.host.assign(components.lpszHostName, components.dwHostNameLength);
    parts.path.assign(components.lpszUrlPath, components.dwUrlPathLength);
    if (components.lpszExtraInfo && components.dwExtraInfoLength) {
        parts.path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
    }
    parts.port = components.nPort;
    parts.secure = components.nScheme == INTERNET_SCHEME_HTTPS;
    return !parts.host.empty() && !parts.path.empty();
}

bool HttpDownload(
    std::wstring_view url,
    const std::filesystem::path& destination,
    const std::function<void(int)>& onProgress,
    std::atomic<bool>& stop,
    std::wstring& error) {

    UrlParts parts;
    if (!CrackUrl(url, parts)) {
        error = L"URL de atualização inválida.";
        return false;
    }

    HINTERNET session = WinHttpOpen(
        kUserAgent,
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (!session) {
        error = ErrorText(L"WinHTTP não iniciou", GetLastError());
        return false;
    }

    WinHttpSetTimeouts(session, 8000, 8000, 12000, 30000);

    HINTERNET connection = WinHttpConnect(session, parts.host.c_str(), parts.port, 0);
    if (!connection) {
        error = ErrorText(L"Falha conectando ao servidor de atualização", GetLastError());
        WinHttpCloseHandle(session);
        return false;
    }

    HINTERNET request = WinHttpOpenRequest(
        connection,
        L"GET",
        parts.path.c_str(),
        nullptr,
        WINHTTP_NO_REFERER,
        WINHTTP_DEFAULT_ACCEPT_TYPES,
        parts.secure ? WINHTTP_FLAG_SECURE : 0);
    if (!request) {
        error = ErrorText(L"Falha criando download", GetLastError());
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return false;
    }

    const BOOL sent =
        WinHttpSendRequest(
            request,
            WINHTTP_NO_ADDITIONAL_HEADERS,
            0,
            WINHTTP_NO_REQUEST_DATA,
            0,
            0,
            0) &&
        WinHttpReceiveResponse(request, nullptr);

    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    if (!sent ||
        !WinHttpQueryHeaders(
            request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX,
            &status,
            &statusSize,
            WINHTTP_NO_HEADER_INDEX) ||
        status != 200) {
        error = sent
            ? L"Servidor de atualização respondeu HTTP " + std::to_wstring(status) + L"."
            : ErrorText(L"Falha baixando atualização", GetLastError());
        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return false;
    }

    DWORD contentLength = 0;
    DWORD lengthSize = sizeof(contentLength);
    WinHttpQueryHeaders(
        request,
        WINHTTP_QUERY_CONTENT_LENGTH | WINHTTP_QUERY_FLAG_NUMBER,
        WINHTTP_HEADER_NAME_BY_INDEX,
        &contentLength,
        &lengthSize,
        WINHTTP_NO_HEADER_INDEX);

    std::error_code fsError;
    std::filesystem::create_directories(destination.parent_path(), fsError);

    HANDLE file = CreateFileW(
        destination.c_str(),
        GENERIC_WRITE,
        0,
        nullptr,
        CREATE_ALWAYS,
        FILE_ATTRIBUTE_NORMAL,
        nullptr);
    if (file == INVALID_HANDLE_VALUE) {
        error = ErrorText(L"Não foi possível salvar a atualização", GetLastError());
        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connection);
        WinHttpCloseHandle(session);
        return false;
    }

    std::array<char, 64 * 1024> buffer{};
    unsigned long long total = 0;
    int lastProgress = -1;
    bool success = true;

    while (!stop.load()) {
        DWORD read = 0;
        if (!WinHttpReadData(
                request,
                buffer.data(),
                static_cast<DWORD>(buffer.size()),
                &read)) {
            error = ErrorText(L"Falha durante o download", GetLastError());
            success = false;
            break;
        }
        if (read == 0) break;

        DWORD written = 0;
        if (!WriteFile(file, buffer.data(), read, &written, nullptr) || written != read) {
            error = ErrorText(L"Falha gravando a atualização", GetLastError());
            success = false;
            break;
        }

        total += read;
        if (contentLength > 0) {
            const int progress = static_cast<int>(
                std::min<unsigned long long>(100, total * 100 / contentLength));
            if (progress != lastProgress && (progress == 100 || progress - lastProgress >= 2)) {
                lastProgress = progress;
                if (onProgress) onProgress(progress);
            }
        }
    }

    if (stop.load()) {
        success = false;
        error = L"Atualização cancelada.";
    }

    CloseHandle(file);
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);

    if (!success) {
        DeleteFileW(destination.c_str());
    }
    return success;
}

bool HttpGetUrlText(std::wstring_view url, std::string& body, std::wstring& error) {
    UrlParts parts;
    if (!CrackUrl(url, parts)) {
        error = L"URL de checksum inválida.";
        return false;
    }

    HINTERNET session = WinHttpOpen(
        kUserAgent,
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0);
    if (!session) {
        error = ErrorText(L"WinHTTP não iniciou", GetLastError());
        return false;
    }
    WinHttpSetTimeouts(session, 8000, 8000, 10000, 15000);

    HINTERNET connection = WinHttpConnect(session, parts.host.c_str(), parts.port, 0);
    HINTERNET request = connection
        ? WinHttpOpenRequest(
              connection,
              L"GET",
              parts.path.c_str(),
              nullptr,
              WINHTTP_NO_REFERER,
              WINHTTP_DEFAULT_ACCEPT_TYPES,
              parts.secure ? WINHTTP_FLAG_SECURE : 0)
        : nullptr;

    bool ok = request &&
        WinHttpSendRequest(
            request,
            WINHTTP_NO_ADDITIONAL_HEADERS,
            0,
            WINHTTP_NO_REQUEST_DATA,
            0,
            0,
            0) &&
        WinHttpReceiveResponse(request, nullptr);

    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    if (ok) {
        ok = WinHttpQueryHeaders(
                 request,
                 WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                 WINHTTP_HEADER_NAME_BY_INDEX,
                 &status,
                 &statusSize,
                 WINHTTP_NO_HEADER_INDEX) &&
             status == 200;
    }

    if (ok) {
        std::array<char, 4096> buffer{};
        for (;;) {
            DWORD read = 0;
            if (!WinHttpReadData(
                    request,
                    buffer.data(),
                    static_cast<DWORD>(buffer.size()),
                    &read)) {
                ok = false;
                break;
            }
            if (!read) break;
            body.append(buffer.data(), read);
            if (body.size() > 64 * 1024) {
                ok = false;
                break;
            }
        }
    }

    if (!ok) {
        error = status
            ? L"Checksum respondeu HTTP " + std::to_wstring(status) + L"."
            : ErrorText(L"Falha obtendo checksum", GetLastError());
    }

    if (request) WinHttpCloseHandle(request);
    if (connection) WinHttpCloseHandle(connection);
    WinHttpCloseHandle(session);
    return ok;
}

std::string NormalizeHash(std::string_view value) {
    std::string output;
    output.reserve(64);
    for (const char ch : value) {
        if (std::isxdigit(static_cast<unsigned char>(ch))) {
            output.push_back(static_cast<char>(
                std::tolower(static_cast<unsigned char>(ch))));
            if (output.size() == 64) break;
        } else if (!output.empty()) {
            break;
        }
    }
    return output.size() == 64 ? output : std::string{};
}

std::string Sha256File(const std::filesystem::path& path, std::wstring& error) {
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    DWORD objectLength = 0;
    DWORD hashLength = 0;
    DWORD resultLength = 0;

    if (BCryptOpenAlgorithmProvider(
            &algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0 ||
        BCryptGetProperty(
            algorithm, BCRYPT_OBJECT_LENGTH,
            reinterpret_cast<PUCHAR>(&objectLength),
            sizeof(objectLength), &resultLength, 0) < 0 ||
        BCryptGetProperty(
            algorithm, BCRYPT_HASH_LENGTH,
            reinterpret_cast<PUCHAR>(&hashLength),
            sizeof(hashLength), &resultLength, 0) < 0) {
        if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
        error = L"Não foi possível inicializar SHA-256.";
        return {};
    }

    std::vector<UCHAR> object(objectLength);
    std::vector<UCHAR> digest(hashLength);
    if (BCryptCreateHash(
            algorithm, &hash, object.data(), objectLength,
            nullptr, 0, 0) < 0) {
        BCryptCloseAlgorithmProvider(algorithm, 0);
        error = L"Não foi possível criar o hash SHA-256.";
        return {};
    }

    std::ifstream input(path, std::ios::binary);
    if (!input) {
        BCryptDestroyHash(hash);
        BCryptCloseAlgorithmProvider(algorithm, 0);
        error = L"Não foi possível abrir o pacote baixado.";
        return {};
    }

    std::array<char, 64 * 1024> buffer{};
    while (input) {
        input.read(buffer.data(), static_cast<std::streamsize>(buffer.size()));
        const auto count = input.gcount();
        if (count > 0 &&
            BCryptHashData(
                hash,
                reinterpret_cast<PUCHAR>(buffer.data()),
                static_cast<ULONG>(count),
                0) < 0) {
            BCryptDestroyHash(hash);
            BCryptCloseAlgorithmProvider(algorithm, 0);
            error = L"Falha calculando SHA-256.";
            return {};
        }
    }

    if (BCryptFinishHash(hash, digest.data(), hashLength, 0) < 0) {
        BCryptDestroyHash(hash);
        BCryptCloseAlgorithmProvider(algorithm, 0);
        error = L"Falha finalizando SHA-256.";
        return {};
    }

    BCryptDestroyHash(hash);
    BCryptCloseAlgorithmProvider(algorithm, 0);

    std::ostringstream output;
    output << std::hex << std::setfill('0');
    for (const auto byte : digest) {
        output << std::setw(2) << static_cast<unsigned int>(byte);
    }
    return output.str();
}

std::wstring Quote(std::wstring_view value) {
    std::wstring result = L"\"";
    for (const wchar_t ch : value) {
        if (ch == L'\"') result += L"\\\"";
        else result.push_back(ch);
    }
    result += L"\"";
    return result;
}

std::filesystem::path ExecutableDirectory() {
    std::wstring buffer(32768, L'\0');
    const DWORD length = GetModuleFileNameW(
        nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
    if (!length || length >= buffer.size()) return {};
    buffer.resize(length);
    return std::filesystem::path(buffer).parent_path();
}

std::filesystem::path UpdateDirectory() {
    std::wstring local(32768, L'\0');
    const DWORD length = GetEnvironmentVariableW(
        L"LOCALAPPDATA", local.data(), static_cast<DWORD>(local.size()));
    if (!length || length >= local.size()) {
        return std::filesystem::temp_directory_path() / L"LuniraScreen" / L"updates";
    }
    local.resize(length);
    return std::filesystem::path(local) / L"LuniraScreen" / L"updates";
}

} // namespace

UpdaterClient::~UpdaterClient() {
    Stop();
}

std::wstring UpdaterClient::CurrentVersion() {
    return Utf8ToWide(LUNIRA_APP_VERSION);
}

bool UpdaterClient::StartWorker(std::function<void()> work) {
    if (running_.exchange(true)) return false;

    if (worker_.joinable()) worker_.join();
    stop_.store(false);

    try {
        worker_ = std::thread([this, work = std::move(work)]() mutable {
            work();
            running_.store(false);
        });
        return true;
    } catch (...) {
        running_.store(false);
        return false;
    }
}

void UpdaterClient::Notify(UpdateEvent event) {
    Callback callback;
    {
        std::scoped_lock lock(mutex_);
        callback = callback_;
    }
    if (callback) callback(std::move(event));
}

bool UpdaterClient::Check(Callback callback) {
    {
        std::scoped_lock lock(mutex_);
        callback_ = std::move(callback);
    }
    return StartWorker([this] { CheckWorker(); });
}

bool UpdaterClient::DownloadAndInstall(Callback callback) {
    {
        std::scoped_lock lock(mutex_);
        if (packageUrl_.empty() || checksumUrl_.empty() || latestVersion_.empty()) {
            return false;
        }
        callback_ = std::move(callback);
    }
    return StartWorker([this] { DownloadWorker(); });
}

void UpdaterClient::Stop() {
    stop_.store(true);
    if (worker_.joinable()) worker_.join();
    running_.store(false);
}

void UpdaterClient::CheckWorker() {
    Notify({UpdateEventType::Checking, {}, L"Verificando atualizações…", -1});

    const auto response = HttpGetText(kApiHost, kLatestReleasePath);
    if (stop_.load()) return;

    if (response.status == 404) {
        Notify({
            UpdateEventType::UpToDate,
            CurrentVersion(),
            L"Nenhuma versão pública foi lançada ainda.",
            -1});
        return;
    }

    if (!response.error.empty() || response.status != 200) {
        Notify({
            UpdateEventType::Error,
            {},
            !response.error.empty()
                ? response.error
                : L"GitHub respondeu HTTP " + std::to_wstring(response.status) + L".",
            -1});
        return;
    }

    const std::string tagUtf8 = JsonString(response.body, "tag_name");
    if (tagUtf8.empty()) {
        Notify({
            UpdateEventType::Error,
            {},
            L"Resposta do GitHub não contém uma versão válida.",
            -1});
        return;
    }

    const std::wstring tag = Utf8ToWide(tagUtf8);
    std::wstring latest = tag;
    if (!latest.empty() && (latest.front() == L'v' || latest.front() == L'V')) {
        latest.erase(latest.begin());
    }

    bool comparable = false;
    const int comparison = CompareVersions(CurrentVersion(), latest, comparable);
    if (!comparable) {
        Notify({
            UpdateEventType::Error,
            latest,
            L"Formato de versão inválido no GitHub Release.",
            -1});
        return;
    }

    if (comparison >= 0) {
        Notify({
            UpdateEventType::UpToDate,
            latest,
            L"Você está usando a versão mais recente.",
            -1});
        return;
    }

    const std::wstring base =
        L"https://github.com/kc-scripter/lumacast/releases/download/" + tag + L"/";

    {
        std::scoped_lock lock(mutex_);
        latestVersion_ = latest;
        releaseTag_ = tag;
        packageUrl_ = base + L"LuniraScreen-Native.zip";
        checksumUrl_ = base + L"LuniraScreen-Native.sha256";
    }

    Notify({
        UpdateEventType::Available,
        latest,
        L"Nova versão " + latest + L" disponível.",
        -1});
}

void UpdaterClient::DownloadWorker() {
    std::wstring version;
    std::wstring tag;
    std::wstring packageUrl;
    std::wstring checksumUrl;
    {
        std::scoped_lock lock(mutex_);
        version = latestVersion_;
        tag = releaseTag_;
        packageUrl = packageUrl_;
        checksumUrl = checksumUrl_;
    }

    if (version.empty() || packageUrl.empty() || checksumUrl.empty()) {
        Notify({
            UpdateEventType::Error,
            {},
            L"Nenhuma atualização preparada para download.",
            -1});
        return;
    }

    std::error_code fsError;
    const auto updateDir = UpdateDirectory();
    std::filesystem::create_directories(updateDir, fsError);
    if (fsError) {
        Notify({
            UpdateEventType::Error,
            version,
            L"Não foi possível criar a pasta de atualização.",
            -1});
        return;
    }

    const auto zip = updateDir / (L"LuniraScreen-" + version + L".zip");

    Notify({
        UpdateEventType::Downloading,
        version,
        L"Baixando atualização…",
        0});

    std::wstring error;
    if (!HttpDownload(
            packageUrl,
            zip,
            [this, &version](int progress) {
                Notify({
                    UpdateEventType::Downloading,
                    version,
                    L"Baixando atualização…",
                    progress});
            },
            stop_,
            error)) {
        if (!stop_.load()) {
            Notify({
                UpdateEventType::Error,
                version,
                error.empty() ? L"Falha no download da atualização." : error,
                -1});
        }
        return;
    }

    std::string checksumText;
    if (!HttpGetUrlText(checksumUrl, checksumText, error)) {
        DeleteFileW(zip.c_str());
        Notify({
            UpdateEventType::Error,
            version,
            error.empty() ? L"Não foi possível validar a atualização." : error,
            -1});
        return;
    }

    const std::string expected = NormalizeHash(checksumText);
    if (expected.empty()) {
        DeleteFileW(zip.c_str());
        Notify({
            UpdateEventType::Error,
            version,
            L"Checksum SHA-256 do Release é inválido.",
            -1});
        return;
    }

    const std::string actual = Sha256File(zip, error);
    if (actual.empty() || actual != expected) {
        DeleteFileW(zip.c_str());
        Notify({
            UpdateEventType::Error,
            version,
            actual.empty()
                ? error
                : L"A atualização baixada falhou na verificação SHA-256.",
            -1});
        return;
    }

    const auto installDir = ExecutableDirectory();
    const auto helper = installDir / L"LuniraUpdater.exe";
    if (installDir.empty() || !std::filesystem::exists(helper)) {
        Notify({
            UpdateEventType::Error,
            version,
            L"LuniraUpdater.exe não foi encontrado ao lado do aplicativo.",
            -1});
        return;
    }

    std::wstring command =
        Quote(helper.wstring()) +
        L" --apply " +
        Quote(zip.wstring()) +
        L" " +
        Quote(installDir.wstring()) +
        L" " +
        std::to_wstring(GetCurrentProcessId());

    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION process{};
    std::wstring mutableCommand = command;
    if (!CreateProcessW(
            helper.c_str(),
            mutableCommand.data(),
            nullptr,
            nullptr,
            FALSE,
            CREATE_NO_WINDOW,
            nullptr,
            installDir.c_str(),
            &startup,
            &process)) {
        Notify({
            UpdateEventType::Error,
            version,
            ErrorText(L"Não foi possível iniciar o atualizador", GetLastError()),
            -1});
        return;
    }

    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);

    Notify({
        UpdateEventType::Installing,
        version,
        L"Atualização pronta. Reiniciando…",
        100});
}

} // namespace lunira
