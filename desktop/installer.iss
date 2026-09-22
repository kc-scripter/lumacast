#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#define MyAppName "Lunira Screen"
#define MyAppExeName "LuniraScreen.exe"
#define WebView2Guid "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

[Setup]
AppId={{A8B8D2B5-E722-46E8-A4C2-A46C1E0F5CB7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Lunira Screen
DefaultDirName={autopf}\Lunira Screen
DefaultGroupName=Lunira Screen
DisableProgramGroupPage=yes
OutputDir=release
OutputBaseFilename=Lunira-Screen-{#MyAppVersion}-x64
SetupIconFile=Assets\Lunira.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
CloseApplications=yes

[Files]
Source: "bin\Release\net48\LuniraScreen.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "bin\Release\net48\LuniraScreen.exe.config"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist
Source: "bin\Release\net48\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "bin\Release\net48\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "bin\Release\net48\runtimes\win-x64\native\WebView2Loader.dll"; DestDir: "{app}\runtimes\win-x64\native"; Flags: ignoreversion
Source: "bin\Release\net48\web-url.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "Assets\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall

[Icons]
Name: "{autoprograms}\Lunira Screen"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Lunira Screen"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Instalando Microsoft Edge WebView2 Runtime..."; Flags: waituntilterminated runhidden; Check: WebView2Missing
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Lunira Screen"; Flags: nowait postinstall skipifsilent

[Code]
function ValidWebViewVersion(const Version: String): Boolean;
begin
  Result := (Version <> '') and (Version <> '0.0.0.0');
end;

function WebView2Missing: Boolean;
var
  Version: String;
begin
  Result := True;

  if RegQueryStringValue(HKLM32,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{#WebView2Guid}',
    'pv', Version) and ValidWebViewVersion(Version) then
  begin
    Result := False;
    exit;
  end;

  if RegQueryStringValue(HKCU,
    'SOFTWARE\Microsoft\EdgeUpdate\Clients\{#WebView2Guid}',
    'pv', Version) and ValidWebViewVersion(Version) then
  begin
    Result := False;
    exit;
  end;
end;
