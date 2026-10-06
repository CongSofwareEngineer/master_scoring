# Cửa sổ app & khung giao diện

- **Mục đích:** Tạo cửa sổ Electron an toàn và khung UI chung (top bar, sidebar, điều hướng trang) cho mọi màn hình.
- **File:** `src/main/index.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/components/Shell.tsx`,
  `src/renderer/src/lib/store.ts`, `src/renderer/src/styles.css`, `src/renderer/src/env.d.ts`, `electron.vite.config.ts`
- **Changelog:** [../changelog/app-shell.md](../changelog/app-shell.md)

## Logic chính

- **Khởi động (`index.ts`):** chỉ cho 1 instance (`requestSingleInstanceLock`, mở lần 2 thì focus cửa sổ cũ) →
  `paths.init()` → `openDb()` → `ensureDefaultAccount()` → `cleanupStale()` (dọn llama-server sót) →
  `recoverOnStartup()` (hàng đợi) → `registerIpc()` → tạo cửa sổ. Lỗi không bắt được ghi vào `logs/app.log`.
- **Cửa sổ:** kích thước ~85% màn hình (min 1024×600), luôn dark (`nativeTheme.themeSource = 'dark'`), thanh tiêu đề
  ẩn (`hiddenInset` trên macOS, `titleBarOverlay` trên Windows). `contextIsolation + sandbox`, không `nodeIntegration`.
  Chặn mở cửa sổ mới / điều hướng lạ; link `https://` mở bằng trình duyệt ngoài. DevTools chỉ bật khi dev (F12).
- **Tắt app:** `before-quit` → `stopLocalSync()` (kill llama-server) + `flush()` DB.
- **Điều hướng:** không dùng router; `useStore().page` + `go(page, params)` chọn trang trong `App.tsx`.
  Các phase: `loading → auth → setup (AI Configuration lần đầu) → main`. Bỏ qua setup lưu ở
  `localStorage['ms:skipSetup:<userId>']`.
- **Sidebar:**
  - Thu gọn / mở rộng: nút cuối sidebar → `settings.sidebarCollapsed` (cài đặt riêng từng giáo viên).
    Cửa sổ < 1180px tự thu gọn.
  - Kéo mép phải (`.sidebar-resizer`) để đổi độ rộng 180–420px, nhấp đúp về mặc định 220px. Độ rộng lưu
    `localStorage['sidebarWidth']` (theo máy, không theo user). CSS dùng biến `--sidebar-w`.
  - Badge `done/total` ở mục Hàng đợi khi đang chấm.
- **Top bar:** logo + tên app + version (`__APP_VERSION__`, inject từ `package.json` qua `define` trong
  `electron.vite.config.ts`), chọn assignment hiện tại, chỉ báo trạng thái AI, menu tài khoản.
- **Sự kiện nền:** `App.tsx` lắng nghe `ai:local`, `ai:cloud-changed`, `queue:state`, `ai:runtime-progress` để
  cập nhật store / toast.

## Lưu ý / giới hạn

- Trang mới: thêm vào type `Page` trong `store.ts`, `NAV` trong `Shell.tsx`, và nhánh render trong `App.tsx`.
- `__APP_VERSION__` khai báo kiểu trong `env.d.ts`; chỉ có ở renderer.
- Banner nhắc đổi mật khẩu mặc định hiện ở mọi trang trừ Code Review.

## Test

`npm run typecheck`. Thủ công (`npm run dev`): kéo / nhấp đúp mép sidebar, thu gọn sidebar, thu nhỏ cửa sổ < 1180px,
mở app lần 2 (phải focus cửa sổ cũ), kiểm tra version hiện trên top bar.
