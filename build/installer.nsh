; Cài Visual C++ Redistributable (llama-server.exe cần) nếu máy chưa có.
; File vc_redist.x64.exe được tải bởi scripts/fetch-runtime.mjs; thiếu file thì bỏ qua bước này.
; Tin cậy chứng chỉ ký số: build/embedded-signer.cer do scripts/builder.mjs chép từ build/cert
; khi ký bằng chứng chỉ tự ký (không có khi ký bằng WIN_CSC_LINK thật). Thêm vào store của user
; hiện tại nên KHÔNG cần Admin — người dùng chỉ cần chạy 1 file bộ cài là đủ.
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

  !if /FileExists "${BUILD_RESOURCES_DIR}\embedded-signer.cer"
    DetailPrint "Thêm chứng chỉ ký số vào danh sách tin cậy (user)..."
    File /oname=$PLUGINSDIR\signer.cer "${BUILD_RESOURCES_DIR}\embedded-signer.cer"
    nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -f -addstore Root "$PLUGINSDIR\signer.cer"'
    Pop $0
    nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -f -addstore TrustedPublisher "$PLUGINSDIR\signer.cer"'
    Pop $0
  !endif
!macroend

; Gỡ chứng chỉ đã thêm lúc cài (khớp theo tên CN "Master Scoring" trong store của user).
!macro customUnInstall
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -f -delstore Root "Master Scoring"'
  Pop $0
  nsExec::ExecToLog '"$SYSDIR\certutil.exe" -user -f -delstore TrustedPublisher "Master Scoring"'
  Pop $0
!macroend
