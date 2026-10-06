# Changelog: Build, version & ký số bộ cài

> Hiện trạng logic: [../instruction/build-release.md](../instruction/build-release.md)

- 2026-10-05 | Thêm mới | Build & đóng gói (Windows NSIS, macOS dmg): phiên bản đầu tiên (commit "first commit") — khởi tạo dự án
- 2026-10-06 | Thêm mới | Tự tăng version: `scripts/bump-version.mjs` chạy trước `build:*` (patch mặc định, `BUMP=minor|major|none`), tách lệnh `pack:*` — mỗi bản build có version riêng
- 2026-10-06 | Thêm mới | Ký số bộ cài Windows: `gen-cert.mjs` tạo chứng chỉ tự ký vào build/cert, `builder.mjs` ký + chép .cer và `trust-cert.bat` vào release — giảm cảnh báo khi cài trên máy trường
- 2026-10-06 | Thêm mới | Build, version & ký số bộ cài: tạo tài liệu instruction mô tả hiện trạng — áp dụng quy tắc docs trong CLAUDE.md
- 2026-10-06 | Sửa | Ký số bộ cài Windows: nhúng chứng chỉ `.cer` vào bộ cài (`builder.mjs` → `build/embedded-signer.cer`, `installer.nsh` chạy `certutil -user -addstore Root/TrustedPublisher` lúc cài, gỡ cài xoá lại) — người dùng chỉ cần chép + chạy 1 file `MasterScoring-Setup-<version>.exe`, không cần kèm `.cer` / `trust-cert.bat`
- 2026-10-06 | Thêm mới | Bộ cài Windows: `builder.mjs` sinh `setup.bat` cạnh `MasterScoring-Setup-<version>.exe` (nhúng cert base64 → `certutil -user -addstore`, `Unblock-File` gỡ Mark-of-the-Web, rồi chạy Setup, truyền tham số như `/S`) — gỡ cảnh báo SmartScreen "More info → Run anyway" khi double-click trực tiếp file Setup tải từ internet
