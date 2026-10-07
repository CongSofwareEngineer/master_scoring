# Master Scoring

Ứng dụng desktop chấm điểm code sinh viên (Java Android, Next.js, C, C++) và **báo cáo / bài viết Word / Excel / PowerPoint (.doc .docx .xls .xlsx .ppt .pptx)** cho giáo viên.
Mỗi assignment chọn loại bài **Chấm code** hoặc **Chấm báo cáo (Word / Excel / PowerPoint)** — hai loại có bộ filter chấm khác nhau (xem
[docs/instruction/report-grading.md](docs/instruction/report-grading.md)). Context AI chọn trong AI Models: mặc định 32K,
tới 200K cho Cloud AI (Local AI tối đa 32K).
Thiết kế chi tiết: [Master_Scoring_Design.md](Master_Scoring_Design.md).

Công nghệ: **Electron + React + TypeScript** (phương án thay thế trong mục 23 của design — dev được trên macOS/Windows,
build ra bộ cài `.exe` cho Windows 10/11 x64).

## Lệnh

| Mục đích | Lệnh |
| --- | --- |
| Cài package (chạy 1 lần) | `npm install` |
| **Dev / debug** (hot reload, F12 mở DevTools) | `npm run dev` |
| **Build production Windows → bộ cài `.exe`** | `npm run build:win` |
| **Build production macOS → `.dmg` (Apple Silicon + Intel)** | `npm run build:mac` |
| Chỉ build macOS Apple Silicon / Intel | `npm run build:mac:arm64` / `npm run build:mac:x64` |
| Build tất cả (Windows + macOS) | `npm run build:all` |
| Kiểm tra kiểu TypeScript | `npm run typecheck` |

Kết quả nằm trong `release/<version>/`:

| File | Dùng cho |
| --- | --- |
| `MasterScoring-Setup-<version>.exe` | Windows 10/11 x64 — bộ cài NSIS, cài vào thư mục user (không cần Admin), tạo shortcut Desktop + Start Menu, gỡ trong Settings → Apps |
| `setup.bat` | Windows — tải kèm `Setup.exe`, chạy 1 lần trước khi cài: tự thêm chứng chỉ + gỡ chặn SmartScreen rồi mở bộ cài (không cần Admin; truyền tham số được, vd. `setup.bat /S` cài im lặng) |
| `MasterScoring-<version>-arm64.dmg` | macOS Apple Silicon (M1/M2/M3/M4…) |
| `MasterScoring-<version>-x64.dmg` | macOS chip Intel |

Các lệnh build tự làm:
1. Sinh icon (`build/icon.ico`, `build/icon.png`).
2. Tải llama-server (llama.cpp) để đóng gói kèm Local AI — Windows: bản CPU + GPU Vulkan và Visual C++ Redistributable;
   macOS: bản Metal cho từng kiến trúc (`npm run fetch:runtime` / `npm run fetch:runtime:mac`; đã có thì bỏ qua).
   Không tải được thì vẫn build — app tự tải llama-server lần đầu dùng Local AI.
   Kèm 7-Zip 25.01 (Windows `7z.exe + 7z.dll`, macOS `7zz`) để đọc bài nộp .rar / .7z / .tar.gz / .iso / .dmg / .arj…
   Thiếu 7-Zip thì app chỉ đọc được .zip (hoặc dùng 7-Zip cài sẵn trên máy).
3. Build mã nguồn (electron-vite) và đóng gói (electron-builder).

Build Windows chạy được trên cả macOS lẫn Windows. Build macOS cần chạy trên máy Mac.

