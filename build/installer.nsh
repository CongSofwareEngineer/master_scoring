; Cài Visual C++ Redistributable (llama-server.exe cần) nếu máy chưa có.
; File vc_redist.x64.exe được tải bởi scripts/fetch-runtime.mjs; thiếu file thì bỏ qua bước này.
!macro customInstall
  !if /FileExists "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
    ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
    ${If} $0 != 1
      DetailPrint "Cài Visual C++ Runtime..."
      File /oname=$PLUGINSDIR\vc_redist.x64.exe "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
      ; vc_redist cần quyền Admin: dùng "runas" để Windows hỏi UAC (app vẫn cài vào thư mục user)
      ExecShellWait "runas" "$PLUGINSDIR\vc_redist.x64.exe" "/install /passive /norestart"
    ${EndIf}
  !endif
!macroend
