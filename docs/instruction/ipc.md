# IPC main ↔ renderer & phân quyền

- **Mục đích:** Kênh duy nhất để renderer (React, sandbox) gọi chức năng main process và nhận sự kiện nền.
- **File:** `src/main/ipc.ts`, `src/main/events.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`,
  `src/renderer/src/lib/api.ts`, `src/shared/types.ts` (`ApiResult`)
- **Changelog:** [../changelog/ipc.md](../changelog/ipc.md)

## Logic chính

- Preload chỉ expose `window.api = { invoke(channel, ...args), on(event, cb) }`.
- Main đăng ký mọi handler bằng `handle(channel, fn)` trong `registerIpc()`; kết quả luôn bọc thành
  `{ ok: true, data } | { ok: false, error }` → renderer dùng `call<T>()` trong `lib/api.ts` (ném lỗi với message
  để hiển thị toast).
- Sự kiện main → renderer: `emit(channel, payload)` (`events.ts`) gửi `evt:<channel>` tới mọi cửa sổ; renderer
  nghe bằng `on(channel, cb)`. Các kênh chính: `ai:local`, `ai:cloud-changed`, `ai:runtime-progress`, `queue:state`,
  `students:changed`, `scan:progress`, `integrity:status`, `mingw:progress`.
- Tên kênh theo nhóm: `app:*`, `auth:*`, `settings:*`, `ai:*`, `assign:*`, `students:*`, `result:*`, `review:*`,
  `queue:*`, `integrity:*`, `dashboard:*`, `profiles:*`, `rubric:*`, `mingw:*`, `reports:*`, `system:*`.
- **Phân quyền:** `requireUser()` bắt buộc đăng nhập; `ownAssignment(id)` / `ownStudent(studentId)` kiểm tra
  assignment thuộc giáo viên đang đăng nhập (mỗi giáo viên chỉ thấy dữ liệu của mình).
- Hộp thoại chọn file/folder (`dialog.showOpenDialog`) luôn mở từ main, renderer chỉ nhận đường dẫn kết quả.

## Lưu ý / giới hạn

- Thêm handler mới: đặt vào đúng nhóm trong `ipc.ts`, luôn kiểm tra quyền (`requireUser` / `own*`) trước khi đọc
  hoặc ghi dữ liệu.
- `app:openExternal` chỉ cho URL `https://`.
- Validate input ở main (vd. `settings:update` kiểm tra ngưỡng trùng lặp 30–100%), không tin renderer.

## Test

`npm run typecheck`. Thủ công: gọi chức năng khi chưa đăng nhập / với assignment của user khác phải báo lỗi
"Chưa đăng nhập" / "Không có quyền truy cập".
