#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#define MyAppName "Lunira Screen"
#define MyAppExeName "LuniraScreen.exe"

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

[Files]
Source: "bin\Release\net48\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Lunira Screen"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\Lunira Screen"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; GroupDescription: "Atalhos:"; Flags: unchecked

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir Lunira Screen"; Flags: nowait postinstall skipifsilent
