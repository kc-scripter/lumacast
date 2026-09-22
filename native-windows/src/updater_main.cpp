#include <windows.h>
#include <filesystem>
#include <fstream>
#include <string>
#include <string_view>
#include <vector>

namespace {

std::wstring Quote(std::wstring_view value) {
    std::wstring result = L"\"";
    for (const wchar_t ch : value) {
        if (ch == L'\"') result += L"\\\"";
        else result.push_back(ch);
    }
    result += L"\"";
    return result;
}

std::wstring PowerShellLiteral(std::wstring_view value) {
    std::wstring result = L"'";
    for (const wchar_t ch : value) {
        if (ch == L'\'') result += L"''";
        else result.push_back(ch);
    }
    result += L"'";
    return result;
}

std::filesystem::path LogPath() {
    std::wstring local(32768, L'\0');
    const DWORD length = GetEnvironmentVariableW(
        L"LOCALAPPDATA", local.data(), static_cast<DWORD>(local.size()));
    std::filesystem::path base;
    if (length && length < local.size()) {
        local.resize(length);
        base = std::filesystem::path(local) / L"LuniraScreen";
    } else {
        base = std::filesystem::temp_directory_path() / L"LuniraScreen";
    }
    std::error_code ec;
    std::filesystem::create_directories(base, ec);
    return base / L"updater.log";
}

void Log(std::wstring_view message) {
    std::wofstream out(LogPath(), std::ios::app);
    if (!out) return;
    SYSTEMTIME time{};
    GetLocalTime(&time);
    out << L"[" << time.wYear << L"-" << time.wMonth << L"-" << time.wDay
        << L" " << time.wHour << L":" << time.wMinute << L":" << time.wSecond
        << L"] " << message << L"\n";
}

bool RunAndWait(
    const std::filesystem::path& executable,
    std::wstring command,
    DWORD timeoutMs,
    DWORD& exitCode) {

    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(
            executable.c_str(),
            command.data(),
            nullptr,
            nullptr,
            FALSE,
            CREATE_NO_WINDOW,
            nullptr,
            nullptr,
            &startup,
            &process)) {
        return false;
    }

    const DWORD wait = WaitForSingleObject(process.hProcess, timeoutMs);
    if (wait != WAIT_OBJECT_0) {
        TerminateProcess(process.hProcess, 2);
        WaitForSingleObject(process.hProcess, 5000);
        CloseHandle(process.hThread);
        CloseHandle(process.hProcess);
        return false;
    }

    exitCode = 1;
    GetExitCodeProcess(process.hProcess, &exitCode);
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return true;
}

bool WaitForApp(DWORD pid) {
    HANDLE process = OpenProcess(SYNCHRONIZE, FALSE, pid);
    if (!process) return true;
    const DWORD wait = WaitForSingleObject(process, 120000);
    CloseHandle(process);
    return wait == WAIT_OBJECT_0;
}

std::filesystem::path FindPackageRoot(const std::filesystem::path& extracted) {
    if (std::filesystem::exists(extracted / L"LuniraScreen.exe")) return extracted;

    std::error_code ec;
    for (const auto& entry : std::filesystem::directory_iterator(extracted, ec)) {
        if (ec) break;
        if (entry.is_directory() &&
            std::filesystem::exists(entry.path() / L"LuniraScreen.exe")) {
            return entry.path();
        }
    }
    return {};
}

bool BackupAndCopy(
    const std::filesystem::path& sourceRoot,
    const std::filesystem::path& targetRoot,
    const std::filesystem::path& backupRoot) {

    std::vector<std::filesystem::path> touched;
    std::error_code ec;

    for (const auto& entry :
         std::filesystem::recursive_directory_iterator(sourceRoot, ec)) {
        if (ec) return false;
        if (!entry.is_regular_file()) continue;

        const auto relative = std::filesystem::relative(entry.path(), sourceRoot, ec);
        if (ec) return false;

        const auto filename = relative.filename().wstring();
        if (_wcsicmp(filename.c_str(), L"LuniraUpdater.exe") == 0) {
            continue;
        }

        const auto destination = targetRoot / relative;
        const auto backup = backupRoot / relative;

        std::filesystem::create_directories(destination.parent_path(), ec);
        if (ec) return false;

        if (std::filesystem::exists(destination)) {
            std::filesystem::create_directories(backup.parent_path(), ec);
            if (ec) return false;
            std::filesystem::copy_file(
                destination,
                backup,
                std::filesystem::copy_options::overwrite_existing,
                ec);
            if (ec) return false;
        }

        std::filesystem::copy_file(
            entry.path(),
            destination,
            std::filesystem::copy_options::overwrite_existing,
            ec);
        if (ec) {
            for (const auto& restore :
                 std::filesystem::recursive_directory_iterator(backupRoot, ec)) {
                if (ec) break;
                if (!restore.is_regular_file()) continue;
                const auto restoreRelative =
                    std::filesystem::relative(restore.path(), backupRoot, ec);
                if (ec) break;
                const auto restoreTarget = targetRoot / restoreRelative;
                std::filesystem::create_directories(
                    restoreTarget.parent_path(), ec);
                if (ec) break;
                std::filesystem::copy_file(
                    restore.path(),
                    restoreTarget,
                    std::filesystem::copy_options::overwrite_existing,
                    ec);
            }
            return false;
        }

        touched.push_back(destination);
    }

    return true;
}

