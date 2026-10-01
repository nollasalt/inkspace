Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
Name "Inkspace VSCodium ${VERSION}"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\InkspaceVSCodium"
InstallDirRegKey HKCU "Software\InkspaceVSCodium" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID zlib
BrandingText "Inkspace · VSCodium / Xournal++ / Cairo"
Icon "${ICON}"
UninstallIcon "${ICON}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "Inkspace VSCodium"
VIAddVersionKey "FileDescription" "Inkspace VSCodium Installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Inkspace contributors; upstream licenses included"
Var TestMode
Var Parameters
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION Launch
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!define PROFILE_ARGS '--user-data-dir="$APPDATA\InkspaceVSCodium\UserData" --extensions-dir="$APPDATA\InkspaceVSCodium\Extensions"'

Function .onInit
  SetShellVarContext current
  ${GetParameters} $Parameters
  ClearErrors
  ${GetOptions} $Parameters "/TEST" $TestMode
  ${If} ${Errors}
    StrCpy $TestMode "0"
  ${Else}
    StrCpy $TestMode "1"
  ${EndIf}
FunctionEnd

Section "Inkspace VSCodium（必需）" Core
  SectionIn RO
  SetOutPath "$INSTDIR"
  File /r "${PAYLOAD}\*"
  WriteINIStr "$INSTDIR\install-mode.ini" "Install" "TestMode" "$TestMode"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ${If} $TestMode != "1"
    WriteRegStr HKCU "Software\InkspaceVSCodium" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "DisplayName" "Inkspace VSCodium"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "Publisher" "Inkspace"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "DisplayIcon" "$INSTDIR\Inkspace.ico"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium" "NoRepair" 1
    CreateDirectory "$SMPROGRAMS\Inkspace VSCodium"
    CreateShortCut "$SMPROGRAMS\Inkspace VSCodium\Inkspace.lnk" "$INSTDIR\VSCodium.exe" '${PROFILE_ARGS}' "$INSTDIR\Inkspace.ico"
    CreateShortCut "$SMPROGRAMS\Inkspace VSCodium\卸载.lnk" "$INSTDIR\Uninstall.exe"
  ${EndIf}
SectionEnd

Section "桌面快捷方式" Desktop
  ${If} $TestMode != "1"
    CreateShortCut "$DESKTOP\Inkspace VSCodium.lnk" "$INSTDIR\VSCodium.exe" '${PROFILE_ARGS}' "$INSTDIR\Inkspace.ico"
  ${EndIf}
SectionEnd

Section "文件夹右键：在 Inkspace 中打开" FolderMenu
  ${If} $TestMode != "1"
    WriteRegStr HKCU "Software\Classes\Directory\shell\InkspaceVSCodium.OpenFolder" "" "在 Inkspace 中打开"
    WriteRegStr HKCU "Software\Classes\Directory\shell\InkspaceVSCodium.OpenFolder" "Icon" "$INSTDIR\Inkspace.ico"
    WriteRegStr HKCU "Software\Classes\Directory\shell\InkspaceVSCodium.OpenFolder\command" "" '$\"$INSTDIR\VSCodium.exe$\" ${PROFILE_ARGS} $\"%1$\"'
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InkspaceVSCodium.OpenFolder" "" "在 Inkspace 中打开"
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InkspaceVSCodium.OpenFolder" "Icon" "$INSTDIR\Inkspace.ico"
    WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InkspaceVSCodium.OpenFolder\command" "" '$\"$INSTDIR\VSCodium.exe$\" ${PROFILE_ARGS} $\"%V$\"'
  ${EndIf}
SectionEnd

Function Launch
  Exec '$\"$INSTDIR\VSCodium.exe$\" ${PROFILE_ARGS}'
FunctionEnd

Section "Uninstall"
  SetShellVarContext current
  ReadINIStr $TestMode "$INSTDIR\install-mode.ini" "Install" "TestMode"
  ${If} $TestMode != "1"
    Delete "$DESKTOP\Inkspace VSCodium.lnk"
    Delete "$SMPROGRAMS\Inkspace VSCodium\Inkspace.lnk"
    Delete "$SMPROGRAMS\Inkspace VSCodium\卸载.lnk"
    RMDir "$SMPROGRAMS\Inkspace VSCodium"
    DeleteRegKey HKCU "Software\Classes\Directory\shell\InkspaceVSCodium.OpenFolder"
    DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\InkspaceVSCodium.OpenFolder"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\InkspaceVSCodium"
    DeleteRegKey HKCU "Software\InkspaceVSCodium"
  ${EndIf}
  ; Generated exact file list: never recursively delete the user's chosen folder.
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\install-mode.ini"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
