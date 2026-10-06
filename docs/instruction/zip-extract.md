# Giải nén bài nộp an toàn

- **Mục đích:** Đọc mã nguồn trong file zip sinh viên vào bộ nhớ một cách an toàn và chỉ lấy file cần chấm.
- **File:** `src/main/importer/extract.ts`, `src/shared/constants.ts` (`BLOCKED_EXT`), `src/main/zipUtil.ts`
  (chỉ cho runtime, không dùng cho bài nộp)
- **Changelog:** [../changelog/zip-extract.md](../changelog/zip-extract.md)

## Logic chính

- `loadSubmission(zipPath, profile, limits)` đọc zip bằng `yauzl` **vào RAM** (`Map<path, Buffer>`), không ghi ra đĩa
  (chỉ ghi khi cần compile — `writeFilesTo`).
- **Lọc ngay khi đọc:** bỏ đường dẫn khớp `profile.ignore` + `ALWAYS_IGNORE` (node_modules, build, .git, lock file,
  README/LICENSE, file cấu hình công cụ, `*.min.js`…); chỉ lấy file văn bản theo đuôi của các profile; bỏ file > 512 KB
  và file nhị phân (có byte 0).
- **An toàn:**
  - zip-slip: bỏ đường dẫn tuyệt đối hoặc chứa `..`.
  - zip bomb: tổng dung lượng giải nén ≤ `maxUnzipMb` (mặc định 500 MB) và số file ≤ `maxFiles` (20 000).
  - zip có mật khẩu → lỗi; file thực thi (`.exe .bat .cmd .ps1 .dll .msi .com .scr .vbs`) không giải nén.
  - Zip lồng zip: giải thêm **1 cấp** (≤ 200 MB). `.rar` / `.7z` bên trong → cảnh báo.
- **Tên file tiếng Việt:** có cờ UTF-8 → UTF-8; không → thử UTF-8 → CP1258 → CP437.
- Zip chỉ có 1 thư mục gốc chung → tự bỏ (tối đa 3 cấp). Kết quả sắp xếp theo đường dẫn.
- `decodeText(buf)`: UTF-16 BOM → UTF-8 (bỏ BOM) → fallback CP1258.
- Cảnh báo (`warnings`) được lưu vào kết quả chấm để giáo viên xem.

## Lưu ý / giới hạn

- File bị lọc sẽ không có trong Code Review và không gửi cho AI.
- `quickCheckZip` chỉ đọc central directory (dùng lúc quét folder).

## Test

Thủ công: zip có `node_modules`, zip lồng zip, zip có `../evil.txt`, zip tên file tiếng Việt tạo trên Windows cũ →
kiểm tra danh sách file trong Code Review và phần cảnh báo.
