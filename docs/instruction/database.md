# Database & thư mục dữ liệu

- **Mục đích:** Lưu toàn bộ dữ liệu app (tài khoản, cài đặt, assignment, kết quả chấm…) cục bộ, không cần server.
- **File:** `src/main/db.ts`, `src/main/paths.ts`, `src/main/repo.ts`
- **Changelog:** [../changelog/database.md](../changelog/database.md)

## Logic chính

- **Engine:** SQLite qua `sql.js` (WebAssembly) — không có native module nên build Windows từ máy nào cũng được.
  `sql-wasm.wasm` được `asarUnpack` trong `electron-builder.yml`.
- DB nằm trong RAM; mỗi `run()` / `transaction()` gọi `scheduleSave()` (debounce 400ms) → `flush()` ghi nguyên tử
  (`app.db.tmp` rồi `rename`). `flush()` cũng gọi khi tắt app và trước khi sao lưu.
- **Bảng:** `users`, `settings (user_id, key)`, `secrets`, `assignments (data JSON)`, `profiles`, `rubric_templates`,
  `students`, `results` (1 dòng / sinh viên, các cột JSON: criteria, issues, auto, ai_signal, ai_penalty,
  ai_questions, overrides, warnings, fingerprint), `integrity_pairs`, `netlog`.
- **Migration:** `SCHEMA` dùng `CREATE TABLE IF NOT EXISTS`; cột mới thêm bằng `ALTER TABLE` trong `migrate()` sau khi
  kiểm tra `PRAGMA table_info`.
- **Helper:** `run`, `all`, `get`, `transaction`, `exportDb`, `nowIso`. `repo.ts` chứa CRUD assignment, profile,
  rubric mẫu, sinh viên, kết quả (`updateResult` tự `JSON.stringify` object, boolean → 0/1).
- **Thư mục (`paths.ts`):** Windows `%LocalAppData%\MasterScoring\`, macOS `~/Library/Application Support/MasterScoring/`:
  `data/app.db`, `models/` (đổi được), `runtime/` (llama-server, MinGW), `w/` (thư mục làm việc tạm, tên ngắn để
  tránh lỗi đường dẫn > 260 ký tự), `logs/`. `bundledRuntimeDir()` = `resources/runtime` trong bộ cài.

## Lưu ý / giới hạn

- Thêm cột: thêm vào `SCHEMA` **và** `migrate()` để DB cũ nâng cấp được.
- Code sinh viên **không** lưu vào DB (đọc lại từ zip khi cần — xem `code-review.md`); chỉ lưu fingerprint.
- `foreign_keys = OFF`: xoá dữ liệu liên quan phải làm tay (vd. xoá student thì xoá results).

## Test

`npm run typecheck`. Thủ công: mở app với DB cũ (bản trước khi thêm cột) phải chạy được; tắt app đột ngột rồi mở lại
không mất dữ liệu đã lưu > 400ms.
