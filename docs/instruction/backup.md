# Sao lưu / khôi phục / dung lượng

- **Mục đích:** Cho giáo viên sao lưu, khôi phục toàn bộ dữ liệu và xem / dọn dung lượng app đang dùng.
- **File:** `src/main/backup.ts`, `src/main/ipc.ts` (`system:backup|restore|storage|cleanWork`),
  `src/renderer/src/pages/Settings.tsx` (tab Dữ liệu)
- **Changelog:** [../changelog/backup.md](../changelog/backup.md)

## Logic chính

- **Sao lưu:** `flush()` rồi ghi `exportDb()` ra file `.msbak` (thực chất là file SQLite), tên mặc định
  `MasterScoring_backup_YYYYMMDD.msbak`.
- **Khôi phục:** kiểm tra header `SQLite format 3\0`; lưu bản hiện tại thành `data/app.before-restore-<timestamp>.db`;
  `reopenDbFrom(buf)` (chạy schema + migrate); `ensureDefaultAccount()`; đăng xuất user.
- **Dung lượng:** tổng kích thước `data`, `models` (theo `modelsDir`), `runtime`, `w` (tạm), `logs`.
- **Dọn tạm:** xoá mọi thứ trong `w/`.

## Lưu ý / giới hạn

- Backup chỉ gồm database — **không** gồm model GGUF, runtime, hay file zip bài nộp (DB chỉ lưu đường dẫn zip).
- Khôi phục trên máy khác: đường dẫn folder bài nộp có thể không còn đúng → cần chọn lại folder và quét lại.
- API key (bảng `secrets`) mã hoá bằng safeStorage gắn với tài khoản hệ điều hành → khôi phục sang máy khác sẽ không
  giải mã được, phải nhập lại key.

## Test

Thủ công: sao lưu → sửa dữ liệu → khôi phục → dữ liệu về như lúc sao lưu, có file `app.before-restore-*.db`.
