# Build, version & ký số bộ cài

- **Mục đích:** Đóng gói bộ cài Windows (`.exe` NSIS) và macOS (`.dmg`) kèm runtime Local AI, tự tăng version, tự ký
  bộ cài Windows.
- **File:** `package.json` (scripts), `electron-builder.yml`, `electron.vite.config.ts`, `scripts/bump-version.mjs`,
  `scripts/builder.mjs`, `scripts/gen-cert.mjs`, `scripts/gen-icon.mjs`, `scripts/fetch-runtime.mjs`,
  `scripts/run-electron-vite.mjs`, `build/trust-cert.bat`, `build/installer.nsh`,
  `build/embedded-signer.cer` (sinh lúc build, không commit), `release/<version>/setup.bat` (sinh lúc build),
  `README.md`
- **Changelog:** [../changelog/build-release.md](../changelog/build-release.md)

## Logic chính

- **Lệnh:** `build:win`, `build:mac`, `build:mac:arm64`, `build:mac:x64`, `build:all` = `bump-version.mjs` rồi
  `pack:*`. `pack:*` không tăng version (dùng để build lại).
- **Tăng version (`bump-version.mjs`):** mặc định patch; chọn bằng tham số hoặc `BUMP=minor|major|none`. Cập nhật
  `package.json` + `package-lock.json`. Version hiển thị trên top bar qua `__APP_VERSION__`.
- **pack:win:** `gen-icon` → `fetch-runtime win` (llama-server CPU + Vulkan, 7-Zip `7z.exe + 7z.dll` →
  `resources/runtime/7zip`, VC++ Redistributable) → `gen-cert` →
  `electron-vite build` → `builder.mjs --win nsis --x64`.
