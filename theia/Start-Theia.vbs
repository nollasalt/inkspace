Option Explicit
Dim files, shell, folder, electron, command, argument
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
folder = files.GetParentFolderName(WScript.ScriptFullName)
electron = files.BuildPath(files.GetParentFolderName(folder), "node_modules\electron\dist\electron.exe")
If Not files.FileExists(electron) Or Not files.FileExists(files.BuildPath(folder, "lib\backend\main.js")) Then
  MsgBox "Build this validation app first: npm run build:theia", vbExclamation, "Inkspace Theia"
  WScript.Quit 1
End If
shell.CurrentDirectory = folder
command = Chr(34) & electron & Chr(34) & " " & Chr(34) & files.BuildPath(folder, "host.cjs") & Chr(34)
For Each argument In WScript.Arguments
  command = command & " " & Chr(34) & "--workspace=" & argument & Chr(34)
Next
shell.Run command, 1, False