**Ký số (khuyến nghị khi phát hành):**
- Windows: không đặt `CSC_LINK` → bộ cài ký bằng chứng chỉ tự ký (`build/cert`, `gen-cert.mjs` tạo tự động) và
  **tự thêm chứng chỉ vào store của user trong lúc cài**. `release/` còn có `setup.bat` (nhúng cert + gỡ
  Mark-of-the-Web rồi mở Setup) — **máy khác chỉ cần tải `MasterScoring-Setup-<version>.exe` + `setup.bat`, chạy
  `setup.bat` là cài được, hết cảnh báo "Windows protected your PC → Run anyway"** (`.cer` / `trust-cert.bat` vẫn
  chép kèm làm phương án thủ công). Nếu Windows Defender báo "virus/threat" thì phải Allow trong
  Protection history hoặc gửi báo cáo false positive cho Microsoft.
- Windows: đặt `CSC_LINK` (file .pfx) và `CSC_KEY_PASSWORD` để tránh SmartScreen cảnh báo.
- macOS: cần chứng chỉ **Developer ID Application** + notarize (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`).
  Nếu không, máy Mac khác sẽ chặn lần mở đầu: chuột phải vào app → Open, hoặc chạy
  `xattr -dr com.apple.quarantine "/Applications/Master Scoring.app"`.

## Tài khoản

- Lần mở đầu tiên app tự tạo tài khoản mặc định **`username` / `pass`**.
- Sau khi đăng nhập: **Cài đặt → Tài khoản** để đổi tên đăng nhập, tên hiển thị và mật khẩu
  (app hiện thanh nhắc cho tới khi đổi mật khẩu mặc định). Có thể tạo thêm tài khoản cho giáo viên khác ở màn hình đăng nhập.

## Dev trên macOS

- Giao diện, đăng nhập, assignment, quét bài nộp, phân tích tĩnh, Integrity, báo cáo… chạy đầy đủ.
- Local AI khi dev trên Mac: chạy `npm run fetch:runtime:mac` (hoặc `brew install llama.cpp`) — app tự tìm llama-server. Apple Silicon chạy model trên GPU qua Metal.
- Đọc bài nộp ngoài .zip (.rar, .7z, .tar.gz, .iso, .dmg…) khi dev trên Mac: chạy `npm run fetch:runtime:mac`
  (hoặc `brew install sevenzip`) — app tự tìm 7-Zip.
- Compile C/C++ khi dev trên Mac dùng `gcc`/`g++` (clang) có sẵn.

## Dữ liệu

```
%LocalAppData%\MasterScoring\
   ├─ data\app.db     SQLite (sql.js): user, assignment, rubric, sinh viên, kết quả, log
   ├─ models\         file GGUF (đổi vị trí được)
   ├─ runtime\        llama-server, MinGW (nếu tải)
   ├─ w\              thư mục làm việc tạm (tự dọn)
   └─ logs\
```
(Trên macOS khi dev: `~/Library/Application Support/MasterScoring/`.)

## Cấu trúc mã nguồn

```
src/shared/      kiểu dữ liệu + hằng số dùng chung (model, profile, rubric mẫu)
src/main/        Electron main process
  ai/            llama-server sidecar, tải model (resume + SHA-256), client OpenAI-compatible (Local/Cloud)
  importer/      quét folder, giải nén an toàn (zip-slip, zip bomb, tên file CP1258), đọc file Word / Excel / PowerPoint (.doc/.docx, .xls/.xlsx, .ppt/.pptx, .rtf), danh sách lớp
  analysis/      nhận diện công nghệ, phân tích tĩnh, kiểm tra hình thức báo cáo, compile/test C/C++ (MinGW), chạy tiến trình có giới hạn
  grading/       prompt + JSON schema, pipeline chấm 1 SV, hàng đợi tuần tự (pause/resume/cancel, tiếp tục sau khi tắt app)
  integrity/     fingerprint winnowing (kiểu MOSS), so sánh cặp, cluster
  reports/       Excel (exceljs), CSV, PDF (printToPDF)
src/preload/     cầu nối IPC an toàn (contextIsolation + sandbox)
src/renderer/    React UI (dark theme, CodeMirror 6 read-only, biểu đồ SVG)
```