- **Ký số Windows:**
  - `gen-cert.mjs` tạo chứng chỉ tự ký bằng `openssl` vào `build/cert/` (`codesign.pfx`, `password.txt`,
    `MasterScoring-CodeSign.cer`); đã có thì bỏ qua. Không có openssl → cảnh báo, bộ cài không ký.
  - `builder.mjs` đặt `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` từ `build/cert` nếu chưa có chứng chỉ thật
    (`WIN_CSC_LINK` / `CSC_LINK` đặt sẵn được ưu tiên), rồi chép `MasterScoring-CodeSign.cer` + `trust-cert.bat` vào
    `release/<version>/` (phương án thủ công).
  - **Tự tin cậy chứng chỉ khi cài (chỉ chạy 1 file `.exe` là đủ):** `builder.mjs` chép
    `build/cert/MasterScoring-CodeSign.cer` → `build/embedded-signer.cer` trước khi gọi electron-builder — chỉ khi
    ký bằng chứng chỉ tự ký; ký bằng `WIN_CSC_LINK` thật thì xoá file này. `build/installer.nsh`:
    - `customInstall`: nếu có `embedded-signer.cer` thì giải nén ra `$PLUGINSDIR` và chạy
      `certutil -user -f -addstore Root` + `-addstore TrustedPublisher` — thêm vào store của **user hiện tại**
      nên **không cần Admin** (khác `trust-cert.bat` chạy Admin).
    - `customUnInstall`: `certutil -user -f -delstore Root/TrustedPublisher "Master Scoring"` gỡ chứng chỉ
      theo tên CN.
  - `trust-cert.bat` (chạy quyền Admin trên máy người dùng) thêm chứng chỉ vào Root + TrustedPublisher — giữ lại
    cho trường hợp thêm tay.
  - **`setup.bat` (sinh bởi `builder.mjs` vào `release/<version>/`, chạy được ngay, không cần Admin):** người dùng
    tải 2 file `MasterScoring-Setup-<version>.exe` + `setup.bat`, chạy `setup.bat` một lần. Bat làm 3 bước:
    1. Nhúng chứng chỉ (base64 ngay trong file `.bat`, không cần kèm `.cer`) → `certutil -user -f -addstore Root`
       + `TrustedPublisher`.
    2. `Unblock-File` gỡ Mark-of-the-Web khỏi `MasterScoring-Setup-*.exe` → **SmartScreen ("More info → Run
       anyway") không kích hoạt** vì SmartScreen chỉ kiểm file có MOTW.
    3. Chạy bộ cài, truyền nguyên tham số (`setup.bat /S` → cài im lặng).
    Văn bản bat thuần ASCII (tránh lỗi mã hoá cmd), dòng CRLF; có nhúng cert chỉ sinh khi ký tự ký.
- **pack:mac:** giống trên nhưng runtime Metal theo kiến trúc (`resources/runtime-mac/<arch>`, gồm cả 7-Zip `7zz` bản
  universal chép vào `<arch>/7zip`), không ký mặc định.
- **7-Zip (đọc bài nộp .rar/.7z/.tar.gz/.iso/.dmg…):** tải bản cố định `SEVEN_ZIP_VER` từ 7-zip.org (không qua GitHub
  API). Windows: tải bộ cài `7z<ver>-x64.exe` (là 7z SFX) rồi bóc `7z.exe`, `7z.dll`, `License.txt` bằng 7-Zip của máy
  build (`7zr.exe` trên Windows, `7zz` mac/linux tải tạm) → build Windows chạy được cả trên Mac. Đã có thì bỏ qua.
- **Kết quả:** `release/<version>/MasterScoring-Setup-<version>.exe` (+ `setup.bat`, `.cer`, `trust-cert.bat` khi ký
  tự ký), `MasterScoring-<version>-<arch>.dmg`.
- **NSIS:** cài theo user (không cần Admin), cho đổi thư mục, shortcut Desktop + Start Menu, gỡ cài không xoá dữ liệu.
- `run-electron-vite.mjs` xoá `ELECTRON_RUN_AS_NODE` trước khi chạy (môi trường VS Code extension).

## Lưu ý / giới hạn

- `build/cert/` nằm trong `.gitignore` — **phải sao lưu riêng**; mất thì bản build sau dùng chứng chỉ khác, người dùng
  phải tin cậy lại.
- Chứng chỉ tự ký không qua được SmartScreen như chứng chỉ thương mại: **lần mở đầu** file `.exe` tải từ internet
  vẫn hiện "Windows protected your PC" → More info → Run anyway. **Cách qua mặt SmartScreen:** chạy `setup.bat`
  cùng thư mục (bước 2 gỡ MOTW → SmartScreen không kiểm tra). Cài xong cert đã ở trong store user nên app chạy
  bình thường (không còn cảnh báo "không rõ nguồn gốc"). Muốn không cần workaround thì mua chứng chỉ thương mại.
- **Defender báo "virus/threat" (false positive heuristic) thì `setup.bat` không cứu được** — phải gửi báo cáo
  false positive cho Microsoft (Windows Security → Protection history → Allow) hoặc submit file lên Microsoft.
- Ký bằng `WIN_CSC_LINK` thật → không nhúng cert vào bộ cài (máy người dùng đã tin chứng chỉ phát hành).
- Thiếu openssl lúc build → không ký và không nhúng cert (`embedded-signer.cer` bị xoá) — bộ cài vẫn cài được,
  chỉ là Windows cảnh báo nhiều hơn.
- Build macOS phải chạy trên Mac; build Windows chạy được trên cả hai.

## Test

Chạy `BUMP=none npm run build:win` (hoặc `npm run pack:win`) → kiểm tra `release/<version>/` có `.exe`, `.cer`,
`trust-cert.bat`, `setup.bat`; version trong tên file khớp `package.json`; `build/embedded-signer.cer` tồn tại
(khi ký tự ký).
Cài bản build đó → chạy `certutil -user -store Root` thấy CN `Master Scoring`; gỡ cài → chứng chỉ biến mất
(tự kiểm: `certutil -user -f -addstore Root build\embedded-signer.cer` rồi `certutil -user -f -delstore Root "Master Scoring"`).
Test `setup.bat` không cần cài thật: copy `setup.bat` vào thư mục tạm có khoảng trắng, copy một `.exe` nhỏ (vd.
`where.exe`) đổi tên thành `MasterScoring-Setup-<version>.exe`, thêm MOTW
(`Set-Content -Path <file> -Stream Zone.Identifier -Value "[ZoneTransfer]`r`nZoneId=3"`) → chạy `cmd /c "setup.bat < nul"`
→ thấy cert vào store, stream `Zone.Identifier` biến mất, bat chạy đúng file `.exe`; dọn bằng
`certutil -user -f -delstore Root/TrustedPublisher "Master Scoring"`.
