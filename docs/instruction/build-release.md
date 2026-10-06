# Build, version & ký số bộ cài

- **Mục đích:** Đóng gói bộ cài Windows (`.exe` NSIS) và macOS (`.dmg`) kèm runtime Local AI, tự tăng version, tự ký
  bộ cài Windows.
- **File:** `package.json` (scripts), `electron-builder.yml`, `electron.vite.config.ts`, `scripts/bump-version.mjs`,
  `scripts/builder.mjs`, `scripts/gen-cert.mjs`, `scripts/gen-icon.mjs`, `scripts/fetch-runtime.mjs`,
  `scripts/run-electron-vite.mjs`, `build/trust-cert.bat`, `build/installer.nsh`, `README.md`
- **Changelog:** [../changelog/build-release.md](../changelog/build-release.md)

## Logic chính

- **Lệnh:** `build:win`, `build:mac`, `build:mac:arm64`, `build:mac:x64`, `build:all` = `bump-version.mjs` rồi
  `pack:*`. `pack:*` không tăng version (dùng để build lại).
- **Tăng version (`bump-version.mjs`):** mặc định patch; chọn bằng tham số hoặc `BUMP=minor|major|none`. Cập nhật
  `package.json` + `package-lock.json`. Version hiển thị trên top bar qua `__APP_VERSION__`.
- **pack:win:** `gen-icon` → `fetch-runtime win` (llama-server CPU + Vulkan, VC++ Redistributable) → `gen-cert` →
  `electron-vite build` → `builder.mjs --win nsis --x64`.
- **Ký số Windows:**
  - `gen-cert.mjs` tạo chứng chỉ tự ký bằng `openssl` vào `build/cert/` (`codesign.pfx`, `password.txt`,
    `MasterScoring-CodeSign.cer`); đã có thì bỏ qua. Không có openssl → cảnh báo, bộ cài không ký.
  - `builder.mjs` đặt `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` từ `build/cert` nếu chưa có chứng chỉ thật
    (`WIN_CSC_LINK` / `CSC_LINK` đặt sẵn được ưu tiên), rồi chép `MasterScoring-CodeSign.cer` + `trust-cert.bat` vào
    `release/<version>/`.
  - `trust-cert.bat` (chạy quyền Admin trên máy người dùng) thêm chứng chỉ vào Root + TrustedPublisher.
- **pack:mac:** giống trên nhưng runtime Metal theo kiến trúc (`resources/runtime-mac/<arch>`), không ký mặc định.
- **Kết quả:** `release/<version>/MasterScoring-Setup-<version>.exe`, `MasterScoring-<version>-<arch>.dmg`.
- **NSIS:** cài theo user (không cần Admin), cho đổi thư mục, shortcut Desktop + Start Menu, gỡ cài không xoá dữ liệu.
- `run-electron-vite.mjs` xoá `ELECTRON_RUN_AS_NODE` trước khi chạy (môi trường VS Code extension).

## Lưu ý / giới hạn

- `build/cert/` nằm trong `.gitignore` — **phải sao lưu riêng**; mất thì bản build sau dùng chứng chỉ khác, người dùng
  phải tin cậy lại.
- Chứng chỉ tự ký không qua được SmartScreen như chứng chỉ thương mại; chỉ tin cậy trên máy đã chạy `trust-cert.bat`.
- Build macOS phải chạy trên Mac; build Windows chạy được trên cả hai.

## Test

Chạy `BUMP=none npm run build:win` (hoặc `npm run pack:win`) → kiểm tra `release/<version>/` có `.exe`, `.cer`,
`trust-cert.bat`; version trong tên file khớp `package.json`.
