#define AppVersion "0.1.8"
[Setup]
AppId={{F33E1712-576C-4B4A-8E2A-92B0263E7D24}
AppName=Portfolio Lens
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\Portfolio Lens
DefaultGroupName=Portfolio Lens
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=Portfolio-Lens-Setup-{#AppVersion}
SetupIconFile=..\assets\app.ico
UninstallDisplayIcon={app}\Portfolio Lens.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Portfolio Lens"; Filename: "{app}\Portfolio Lens.exe"
Name: "{userdesktop}\Portfolio Lens"; Filename: "{app}\Portfolio Lens.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе"; GroupDescription: "Дополнительно:"

[Run]
Filename: "{app}\Portfolio Lens.exe"; Description: "Запустить Portfolio Lens"; Flags: nowait postinstall skipifsilent
