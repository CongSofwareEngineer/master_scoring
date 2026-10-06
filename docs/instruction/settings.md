# Cài đặt (theo máy / theo giáo viên)

- **Mục đích:** Lưu cấu hình app; phân biệt cài đặt chung của máy và cài đặt riêng từng giáo viên.
- **File:** `src/main/settings.ts`, `src/shared/constants.ts` (`DEFAULT_SETTINGS`), `src/shared/types.ts`
  (`AppSettings`), `src/main/ipc.ts` (`settings:*`), `src/renderer/src/pages/Settings.tsx`, `src/renderer/src/lib/store.ts`
- **Changelog:** [../changelog/settings.md](../changelog/settings.md)

## Logic chính

- Bảng `settings (user_id, key, value JSON)`. `user_id = 0` = cài đặt theo máy.
- `PER_USER_KEYS = ['lang', 'sidebarCollapsed']` lưu theo giáo viên; mọi key khác lưu theo máy.
- `getSettings(userId)` = `DEFAULT_SETTINGS` ← global ← key riêng của user. `modelsDir` trống → `paths.models`.
- `updateSettings` bỏ qua key không có trong `DEFAULT_SETTINGS`.
- Một số key nội bộ cũng nằm trong bảng `settings` nhưng không thuộc `AppSettings`: `queueState` (user 0),
  `cloudConfig` (theo user).
- Trang Settings có các tab: Chung, Tài khoản, Dữ liệu, Kết nối mạng, Giới thiệu.
- Các nhóm cài đặt chính: ngôn ngữ; Local AI (`contextSize`, `llamaVariant`, `gpuLayers`, `threads`, `modelsDir`,
  `activeModelId`); `preventSleep`; giới hạn giải nén (`maxUnzipMb`, `maxFiles`); trùng lặp (`similarityEnabled`
  mặc định tắt, `similarityThreshold` 30–100); câu hỏi vấn đáp (`aiQuestionsEnabled` mặc định tắt,
  `aiQuestionsMinPercent`); `anonymizeCloud`; đường dẫn công cụ (`androidSdkPath`, `jdkPath`, `mingwPath`).

## Lưu ý / giới hạn

- Thêm key mới: thêm vào `AppSettings` + `DEFAULT_SETTINGS`; nếu cần theo giáo viên thì thêm vào `PER_USER_KEYS`.
- `mssvPattern` vẫn còn trong settings nhưng **không còn được dùng** để kiểm tra tên file (xem `submission-scan.md`);
  `settings.ts` chỉ chuyển mẫu mặc định cũ sang mẫu mới. `nodePath` hiện cũng chưa dùng.

## Test

`npm run typecheck`. Thủ công: 2 giáo viên chọn ngôn ngữ khác nhau phải giữ riêng; đổi `contextSize` áp dụng cho mọi
tài khoản trên máy.