bool LaunchApp(const std::filesystem::path& targetRoot) {
    const auto app = targetRoot / L"LuniraScreen.exe";
    if (!std::filesystem::exists(app)) return false;

    std::wstring command = Quote(app.wstring());
    STARTUPINFOW startup{sizeof(startup)};
    PROCESS_INFORMATION process{};
    if (!CreateProcessW(
            app.c_str(),
            command.data(),
            nullptr,
            nullptr,
            FALSE,
            0,
            nullptr,
            targetRoot.c_str(),
            &startup,
            &process)) {
        return false;
    }
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    return true;
}

int ApplyUpdate(
    const std::filesystem::path& zip,
    const std::filesystem::path& target,
    DWORD pid) {

    Log(L"Update requested.");

    if (!WaitForApp(pid)) {
        Log(L"Timed out waiting for LuniraScreen to close.");
        return 10;
    }

    std::error_code ec;
    if (!std::filesystem::exists(zip) ||
        !std::filesystem::exists(target)) {
        Log(L"Package or target directory is missing.");
        LaunchApp(target);
        return 11;
    }

    const auto work =
        std::filesystem::temp_directory_path() /
        (L"LuniraUpdate-" + std::to_wstring(GetCurrentProcessId()));
    const auto extracted = work / L"extracted";
    const auto backup = work / L"backup";

    std::filesystem::remove_all(work, ec);
    ec.clear();
    std::filesystem::create_directories(extracted, ec);
    if (ec) {
        Log(L"Could not create extraction directory.");
        LaunchApp(target);
        return 12;
    }

    const std::wstring script =
        L"Expand-Archive -LiteralPath " +
        PowerShellLiteral(zip.wstring()) +
        L" -DestinationPath " +
        PowerShellLiteral(extracted.wstring()) +
        L" -Force";

    std::wstring command =
        L"powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command " +
        Quote(script);

    DWORD exitCode = 1;
    if (!RunAndWait(L"powershell.exe", command, 120000, exitCode) ||
        exitCode != 0) {
        Log(L"Expand-Archive failed.");
        std::filesystem::remove_all(work, ec);
        LaunchApp(target);
        return 13;
    }

    const auto sourceRoot = FindPackageRoot(extracted);
    if (sourceRoot.empty()) {
        Log(L"LuniraScreen.exe not found inside update package.");
        std::filesystem::remove_all(work, ec);
        LaunchApp(target);
        return 14;
    }

    if (!BackupAndCopy(sourceRoot, target, backup)) {
        Log(L"Copy failed; backup restoration was attempted.");
        std::filesystem::remove_all(work, ec);
        LaunchApp(target);
        return 15;
    }

    DeleteFileW(zip.c_str());
    std::filesystem::remove_all(work, ec);

    if (!LaunchApp(target)) {
        Log(L"Update installed but application relaunch failed.");
        return 16;
    }

    Log(L"Update installed successfully.");
    return 0;
}

} // namespace

int wmain(int argc, wchar_t** argv) {
    int result = 2;

    if (argc == 2 && std::wstring_view(argv[1]) == L"--self-test") {
        result = 0;
    } else if (
        argc == 5 &&
        std::wstring_view(argv[1]) == L"--apply") {

        DWORD pid = 0;
        try {
            pid = static_cast<DWORD>(std::stoul(argv[4]));
        } catch (...) {
            pid = 0;
        }

        if (pid != 0) {
            result = ApplyUpdate(
                std::filesystem::path(argv[2]),
                std::filesystem::path(argv[3]),
                pid);
        }
    }

    return result;
}
