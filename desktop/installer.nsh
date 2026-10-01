; Folder and directory-background context menus, scoped to the installing user.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\Inkspace.OpenFolder" "" "在 Inkspace 中打开"
  WriteRegStr HKCU "Software\Classes\Directory\shell\Inkspace.OpenFolder" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\Inkspace.OpenFolder\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--open-folder=%1"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Inkspace.OpenFolder" "" "在 Inkspace 中打开"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Inkspace.OpenFolder" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\Inkspace.OpenFolder\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--open-folder=%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\Inkspace.OpenFolder"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\Inkspace.OpenFolder"
!macroend
